"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  buildKnowledgeSearchTerms,
  filterKnowledgeItems,
  saveKnowledgeSearch,
  subscribeToKnowledgeProducts,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";

type KnowledgeSelection =
  | { type: "item"; item: KnowledgeItem }
  | { type: "product"; product: KnowledgeProduct };

type ProductSearchResult = {
  product: KnowledgeProduct;
  snippets: string[];
};

export function SalesKnowledgeChatWidget() {
  const { profile } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [selection, setSelection] = useState<KnowledgeSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const isKnowledgePage = pathname.startsWith("/sales/knowledge");

  useEffect(() => {
    if (!isKnowledgePage) return;
    setIsOpen(false);
    setSelection(null);
  }, [isKnowledgePage]);

  useEffect(() => {
    if (!userId || !companyId) {
      setItems([]);
      return;
    }

    return subscribeToVisibleKnowledgeItems(
      { userId, companyId, role: "sales" },
      setItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId, userId]);

  useEffect(() => {
    if (!companyId) {
      setProducts([]);
      return;
    }

    return subscribeToKnowledgeProducts(
      companyId,
      setProducts,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId]);

  const knowledgeResults = useMemo(
    () => filterKnowledgeItems(items, submittedQuery).slice(0, 8),
    [items, submittedQuery],
  );
  const productResults = useMemo(
    () => filterKnowledgeProducts(products, submittedQuery).slice(0, 5),
    [products, submittedQuery],
  );
  const searchTerms = useMemo(() => buildKnowledgeSearchTerms(submittedQuery), [submittedQuery]);
  const resultCount = knowledgeResults.length + productResults.length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);

    if (userId && nextQuery) {
      void saveKnowledgeSearch(userId, nextQuery).catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : "検索履歴の保存に失敗しました。");
      });
    }
  };

  const closeWidget = () => {
    setIsOpen(false);
    setSelection(null);
    setQuery("");
    setSubmittedQuery("");
    setError(null);
  };

  if (isKnowledgePage) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="fixed bottom-6 right-6 z-40 flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#e8ebf0] bg-white shadow-[0_18px_42px_rgba(17,24,39,0.18)] transition hover:-translate-y-0.5 hover:border-[#f0c655] hover:bg-[#fffdf7]"
        aria-label="ナレッジチャットを開く"
        aria-expanded={isOpen}
      >
        <Image src="/sechat.png" alt="" width={54} height={54} className="h-[54px] w-[54px] object-contain" />
      </button>

      {isOpen && !selection ? (
        <aside
          className="fixed right-6 bottom-24 z-40 flex max-h-[min(680px,calc(100vh-120px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-[#e8ebf0] bg-white shadow-[0_24px_64px_rgba(17,24,39,0.2)] max-lg:right-4"
        >
          <div className="border-b border-[#eef1f5] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fffaf0]">
                  <Image src="/sechat.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
                </span>
                <div>
                  <div className="text-[14px] font-black text-[#171717]">ナレッジチャット</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#8d94a1]">ページを開いたまま検索できます</div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeWidget}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e8ebf0] text-[20px] leading-none text-[#8d94a1] transition hover:border-[#f0c655] hover:text-[#171717]"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2 rounded-[16px] border border-[#e8ebf0] bg-[#fcfcfd] px-3 py-2 focus-within:border-[#f0c655]">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="料金、反論、事例など"
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#171717] outline-none placeholder:text-[#a3aab5]"
              />
              <button
                type="submit"
                className="h-9 rounded-[12px] bg-[#ffc400] px-3 text-[12px] font-black text-[#171717]"
              >
                検索
              </button>
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {error ? (
              <div className="mb-3 rounded-[14px] border border-[#ffd2cc] bg-[#fff2ef] px-3 py-2 text-[12px] font-bold text-[#cf4b39]">
                {error}
              </div>
            ) : null}

            {!submittedQuery ? (
              <EmptyState title="ナレッジをすぐ確認" body="ロープレ中や商談準備中に、キーワードでメモ・Q&A・商材情報を探せます。" />
            ) : resultCount === 0 ? (
              <EmptyState title="該当ナレッジなし" body="別のキーワードで検索するか、ナレッジを追加してください。" />
            ) : (
              <div className="space-y-4">
                <div className="rounded-[16px] bg-[#fffaf0] px-4 py-3">
                  <div className="text-[12px] font-bold text-[#9c7600]">検索結果</div>
                  <div className="mt-1 text-[14px] font-black text-[#171717]">
                    「{submittedQuery}」に {resultCount} 件ヒット
                  </div>
                </div>

                {productResults.length > 0 ? (
                  <ResultGroup title="商材情報">
                    {productResults.map(({ product, snippets }) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelection({ type: "product", product })}
                        className="block w-full rounded-[16px] border border-[#eef1f5] bg-white px-4 py-3 text-left transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                      >
                        <div className="text-[14px] font-black text-[#171717]">{product.name}</div>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6f7480]">
                          {snippets[0] || product.description || product.valueProposition || "商材情報を確認"}
                        </div>
                      </button>
                    ))}
                  </ResultGroup>
                ) : null}

                {knowledgeResults.length > 0 ? (
                  <ResultGroup title="ナレッジ">
                    {knowledgeResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelection({ type: "item", item })}
                        className="block w-full rounded-[16px] border border-[#eef1f5] bg-white px-4 py-3 text-left transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 truncate text-[14px] font-black text-[#171717]">{item.title}</div>
                          <span className="shrink-0 rounded-full bg-[#f1f2f5] px-2 py-1 text-[10px] font-bold text-[#596273]">
                            {formatKind(item.kind)}
                          </span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6f7480]">
                          {item.description || item.body || "詳細を確認"}
                        </div>
                      </button>
                    ))}
                  </ResultGroup>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      ) : null}

      {selection ? (
        <KnowledgeDetailDrawer selection={selection} searchTerms={searchTerms} onClose={() => setSelection(null)} />
      ) : null}
    </>
  );
}

