"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  createKnowledgeCategory,
  createKnowledgeItem,
  createKnowledgeProduct,
  subscribeToKnowledgeCategories,
  subscribeToKnowledgeProducts,
  subscribeToRecentKnowledgeSearches,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeCategory,
  type KnowledgeItem,
  type KnowledgeProduct,
  type KnowledgeSearchHistory,
} from "@/lib/firebase/knowledge";

const DEFAULT_CATEGORY = {
  id: "how-to",
  title: "使い方",
  description: "Selmoの使い方やナレッジ整理の基本",
  knowledgeCount: 0,
  updatedAt: null,
} as const;

export default function SalesKnowledgePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<KnowledgeSearchHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const userId = profile?.uid;

  useEffect(() => {
    if (!userId) return;

    const handleError = (nextError: FirebaseError) => {
      setError(nextError.message);
    };
    const unsubscribers = [
      subscribeToKnowledgeCategories(setCategories, handleError),
      subscribeToKnowledgeProducts(setProducts, handleError),
      subscribeToVisibleKnowledgeItems(userId, setItems, handleError),
      subscribeToRecentKnowledgeSearches(userId, setSearchHistory, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [userId]);

  const personalItems = useMemo(
    () => items.filter((item) => item.ownerId === userId && item.scope === "personal").slice(0, 3),
    [items, userId],
  );
  const sharedItems = useMemo(
    () => items.filter((item) => item.scope === "shared").slice(0, 3),
    [items],
  );

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    const query = term ? `?q=${encodeURIComponent(term)}` : "";
    router.push(`/sales/knowledge/search${query}`);
  };

  const handleCreateCategory = async () => {
    if (!userId) return;
    const title = window.prompt("カテゴリ名を入力してください");
    if (!title?.trim()) return;
    await createKnowledgeCategory({ title: title.trim(), userId });
  };

  const handleCreateProduct = async () => {
    if (!userId) return;
    const name = window.prompt("商品名を入力してください");
    if (!name?.trim()) return;
    await createKnowledgeProduct({ name: name.trim(), userId });
  };

  const handleCreateKnowledge = async (scope: "personal" | "shared" = "personal") => {
    if (!userId) return;
    const title = window.prompt(scope === "shared" ? "共有ナレッジのタイトルを入力してください" : "ナレッジのタイトルを入力してください");
    if (!title?.trim()) return;
    await createKnowledgeItem({ title: title.trim(), ownerId: userId, scope });
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-6 py-8 md:px-10">
      <section className="relative pb-8 pt-2 md:pb-10 md:pt-3">
        <div className="absolute inset-0">
          <Image
            src="/haikei1.png"
            alt="ナレッジ背景"
            fill
            priority
            className="object-contain object-top"
          />
        </div>

        <div className="relative z-10 flex justify-end">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleCreateKnowledge("personal")}
              className="inline-flex h-[42px] items-center gap-2 rounded-[15px] border border-[#f0c655] bg-white px-4 text-[12px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PlusIcon />
              ナレッジを作成
            </button>
            <button
              type="button"
              onClick={() => handleCreateKnowledge("personal")}
              className="inline-flex h-[42px] items-center gap-2 rounded-[15px] border border-[#e6eaf0] bg-white px-4 text-[12px] font-semibold text-[#3d4350] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
            >
              <PenIcon />
              メモを作成
            </button>
            <div className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#171717] shadow-[0_10px_18px_rgba(17,24,39,0.12)]">
              <Image src="/nareji.png" alt="ナレッジ" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto mt-8 max-w-[1380px]">
          <div className="mx-auto max-w-[900px] text-center">
            <div className="inline-flex items-center gap-4 text-[19px] font-semibold text-[#222222]">
              <span className="text-[#171717]">＼</span>
              <span className="inline-flex items-center gap-2">
                <span className="text-[26px]">☀️</span>
                おはようございます！
              </span>
              <span className="text-[#171717]">／</span>
            </div>

            <h1 className="mt-6 text-[15px] font-bold tracking-[-0.06em] text-[#171717] sm:text-[21px]">
              必要なナレッジを、すぐに見つけよう
            </h1>

            <div className="mx-auto mt-3 h-[6px] w-[340px] max-w-full rounded-full bg-[#ffd13a]" />

            <p className="mt-6 text-[13px] leading-6 text-[#6f7684] sm:text-[15px]">
              営業の悩みや疑問に、すぐ使えるヒントが見つかります
            </p>
          </div>

          <div className="relative mx-auto mt-2 max-w-[980px] pt-[64px]">
            <div className="pointer-events-none absolute left-1/2 top-[-18px] z-20 w-[168px] -translate-x-1/2">
              <Image
                src="/kensaku1.png"
                alt="検索"
                width={320}
                height={150}
                className="h-auto w-full object-contain"
              />
            </div>

            <div className="rounded-[28px] border border-[#f0e3c1] bg-white px-4 py-5 shadow-[0_20px_48px_rgba(17,24,39,0.06)] sm:px-6 sm:py-6">
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-3 rounded-[999px] border border-[#eceef4] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(17,24,39,0.05)] transition focus-within:border-[#ead8a8] hover:border-[#ead8a8] hover:bg-[#fffdf7]"
              >
                <span className="text-[#8f96a3]">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="キーワードを入力"
                  className="w-full bg-transparent text-[17px] text-[#171717] outline-none placeholder:text-[#a2a8b3]"
                />
                <button type="submit" className="text-[18px] text-[#171717]">
                  →
                </button>
              </form>

            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-6 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
          {error}
        </div>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[30px] font-bold tracking-[-0.04em] text-[#171717]">カテゴリ</h2>
          <button
            type="button"
            onClick={handleCreateCategory}
            className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
          >
            <PlusIcon />
            カテゴリを追加
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Link
            href={`/sales/knowledge/categories/${DEFAULT_CATEGORY.id}`}
            className="min-w-0 rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(17,24,39,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fff0b8] text-[#8a6500]">
                <CategoryIcon />
              </span>
              <span className="rounded-full bg-[#fff5d8] px-2.5 py-1 text-[11px] font-bold text-[#8a6500]">
                はじめに
              </span>
            </div>
            <span className="mt-4 block truncate text-[22px] font-bold text-[#171717]">{DEFAULT_CATEGORY.title}</span>
            <span className="mt-2 block truncate text-[14px] text-[#6d7481]">{DEFAULT_CATEGORY.description}</span>
            <div className="mt-4 flex items-center justify-between gap-3 text-[12px] font-medium text-[#8a909b]">
              <span>{DEFAULT_CATEGORY.knowledgeCount}件</span>
              <span>{formatDate(DEFAULT_CATEGORY.updatedAt)}</span>
            </div>
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/sales/knowledge/categories/${category.id}`}
              className="min-w-0 rounded-[20px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(17,24,39,0.04)]"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fff0b8] text-[#8a6500]">
                <CategoryIcon />
              </span>
              <span className="mt-4 block truncate text-[22px] font-bold text-[#171717]">{category.title}</span>
              <span className="mt-2 block truncate text-[14px] text-[#6d7481]">{category.description || "説明未設定"}</span>
              <div className="mt-4 flex items-center justify-between gap-3 text-[12px] font-medium text-[#8a909b]">
                <span>{category.knowledgeCount}件</span>
                <span>{formatDate(category.updatedAt)}</span>
              </div>
            </Link>
          ))}
          <AddCard title="新しいカテゴリ" count="0件" onClick={handleCreateCategory} />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[30px] font-bold tracking-[-0.04em] text-[#171717]">商品で探す</h2>
          <button
            type="button"
            onClick={handleCreateProduct}
            className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
          >
            <PlusIcon />
            商品を追加
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {products.map((product) => (
            <article
              key={product.id}
              className="min-w-0 rounded-[20px] border border-[#eceef4] bg-white px-6 py-5 shadow-[0_8px_20px_rgba(17,24,39,0.04)]"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fff0b8] text-[#8a6500]">
                <ProductIcon />
              </span>
              <h3 className="mt-4 truncate text-[22px] font-bold text-[#171717]">{product.name}</h3>
              <p className="mt-2 text-[14px] text-[#6d7481]">{product.knowledgeCount}件</p>
            </article>
          ))}
          <AddCard title="新しい商品" count="0件" onClick={handleCreateProduct} />
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(340px,0.78fr)]">
        <KnowledgePanel
          title="マイナレッジ"
          description="自分だけのナレッジやメモ"
          items={personalItems}
          emptyTitle="新しいナレッジを作成"
          emptyBody="自分用の提案メモや切り返しを保存できます"
          actionLabel="ナレッジを作成"
          onAction={() => handleCreateKnowledge("personal")}
        />

        <KnowledgePanel
          title="共有ナレッジ"
          description="管理者から共有されたナレッジ"
          items={sharedItems}
          emptyTitle="共有ナレッジを追加"
          emptyBody="チームで使う資料やFAQをまとめられます"
          actionLabel="共有ナレッジを追加"
          onAction={() => handleCreateKnowledge("shared")}
        />

        <article className="min-w-0 rounded-[24px] border border-[#eceef4] bg-white px-5 py-6 shadow-[0_8px_20px_rgba(17,24,39,0.04)] sm:px-6">
          <h2 className="min-w-0 text-[24px] font-bold text-[#171717] sm:text-[28px]">最近の検索履歴</h2>
          {searchHistory.length > 0 ? (
            <div className="mt-5 space-y-3">
              {searchHistory.map((history) => (
                <Link
                  key={history.id}
                  href={{ pathname: "/sales/knowledge/search", query: { q: history.term } }}
                  className="flex items-center gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 text-[14px] font-semibold text-[#171717]"
                >
                  <SearchIcon />
                  <span className="min-w-0 flex-1 truncate">{history.term}</span>
                  <span className="text-[12px] font-medium text-[#9aa1ac]">{formatDate(history.searchedAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                <SearchIcon />
              </span>
              <h3 className="mt-4 text-[18px] font-bold text-[#171717]">検索履歴はまだありません</h3>
              <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-6 text-[#7a808c]">
                ナレッジを検索すると、直近のキーワードがここに表示されます
              </p>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function KnowledgePanel({
  title,
  description,
  items,
  emptyTitle,
  emptyBody,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  items: KnowledgeItem[];
  emptyTitle: string;
  emptyBody: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className="min-w-0 rounded-[24px] border border-[#eceef4] bg-white px-6 py-6 shadow-[0_8px_20px_rgba(17,24,39,0.04)]">
      <div>
        <h2 className="text-[28px] font-bold tracking-[-0.04em] text-[#171717]">{title}</h2>
        <p className="mt-1 text-[14px] text-[#7a808c]">{description}</p>
      </div>

      {items.length > 0 ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4"
            >
              <div className="truncate text-[15px] font-semibold text-[#171717]">{item.title}</div>
              <div className="mt-1 text-[12px] text-[#8a909b]">更新：{formatDate(item.updatedAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[18px] border border-dashed border-[#e0c36b] bg-[#fffdf7] px-5 py-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.05)]">
            <PlusIcon />
          </span>
          <h3 className="mt-4 text-[18px] font-bold text-[#171717]">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-6 text-[#7a808c]">{emptyBody}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#f0c655] bg-white text-[14px] font-semibold text-[#171717]"
      >
        <PlusIcon />
        {actionLabel}
      </button>
    </article>
  );
}

function AddCard({ title, count, onClick }: { title: string; count: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[126px] rounded-[20px] border border-dashed border-[#e0c36b] bg-[#fffdf7] px-6 py-5 text-left transition hover:border-[#d7ad35] hover:bg-[#fff9e8]"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.05)]">
        <PlusIcon />
      </span>
      <span className="mt-4 block text-[22px] font-bold text-[#171717]">{title}</span>
      <span className="mt-2 block text-[14px] text-[#6d7481]">{count}</span>
    </button>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[2]">
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

function CategoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.5v9M8 11.5h8" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <rect x="5" y="6" width="14" height="12" rx="2.5" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}
