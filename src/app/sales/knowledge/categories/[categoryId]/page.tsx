"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToKnowledgeCategories,
  subscribeToKnowledgeItemsByCategory,
  type KnowledgeCategory,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";

const DEFAULT_CATEGORY = {
  id: "how-to",
  title: "使い方",
  description: "Selmoの使い方やナレッジ整理の基本を確認できます。",
} as const;

export default function SalesKnowledgeCategoryPage() {
  const params = useParams<{ categoryId: string }>();
  const { profile } = useAuth();
  const categoryId = params.categoryId;
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    return subscribeToKnowledgeCategories(companyId, setCategories, handleError);
  }, [companyId]);

  useEffect(() => {
    if (!userId || !companyId || !categoryId) return;

    return subscribeToKnowledgeItemsByCategory(
      { categoryId, userId, companyId },
      setItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [categoryId, companyId, userId]);

  const category = useMemo(
    () =>
      categories.find((candidate) => candidate.id === categoryId) ??
      (categoryId === DEFAULT_CATEGORY.id
        ? {
            id: DEFAULT_CATEGORY.id,
            title: DEFAULT_CATEGORY.title,
            description: DEFAULT_CATEGORY.description,
            knowledgeCount: 0,
            memoCount: 0,
            updatedAt: null,
          }
        : null),
    [categories, categoryId],
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfbfc]">
      <div className="min-w-0 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-[1180px] min-w-0">
          <Link
            href="/sales/knowledge"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#596273] transition hover:text-[#171717]"
          >
            <ArrowLeftIcon />
            ナレッジへ戻る
          </Link>

          {error ? (
            <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
              {error}
            </div>
          ) : null}

          <section className="mt-6 grid min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="flex items-center gap-6">
                <span className="inline-flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-[22px] bg-[#fff3c8] text-[#171717]">
                  <Image
                    src="/gaido.png"
                    alt="カテゴリ"
                    width={88}
                    height={88}
                    className="h-[88px] w-[88px] object-contain"
                    priority
                  />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-[36px] font-bold tracking-[-0.03em] text-[#171717]">
                    {category?.title ?? "カテゴリ"}
                  </h1>
                  <p className="mt-4 max-w-[640px] text-[15px] leading-7 text-[#172033]">
                    {category?.description || "このカテゴリに追加したナレッジやメモを確認できます。"}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 text-[13px] text-[#596273]">
                <Pill>{`ナレッジ ${items.filter((item) => item.kind === "knowledge").length}件`}</Pill>
                <Pill>{`メモ ${items.filter((item) => item.kind === "memo").length}件`}</Pill>
                <Pill>{`最終更新：${formatLatestDate(items)}`}</Pill>
              </div>
            </div>

            <div className="hidden min-w-0 justify-end lg:flex">
              <div className="relative h-[240px] w-[340px]">
                <Image
                  src="/kiiro.png"
                  alt=""
                  width={560}
                  height={380}
                  className="absolute left-1/2 top-1/2 z-0 h-[360px] w-[520px] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
                />
                <Image
                  src="/mojiokoshi.png"
                  alt="ナレッジ作成"
                  width={360}
                  height={260}
                  className="relative z-10 h-full w-full object-contain"
                  priority
                />
              </div>
            </div>
          </section>

          <section className="mt-10">
            {items.length > 0 ? (
              <div className="mt-6 space-y-3">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/sales/knowledge/categories/${categoryId}/knowledge/${item.id}`}
                    className="grid gap-4 rounded-[14px] border border-[#e5e9f0] bg-white px-4 py-4 shadow-[0_6px_16px_rgba(17,24,39,0.025)] md:grid-cols-[56px_minmax(0,1fr)_112px]"
                  >
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-[12px] bg-[#ecefff] text-[#5767c8] [&_svg]:h-6 [&_svg]:w-6">
                      <DocumentIcon />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[16px] font-bold text-[#171717]">{item.title}</h3>
                      <p className="mt-1 truncate text-[13px] leading-5 text-[#596273]">
                        {item.description || item.body || "本文未入力"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#edf2ff] px-2.5 py-0.5 text-[11px] font-bold text-[#5767c8]">
                          {item.scope === "shared" ? "共有" : "自分用"}
                        </span>
                        <span className="rounded-full bg-[#fff3cf] px-2.5 py-0.5 text-[11px] font-bold text-[#a97d00]">
                          {item.kind}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start justify-end">
                      <span className="text-[12px] text-[#596273]">{formatDate(item.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#f0c655] bg-[#fffdf7] px-6 py-14 text-center">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-white text-[#9c7600] shadow-[0_8px_18px_rgba(17,24,39,0.05)]">
                  <PlusIcon />
                </div>
                <h2 className="mt-4 text-[22px] font-bold text-[#171717]">まだナレッジがありません</h2>
                <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-7 text-[#7a808c]">
                  このカテゴリに追加したナレッジやメモが、ここに表示されます。
                </p>
              </div>
            )}

            <Link
              href={`/sales/knowledge/new?kind=knowledge&scope=personal&categoryId=${encodeURIComponent(categoryId)}`}
              className="mt-5 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#f0c655] bg-white text-[15px] font-bold text-[#171717] hover:bg-[#fffdf7]"
            >
              <PlusIcon />
              ナレッジを追加
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#f1f2f5] px-4 py-2 font-medium text-[#596273] shadow-[0_4px_14px_rgba(17,24,39,0.03)]">
      {children}
    </span>
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

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[2.1]">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10 fill-none stroke-current stroke-[1.9]">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 13h6M9 16h5" />
    </svg>
  );
}
