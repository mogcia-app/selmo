"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  createKnowledgeCategory,
  createKnowledgeProduct,
  subscribeToKnowledgeCategories,
  subscribeToKnowledgeProducts,
  subscribeToRecentKnowledgeSearches,
  subscribeToVisibleKnowledgeItems,
  updateKnowledgeProduct,
  uploadKnowledgeProductLogo,
  type KnowledgeCategory,
  type KnowledgeItem,
  type KnowledgeProduct,
  type KnowledgeSearchHistory,
} from "@/lib/firebase/knowledge";

export default function SalesKnowledgePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<KnowledgeSearchHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const canCreateShared = profile?.role === "admin";

  useEffect(() => {
    if (!userId || !companyId) return;

    const handleError = (nextError: FirebaseError) => {
      setError(nextError.message);
    };
    const unsubscribers = [
      subscribeToKnowledgeCategories(companyId, setCategories, handleError),
      subscribeToKnowledgeProducts(companyId, setProducts, handleError),
      subscribeToVisibleKnowledgeItems({ userId, companyId }, setItems, handleError),
      subscribeToRecentKnowledgeSearches(userId, setSearchHistory, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [companyId, userId]);

  const personalItems = useMemo(
    () => items.filter((item) => item.ownerId === userId && item.scope === "personal").slice(0, 3),
    [items, userId],
  );
  const sharedItems = useMemo(
    () => items.filter((item) => item.scope === "shared").slice(0, 3),
    [items],
  );
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.id !== "how-to").slice(0, 4),
    [categories],
  );

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    const query = term ? `?q=${encodeURIComponent(term)}` : "";
    router.push(`/sales/knowledge/search${query}`);
  };

  const handleCreateCategory = async (input: { title: string; description?: string }) => {
    if (!userId || !companyId) return;
    await createKnowledgeCategory({
      title: input.title,
      description: input.description,
      userId,
      companyId,
    });
  };

  const handleCreateProduct = async (input: { name: string; logoFile?: File | null }) => {
    if (!userId || !companyId) return;
    const productId = await createKnowledgeProduct({ name: input.name, userId, companyId });

    if (input.logoFile) {
      const logo = await uploadKnowledgeProductLogo({
        productId,
        userId,
        file: input.logoFile,
      });
      await updateKnowledgeProduct({
        id: productId,
        name: input.name,
        logoUrl: logo.url,
        logoStoragePath: logo.storagePath,
      });
    }
  };

  const openCreateDialog = (input?: {
    kind?: "knowledge" | "memo" | "qa";
    scope?: "personal" | "shared";
    categoryId?: string | null;
  }) => {
    const params = new URLSearchParams();
    params.set("kind", input?.kind ?? "knowledge");
    params.set("scope", input?.scope ?? "personal");
    if (input?.categoryId) {
      params.set("categoryId", input.categoryId);
    }
    router.push(`/sales/knowledge/new?${params.toString()}`);
  };

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4">
      <div className="mx-auto max-w-[1500px]">
        <header className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="rounded-[28px] border border-[#eceef4] bg-white p-5 shadow-[0_12px_34px_rgba(17,24,39,0.04)] md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#171717] shadow-[0_10px_18px_rgba(17,24,39,0.12)]">
                    <Image src="/nareji.png" alt="ナレッジ" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-[#8a6500]">営業ナレッジ</p>
                    <h1 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717] md:text-[30px]">
                      商材別に探して、商談中にすぐ答える
                    </h1>
                  </div>
                </div>
                <p className="mt-4 max-w-[760px] text-[14px] leading-7 text-[#596273]">
                  管理者が共有した商材資料やマニュアル、自分で保存したメモをまとめて検索できます。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {canCreateShared ? (
                  <button
                    type="button"
                    onClick={() => openCreateDialog({ kind: "knowledge", scope: "shared" })}
                    className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.16)]"
                  >
                    <PlusIcon />
                    公式ナレッジ
                  </button>
                ) : null}
              </div>
            </div>

            <div className="relative mt-4 pt-[78px]">
              <div className="pointer-events-none absolute left-1/2 top-[-30px] z-10 w-[150px] -translate-x-1/2 md:w-[174px]">
                <Image
                  src="/kensaku1.png"
                  alt="検索"
                  width={320}
                  height={150}
                  className="h-auto w-full object-contain"
                />
              </div>
              <form
                onSubmit={handleSearch}
                className="relative flex items-center gap-3 rounded-[20px] border border-[#f0e3c1] bg-white px-4 py-4 shadow-[0_14px_34px_rgba(17,24,39,0.06)] transition focus-within:border-[#e0bd4b]"
              >
                <span className="text-[#8f96a3]">
                  <SearchIcon />
                </span>
                <input
                  id="knowledge-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="料金、導入、競合比較、解約条件などで検索"
                  className="w-full bg-transparent text-[16px] text-[#171717] outline-none placeholder:text-[#9aa1ac]"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-[13px] bg-[#171717] px-4 text-[13px] font-bold text-white"
                >
                  検索
                </button>
              </form>
            </div>

            {searchHistory.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-[#7a808c]">最近:</span>
                {searchHistory.slice(0, 4).map((history) => (
                  <Link
                    key={history.id}
                    href={{ pathname: "/sales/knowledge/search", query: { q: history.term } }}
                    className="rounded-full border border-[#e6eaf0] bg-white px-3 py-1.5 text-[12px] font-bold text-[#596273] transition hover:border-[#e0bd4b] hover:text-[#171717]"
                  >
                    {history.term}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          <aside className="flex items-start justify-center">
            <Image
              src="/tukaikata.png"
              alt="使い方"
              width={720}
              height={720}
              className="aspect-square h-auto w-full rounded-none object-contain"
              priority
            />
          </aside>
        </header>

      {error ? (
        <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
          {error}
        </div>
      ) : null}

      <section className="mt-6 rounded-[28px] border border-[#eceef4] bg-white p-5 shadow-[0_12px_34px_rgba(17,24,39,0.04)] md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.04em] text-[#171717]">商材別ナレッジ</h2>
            <p className="mt-1 text-[14px] text-[#7a808c]">商材ごとの概要、料金、機能、フロー、Q&Aを確認できます。</p>
          </div>
          <button
            type="button"
            onClick={() => setProductDialogOpen(true)}
            className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-semibold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
          >
            <PlusIcon />
            商材を追加
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/sales/knowledge/products/${product.id}`}
              className="min-w-0 rounded-[20px] border border-[#eceef4] bg-[#fcfcfd] px-5 py-5 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
            >
              <ProductLogo product={product} />
              <h3 className="mt-4 truncate text-[22px] font-bold text-[#171717]">{product.name}</h3>
              <div className="mt-4 flex items-center justify-between gap-3 text-[12px] font-medium text-[#8a909b]">
                <span>{product.knowledgeCount}件のナレッジ</span>
                <span>開く</span>
              </div>
            </Link>
          ))}
          <AddCard title="商材を追加" count="公式ナレッジの入口を作成" onClick={() => setProductDialogOpen(true)} />
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
        <KnowledgePanel
          title="自分のナレッジ"
          description="商談メモや、自分用にアレンジした内容"
          items={personalItems}
          emptyTitle="自分用メモを作成"
          emptyBody="商材に紐づかないメモも保存できます"
          actionLabel="メモを作成"
          onAction={() => openCreateDialog({ kind: "memo", scope: "personal" })}
        />

        <KnowledgePanel
          title="共有されたナレッジ"
          description="管理者やチームから配られた公式情報"
          items={sharedItems}
          emptyTitle="共有ナレッジはまだありません"
          emptyBody="商材別に作られた公式ナレッジもここに表示されます"
          actionLabel={canCreateShared ? "公式ナレッジを作成" : undefined}
          onAction={
            canCreateShared
              ? () => openCreateDialog({ kind: "knowledge", scope: "shared" })
              : undefined
          }
        />

        <article className="min-w-0 rounded-[24px] border border-[#eceef4] bg-white px-5 py-6 shadow-[0_8px_20px_rgba(17,24,39,0.04)] sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold text-[#171717]">補助カテゴリ</h2>
              <p className="mt-1 text-[13px] text-[#7a808c]">商材に紐づかない使い方や社内メモ</p>
            </div>
            <button
              type="button"
              onClick={() => setCategoryDialogOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#e4e8ef] bg-white text-[#8a6500]"
              aria-label="カテゴリを追加"
            >
              <PlusIcon />
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {visibleCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
            {visibleCategories.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-4 py-5 text-center text-[13px] text-[#7a808c]">
                補助カテゴリはまだありません
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <CategoryCreateDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onSubmit={handleCreateCategory}
      />
      <ProductCreateDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        onSubmit={handleCreateProduct}
      />
      </div>
    </main>
  );
}

function CategoryCreateDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; description?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setError(null);
    setIsSaving(false);
  }, [open]);

  if (!open) return null;

  return (
    <SimpleDialogFrame
      title="カテゴリを追加"
      description="ナレッジを整理するカテゴリを作成します。"
      error={error}
      isSaving={isSaving}
      submitLabel="追加する"
      onClose={onClose}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) {
          setError("カテゴリ名を入力してください。");
          return;
        }
        setIsSaving(true);
        setError(null);
        try {
          await onSubmit({ title: title.trim(), description: description.trim() });
          onClose();
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "カテゴリの追加に失敗しました。");
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <label>
        <span className="text-[13px] font-bold text-[#343b48]">カテゴリ名</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例：価格交渉"
          className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
          autoFocus
        />
      </label>
      <label className="mt-4 block">
        <span className="text-[13px] font-bold text-[#343b48]">説明</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="一覧に表示する短い説明"
          className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
        />
      </label>
    </SimpleDialogFrame>
  );
}

function ProductCreateDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; logoFile?: File | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLogoFile(null);
    setError(null);
    setIsSaving(false);
  }, [open]);

  if (!open) return null;

  return (
    <SimpleDialogFrame
      title="商材を追加"
      description="ナレッジを商材別に探せるようにします。"
      error={error}
      isSaving={isSaving}
      submitLabel="追加する"
      onClose={onClose}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError("商材名を入力してください。");
          return;
        }
        if (logoFile && logoFile.type !== "image/png" && !logoFile.name.toLowerCase().endsWith(".png")) {
          setError("ロゴ画像はPNGファイルを選択してください。");
          return;
        }
        setIsSaving(true);
        setError(null);
        try {
          await onSubmit({ name: name.trim(), logoFile });
          onClose();
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "商材の追加に失敗しました。");
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <label>
        <span className="text-[13px] font-bold text-[#343b48]">商材名</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例：Selmo"
          className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
          autoFocus
        />
      </label>
      <label className="mt-4 block">
        <span className="text-[13px] font-bold text-[#343b48]">ロゴ画像</span>
        <span className="mt-2 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-4 py-3 text-[13px] text-[#596273] transition hover:border-[#f0c655] hover:bg-[#fffdf7]">
          <span className="min-w-0 truncate">{logoFile ? logoFile.name : "PNGファイルを選択"}</span>
          <span className="shrink-0 font-bold text-[#8a6500]">選択</span>
        </span>
        <input
          type="file"
          accept="image/png,.png"
          onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>
    </SimpleDialogFrame>
  );
}

function SimpleDialogFrame({
  title,
  description,
  error,
  isSaving,
  submitLabel,
  children,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  error: string | null;
  isSaving: boolean;
  submitLabel: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[520px] rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_24px_70px_rgba(17,24,39,0.18)] md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">{title}</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#e6eaf0] text-[22px] leading-none text-[#8a909b] transition hover:text-[#171717]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        {error ? (
          <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}
        <div className="mt-5">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-bold text-[#171717] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "保存中" : submitLabel}
          </button>
        </div>
      </form>
    </div>
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
  actionLabel?: string;
  onAction?: () => void;
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
            <Link
              key={item.id}
              href={getKnowledgeDetailHref(item)}
              className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4"
            >
              <div className="truncate text-[15px] font-semibold text-[#171717]">{item.title}</div>
              <div className="mt-1 text-[12px] text-[#8a909b]">更新：{formatDate(item.updatedAt)}</div>
            </Link>
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

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#f0c655] bg-white text-[14px] font-semibold text-[#171717]"
        >
          <PlusIcon />
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function CategoryRow({ category }: { category: Pick<KnowledgeCategory, "id" | "title" | "knowledgeCount"> }) {
  return (
    <Link
      href={`/sales/knowledge/categories/${category.id}`}
      className="flex items-center gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white text-[#8a6500]">
        <CategoryIcon />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#171717]">{category.title}</span>
      <span className="text-[12px] font-medium text-[#8a909b]">{category.knowledgeCount}件</span>
    </Link>
  );
}

function getKnowledgeDetailHref(item: KnowledgeItem) {
  return `/sales/knowledge/categories/${item.categoryId ?? "how-to"}/knowledge/${item.id}`;
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

function ProductLogo({ product }: { product: KnowledgeProduct }) {
  if (product.logoUrl) {
    return (
      <span className="inline-flex h-11 w-11 overflow-hidden rounded-[14px] border border-[#eceef4] bg-white shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
        <span
          aria-label={`${product.name}のロゴ`}
          role="img"
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${product.logoUrl}")` }}
        />
      </span>
    );
  }

  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fff0b8] text-[#8a6500]">
      <ProductIcon />
    </span>
  );
}
