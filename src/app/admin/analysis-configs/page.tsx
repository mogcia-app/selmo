"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { EmptyState, PageHeader, PageShell, Panel, useAdminInsights } from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import {
  analysisTypeLabels,
  createAnalysisConfig,
  subscribeToAnalysisConfigs,
  updateAnalysisConfig,
  type AnalysisConfig,
  type AnalysisConfigInput,
  type AnalysisConfigItem,
  type AnalysisConfigType,
} from "@/lib/firebase/analysis-configs";

const defaultChecklist: Record<AnalysisConfigType, AnalysisConfigItem[]> = {
  meeting_upload: [
    { id: "issue", label: "課題の背景まで深掘りできている", description: "表面的な課題だけでなく、原因・影響・理想状態を確認する", required: true },
    { id: "next-action", label: "次回アクションが明確", description: "日程・担当・次に確認する内容まで合意する", required: true },
  ],
  teleapo_upload: [
    { id: "permission", label: "話す許可を取れている", description: "電話口で短く許可取りをしてから本題に入る", required: true },
    { id: "appointment", label: "次接点を打診している", description: "資料送付だけで終わらず、確認日程や短時間商談を提示する", required: true },
  ],
  meeting_roleplay: [
    { id: "issue", label: "課題深掘り", description: "顧客の現状・背景・影響を確認する", required: true },
    { id: "value", label: "価値接続", description: "商材価値を顧客の課題に接続する", required: true },
  ],
  teleapo_roleplay: [
    { id: "opening", label: "冒頭の用件が短く明確", description: "名乗り・用件・相手に関係ある理由を短く伝える", required: true },
    { id: "rebuttal", label: "断りへの1回切り返し", description: "忙しい・資料送って等に自然に1回だけ切り返す", required: true },
  ],
};

