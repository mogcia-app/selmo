"use client";

import { FirebaseError } from "firebase/app";
import { FormEvent, useEffect, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  StatusBadge,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createSalesManual,
  subscribeToSalesManuals,
  updateSalesManual,
  type SalesManualCustomField,
  type SalesManual,
} from "@/lib/firebase/manuals";

export default function AdminManualsPage() {
  const { profile } = useAuth();
  const [manuals, setManuals] = useState<SalesManual[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [editingManual, setEditingManual] = useState<SalesManual | null>(null);
  const [viewingManual, setViewingManual] = useState<SalesManual | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeManuals = manuals.filter((manual) => manual.status === "active");

  useEffect(() => {
    if (!profile?.companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToSalesManuals(profile.companyId, setManuals, handleError),
      subscribeToKnowledgeProducts(profile.companyId, setProducts, handleError),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile?.companyId]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MANUAL"
          title="マニュアル"
          description="会社の勝ちパターン、必須ヒアリング、反論対応、クロージング基準を登録します。sales側の分析結果はこの基準に沿って表示されます。"
        />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-8 rounded-[24px] border border-[#f0c655] bg-[#fffaf0] px-5 py-5 shadow-[0_10px_28px_rgba(245,189,7,0.08)] md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-[#ffd84d] px-3 py-1 text-[12px] font-black text-[#171717]">
                まずここから
              </div>
              <h2 className="mt-3 text-[22px] font-black tracking-[-0.03em] text-[#171717]">
                会社の営業マニュアルを追加する
              </h2>
              <p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[#596273]">
                評価基準・必須ヒアリング・反論対応・クロージング基準を登録すると、sales側の商談分析とロープレ分析が会社基準に沿って表示されます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-12 shrink-0 rounded-[16px] border border-[#171717] bg-[#171717] px-6 text-[14px] font-black text-white transition hover:bg-[#343b48]"
            >
              ＋ マニュアルを追加
            </button>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <KpiCard label="登録マニュアル" value={`${manuals.length}件`} note="営業基準の登録数" />
          <KpiCard label="有効基準" value={`${activeManuals.length}件`} note="sales分析に反映" />
          <KpiCard label="分析結果" value={activeManuals.length > 0 ? "基準あり" : "汎用"} note="商談/ロープレ" />
        </section>

        <div className="mt-8">
          <Panel title="マニュアル一覧">
            {manuals.length > 0 ? (
              <div className="grid gap-5 lg:grid-cols-2">
              {manuals.map((manual) => (
                <article
                  key={manual.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingManual(manual)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setViewingManual(manual);
                    }
                  }}
                  className="cursor-pointer rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-5 py-5 transition hover:border-[#e0bd4b] hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-[20px] font-black text-[#171717]">{manual.title}</h2>
                      <p className="mt-1 text-[12px] font-bold text-[#8a909b]">{formatManualMeta(manual)}</p>
                      <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-[#596273]">{manual.content || "本文未登録"}</p>
                    </div>
                    <StatusBadge tone={manual.status === "active" ? "good" : "normal"} label={manual.status === "active" ? "有効" : "下書き"} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <MiniInfo label="評価基準" value={`${manual.criteria.length}件`} />
                    <MiniInfo label="必須ヒアリング" value={`${manual.requiredQuestions.length}件`} />
                    <MiniInfo label="反論対応" value={`${manual.objectionHandling.length}件`} />
                    <MiniInfo label="クロージング" value={`${manual.closingRules.length}件`} />
                    <MiniInfo label="自由項目" value={`${manual.customFields.length}件`} />
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingManual(manual);
                    }}
                    className="mt-4 rounded-[12px] border border-[#e4e8ef] bg-white px-3 py-2 text-[12px] font-bold text-[#343b48]"
                  >
                    編集
                  </button>
                </article>
              ))}
              </div>
            ) : (
              <EmptyState title="営業成功基準はまだありません" body="マニュアルを登録すると、sales側の商談分析結果が会社基準に沿った表示へ切り替わります。" />
            )}
          </Panel>
        </div>

        {createOpen && profile?.uid && profile.companyId ? (
          <ManualDialog
            companyId={profile.companyId}
            userId={profile.uid}
            products={products}
            onClose={() => setCreateOpen(false)}
          />
        ) : null}
        {editingManual && profile?.uid && profile.companyId ? (
          <ManualDialog
            companyId={profile.companyId}
            userId={profile.uid}
            products={products}
            manual={editingManual}
            onClose={() => setEditingManual(null)}
          />
        ) : null}
        {viewingManual ? (
          <ManualDetailDialog
            manual={viewingManual}
            onClose={() => setViewingManual(null)}
            onEdit={() => {
              setViewingManual(null);
              setEditingManual(viewingManual);
            }}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

function ManualDetailDialog({
  manual,
  onClose,
  onEdit,
}: {
  manual: SalesManual;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[860px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[24px] font-black text-[#171717]">{manual.title}</h2>
            <p className="mt-1 text-[13px] font-bold text-[#8a909b]">{formatManualMeta(manual)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DetailItem label="商材" value={manual.productName} />
          <DetailItem label="カテゴリー" value={manual.manualCategory} />
          <DetailItem label="ターゲット層" value={manual.targetSegment} />
          <DetailItem label="状態" value={manual.status === "active" ? "有効" : "下書き"} />
          <DetailItem label="概要" value={manual.content} className="md:col-span-2" />
          <DetailItem label="評価基準" value={formatLines(manual.criteria)} />
          <DetailItem label="必須ヒアリング" value={formatLines(manual.requiredQuestions)} />
          <DetailItem label="スコアルール" value={formatLines(manual.scoringRules)} />
          <DetailItem label="反論対応" value={formatLines(manual.objectionHandling)} />
          <DetailItem label="クロージング基準" value={formatLines(manual.closingRules)} className="md:col-span-2" />
          {manual.customFields.map((field) => (
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

function ManualDialog({
  companyId,
  userId,
  products,
  manual,
  onClose,
}: {
  companyId: string;
  userId: string;
  products: KnowledgeProduct[];
  manual?: SalesManual;
  onClose: () => void;
}) {
  const [productId, setProductId] = useState(manual?.productId ?? products.find((product) => product.name === manual?.productName)?.id ?? "");
  const [manualCategory, setManualCategory] = useState<"新規" | "既存" | "">(manual?.manualCategory ?? "");
  const [targetSegment, setTargetSegment] = useState(manual?.targetSegment ?? "");
  const [content, setContent] = useState(manual?.content ?? "");
  const [criteria, setCriteria] = useState((manual?.criteria ?? []).join("\n"));
  const [requiredQuestions, setRequiredQuestions] = useState((manual?.requiredQuestions ?? []).join("\n"));
  const [scoringRules, setScoringRules] = useState((manual?.scoringRules ?? []).join("\n"));
  const [objectionHandling, setObjectionHandling] = useState((manual?.objectionHandling ?? []).join("\n"));
  const [closingRules, setClosingRules] = useState((manual?.closingRules ?? []).join("\n"));
  const [customFields, setCustomFields] = useState<SalesManualCustomField[]>(manual?.customFields ?? []);
  const [status, setStatus] = useState<"active" | "draft">(manual?.status ?? "active");
  const [bulkText, setBulkText] = useState("");
  const [isStructuring, setIsStructuring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProduct = products.find((product) => product.id === productId);
  const generatedTitle = buildManualTitle({
    productName: selectedProduct?.name ?? manual?.productName ?? "",
    manualCategory,
    targetSegment,
    fallbackTitle: manual?.title,
  });

  async function handleStructurePaste() {
    if (!bulkText.trim()) {
      setError("一括貼り付け欄にマニュアル本文を入力してください。");
      return;
    }

    setIsStructuring(true);
      setError(null);
    try {
      const structured = await structureAdminPaste("manual", bulkText);
      setContent((current) => structured.content || current);
      setCriteria(joinLines(structured.criteria) || criteria);
      setRequiredQuestions(joinLines(structured.requiredQuestions) || requiredQuestions);
      setScoringRules(joinLines(structured.scoringRules) || scoringRules);
      setObjectionHandling(joinLines(structured.objectionHandling) || objectionHandling);
      setClosingRules(joinLines(structured.closingRules) || closingRules);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI整理に失敗しました。");
    } finally {
      setIsStructuring(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) {
      setError("商材を選択してください。");
      return;
    }
    if (!manualCategory) {
      setError("カテゴリーを選択してください。");
      return;
    }
    if (!targetSegment.trim()) {
      setError("ターゲット層を入力してください。");
      return;
    }
    const normalizedCustomFields = normalizeCustomFields(customFields);
    if (!normalizedCustomFields) {
      setError("自由項目は項目名と本文を両方入力してください。");
      return;
    }

    const title = buildManualTitle({
      productName: selectedProduct.name,
      manualCategory,
      targetSegment,
    });
    const payload = {
      companyId,
      title,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      manualCategory,
      targetSegment: targetSegment.trim(),
      content: content.trim(),
      criteria: splitLines(criteria),
      requiredQuestions: splitLines(requiredQuestions),
      scoringRules: splitLines(scoringRules),
      objectionHandling: splitLines(objectionHandling),
      closingRules: splitLines(closingRules),
      customFields: normalizedCustomFields,
      status,
      createdBy: userId,
    };

    setIsSaving(true);
    setError(null);
    try {
      if (manual) {
        await updateSalesManual(manual.id, payload);
      } else {
        await createSalesManual(payload);
      }
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-[860px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-black text-[#171717]">{manual ? "マニュアル編集" : "マニュアル追加"}</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">長文を一括貼り付けして、AIで項目ごとに整理できます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
        </div>
        {error ? <ErrorBox message={error} /> : null}

        <div className="mt-5 rounded-[18px] border border-[#f0e3c1] bg-[#fffaf0] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[14px] font-black text-[#171717]">一括貼り付け</div>
              <p className="mt-1 text-[12px] leading-5 text-[#6f6250]">
                マニュアル全文をそのまま貼り付けると、評価基準・必須ヒアリング・反論対応などに自動で分けます。
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
            placeholder="ここに営業マニュアル全文をそのまま貼り付け"
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="商材">
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className={inputClassName}>
              <option value="">商材を選択</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label="カテゴリー">
            <select value={manualCategory} onChange={(event) => setManualCategory(event.target.value as "新規" | "既存" | "")} className={inputClassName}>
              <option value="">選択してください</option>
              <option value="新規">新規</option>
              <option value="既存">既存</option>
            </select>
          </Field>
          <Field label="ターゲット層">
            <input value={targetSegment} onChange={(event) => setTargetSegment(event.target.value)} className={inputClassName} placeholder="例：不動産" />
          </Field>
          <Field label="状態">
            <select value={status} onChange={(event) => setStatus(event.target.value as "active" | "draft")} className={inputClassName}>
              <option value="active">有効</option>
              <option value="draft">下書き</option>
            </select>
          </Field>
          <div className="md:col-span-2 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
            <div className="text-[12px] font-bold text-[#8a909b]">保存後のタイトル</div>
            <div className="mt-1 text-[16px] font-black text-[#171717]">{generatedTitle || "商材・カテゴリー・ターゲット層から自動生成"}</div>
          </div>
          <Field label="概要" className="md:col-span-2">
            <textarea value={content} onChange={(event) => setContent(event.target.value)} className={textareaClassName} placeholder="このマニュアルで重視する営業基準" />
          </Field>
          <Field label="評価基準">
            <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className={textareaClassName} placeholder={"例：課題を顧客の言葉で確認している\n例：料金説明の前に価値を提示している"} />
          </Field>
          <Field label="必須ヒアリング">
            <textarea value={requiredQuestions} onChange={(event) => setRequiredQuestions(event.target.value)} className={textareaClassName} placeholder={"例：現在の課題\n例：決裁者\n例：予算感"} />
          </Field>
          <Field label="スコアルール">
            <textarea value={scoringRules} onChange={(event) => setScoringRules(event.target.value)} className={textareaClassName} placeholder={"例：課題確認なしは減点\n例：次回アクション明確なら加点"} />
          </Field>
          <Field label="反論対応">
            <textarea value={objectionHandling} onChange={(event) => setObjectionHandling(event.target.value)} className={textareaClassName} placeholder={"例：高いと言われたら費用対効果で返す\n例：競合比較は違いを3点で説明"} />
          </Field>
          <Field label="クロージング基準" className="md:col-span-2">
            <textarea value={closingRules} onChange={(event) => setClosingRules(event.target.value)} className={textareaClassName} placeholder={"例：次回日時を確定する\n例：判断条件を合意する"} />
          </Field>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-bold text-[#343b48]">自由項目</div>
                <p className="mt-1 text-[12px] text-[#7a808c]">項目名と本文を自由に追加できます。</p>
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
                    <input value={field.label} onChange={(event) => updateCustomField(setCustomFields, field.id, "label", event.target.value)} className={inputClassName} placeholder="項目名 例：導入前チェック" />
                    <textarea value={field.value} onChange={(event) => updateCustomField(setCustomFields, field.id, "value", event.target.value)} className={textareaClassName} placeholder="本文" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]">キャンセル</button>
          <button type="submit" disabled={isSaving} className="h-11 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-black text-[#171717] disabled:opacity-60">{isSaving ? "保存中" : "保存する"}</button>
        </div>
      </form>
    </div>
  );
}

const inputClassName = "mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none focus:border-[#e0bd4b]";
const textareaClassName = "mt-2 min-h-[116px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#e0bd4b]";

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="text-[13px] font-bold text-[#343b48]">{label}</span>
      {children}
    </label>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#eef1f5] bg-white px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[15px] font-black text-[#171717]">{value}</div>
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

function formatManualMeta(manual: SalesManual) {
  const items = [manual.productName, manual.manualCategory, manual.targetSegment].filter(Boolean);
  return items.length > 0 ? items.join(" / ") : "分類未設定";
}

function formatLines(items: string[]) {
  return items.join("\n");
}

function buildManualTitle(input: {
  productName: string;
  manualCategory: "新規" | "既存" | "";
  targetSegment: string;
  fallbackTitle?: string;
}) {
  const parts = [input.productName.trim(), input.manualCategory, input.targetSegment.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : input.fallbackTitle ?? "";
}

function createEmptyCustomField(): SalesManualCustomField {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    value: "",
  };
}

function updateCustomField(
  setCustomFields: React.Dispatch<React.SetStateAction<SalesManualCustomField[]>>,
  id: string,
  key: "label" | "value",
  value: string,
) {
  setCustomFields((current) => current.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
}

function normalizeCustomFields(fields: SalesManualCustomField[]) {
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

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function joinLines(value: string[] | undefined) {
  return value?.filter(Boolean).join("\n") ?? "";
}

async function structureAdminPaste(kind: "manual", text: string) {
  const response = await fetch("/api/admin/structure-paste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, text }),
  });
  const payload = (await response.json()) as {
    structured?: {
      title?: string;
      content?: string;
      criteria?: string[];
      requiredQuestions?: string[];
      scoringRules?: string[];
      objectionHandling?: string[];
      closingRules?: string[];
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
