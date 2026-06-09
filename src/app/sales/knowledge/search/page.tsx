"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  filterKnowledgeItems,
  saveKnowledgeSearch,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";

export default function SalesKnowledgeSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const query = searchParams.get("q")?.trim() ?? "";
  const [searchTerm, setSearchTerm] = useState(query);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const userId = profile?.uid;

  useEffect(() => {
    setSearchTerm(query);
  }, [query]);

  useEffect(() => {
    if (!userId) return;

    return subscribeToVisibleKnowledgeItems(
      userId,
      setItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [userId]);

  useEffect(() => {
    if (!userId || !query) return;
    void saveKnowledgeSearch(userId, query).catch((nextError: unknown) => {
      setError(nextError instanceof Error ? nextError.message : "検索履歴の保存に失敗しました。");
    });
  }, [query, userId]);

  const results = useMemo(() => filterKnowledgeItems(items, query), [items, query]);
  const personalResults = results.filter((item) => item.scope === "personal");
  const sharedResults = results.filter((item) => item.scope === "shared");
  const qaResults = results.filter((item) => item.kind === "qa");

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    router.push(`/sales/knowledge/search${term ? `?q=${encodeURIComponent(term)}` : ""}`);
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-6 py-8 md:px-10">
      <section className="rounded-[24px] border border-[#eceef4] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] sm:px-5">
        <div className="grid items-center gap-4 lg:grid-cols-[140px_minmax(0,1fr)_auto]">
          <Link
            href="/sales/knowledge"
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
            <button
              type="button"
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PlusIcon />
              ナレッジを作成
            </button>
            <button
              type="button"
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#e6eaf0] bg-white px-4 text-[13px] font-semibold text-[#3d4350] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PenIcon />
              メモを作成
            </button>
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
            </div>
            {query && results.length > 0 ? (
              <p className="mt-4 text-[14px] leading-7 text-[#3d4350]">
                「{query}」に関連するナレッジが {results.length} 件見つかりました。関連ナレッジや共有ナレッジを確認して、商談前の準備に活用できます。
              </p>
            ) : (
              <EmptyBlock
                icon={<SparkIcon />}
                title={query ? "AI回答はまだありません" : "キーワードを入力してください"}
                body={query ? "一致するナレッジが追加されると、検索キーワードに関連する回答がここに表示されます。" : "検索すると、関連するナレッジやQ&Aをまとめて確認できます。"}
              />
            )}
          </section>

          <ResultSection title="関連ナレッジ" items={results} emptyTitle="関連ナレッジはまだありません" />
          <ResultSection title="マイナレッジ" items={personalResults} emptyTitle="自分のナレッジはまだありません" />
          <ResultSection title="共有ナレッジ" items={sharedResults} emptyTitle="共有ナレッジはまだありません" />
          <ResultSection title="関連するQ&A" items={qaResults} emptyTitle="関連するQ&Aはまだありません" />
        </div>

        <aside className="space-y-5">
          <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
            <h2 className="text-[17px] font-bold text-[#171717]">検索サマリー</h2>
            <div className="mt-5 space-y-4">
              <SummaryRow label="関連ナレッジ" value={`${results.length}件`} icon={<DocumentIcon />} />
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

function ResultSection({ title, items, emptyTitle }: { title: string; items: KnowledgeItem[]; emptyTitle: string }) {
  return (
    <section className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <h2 className="text-[17px] font-bold text-[#171717]">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[#4f7df3]">
                  <DocumentIcon />
                </span>
                <h3 className="text-[14px] font-bold leading-5 text-[#171717]">{item.title}</h3>
              </div>
              <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[#6d7481]">
                {item.description || item.body || "本文未入力"}
              </p>
              <div className="mt-4 flex items-center justify-between text-[11px] text-[#8a909b]">
                <span>{item.scope === "shared" ? "共有" : "自分用"}</span>
                <span>{formatDate(item.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock icon={<DocumentIcon />} title={emptyTitle} body="条件に合うデータが登録されると、ここに表示されます。" />
      )}
    </section>
  );
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