function KnowledgeDetailDrawer({
  selection,
  searchTerms,
  onClose,
}: {
  selection: KnowledgeSelection;
  searchTerms: string[];
  onClose: () => void;
}) {
  const isProduct = selection.type === "product";
  const title = isProduct ? selection.product.name : selection.item.title;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const searchKey = searchTerms.join("\u0001");

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || searchTerms.length === 0) return;

    const animationFrame = requestAnimationFrame(() => {
      const firstMatch = container.querySelector<HTMLElement>("[data-knowledge-search-match='true']");
      firstMatch?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [searchKey, searchTerms.length, selection]);

  return (
    <aside className="fixed bottom-6 right-6 top-24 z-50 flex w-[min(430px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-[#e8ebf0] bg-white shadow-[0_24px_64px_rgba(17,24,39,0.22)]">
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-[#9c7600]">{isProduct ? "商材情報" : "ナレッジ"}</div>
            <h2 className="mt-1 line-clamp-2 text-[18px] font-black leading-7 text-[#171717]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e8ebf0] text-[20px] leading-none text-[#8d94a1] transition hover:border-[#f0c655] hover:text-[#171717]"
            aria-label="詳細を閉じる"
          >
            ×
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {isProduct ? (
          <ProductDetail product={selection.product} searchTerms={searchTerms} />
        ) : (
          <KnowledgeItemDetail item={selection.item} searchTerms={searchTerms} />
        )}
      </div>
    </aside>
  );
}

function KnowledgeItemDetail({ item, searchTerms }: { item: KnowledgeItem; searchTerms: string[] }) {
  return (
    <div className="space-y-4">
      <DetailBlock label="概要" value={item.description || "未登録"} searchTerms={searchTerms} />
      <DetailBlock label={item.tabTitle || "本文"} value={item.body || "未登録"} searchTerms={searchTerms} multiline />
      {item.tags.length > 0 ? (
        <div>
          <div className="text-[12px] font-black text-[#8d94a1]">タグ</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#fffaf0] px-3 py-1 text-[11px] font-bold text-[#9c7600]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {item.links.length > 0 ? (
        <div>
          <div className="text-[12px] font-black text-[#8d94a1]">リンク</div>
          <div className="mt-2 space-y-2">
            {item.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-[14px] border border-[#eef1f5] px-3 py-2 text-[12px] font-bold text-[#171717] transition hover:border-[#f0c655]"
              >
                {link.title || link.url}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductDetail({ product, searchTerms }: { product: KnowledgeProduct; searchTerms: string[] }) {
  return (
    <div className="space-y-4">
      <DetailBlock label="概要" value={product.description || "未登録"} searchTerms={searchTerms} multiline />
      <DetailBlock label="ターゲット顧客" value={product.targetCustomer || "未登録"} searchTerms={searchTerms} multiline />
      <DetailBlock label="価値訴求" value={product.valueProposition || "未登録"} searchTerms={searchTerms} multiline />
      <DetailBlock label="料金" value={product.pricing || "未登録"} searchTerms={searchTerms} multiline />
      <DetailList label="顧客課題" values={product.painPoints} searchTerms={searchTerms} />
      <DetailList label="よくある反論" values={product.commonObjections} searchTerms={searchTerms} />
      <DetailList label="FAQ" values={product.faq} searchTerms={searchTerms} />
      <DetailList label="成功トーク" values={product.successTalk} searchTerms={searchTerms} />
      <DetailList label="競合" values={product.competitors} searchTerms={searchTerms} />
      {product.customFields.length > 0 ? (
        <div className="space-y-3">
          {product.customFields.map((field) => (
            <DetailBlock key={field.id} label={field.label} value={field.value || "未登録"} searchTerms={searchTerms} multiline />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({
  label,
  value,
  searchTerms,
  multiline = false,
}: {
  label: string;
  value: string;
  searchTerms?: string[];
  multiline?: boolean;
}) {
  return (
    <section className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
      <div className="text-[12px] font-black text-[#8d94a1]">{label}</div>
      <div className={`mt-2 text-[13px] font-semibold leading-6 text-[#343b48] ${multiline ? "whitespace-pre-wrap" : ""}`}>
        <HighlightedText value={value} searchTerms={searchTerms} />
      </div>
    </section>
  );
}

function DetailList({ label, values, searchTerms }: { label: string; values: string[]; searchTerms?: string[] }) {
  if (values.length === 0) {
    return <DetailBlock label={label} value="未登録" searchTerms={searchTerms} />;
  }

  return (
    <section className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
      <div className="text-[12px] font-black text-[#8d94a1]">{label}</div>
      <ul className="mt-2 space-y-2">
        {values.map((value) => (
          <li key={value} className="flex gap-2 text-[13px] font-semibold leading-6 text-[#343b48]">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffc400]" />
            <span><HighlightedText value={value} searchTerms={searchTerms} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HighlightedText({ value, searchTerms }: { value: string; searchTerms?: string[] }) {
  const terms = Array.from(new Set((searchTerms ?? []).filter(Boolean))).sort((left, right) => right.length - left.length);
  if (terms.length === 0) {
    return <>{value}</>;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = value.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = terms.some((term) => part.toLowerCase() === term.toLowerCase());
        if (!isMatch) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <mark
            key={`${part}-${index}`}
            data-knowledge-search-match="true"
            className="rounded-[4px] bg-[#fff1a8] px-0.5 py-[1px] font-black text-[#171717] underline decoration-[#ffc400] decoration-2 underline-offset-2"
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[12px] font-black text-[#8d94a1]">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
      <div className="text-[14px] font-black text-[#171717]">{title}</div>
      <p className="mt-2 text-[12px] font-semibold leading-5 text-[#7a808c]">{body}</p>
    </div>
  );
}

function filterKnowledgeProducts(products: KnowledgeProduct[], query: string): ProductSearchResult[] {
  const searchTerms = buildKnowledgeSearchTerms(query);
  if (searchTerms.length === 0) {
    return [];
  }

  return products
    .map((product) => {
      const snippets = buildProductSnippets(product).filter((snippet) =>
        searchTerms.some((term) => snippet.toLowerCase().includes(term.toLowerCase())),
      );
      return { product, snippets };
    })
    .filter((result) => result.snippets.length > 0)
    .sort((left, right) => right.snippets.length - left.snippets.length);
}

function buildProductSnippets(product: KnowledgeProduct) {
  return [
    product.name,
    product.description,
    product.targetCustomer,
    product.valueProposition,
    product.pricing,
    product.sourceSummary,
    ...product.painPoints,
    ...product.commonObjections,
    ...product.faq,
    ...product.successTalk,
    ...product.ngTalk,
    ...product.competitors,
    ...product.customFields.map((field) => `${field.label}: ${field.value}`),
  ].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatKind(kind: KnowledgeItem["kind"]) {
  if (kind === "qa") return "Q&A";
  if (kind === "memo") return "メモ";
  return "ナレッジ";
}
