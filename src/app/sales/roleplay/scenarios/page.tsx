"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createRoleplayScenario,
  subscribeToRoleplayScenarios,
  type RoleplayDifficulty,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

export default function SalesRoleplayScenariosPage() {
  const { profile } = useAuth();
  const userId = profile?.uid;
  const canManage = profile?.role === "admin";
  const [scenarios, setScenarios] = useState<RoleplayScenario[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0] ?? null,
    [activeScenarioId, scenarios],
  );

  useEffect(() => {
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToRoleplayScenarios(setScenarios, handleError),
      subscribeToKnowledgeProducts(setProducts, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="scenario" />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-7 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[12px] font-bold text-[#8a6500]">SCENARIOS</p>
                <h2 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">シナリオを選択</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                  商品・顧客条件・反論パターンを選んで、AI顧客との練習を開始できます。
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 text-[13px] font-black text-[#171717]"
                >
                  <PlusIcon />
                  シナリオ作成
                </button>
              ) : null}
            </div>

            {scenarios.length > 0 ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setActiveScenarioId(scenario.id)}
                    className={`min-w-0 rounded-[18px] border px-4 py-4 text-left transition ${
                      activeScenario?.id === scenario.id
                        ? "border-[#f0c655] bg-[#fffdf7]"
                        : "border-[#e6eaf0] bg-[#fcfcfd] hover:border-[#ead8a8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[17px] font-black text-[#171717]">{scenario.title}</h3>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-[#596273]">{scenario.description}</p>
                      </div>
                      <DifficultyBadge difficulty={scenario.difficulty} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Pill>{scenario.productName || "商品未設定"}</Pill>
                      <Pill>{scenario.customerRole}</Pill>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-12 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                  <ScenarioIcon />
                </span>
                <h3 className="mt-4 text-[20px] font-black text-[#171717]">シナリオはまだありません</h3>
                <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-7 text-[#7a808c]">
                  管理者が商品別の練習テーマを追加すると、ここからロープレを開始できます。
                </p>
              </div>
            )}
          </article>

          <aside className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <h2 className="text-[18px] font-black text-[#171717]">選択中のAI顧客</h2>
            {activeScenario ? (
              <div className="mt-5 space-y-4">
                <div>
                  <h3 className="text-[22px] font-black text-[#171717]">{activeScenario.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#596273]">{activeScenario.customerProfile}</p>
                </div>
                <InfoBlock label="ゴール" value={activeScenario.goal} />
                <InfoBlock label="想定反論" value={activeScenario.objections.join(" / ") || "未設定"} />
                <InfoBlock label="採点基準" value={activeScenario.evaluationCriteria.join(" / ") || "未設定"} />
                <Link
                  href={`/sales/roleplay?scenarioId=${encodeURIComponent(activeScenario.id)}`}
                  className="inline-flex h-12 w-full items-center justify-center rounded-[14px] bg-[#ffd12f] text-[14px] font-black text-[#171717]"
                >
                  このシナリオで開始
                </Link>
              </div>
            ) : (
              <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
                <h3 className="text-[18px] font-bold text-[#171717]">未選択</h3>
                <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                  シナリオを選ぶと、AI顧客の条件が表示されます。
                </p>
              </div>
            )}
          </aside>
        </section>
      </div>

      {dialogOpen && userId ? (
        <ScenarioCreateDialog
          products={products}
          userId={userId}
          onClose={() => setDialogOpen(false)}
          onCreated={() => setDialogOpen(false)}
          onError={setError}
        />
      ) : null}
    </main>
  );
}

function ScenarioCreateDialog({
  products,
  userId,
  onClose,
  onCreated,
  onError,
}: {
  products: KnowledgeProduct[];
  userId: string;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState("");
  const [customerRole, setCustomerRole] = useState("");
  const [customerProfile, setCustomerProfile] = useState("");
  const [goal, setGoal] = useState("");
  const [objections, setObjections] = useState("");
  const [criteria, setCriteria] = useState("");
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty>("normal");
  const [isSaving, setIsSaving] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !customerRole.trim() || !goal.trim()) {
      onError("タイトル、顧客役職、練習ゴールを入力してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      await createRoleplayScenario({
        title: title.trim(),
        description: description.trim(),
        productId: productId || null,
        productName: selectedProduct?.name ?? "",
        customerRole: customerRole.trim(),
        customerProfile: customerProfile.trim(),
        goal: goal.trim(),
        objections: splitLines(objections),
        evaluationCriteria: splitLines(criteria),
        difficulty,
        createdBy: userId,
      });
      onCreated();
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "シナリオの作成に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">シナリオ作成</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">商品・顧客条件・反論・採点基準を登録します。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="タイトル" required>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：料金が高いと言われた時" />
          </Field>
          <Field label="商品">
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="">未設定</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label="顧客役職" required>
            <input value={customerRole} onChange={(event) => setCustomerRole(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：営業部長" />
          </Field>
          <Field label="難易度">
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as RoleplayDifficulty)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="easy">やさしい</option>
              <option value="normal">標準</option>
              <option value="hard">難しい</option>
            </select>
          </Field>
          <Field label="概要" className="md:col-span-2">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="シナリオの説明" />
          </Field>
          <Field label="顧客プロフィール" className="md:col-span-2">
            <textarea value={customerProfile} onChange={(event) => setCustomerProfile(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="業種、課題、検討状況など" />
          </Field>
          <Field label="練習ゴール" required className="md:col-span-2">
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：価格ではなく効果と導入後の成果で納得してもらう" />
          </Field>
          <Field label="想定反論" className="md:col-span-1">
            <textarea value={objections} onChange={(event) => setObjections(event.target.value)} className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder={"1行に1つ\n例：料金が高い"} />
          </Field>
          <Field label="採点基準" className="md:col-span-1">
            <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder={"1行に1つ\n例：課題を確認できている"} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]">
            キャンセル
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-black text-[#171717] disabled:opacity-60">
            {isSaving ? "保存中" : "作成する"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[13px] font-bold text-[#343b48]">
        {label}
        {required ? <span className="text-[#e04f4f]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function RoleplayHeader({ activeStep }: { activeStep: "scenario" | "practice" | "results" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href="/sales/roleplay/scenarios" />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href="/sales/roleplay" />
        <Step number="3" label="分析結果" active={activeStep === "results"} href="/sales/roleplay/results" />
      </div>
    </header>
  );
}

function Step({ number, label, active = false, href }: { number: string; label: string; active?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 min-w-[170px] items-center justify-center gap-3 rounded-[12px] border px-4 text-[13px] font-bold ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] leading-6 text-[#343b48]">{value || "未設定"}</div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: RoleplayDifficulty }) {
  const label = difficulty === "easy" ? "やさしい" : difficulty === "hard" ? "難しい" : "標準";
  return <span className="shrink-0 rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#9c7600]">{label}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#f1f2f5] px-2.5 py-1 text-[11px] font-bold text-[#596273]">{children}</span>;
}

function splitLines(value: string) {
  return value
    .split(/\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function ScenarioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
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
