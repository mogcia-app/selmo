"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { getApiAuthHeaders } from "@/lib/client/api-auth";
import { getKnowledgeBasePath } from "@/lib/knowledge-paths";
import {
  buildKnowledgeSearchTerms,
  filterKnowledgeItems,
  saveKnowledgeSearch,
  subscribeToKnowledgeProducts,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { saveKnowledgeSearchEvent } from "@/lib/firebase/operations";
import { canUseSalesDomain } from "@/lib/sales-domains";

type KnowledgeSearchEvidence = {
  id: string;
  title: string;
  kind: KnowledgeItem["kind"] | "product";
  scope: "personal" | "shared";
  href: string;
  snippets: string[];
};

type ProductSnippet = {
  label: string;
  value: string;
};

type AiAnswer = {
  overview: string;
  bullets: string[];
  followUps: string[];
};

export default function SalesKnowledgeSearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const basePath = getKnowledgeBasePath(pathname);
  const knowledgeRole = basePath.startsWith("/admin") ? "admin" : "sales";
  const query = searchParams.get("q")?.trim() ?? "";
  const [searchTerm, setSearchTerm] = useState(query);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [aiAnswer, setAiAnswer] = useState<AiAnswer | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "fallback" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loggedSearchEventKeyRef = useRef<string | null>(null);
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const canAccessKnowledge =
    knowledgeRole === "admin" ||
    !profile ||
    canUseSalesDomain(profile, "meeting") ||
    canUseSalesDomain(profile, "teleapo");

  useEffect(() => {
    setSearchTerm(query);
  }, [query]);

  useEffect(() => {
    if (!userId || !companyId || !canAccessKnowledge) {
      setItems([]);
      return;
    }

    return subscribeToVisibleKnowledgeItems(
      { userId, companyId, role: knowledgeRole },
      setItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [canAccessKnowledge, companyId, knowledgeRole, userId]);

  useEffect(() => {
    if (!companyId || !canAccessKnowledge) {
      setProducts([]);
      return;
    }

    return subscribeToKnowledgeProducts(
      companyId,
      setProducts,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [canAccessKnowledge, companyId]);

  useEffect(() => {
    if (!userId || !query || !canAccessKnowledge) return;
    void saveKnowledgeSearch(userId, query).catch((nextError: unknown) => {
      setError(nextError instanceof Error ? nextError.message : "検索履歴の保存に失敗しました。");
    });
  }, [canAccessKnowledge, query, userId]);

  const results = useMemo(() => filterKnowledgeItems(items, query), [items, query]);
  const productResults = useMemo(() => filterKnowledgeProducts(products, query), [products, query]);
  const knowledgeEvidence = useMemo(() => buildSearchEvidence(results, query, basePath), [basePath, query, results]);
  const productEvidence = useMemo(() => buildProductEvidence(productResults, basePath), [basePath, productResults]);
  const evidence = useMemo(
    () => [...knowledgeEvidence, ...productEvidence],
    [knowledgeEvidence, productEvidence],
  );
  const personalResults = results.filter((item) => item.scope === "personal");
  const sharedResults = results.filter((item) => item.scope === "shared");
  const qaResults = results.filter((item) => item.kind === "qa");

  useEffect(() => {
    if (!userId || !query || !canAccessKnowledge) return;

    const eventKey = `${userId}:${query}:${results.length}:${productResults.length}:${evidence.length > 0}`;
    if (loggedSearchEventKeyRef.current === eventKey) return;
    loggedSearchEventKeyRef.current = eventKey;

    void saveKnowledgeSearchEvent({
      companyId: profile?.companyId,
      userId,
      query,
      resultCount: results.length + productResults.length,
      usedAi: evidence.length > 0 || productResults.length > 0,
    }).catch(() => undefined);
  }, [canAccessKnowledge, evidence.length, productResults.length, profile?.companyId, query, results.length, userId]);

  useEffect(() => {
    if (!query || evidence.length === 0) {
      setAiAnswer(null);
      setAiStatus("idle");
      setAiError(null);
      return;
    }

    let isActive = true;
    setAiStatus("loading");
    setAiError(null);

    getApiAuthHeaders({ "Content-Type": "application/json" })
      .then((headers) =>
        fetch("/api/knowledge/search-answer", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            sources: evidence.slice(0, 8).map((item) => ({
              id: item.id,
              title: item.title,
              kind: item.kind,
              scope: item.scope,
              snippets: item.snippets,
            })),
          }),
        }),
      )
      .then(async (response) => {
        const payload = (await response.json()) as {
          answer?: AiAnswer;
          error?: string;
          detail?: string;
        };

        if (!response.ok || !payload.answer) {
          throw new Error(payload.detail || payload.error || "AI回答の生成に失敗しました。");
        }

        if (!isActive) return;
        setAiAnswer(payload.answer);
        setAiStatus("ready");
      })
      .catch((nextError: unknown) => {
        if (!isActive) return;
        setAiAnswer(buildFallbackAnswer(query, evidence));
        setAiStatus("fallback");
        setAiError(nextError instanceof Error ? nextError.message : "AI回答の生成に失敗しました。");
      });

    return () => {
      isActive = false;
    };
  }, [evidence, query]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    router.push(`${basePath}/search${term ? `?q=${encodeURIComponent(term)}` : ""}`);
  };

  return (
    <main className="mx-auto max-w-[1500px] overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <section className="rounded-[24px] border border-[#eceef4] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] sm:px-5">
        <div className="grid items-center gap-4 lg:grid-cols-[140px_minmax(0,1fr)_auto]">
          <Link
            href={basePath}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#3d4350] transition hover:text-[#171717]"
          >
            <ArrowLeftIcon />
            ナレッジへ戻る
          </Link>

          <form
            onSubmit={handleSearch}
            className="flex min-h-[42px] items-center gap-3 rounded-full border border-[#eceef4] bg-[#fcfcfd] px-4 shadow-[0_6px_16px_rgba(17,24,39,0.03)] transition focus-within:border-[#ead8a8] hover:border-[#ead8a8] hover:bg-[#fffdf7]"
          >
            <span className="text-[#8f96a3]">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="キーワードを入力"
              className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#3d4350] outline-none placeholder:text-[#a2a8b3]"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-[18px] leading-none text-[#a4aab4] transition hover:text-[#171717]"
              >
                ×
              </button>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${basePath}/new?kind=knowledge&scope=personal`}
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PlusIcon />
              ナレッジを作成
            </Link>
            <Link
              href={`${basePath}/new?kind=memo&scope=personal`}
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#e6eaf0] bg-white px-4 text-[13px] font-semibold text-[#3d4350] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PenIcon />
              メモを作成
            </Link>
            <span className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#171717] shadow-[0_10px_18px_rgba(17,24,39,0.12)]">
              <Image src="/nareji.png" alt="ナレッジ" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            </span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="rounded-[20px] border border-[#eceef4] bg-white px-6 py-6 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
            <div className="flex items-center gap-2">
              <span className="text-[#f2bd00]">
                <SparkIcon />
              </span>
              <h1 className="text-[18px] font-bold text-[#171717]">AI回答</h1>
              {aiStatus === "loading" ? (
                <span className="rounded-full bg-[#fff5d8] px-2.5 py-1 text-[11px] font-bold text-[#8a6500]">
                  生成中
                </span>
              ) : null}
              {aiStatus === "fallback" ? (
                <span className="rounded-full bg-[#f1f2f5] px-2.5 py-1 text-[11px] font-bold text-[#596273]">
                  ローカル要約
                </span>
              ) : null}
            </div>
            {query && evidence.length > 0 && aiAnswer ? (
              <div className="mt-4">
                <p className="text-[14px] leading-7 text-[#3d4350]">{aiAnswer.overview}</p>
                {aiAnswer.bullets.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {aiAnswer.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2 text-[13px] leading-6 text-[#343b48]">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0c655]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {aiError ? (
                  <p className="mt-4 rounded-[14px] bg-[#fcfcfd] px-4 py-3 text-[12px] leading-5 text-[#7a808c]">
                    AI生成は利用できなかったため、検索結果から自動要約しています。
                  </p>
                ) : null}
                {aiAnswer.followUps.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {aiAnswer.followUps.map((followUp) => (
                      <button
                        key={followUp}
                        type="button"
                        onClick={() => {
                          setSearchTerm(followUp);
                          router.push(`${basePath}/search?q=${encodeURIComponent(followUp)}`);
                        }}
                        className="rounded-full border border-[#e6eaf0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#596273] transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : query && evidence.length > 0 ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-[#f0c655] bg-[#fffdf7] px-5 py-5 text-[14px] leading-7 text-[#3d4350]">
                「{query}」に関連するナレッジを確認しています。
              </div>
            ) : (
              <EmptyBlock
                icon={<SparkIcon />}
                title={query ? "AI回答はまだありません" : "キーワードを入力してください"}
                body={query ? "一致するナレッジが追加されると、検索キーワードに関連する回答がここに表示されます。" : "検索すると、関連するナレッジやQ&Aをまとめて確認できます。"}
              />
            )}
          </section>

          <EvidenceSection query={query} evidence={evidence} />
          <ProductResultSection query={query} products={productResults} basePath={basePath} />
          <ResultSection title="関連ナレッジ" query={query} items={results} emptyTitle="関連ナレッジはまだありません" basePath={basePath} />
          <ResultSection title="マイナレッジ" query={query} items={personalResults} emptyTitle="自分のナレッジはまだありません" basePath={basePath} />
          <ResultSection title="共有ナレッジ" query={query} items={sharedResults} emptyTitle="共有ナレッジはまだありません" basePath={basePath} />
          <ResultSection title="関連するQ&A" query={query} items={qaResults} emptyTitle="関連するQ&Aはまだありません" basePath={basePath} />
        </div>

        <aside className="space-y-5">
          <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
            <h2 className="text-[17px] font-bold text-[#171717]">検索サマリー</h2>
            <div className="mt-5 space-y-4">
              <SummaryRow label="商材情報" value={`${productResults.length}件`} icon={<BriefcaseIcon />} />
              <SummaryRow label="関連ナレッジ" value={`${results.length}件`} icon={<DocumentIcon />} />
              <SummaryRow label="根拠箇所" value={`${evidence.reduce((total, item) => total + item.snippets.length, 0)}件`} icon={<SparkIcon />} />
              <SummaryRow label="マイナレッジ" value={`${personalResults.length}件`} icon={<DocumentIcon />} />
              <SummaryRow label="共有ナレッジ" value={`${sharedResults.length}件`} icon={<BriefcaseIcon />} />
              <SummaryRow label="関連Q&A" value={`${qaResults.length}件`} icon={<QuestionIcon />} />
            </div>
            <div className="mt-5 border-t border-[#eef1f5] pt-5">
              <SummaryRow label="最終更新日" value={formatLatestDate(results)} icon={<ClockIcon />} />
            </div>
          </section>

          <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-6 text-center shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
            <Image src="/nareji.png" alt="ナレッジ" width={76} height={76} className="mx-auto h-[76px] w-[76px] object-contain" />
            <h2 className="mt-4 text-[16px] font-bold leading-6 text-[#171717]">
              探している情報が
              <br />
              見つかりませんか？
            </h2>
            <p className="mt-3 text-[13px] leading-6 text-[#7a808c]">
              ナレッジのリクエストやメモの作成ができます
            </p>
            <button
              type="button"
              className="mt-5 inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#f0c655] bg-white text-[13px] font-semibold text-[#171717]"
            >
              <MailIcon />
              リクエストする
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}

function EvidenceSection({ query, evidence }: { query: string; evidence: KnowledgeSearchEvidence[] }) {
  if (!query || evidence.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-[#171717]">根拠ハイライト</h2>
        <span className="rounded-full bg-[#fff5d8] px-3 py-1 text-[12px] font-bold text-[#8a6500]">
          {buildKnowledgeSearchTerms(query).join(" / ")}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {evidence.slice(0, 5).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[15px] font-bold text-[#171717]">{item.title}</h3>
              <span className="text-[12px] font-semibold text-[#8a909b]">{formatKind(item.kind)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {item.snippets.slice(0, 2).map((snippet) => (
                <p
                  key={snippet}
                  className="border-l-4 border-[#ffd84d] bg-white px-3 py-2 text-[13px] leading-6 text-[#343b48]"
                >
                  <HighlightedText text={snippet} query={query} />
                </p>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProductResultSection({
  query,
  products,
  basePath,
}: {
  query: string;
  products: Array<{ product: KnowledgeProduct; snippets: ProductSnippet[] }>;
  basePath: string;
}) {
  if (!query || products.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-[#171717]">商材登録データ</h2>
        <span className="rounded-full bg-[#edf2ff] px-3 py-1 text-[12px] font-bold text-[#5767c8]">
          admin登録情報
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {products.map(({ product, snippets }) => (
          <Link
            key={product.id}
            href={`${basePath}/products/${product.id}`}
            className="min-w-0 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-bold text-[#171717]">{product.name}</h3>
                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6d7481]">
                  {product.description || product.sourceSummary || product.valueProposition || "商材情報"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#8a909b]">
                商材
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {snippets.slice(0, 3).map((snippet) => (
                <div key={`${product.id}-${snippet.label}`} className="rounded-[12px] bg-white px-3 py-2">
                  <div className="text-[11px] font-bold text-[#8a6500]">{snippet.label}</div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#343b48]">
                    <HighlightedText text={snippet.value} query={query} />
                  </p>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ResultSection({
  title,
  query,
  items,
  emptyTitle,
  basePath,
}: {
  title: string;
  query: string;
  items: KnowledgeItem[];
  emptyTitle: string;
  basePath: string;
}) {
  return (
    <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <h2 className="text-[17px] font-bold text-[#171717]">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={getKnowledgeDetailHref(item, basePath)}
              className="min-w-0 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[#4f7df3]">
                  <DocumentIcon />
                </span>
                <h3 className="text-[14px] font-bold leading-5 text-[#171717]">{item.title}</h3>
              </div>
              <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[#6d7481]">
                {item.description || item.body || "本文未入力"}
              </p>
              {query ? (
                <p className="mt-3 border-l-4 border-[#ffd84d] bg-white px-3 py-2 text-[12px] leading-5 text-[#343b48]">
                  <HighlightedText text={buildBestSnippet(item, query) || "該当箇所を詳細で確認できます。"} query={query} />
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8a909b]">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{item.scope === "shared" ? "共有" : "自分用"}</span>
                  {item.tabTitle ? (
                    <span className="rounded-full bg-[#fff3cf] px-2 py-0.5 font-bold text-[#8a6500]">
                      {item.tabTitle}
                    </span>
                  ) : null}
                </span>
                <span>{formatDate(item.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyBlock icon={<DocumentIcon />} title={emptyTitle} body="条件に合うデータが登録されると、ここに表示されます。" />
      )}
    </section>
  );
}

function getKnowledgeDetailHref(item: KnowledgeItem, basePath: string) {
  if (item.productId) {
    return `${basePath}/products/${item.productId}/knowledge/${item.id}`;
  }

  return `${basePath}/categories/${item.categoryId ?? "how-to"}/knowledge/${item.id}`;
}

function buildSearchEvidence(items: KnowledgeItem[], query: string, basePath: string): KnowledgeSearchEvidence[] {
  if (!query.trim()) {
    return [];
  }

  return items
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      scope: item.scope,
      href: getKnowledgeDetailHref(item, basePath),
      snippets: buildKnowledgeSnippets(item, query),
    }))
    .filter((entry) => entry.snippets.length > 0)
    .sort((left, right) => right.snippets.length - left.snippets.length);
}

function buildKnowledgeSnippets(item: KnowledgeItem, query: string) {
  const searchTerms = buildKnowledgeSearchTerms(query);
  const candidates = [
    item.description,
    ...splitTextIntoSentences(item.body),
    ...item.links.flatMap((link) => [link.title, link.description, link.url]),
    ...item.attachments.map((attachment) => attachment.name),
  ].filter(Boolean);

  return Array.from(
    new Set(
      candidates
        .filter((candidate) => {
          const normalizedCandidate = candidate.toLowerCase();
          return searchTerms.some((term) => normalizedCandidate.includes(term));
        })
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  ).slice(0, 4);
}

function filterKnowledgeProducts(products: KnowledgeProduct[], query: string) {
  const searchTerms = buildKnowledgeSearchTerms(query);
  if (searchTerms.length === 0) {
    return [];
  }

  return products
    .map((product) => {
      const snippets = buildProductSnippets(product).filter((snippet) => {
        const searchableText = `${product.name} ${snippet.label} ${snippet.value}`.toLowerCase();
        return searchTerms.some((term) => searchableText.includes(term));
      });

      return { product, snippets };
    })
    .filter((entry) => entry.snippets.length > 0)
    .sort((left, right) => right.snippets.length - left.snippets.length);
}

function buildProductEvidence(products: Array<{ product: KnowledgeProduct; snippets: ProductSnippet[] }>, basePath: string): KnowledgeSearchEvidence[] {
  return products.map(({ product, snippets }) => ({
    id: `product-${product.id}`,
    title: product.name,
    kind: "product",
    scope: "shared",
    href: `${basePath}/products/${product.id}`,
    snippets: snippets.map((snippet) => `${snippet.label}: ${snippet.value}`).slice(0, 4),
  }));
}

function buildProductSnippets(product: KnowledgeProduct): ProductSnippet[] {
  return [
    { label: "商材概要", value: product.description },
    { label: "商材URL", value: product.sourceUrl },
    { label: "ターゲット顧客", value: product.targetCustomer },
    { label: "URL解析メモ", value: product.sourceSummary },
    { label: "顧客課題", value: product.painPoints.join("\n") },
    { label: "価値訴求", value: product.valueProposition },
    { label: "料金", value: product.pricing },
    { label: "競合", value: product.competitors.join("\n") },
    { label: "よくある反論", value: product.commonObjections.join("\n") },
    { label: "FAQ", value: product.faq.join("\n") },
    { label: "成功トーク", value: product.successTalk.join("\n") },
    { label: "NGトーク", value: product.ngTalk.join("\n") },
    ...product.customFields.map((field) => ({ label: field.label, value: field.value })),
  ]
    .map((snippet) => ({ label: snippet.label.trim(), value: snippet.value.trim() }))
    .filter((snippet) => snippet.label && snippet.value);
}

function buildBestSnippet(item: KnowledgeItem, query: string) {
  return buildKnowledgeSnippets(item, query)[0] ?? "";
}

function splitTextIntoSentences(text: string) {
  return text
    .split(/(?<=[。！？!?])|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildFallbackAnswer(query: string, evidence: KnowledgeSearchEvidence[]): AiAnswer {
  const sourceCount = evidence.length;
  const snippetCount = evidence.reduce((total, entry) => total + entry.snippets.length, 0);
  const topTerms = buildKnowledgeSearchTerms(query).slice(0, 5);

  return {
    overview: `「${query}」に関連するナレッジが ${sourceCount} 件、根拠になりそうな箇所が ${snippetCount} 件見つかりました。該当箇所を確認して、商談前の説明や切り返しに利用できます。`,
    bullets: [
      topTerms.length > 1 ? `関連語として「${topTerms.join("」「")}」も含めて検索しています。` : `「${query}」を含む箇所を抽出しています。`,
      evidence[0]?.title ? `特に「${evidence[0].title}」に関連する記述があります。` : "関連ナレッジの本文や概要から根拠を抽出しています。",
    ],
    followUps: [],
  };
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const searchTerms = buildKnowledgeSearchTerms(query);
  const pattern = searchTerms
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");

  if (!pattern) {
    return <>{text}</>;
  }

  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = searchTerms.some((term) => part.toLowerCase() === term.toLowerCase());

        return isMatch ? (
          <mark key={`${part}-${index}`} className="rounded bg-[#fff0a6] px-1 text-[#171717]">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatKind(kind: KnowledgeItem["kind"] | "product") {
  if (kind === "product") return "商材情報";
  if (kind === "memo") return "メモ";
  if (kind === "qa") return "Q&A";
  return "ナレッジ";
}

function EmptyBlock({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mt-4 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
        {icon}
      </span>
      <h3 className="mt-4 text-[18px] font-bold text-[#171717]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f7f8fb] text-[#3d4350]">
        {icon}
      </span>
      <span className="flex-1 font-medium text-[#596273]">{label}</span>
      <span className="font-bold text-[#171717]">{value}</span>
    </div>
  );
}

function formatLatestDate(items: KnowledgeItem[]) {
  const latest = items.reduce<Date | null>((current, item) => {
    if (!item.updatedAt) return current;
    if (!current || item.updatedAt.getTime() > current.getTime()) return item.updatedAt;
    return current;
  }, null);

  return formatDate(latest);
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.2]">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <path d="m4 20 4.2-1 9.9-9.9a1.8 1.8 0 0 0 0-2.6l-.6-.6a1.8 1.8 0 0 0-2.6 0L5 15.8 4 20Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M12 2.8 14.2 9l6.2 2.2-6.2 2.2L12 19.6l-2.2-6.2-6.2-2.2L9.8 9 12 2.8Z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h5" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <rect x="4" y="7" width="16" height="12" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 12h16" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9a2.4 2.4 0 0 1 4.4 1.3c0 1.7-2.2 2.1-2.2 3.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <rect x="4" y="6" width="16" height="12" rx="2.5" />
      <path d="m5 8 7 5 7-5" />
    </svg>
  );
}
