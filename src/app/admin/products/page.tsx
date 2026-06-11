"use client";

import { useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import {
  createKnowledgeProduct,
  updateKnowledgeProduct,
  uploadKnowledgeProductLogo,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { useAuth } from "@/features/auth/auth-provider";

export default function AdminProductsPage() {
  const { profile } = useAuth();
  const { products, knowledgeItems, roleplayScenarios, error } = useAdminInsights();
  const [editingProduct, setEditingProduct] = useState<KnowledgeProduct | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="PRODUCT ENABLEMENT"
          title="商材管理"
          description="商材ごとのナレッジ、反論、FAQ、ロープレシナリオを管理します。"
          action={<button type="button" onClick={() => setCreateOpen(true)} className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]">商材追加</button>}
        />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <KpiCard label="商材数" value={`${products.length}件`} note="knowledgeProducts" />
          <KpiCard label="紐づくナレッジ" value={`${knowledgeItems.filter((item) => item.productId).length}件`} note="商品IDあり" />
          <KpiCard label="紐づくロープレ" value={`${roleplayScenarios.filter((scenario) => scenario.productId).length}件`} note="商品IDあり" />
        </section>

        <Panel title="商材一覧">
          {products.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {products.map((product) => {
                const linkedKnowledge = knowledgeItems.filter((item) => item.productId === product.id);
                const linkedScenarios = roleplayScenarios.filter((scenario) => scenario.productId === product.id);
                return (
                  <article key={product.id} className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductLogo product={product} />
                        <div className="min-w-0">
                          <h2 className="truncate text-[20px] font-black text-[#171717]">{product.name}</h2>
                          <p className="mt-1 text-[12px] text-[#7a808c]">タブ {product.tabs.length}件</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setEditingProduct(product)} className="rounded-[12px] border border-[#e4e8ef] bg-white px-3 py-2 text-[12px] font-bold text-[#343b48]">編集</button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Info label="商品概要" value={findTab(linkedKnowledge, ["概要", "商品概要"])} />
                      <Info label="料金" value={findTab(linkedKnowledge, ["料金", "価格"])} />
                      <Info label="よくある反論" value="集計準備中" />
                      <Info label="FAQ" value={findTab(linkedKnowledge, ["Q&A", "FAQ"])} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-bold text-[#596273]">
                      <span className="rounded-full bg-white px-3 py-1">ナレッジ {linkedKnowledge.length}件</span>
                      <span className="rounded-full bg-white px-3 py-1">ロープレ {linkedScenarios.length}件</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="商材はまだありません" body="商材を追加すると、ナレッジやロープレを紐づけて管理できます。" />
          )}
        </Panel>

        {createOpen && profile?.uid && profile.companyId ? (
          <ProductDialog mode="create" userId={profile.uid} companyId={profile.companyId} onClose={() => setCreateOpen(false)} />
        ) : null}
        {editingProduct && profile?.uid && profile.companyId ? (
          <ProductDialog mode="edit" product={editingProduct} userId={profile.uid} companyId={profile.companyId} onClose={() => setEditingProduct(null)} />
        ) : null}
      </div>
    </PageShell>
  );
}

function ProductDialog({
  mode,
  product,
  userId,
  companyId,
  onClose,
}: {
  mode: "create" | "edit";
  product?: KnowledgeProduct;
  userId: string;
  companyId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [targetCustomer, setTargetCustomer] = useState(product?.targetCustomer ?? "");
  const [painPoints, setPainPoints] = useState((product?.painPoints ?? []).join("\n"));
  const [valueProposition, setValueProposition] = useState(product?.valueProposition ?? "");
  const [pricing, setPricing] = useState(product?.pricing ?? "");
  const [competitors, setCompetitors] = useState((product?.competitors ?? []).join("\n"));
  const [commonObjections, setCommonObjections] = useState((product?.commonObjections ?? []).join("\n"));
  const [successTalk, setSuccessTalk] = useState((product?.successTalk ?? []).join("\n"));
  const [ngTalk, setNgTalk] = useState((product?.ngTalk ?? []).join("\n"));
  const [sourceUrl, setSourceUrl] = useState(product?.sourceUrl ?? "");
  const [sourceSummary, setSourceSummary] = useState(product?.sourceSummary ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const nextName = name.trim();
    if (!nextName) {
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
      const analyzedSummary =
        sourceUrl.trim() && sourceUrl.trim() !== product?.sourceUrl && !sourceSummary.trim()
          ? await analyzeProductUrl(sourceUrl.trim())
          : sourceSummary.trim();
      const payload = {
        name: nextName,
        userId,
        companyId,
        description: description.trim(),
        targetCustomer: targetCustomer.trim(),
        painPoints: splitLines(painPoints),
        valueProposition: valueProposition.trim(),
        pricing: pricing.trim(),
        competitors: splitLines(competitors),
        commonObjections: splitLines(commonObjections),
        successTalk: splitLines(successTalk),
        ngTalk: splitLines(ngTalk),
        sourceUrl: sourceUrl.trim(),
        sourceSummary: analyzedSummary,
      };
      const productId = mode === "create" ? await createKnowledgeProduct(payload) : product?.id;
      if (!productId) throw new Error("商材IDを確認できませんでした。");
      let logoUrl = product?.logoUrl ?? "";
      let logoStoragePath = product?.logoStoragePath ?? "";
      if (logoFile) {
        const logo = await uploadKnowledgeProductLogo({ productId, userId, file: logoFile });
        logoUrl = logo.url;
        logoStoragePath = logo.storagePath;
      }
      await updateKnowledgeProduct({ id: productId, ...payload, logoUrl, logoStoragePath });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "商材の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[860px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-black text-[#171717]">{mode === "create" ? "商材追加" : "商材編集"}</h2>
            <p className="mt-1 text-[13px] text-[#7a808c]">商材情報、競合、反論、分析用URLを設定できます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
        </div>
        {error ? <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{error}</div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-bold text-[#343b48]">商材名</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none focus:border-[#e0bd4b]" />
        </label>
        <label className="block">
          <span className="text-[13px] font-bold text-[#343b48]">ロゴPNG</span>
          <span className="mt-2 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-4 py-3 text-[13px] text-[#596273]">
            <span className="min-w-0 truncate">{logoFile ? logoFile.name : product?.logoUrl ? "現在のロゴを使用中" : "PNGファイルを選択"}</span>
            <span className="font-bold text-[#8a6500]">選択</span>
          </span>
          <input type="file" accept="image/png,.png" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} className="sr-only" />
        </label>
        <Field label="商品URL">
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className={inputClassName} placeholder="https://..." />
        </Field>
        <Field label="ターゲット顧客">
          <input value={targetCustomer} onChange={(event) => setTargetCustomer(event.target.value)} className={inputClassName} placeholder="例：中小企業の管理部門" />
        </Field>
        <Field label="商品概要" className="md:col-span-2">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClassName} />
        </Field>
        <Field label="URL解析メモ" className="md:col-span-2">
          <textarea value={sourceSummary} onChange={(event) => setSourceSummary(event.target.value)} className={textareaClassName} placeholder="URLを入力して保存すると、未入力の場合のみ簡易解析して保存します。" />
        </Field>
        <Field label="顧客課題">
          <textarea value={painPoints} onChange={(event) => setPainPoints(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="価値訴求">
          <textarea value={valueProposition} onChange={(event) => setValueProposition(event.target.value)} className={textareaClassName} />
        </Field>
        <Field label="料金">
          <textarea value={pricing} onChange={(event) => setPricing(event.target.value)} className={textareaClassName} />
        </Field>
        <Field label="競合">
          <textarea value={competitors} onChange={(event) => setCompetitors(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="よくある反論">
          <textarea value={commonObjections} onChange={(event) => setCommonObjections(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="成功トーク">
          <textarea value={successTalk} onChange={(event) => setSuccessTalk(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="NGトーク" className="md:col-span-2">
          <textarea value={ngTalk} onChange={(event) => setNgTalk(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]">キャンセル</button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="h-11 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-black text-[#171717] disabled:opacity-60">{isSaving ? "保存中" : "保存する"}</button>
        </div>
      </div>
    </div>
  );
}

function ProductLogo({ product }: { product: KnowledgeProduct }) {
  if (product.logoUrl) {
    return <span className="h-12 w-12 shrink-0 rounded-[14px] border border-[#eceef4] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${product.logoUrl}")` }} />;
  }
  return <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#fff3cf] text-[18px] font-black text-[#8a6500]">{product.name.slice(0, 1)}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#eef1f5] bg-white px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] font-bold text-[#343b48]">{value === "集計準備中" ? <Placeholder /> : value}</div>
    </div>
  );
}

const inputClassName = "mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none focus:border-[#e0bd4b]";
const textareaClassName = "mt-2 min-h-[104px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#e0bd4b]";

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="text-[13px] font-bold text-[#343b48]">{label}</span>
      {children}
    </label>
  );
}

function findTab(items: Array<{ tabTitle: string; title: string }>, candidates: string[]) {
  const item = items.find((candidate) => candidates.includes(candidate.tabTitle));
  return item?.title ?? "集計準備中";
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

async function analyzeProductUrl(url: string) {
  try {
    const response = await fetch("/api/products/analyze-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as { summary?: string };
    return payload.summary?.trim() ?? "";
  } catch {
    return "";
  }
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