export default function AdminAnalysisConfigsPage() {
  const { profile } = useAuth();
  const { products } = useAdminInsights();
  const [configs, setConfigs] = useState<AnalysisConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    return subscribeToAnalysisConfigs(profile.companyId, setConfigs, () => setConfigs([]));
  }, [profile?.companyId]);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedId) ?? null,
    [configs, selectedId],
  );

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ANALYSIS SETTINGS"
          title="AI分析設定 β"
          description="商材ごとに、商談・テレアポ・ロープレ分析でAIに見てほしい評価軸を試験運用できます。"
        />

        {message ? (
          <div className="mt-5 rounded-[16px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">
            {message}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(520px,1.15fr)]">
          <Panel title="登録済み設定">
            {configs.length > 0 ? (
              <div className="space-y-3">
                {configs.map((config) => (
                  <button
                    key={config.id}
                    type="button"
                    onClick={() => setSelectedId(config.id)}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                      selectedId === config.id ? "border-[#f0c655] bg-[#fffdf7]" : "border-[#e6eaf0] bg-[#fcfcfd]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{config.title}</div>
                        <div className="mt-1 text-[12px] font-bold text-[#7a808c]">
                          {analysisTypeLabels[config.analysisType]} ・ {config.productName || "全商材共通"}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${config.status === "active" ? "bg-[#eaf8ef] text-[#15803d]" : "bg-[#eef1f5] text-[#596273]"}`}>
                        {config.status === "active" ? "有効" : "下書き"}
                      </span>
                    </div>
                    <div className="mt-2 text-[12px] font-bold text-[#8a909b]">
                      評価項目 {config.checklistItems.length}件 / ルール {config.scoringRules.length}件
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="分析設定はまだありません" body="右側のフォームから、商材ごとのAI分析ルールを登録できます。" />
            )}
          </Panel>

          <AnalysisConfigForm
            key={selectedConfig?.id ?? "new"}
            config={selectedConfig}
            products={products}
            companyId={profile?.companyId ?? null}
            userId={profile?.uid ?? null}
            onSaved={(savedMessage) => {
              setMessage(savedMessage);
              setSelectedId(null);
            }}
          />
        </section>
      </div>
    </PageShell>
  );
}

function AnalysisConfigForm({
  config,
  products,
  companyId,
  userId,
  onSaved,
}: {
  config: AnalysisConfig | null;
  products: ReturnType<typeof useAdminInsights>["products"];
  companyId: string | null;
  userId: string | null;
  onSaved: (message: string) => void;
}) {
  const [analysisType, setAnalysisType] = useState<AnalysisConfigType>(config?.analysisType ?? "meeting_roleplay");
  const [productId, setProductId] = useState(config?.productId ?? "");
  const [title, setTitle] = useState(config?.title ?? "商材別AI分析設定");
  const [checklistItems, setChecklistItems] = useState<AnalysisConfigItem[]>(
    config?.checklistItems.length ? config.checklistItems : defaultChecklist[analysisType],
  );
  const [scoringRules, setScoringRules] = useState(config?.scoringRules.join("\n") ?? "");
  const [improvementInstruction, setImprovementInstruction] = useState(config?.improvementInstruction ?? "");
  const [customPrompt, setCustomPrompt] = useState(config?.customPrompt ?? "");
  const [status, setStatus] = useState<"active" | "draft">(config?.status ?? "active");
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  function handleTypeChange(nextType: AnalysisConfigType) {
    setAnalysisType(nextType);
    if (!config) {
      setChecklistItems(defaultChecklist[nextType]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || !userId) return;
    setIsSaving(true);
    try {
      const input: AnalysisConfigInput = {
        companyId,
        productId: productId || null,
        productName: selectedProduct?.name ?? "",
        analysisType,
        title: title.trim() || analysisTypeLabels[analysisType],
        checklistItems,
        scoringRules: splitLines(scoringRules),
        improvementInstruction: improvementInstruction.trim(),
        customPrompt: customPrompt.trim(),
        status,
        createdBy: userId,
      };
      if (config) {
        await updateAnalysisConfig(config.id, input);
      } else {
        await createAnalysisConfig(input);
      }
      onSaved(config ? "分析設定を更新しました。" : "分析設定を作成しました。");
    } catch (error) {
      onSaved(error instanceof Error ? error.message : "分析設定の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel title={config ? "分析設定を編集" : "分析設定を作成"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="分析タイプ">
            <select value={analysisType} onChange={(event) => handleTypeChange(event.target.value as AnalysisConfigType)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
              {Object.entries(analysisTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="商材">
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
              <option value="">全商材共通</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="設定名">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]" />
        </Field>

        <div className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-black text-[#171717]">評価項目</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">AIが必ずチェックする観点です。</p>
            </div>
            <button type="button" onClick={() => setChecklistItems((items) => [...items, createBlankItem()])} className="h-9 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[12px] font-black text-[#343b48]">
              追加
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {checklistItems.map((item, index) => (
              <div key={item.id} className="rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3">
                <div className="grid gap-2 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_88px_72px]">
                  <input value={item.label} onChange={(event) => updateChecklistItem(index, { label: event.target.value }, setChecklistItems)} className="h-10 rounded-[12px] border border-[#e4e8ef] px-3 text-[12px] font-bold outline-none focus:border-[#e0bd4b]" placeholder="例：次接点を打診している" />
                  <input value={item.description} onChange={(event) => updateChecklistItem(index, { description: event.target.value }, setChecklistItems)} className="h-10 rounded-[12px] border border-[#e4e8ef] px-3 text-[12px] font-bold outline-none focus:border-[#e0bd4b]" placeholder="判断基準" />
                  <label className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#e4e8ef] px-2 text-[12px] font-black text-[#343b48]">
                    <input type="checkbox" checked={item.required} onChange={(event) => updateChecklistItem(index, { required: event.target.checked }, setChecklistItems)} />
                    必須
                  </label>
                  <button type="button" onClick={() => setChecklistItems((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="h-10 rounded-[12px] border border-[#f4d4d4] bg-[#fff8f8] text-[12px] font-black text-[#b4232a]">
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="加点/減点ルール">
          <textarea value={scoringRules} onChange={(event) => setScoringRules(event.target.value)} className="min-h-[100px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" placeholder="1行に1ルール。例：資料送付だけで終わった場合は減点" />
        </Field>

        <Field label="改善フレーズ指示">
          <textarea value={improvementInstruction} onChange={(event) => setImprovementInstruction(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" placeholder="例：電話口でそのまま使える短い言い換えを出す" />
        </Field>

        <Field label="追加AI指示">
          <textarea value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" placeholder="例：この商材では音声データの不安解消を重視する" />
        </Field>

        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <Field label="状態">
            <select value={status} onChange={(event) => setStatus(event.target.value as "active" | "draft")} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
              <option value="active">有効</option>
              <option value="draft">下書き</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={isSaving} className="h-12 w-full rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60">
              {isSaving ? "保存中" : config ? "更新する" : "作成する"}
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-black text-[#596273]">{label}</span>
      {children}
    </label>
  );
}

function createBlankItem(): AnalysisConfigItem {
  return { id: crypto.randomUUID(), label: "", description: "", required: true };
}

function updateChecklistItem(
  index: number,
  patch: Partial<AnalysisConfigItem>,
  setItems: (updater: (items: AnalysisConfigItem[]) => AnalysisConfigItem[]) => void,
) {
  setItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
