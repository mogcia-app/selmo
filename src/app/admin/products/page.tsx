"use client";

import { useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { getApiAuthHeaders } from "@/lib/client/api-auth";
import {
  createKnowledgeProduct,
  updateKnowledgeProduct,
  uploadKnowledgeProductLogo,
  type KnowledgeProductCustomField,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { useAuth } from "@/features/auth/auth-provider";

export default function AdminProductsPage() {
  const { profile } = useAuth();
  const { products, knowledgeItems, roleplayScenarios, error } = useAdminInsights();
  const [editingProduct, setEditingProduct] = useState<KnowledgeProduct | null>(null);
  const [viewingProduct, setViewingProduct] = useState<KnowledgeProduct | null>(null);
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

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <KpiCard label="商材数" value={`${products.length}件`} note="登録済み商材" />
          <KpiCard label="紐づくナレッジ" value={`${knowledgeItems.filter((item) => item.productId).length}件`} note="商材に紐づく資料" />
          <KpiCard label="紐づくロープレ" value={`${roleplayScenarios.filter((scenario) => scenario.productId).length}件`} note="商材に紐づく練習" />
        </section>

        <div className="mt-8">
          <Panel title="商材一覧">
            {products.length > 0 ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {products.map((product) => {
                  const linkedKnowledge = knowledgeItems.filter((item) => item.productId === product.id);
                  const linkedScenarios = roleplayScenarios.filter((scenario) => scenario.productId === product.id);
                  return (
                    <article
                      key={product.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewingProduct(product)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setViewingProduct(product);
                        }
                      }}
                      className="cursor-pointer rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-5 py-5 transition hover:border-[#e0bd4b] hover:bg-white"
                    >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductLogo product={product} />
                        <div className="min-w-0">
                          <h2 className="truncate text-[20px] font-black text-[#171717]">{product.name}</h2>
                          <p className="mt-1 text-[12px] text-[#7a808c]">タブ {product.tabs.length}件</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingProduct(product);
                        }}
                        className="rounded-[12px] border border-[#e4e8ef] bg-white px-3 py-2 text-[12px] font-bold text-[#343b48]"
                      >
                        編集
                      </button>
                    </div>

                    <Info label="商材概要" value={formatTextSummary(product.description)} className="mt-4" />

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
        </div>

        {createOpen && profile?.uid && profile.companyId ? (
          <ProductDialog mode="create" userId={profile.uid} companyId={profile.companyId} onClose={() => setCreateOpen(false)} />
        ) : null}
        {editingProduct && profile?.uid && profile.companyId ? (
          <ProductDialog mode="edit" product={editingProduct} userId={profile.uid} companyId={profile.companyId} onClose={() => setEditingProduct(null)} />
        ) : null}
        {viewingProduct ? (
          <ProductDetailDialog
            product={viewingProduct}
            onClose={() => setViewingProduct(null)}
            onEdit={() => {
              setViewingProduct(null);
              setEditingProduct(viewingProduct);
            }}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

function ProductDetailDialog({
  product,
  onClose,
  onEdit,
}: {
  product: KnowledgeProduct;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[860px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <ProductLogo product={product} />
            <div className="min-w-0">
              <h2 className="truncate text-[22px] font-black text-[#171717]">{product.name}</h2>
              <p className="mt-1 text-[13px] text-[#7a808c]">商材詳細</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DetailItem label="商材概要" value={product.description} className="md:col-span-2" />
          <DetailItem label="商材URL" value={product.sourceUrl} />
          <DetailItem label="ターゲット顧客" value={product.targetCustomer} />
          <DetailItem label="URL解析メモ" value={formatUrlAnalysisMemo(product.sourceSummary)} className="md:col-span-2" />
          <DetailItem label="顧客課題" value={formatLines(product.painPoints)} />
          <DetailItem label="価値訴求" value={product.valueProposition} />
          <DetailItem label="料金" value={product.pricing} />
          <DetailItem label="競合" value={formatLines(product.competitors)} />
          <DetailItem label="よくある反論" value={formatLines(product.commonObjections)} />
          <DetailItem label="FAQ" value={formatLines(product.faq)} />
          <DetailItem label="成功トーク" value={formatLines(product.successTalk)} />
          <DetailItem label="NGトーク" value={formatLines(product.ngTalk)} />
          {product.customFields.map((field) => (
            <DetailItem key={field.id} label={field.label} value={field.value} />
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]">閉じる</button>
          <button type="button" onClick={onEdit} className="h-11 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-black text-[#171717]">編集</button>
        </div>
      </div>
    </div>
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
  const [faq, setFaq] = useState((product?.faq ?? []).join("\n"));
  const [successTalk, setSuccessTalk] = useState((product?.successTalk ?? []).join("\n"));
  const [ngTalk, setNgTalk] = useState((product?.ngTalk ?? []).join("\n"));
  const [customFields, setCustomFields] = useState<KnowledgeProductCustomField[]>(product?.customFields ?? []);
  const [sourceUrl, setSourceUrl] = useState(product?.sourceUrl ?? "");
  const [sourceSummary, setSourceSummary] = useState(product?.sourceSummary ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [isStructuring, setIsStructuring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStructurePaste = async () => {
    if (!bulkText.trim()) {
      setError("一括貼り付け欄に商材情報を入力してください。");
      return;
    }

    setIsStructuring(true);
    setError(null);
    try {
      const structured = await structureProductPaste(bulkText);
      setName((current) => structured.name || current);
      setDescription((current) => structured.description || current);
      setTargetCustomer((current) => structured.targetCustomer || current);
      setPainPoints(joinLines(structured.painPoints) || painPoints);
      setValueProposition((current) => structured.valueProposition || current);
      setPricing((current) => structured.pricing || current);
      setCompetitors(joinLines(structured.competitors) || competitors);
      setCommonObjections(joinLines(structured.commonObjections) || commonObjections);
      setFaq(joinLines(structured.faq) || faq);
      setSuccessTalk(joinLines(structured.successTalk) || successTalk);
      setNgTalk(joinLines(structured.ngTalk) || ngTalk);
      setSourceSummary((current) => structured.sourceSummary || current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI整理に失敗しました。");
    } finally {
      setIsStructuring(false);
    }
  };

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
    const normalizedCustomFields = normalizeCustomFields(customFields);
    if (!normalizedCustomFields) {
      setError("自由項目は項目名と中身を両方入力してください。");
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
        faq: splitLines(faq),
        successTalk: splitLines(successTalk),
        ngTalk: splitLines(ngTalk),
        customFields: normalizedCustomFields,
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
            <p className="mt-1 text-[13px] text-[#7a808c]">商材資料やLP本文を一括貼り付けして、AIで項目ごとに整理できます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
        </div>
        {error ? <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{error}</div> : null}
        <div className="mt-5 rounded-[18px] border border-[#f0e3c1] bg-[#fffaf0] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[14px] font-black text-[#171717]">一括貼り付け</div>
              <p className="mt-1 text-[12px] leading-5 text-[#6f6250]">
                商材資料・LP本文・提案メモを貼ると、概要、顧客課題、価値訴求、反論、競合などに自動で分けます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStructurePaste()}
              disabled={isStructuring}
              className="h-10 shrink-0 rounded-[13px] bg-[#171717] px-4 text-[13px] font-black text-white disabled:opacity-60"
            >
              {isStructuring ? "整理中..." : "AIで項目に分ける"}
            </button>
          </div>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            className="mt-3 min-h-[150px] w-full resize-y rounded-[14px] border border-[#f0d992] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#d7a900]"
            placeholder="ここに商材資料やLP本文をそのまま貼り付け"
          />
        </div>

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
        <Field label="商材URL">
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className={inputClassName} placeholder="https://..." />
        </Field>
        <Field label="ターゲット顧客">
          <input value={targetCustomer} onChange={(event) => setTargetCustomer(event.target.value)} className={inputClassName} placeholder="例：中小企業の管理部門" />
        </Field>
        <Field label="商材概要" className="md:col-span-2">
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
        <Field label="FAQ">
          <textarea value={faq} onChange={(event) => setFaq(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="成功トーク">
          <textarea value={successTalk} onChange={(event) => setSuccessTalk(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <Field label="NGトーク">
          <textarea value={ngTalk} onChange={(event) => setNgTalk(event.target.value)} className={textareaClassName} placeholder="1行に1つ" />
        </Field>
        <div className="md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-bold text-[#343b48]">自由項目</div>
              <p className="mt-1 text-[12px] text-[#7a808c]">項目名と中身を自由に追加できます。</p>
            </div>
            <button type="button" onClick={() => setCustomFields((current) => [...current, createEmptyCustomField()])} className="h-10 rounded-[13px] border border-[#e4e8ef] bg-white px-4 text-[13px] font-black text-[#343b48]">項目を追加</button>
          </div>
          {customFields.length > 0 ? (
            <div className="mt-3 space-y-3">
              {customFields.map((field, index) => (
                <div key={field.id} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-bold text-[#8a909b]">自由項目 {index + 1}</div>
                    <button type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))} className="text-[12px] font-bold text-[#b4232a]">削除</button>
                  </div>
                  <input value={field.label} onChange={(event) => updateCustomField(setCustomFields, field.id, "label", event.target.value)} className={inputClassName} placeholder="項目名 例：導入フロー" />
                  <textarea value={field.value} onChange={(event) => updateCustomField(setCustomFields, field.id, "value", event.target.value)} className={textareaClassName} placeholder="中身" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
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

function Info({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-[#eef1f5] bg-white px-4 py-3 ${className}`}>
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] font-bold text-[#343b48]">{value}</div>
    </div>
  );
}

function DetailItem({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 ${className}`}>
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-[14px] font-bold leading-7 text-[#343b48]">{value.trim() || "未登録"}</div>
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

function formatTextSummary(value: string) {
  const normalized = value.trim();
  if (!normalized) return "未登録";
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function formatUrlAnalysisMemo(value: string) {
  const normalized = normalizeMemoText(value);
  if (!normalized) return "";

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (normalized.length <= 520 && lines.length <= 4) {
    return normalized;
  }

  const title = lines.find((line) => line.length <= 80 && !isMemoNoise(line)) ?? "";
  const sentences = extractMemoSummarySentences(normalized)
    .filter((sentence) => sentence !== title)
    .slice(0, 4);

  return [
    title,
    sentences.length > 0 ? `要約: ${sentences.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function extractMemoSummarySentences(value: string) {
  const seen = new Set<string>();
  const sentences: string[] = [];
  const chunks = normalizeMemoText(value).match(/[^。！？!?]+[。！？!?]?/g) ?? [];

  for (const chunk of chunks) {
    const sentence = normalizeMemoText(chunk);
    const comparable = sentence.replace(/\s/g, "");
    if (
      !sentence ||
      seen.has(comparable) ||
      sentence.length < 18 ||
      isMemoNoise(sentence)
    ) {
      continue;
    }

    seen.add(comparable);
    sentences.push(sentence);
  }

  return sentences;
}

function normalizeMemoText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([。！？!?、,.])/g, "$1")
    .trim();
}

function isMemoNoise(value: string) {
  const navigationWords = ["FAQ", "お問い合わせ", "料金", "コンテンツ", "仕組み", "STEP"];
  const hitCount = navigationWords.filter((word) => value.includes(word)).length;
  const numberedMenuCount = (value.match(/\b0[1-9]\b/g) ?? []).length;
  return hitCount >= 3 || numberedMenuCount >= 4;
}

function formatLines(items: string[]) {
  return items.join("\n");
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function joinLines(value: string[] | undefined) {
  return value?.filter(Boolean).join("\n") ?? "";
}

function createEmptyCustomField(): KnowledgeProductCustomField {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    value: "",
  };
}

function updateCustomField(
  setCustomFields: React.Dispatch<React.SetStateAction<KnowledgeProductCustomField[]>>,
  id: string,
  key: "label" | "value",
  value: string,
) {
  setCustomFields((current) => current.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
}

function normalizeCustomFields(fields: KnowledgeProductCustomField[]) {
  const normalized = fields
    .map((field) => ({
      id: field.id,
      label: field.label.trim(),
      value: field.value.trim(),
    }))
    .filter((field) => field.label || field.value);

  if (normalized.some((field) => !field.label || !field.value)) {
    return null;
  }

  return normalized;
}

async function analyzeProductUrl(url: string) {
  try {
    const response = await fetch("/api/products/analyze-url", {
      method: "POST",
      headers: await getApiAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as { summary?: string };
    return payload.summary?.trim() ?? "";
  } catch {
    return "";
  }
}

async function structureProductPaste(text: string) {
  const response = await fetch("/api/admin/structure-paste", {
    method: "POST",
    headers: await getApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ kind: "product", text }),
  });
  const payload = (await response.json()) as {
    structured?: {
      name?: string;
      description?: string;
      targetCustomer?: string;
      painPoints?: string[];
      valueProposition?: string;
      pricing?: string;
      competitors?: string[];
      commonObjections?: string[];
      faq?: string[];
      successTalk?: string[];
      ngTalk?: string[];
      sourceSummary?: string;
    };
    error?: string;
  };
  if (!response.ok || !payload.structured) {
    throw new Error(payload.error ?? "AI整理に失敗しました。");
  }
  return payload.structured;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
