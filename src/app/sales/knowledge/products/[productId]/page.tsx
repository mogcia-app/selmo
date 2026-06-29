"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { getKnowledgeBasePath } from "@/lib/knowledge-paths";
import {
  addKnowledgeProductTab,
  deleteKnowledgeProductTab,
  subscribeToKnowledgeItemsByProduct,
  subscribeToKnowledgeProducts,
  updateKnowledgeProduct,
  uploadKnowledgeProductLogo,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";

type ProductSection = {
  title: string;
  body: string;
};

export default function SalesKnowledgeProductPage() {
  const params = useParams<{ productId: string }>();
  const pathname = usePathname();
  const { profile } = useAuth();
  const productId = params.productId;
  const basePath = getKnowledgeBasePath(pathname);
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [tabDialogOpen, setTabDialogOpen] = useState(false);
  const [productInfoOpen, setProductInfoOpen] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState("");
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [deletingTabTitle, setDeletingTabTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    return subscribeToKnowledgeProducts(companyId, setProducts, handleError);
  }, [companyId]);

  useEffect(() => {
    if (!userId || !companyId || !productId) return;

    return subscribeToKnowledgeItemsByProduct(
      { productId, userId, companyId },
      setItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId, productId, userId]);

  const product = useMemo(
    () => products.find((candidate) => candidate.id === productId) ?? null,
    [productId, products],
  );
  const productSections = useMemo(() => buildProductSections(product), [product]);
  const tabs = useMemo(() => buildProductTabs(items, product?.tabs ?? [], productSections), [items, product?.tabs, productSections]);
  const visibleItems = useMemo(
    () =>
      activeTab === "all"
        ? items
        : items.filter((item) => getProductTabTitle(item) === activeTab),
    [activeTab, items],
  );
  const visibleProductSections = useMemo(
    () => (activeTab === "all" ? productSections : productSections.filter((section) => section.title === activeTab)),
    [activeTab, productSections],
  );
  const latestDate = formatLatestDate(items);
  const handleDeleteProductTab = async (title: string) => {
    if (deletingTabTitle) return;

    setDeletingTabTitle(title);
    setError(null);
    try {
      await deleteKnowledgeProductTab({ productId, title });
      if (activeTab === title) {
        setActiveTab("all");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "タブの削除に失敗しました。");
    } finally {
      setDeletingTabTitle(null);
    }
  };

  return (
    <main className="overflow-x-hidden bg-transparent">
      <div className="min-w-0 px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
        <div className="mx-auto max-w-[1180px] min-w-0">
          <Link
            href={basePath}
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

          <section className="mt-6 rounded-[24px] border border-[#eceef4] bg-white px-6 py-8 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                {product ? (
                  <ProductLogoManager product={product} userId={userId} onError={setError} />
                ) : (
                  <ProductLogo product={product} />
                )}
                <h1 className="mt-4 text-[34px] font-bold tracking-[-0.03em] text-[#171717]">
                  {product?.name ?? "商材"}
                </h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`${basePath}/new?kind=knowledge&scope=personal&productId=${encodeURIComponent(productId)}${
                    activeTab !== "all" ? `&tabTitle=${encodeURIComponent(activeTab)}` : ""
                  }`}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[14px] border border-[#f0c655] bg-white px-5 text-[14px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
                >
                  <PlusIcon />
                  ナレッジを追加
                </Link>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-[#eef1f5] pt-5">
              <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
                すべて
                <span className="ml-2 text-[11px] text-[#8a909b]">{items.length + (productSections.length > 0 ? 1 : 0)}</span>
              </TabButton>
              {tabs.map((tab) => {
                const canDeleteTab = Boolean(product?.tabs.includes(tab.title));
                const isActive = activeTab === tab.title;

                return (
                  <span
                    key={tab.title}
                    className={`inline-flex h-10 items-center rounded-[13px] border transition ${
                      isActive
                        ? "border-[#f0c655] bg-[#fffdf7] text-[#171717]"
                        : "border-[#e6eaf0] bg-white text-[#596273] hover:border-[#ead8a8]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.title)}
                      className="h-full min-w-0 px-4 text-[13px] font-bold"
                    >
                      {tab.title}
                      <span className="ml-2 text-[11px] text-[#8a909b]">{tab.count}</span>
                    </button>
                    {canDeleteTab ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteProductTab(tab.title)}
                        disabled={deletingTabTitle === tab.title}
                        className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[14px] leading-none text-[#b8a46b] transition hover:bg-[#fff0ed] hover:text-[#b4232a] disabled:opacity-50"
                        aria-label={`${tab.title}を削除`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => setTabDialogOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-dashed border-[#d7ad35] bg-[#fffdf7] px-4 text-[13px] font-bold text-[#8a6500]"
              >
                <PlusIcon />
                タブを追加
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 text-[13px] text-[#596273]">
              <Pill>{`商材情報 ${productSections.length > 0 ? 1 : 0}件`}</Pill>
              <Pill>{`ナレッジ ${items.filter((item) => item.kind === "knowledge").length}件`}</Pill>
              <Pill>{`メモ ${items.filter((item) => item.kind === "memo").length}件`}</Pill>
              <Pill>{`Q&A ${items.filter((item) => item.kind === "qa").length}件`}</Pill>
              {latestDate ? <Pill>{`最終更新：${latestDate}`}</Pill> : null}
            </div>
          </section>

          <section className="mt-6 max-h-[560px] overflow-y-auto pr-1 pb-8 md:max-h-[calc(100vh-360px)]">
            {visibleProductSections.length > 0 || visibleItems.length > 0 ? (
              <div className="space-y-3">
                {visibleProductSections.length > 0 && product ? (
                  <ProductInfoCard
                    product={product}
                    sections={productSections}
                    previewSections={visibleProductSections}
                    activeTab={activeTab}
                    onOpen={() => setProductInfoOpen(true)}
                  />
                ) : null}
                {visibleItems.map((item) => (
                  <Link
                    key={item.id}
                    href={getKnowledgeDetailHref(item, basePath)}
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
                          {formatKind(item.kind)}
                        </span>
                        <span className="rounded-full bg-[#f1f2f5] px-2.5 py-0.5 text-[11px] font-bold text-[#596273]">
                          {getProductTabTitle(item)}
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
                <h2 className="mt-4 text-[22px] font-bold text-[#171717]">
                  {activeTab === "all" ? "この商材のナレッジはまだありません" : `${activeTab} のナレッジはまだありません`}
                </h2>
                <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-7 text-[#7a808c]">
                  商材に紐づけて作成したナレッジやメモが、タブごとに表示されます。
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {tabDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const title = newTabTitle.trim();
              if (!title) {
                setError("タブ名を入力してください。");
                return;
              }
              setIsAddingTab(true);
              setError(null);
              try {
                await addKnowledgeProductTab({ productId, title });
                setActiveTab(title);
                setNewTabTitle("");
                setTabDialogOpen(false);
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "タブの追加に失敗しました。");
              } finally {
                setIsAddingTab(false);
              }
            }}
            className="w-full max-w-[460px] rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-bold text-[#171717]">商材タブを追加</h2>
                <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                  追加したタブは、この商材の共有ナレッジや自分のナレッジにも共通で表示されます。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTabDialogOpen(false)}
                className="text-[22px] leading-none text-[#9aa1ac] transition hover:text-[#171717]"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-[13px] font-bold text-[#343b48]">タブ名</span>
              <input
                value={newTabTitle}
                onChange={(event) => setNewTabTitle(event.target.value)}
                placeholder="例：料金、導入フロー、FAQ"
                className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                autoFocus
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTabDialogOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isAddingTab}
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-bold text-[#171717] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAddingTab ? "追加中" : "追加する"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {productInfoOpen && product ? (
        <ProductInfoDialog
          product={product}
          sections={productSections}
          onClose={() => setProductInfoOpen(false)}
        />
      ) : null}
    </main>
  );
}

function getKnowledgeDetailHref(item: KnowledgeItem, basePath: string) {
  if (item.productId) {
    return `${basePath}/products/${item.productId}/knowledge/${item.id}`;
  }

  return `${basePath}/categories/${item.categoryId ?? "how-to"}/knowledge/${item.id}`;
}

function buildProductTabs(items: KnowledgeItem[], productTabs: string[], productSections: ProductSection[]) {
  const counts = new Map<string, number>();

  productSections.forEach((section) => {
    counts.set(section.title, (counts.get(section.title) ?? 0) + 1);
  });

  productTabs.forEach((tab) => {
    const title = tab.trim();
    if (title) {
      counts.set(title, counts.get(title) ?? 0);
    }
  });

  items.forEach((item) => {
    const title = getProductTabTitle(item);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((left, right) => {
      if (left.title === "未分類") return 1;
      if (right.title === "未分類") return -1;
      return left.title.localeCompare(right.title, "ja");
    });
}

function buildProductSections(product: KnowledgeProduct | null): ProductSection[] {
  if (!product) {
    return [];
  }

  return [
    { title: "商材概要", body: product.description },
    { title: "商材URL", body: product.sourceUrl },
    { title: "ターゲット顧客", body: product.targetCustomer },
    { title: "URL解析メモ", body: product.sourceSummary },
    { title: "顧客課題", body: product.painPoints.join("\n") },
    { title: "価値訴求", body: product.valueProposition },
    { title: "料金", body: product.pricing },
    { title: "競合", body: product.competitors.join("\n") },
    { title: "よくある反論", body: product.commonObjections.join("\n") },
    { title: "FAQ", body: product.faq.join("\n") },
    { title: "成功トーク", body: product.successTalk.join("\n") },
    { title: "NGトーク", body: product.ngTalk.join("\n") },
    ...product.customFields.map((field) => ({ title: field.label, body: field.value })),
  ]
    .map((section) => ({ title: section.title.trim(), body: section.body.trim() }))
    .filter((section) => section.title && section.body);
}

function getProductTabTitle(item: KnowledgeItem) {
  return item.tabTitle || "未分類";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center rounded-[13px] border px-4 text-[13px] font-bold transition ${
        active
          ? "border-[#f0c655] bg-[#fffdf7] text-[#171717]"
          : "border-[#e6eaf0] bg-white text-[#596273] hover:border-[#ead8a8]"
      }`}
    >
      {children}
    </button>
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

  return latest ? formatDate(latest) : null;
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKind(kind: KnowledgeItem["kind"]) {
  if (kind === "memo") return "メモ";
  if (kind === "qa") return "Q&A";
  return "ナレッジ";
}

function buildProductUpdateInput(
  product: KnowledgeProduct,
  overrides: Partial<Pick<KnowledgeProduct, "name" | "logoUrl" | "logoStoragePath">>,
) {
  return {
    id: product.id,
    name: overrides.name ?? product.name,
    description: product.description,
    targetCustomer: product.targetCustomer,
    painPoints: product.painPoints,
    valueProposition: product.valueProposition,
    pricing: product.pricing,
    competitors: product.competitors,
    commonObjections: product.commonObjections,
    faq: product.faq,
    successTalk: product.successTalk,
    ngTalk: product.ngTalk,
    customFields: product.customFields,
    sourceUrl: product.sourceUrl,
    sourceSummary: product.sourceSummary,
    logoUrl: overrides.logoUrl ?? product.logoUrl,
    logoStoragePath: overrides.logoStoragePath ?? product.logoStoragePath,
  };
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

function ProductIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <rect x="5" y="6" width="14" height="12" rx="2.5" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}

function ProductLogo({ product }: { product: KnowledgeProduct | null }) {
  if (product?.logoUrl) {
    return (
      <span className="inline-flex h-12 w-12 overflow-hidden rounded-[15px] border border-[#eceef4] bg-white shadow-[0_8px_18px_rgba(17,24,39,0.05)]">
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
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-[15px] bg-[#fff0b8] text-[#8a6500]">
      <ProductIcon />
    </span>
  );
}

function ProductLogoManager({
  product,
  userId,
  onError,
}: {
  product: KnowledgeProduct;
  userId: string | undefined;
  onError: (message: string | null) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const handleChangeLogo = async (file: File | null) => {
    if (!file) return;

    if (!userId) {
      onError("ログイン情報を確認できませんでした。");
      return;
    }

    if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
      onError("ロゴ画像はPNGファイルを選択してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      const logo = await uploadKnowledgeProductLogo({
        productId: product.id,
        userId,
        file,
      });
      await updateKnowledgeProduct(buildProductUpdateInput(product, {
        logoUrl: logo.url,
        logoStoragePath: logo.storagePath,
      }));
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "ロゴ画像の更新に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    setIsSaving(true);
    onError(null);
    try {
      await updateKnowledgeProduct(buildProductUpdateInput(product, {
        logoUrl: "",
        logoStoragePath: "",
      }));
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "ロゴ画像の削除に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ProductLogo product={product} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[12px] font-bold text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fffdf7]">
          {isSaving ? "更新中" : product.logoUrl ? "ロゴ変更" : "ロゴ追加"}
          <input
            type="file"
            accept="image/png,.png"
            disabled={isSaving}
            onChange={(event) => {
              void handleChangeLogo(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
            className="sr-only"
          />
        </label>
        {product.logoUrl ? (
          <button
            type="button"
            onClick={() => void handleDeleteLogo()}
            disabled={isSaving}
            className="inline-flex h-9 items-center justify-center rounded-[12px] border border-[#f0d9d9] bg-white px-3 text-[12px] font-bold text-[#b4232a] transition hover:bg-[#fff8f8] disabled:opacity-60"
          >
            削除
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProductInfoCard({
  product,
  sections,
  previewSections,
  activeTab,
  onOpen,
}: {
  product: KnowledgeProduct;
  sections: ProductSection[];
  previewSections: ProductSection[];
  activeTab: string;
  onOpen: () => void;
}) {
  const preview =
    activeTab === "all"
      ? sections.slice(0, 4).map((section) => `${section.title}: ${section.body}`).join("\n")
      : previewSections[0]?.body ?? "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-4 rounded-[14px] border border-[#e5e9f0] bg-white px-4 py-4 text-left shadow-[0_6px_16px_rgba(17,24,39,0.025)] transition hover:border-[#f0c655] hover:bg-[#fffdf7] md:grid-cols-[56px_minmax(0,1fr)_112px]"
    >
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-[12px] bg-[#fff3cf] text-[#8a6500] [&_svg]:h-6 [&_svg]:w-6">
        <ProductIcon />
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-[16px] font-bold text-[#171717]">
          {activeTab === "all" ? `${product.name}の商材情報` : `${activeTab} / 商材情報`}
        </h3>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-6 text-[#596273]">
          {preview || "商材情報を確認できます。"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#edf2ff] px-2.5 py-0.5 text-[11px] font-bold text-[#5767c8]">
            admin登録
          </span>
          <span className="rounded-full bg-[#fff3cf] px-2.5 py-0.5 text-[11px] font-bold text-[#a97d00]">
            商材情報
          </span>
          <span className="rounded-full bg-[#f1f2f5] px-2.5 py-0.5 text-[11px] font-bold text-[#596273]">
            {sections.length}項目
          </span>
        </div>
      </div>
      <div className="flex items-start justify-end">
        <span className="rounded-full border border-[#e4e8ef] bg-white px-3 py-1 text-[12px] font-bold text-[#596273]">
          詳細
        </span>
      </div>
    </button>
  );
}

function ProductInfoDialog({
  product,
  sections,
  onClose,
}: {
  product: KnowledgeProduct;
  sections: ProductSection[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <section className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <ProductLogo product={product} />
            <h2 className="mt-4 truncate text-[24px] font-bold tracking-[-0.03em] text-[#171717]">
              {product.name}の商材情報
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
              adminで登録された商材情報をまとめて確認できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[24px] leading-none text-[#9aa1ac] transition hover:text-[#171717]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={`product-info-${section.title}`} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
              <h3 className="text-[13px] font-bold text-[#8a6500]">{section.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-7 text-[#343b48]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>
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
