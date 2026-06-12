"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  createRoleplayScenario,
  subscribeToRoleplayAssignments,
  subscribeToRoleplayScenarios,
  updateRoleplayScenario,
  type RoleplayAssignment,
  type RoleplayDifficulty,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

export default function SalesRoleplayScenariosPage() {
  const { profile } = useAuth();
  const userId = profile?.uid;
  const [scenarios, setScenarios] = useState<RoleplayScenario[]>([]);
  const [assignments, setAssignments] = useState<RoleplayAssignment[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<RoleplayScenario | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0] ?? null,
    [activeScenarioId, scenarios],
  );

  useEffect(() => {
    if (!profile?.companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToRoleplayScenarios(profile.companyId, setScenarios, handleError),
      subscribeToRoleplayAssignments(
        { companyId: profile.companyId, userId: profile.uid, isAdmin: false },
        setAssignments,
        handleError,
      ),
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId },
        setMeetings,
        handleError,
      ),
      subscribeToKnowledgeProducts(profile.companyId, setProducts, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile?.companyId, profile?.role, profile?.uid]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "assigned"),
    [assignments],
  );
  const recommendedScenarios = useMemo(
    () => buildRecommendedScenarios(meetings, scenarios),
    [meetings, scenarios],
  );

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
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 text-[13px] font-black text-[#171717]"
              >
                <PlusIcon />
                シナリオ作成
              </button>
            </div>

            {activeAssignments.length > 0 ? (
              <section className="mt-6 rounded-[20px] border border-[#f0c655] bg-[#fffaf0] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-black text-[#8a6500]">ASSIGNED</p>
                    <h3 className="mt-1 text-[18px] font-black text-[#171717]">管理者からの課題</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[12px] font-black text-[#8a6500]">
                    {activeAssignments.length}件
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {activeAssignments.slice(0, 4).map((assignment) => (
                    <AssignmentCard key={assignment.id} assignment={assignment} />
                  ))}
                </div>
              </section>
            ) : null}

            {recommendedScenarios.length > 0 ? (
              <section className="mt-6 rounded-[20px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-4">
                <p className="text-[12px] font-black text-[#8a6500]">RECOMMENDED</p>
                <h3 className="mt-1 text-[18px] font-black text-[#171717]">商談分析からの推奨ロープレ</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {recommendedScenarios.map(({ scenario, reason }) => (
                    <RecommendationCard key={scenario.id} scenario={scenario} reason={reason} />
                  ))}
                </div>
              </section>
            ) : null}

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
                      <Pill>{scenario.scenarioCategory || "分類未設定"}</Pill>
                      <Pill>{scenario.targetSegment || "ターゲット未設定"}</Pill>
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
                <button
                  type="button"
                  onClick={() => setEditingScenario(activeScenario)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white text-[14px] font-black text-[#343b48]"
                >
                  シナリオを編集
                </button>
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

      {dialogOpen && userId && profile?.companyId ? (
        <ScenarioCreateDialog
          products={products}
          meetings={meetings}
          userId={userId}
          companyId={profile.companyId}
          onClose={() => setDialogOpen(false)}
          onCreated={() => setDialogOpen(false)}
          onError={setError}
        />
      ) : null}
      {editingScenario && userId && profile?.companyId ? (
        <ScenarioCreateDialog
          products={products}
          meetings={meetings}
          userId={userId}
          companyId={profile.companyId}
          scenario={editingScenario}
          onClose={() => setEditingScenario(null)}
          onCreated={() => setEditingScenario(null)}
          onError={setError}
        />
      ) : null}
    </main>
  );
}

function ScenarioCreateDialog({
  products,
  meetings,
  userId,
  companyId,
  scenario,
  onClose,
  onCreated,
  onError,
}: {
  products: KnowledgeProduct[];
  meetings: MeetingRecord[];
  userId: string;
  companyId: string;
  scenario?: RoleplayScenario;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(scenario?.title ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const [productId, setProductId] = useState(scenario?.productId ?? "");
  const [scenarioCategory, setScenarioCategory] = useState<"新規" | "既存" | "">(scenario?.scenarioCategory ?? "");
  const [targetSegment, setTargetSegment] = useState(scenario?.targetSegment ?? "");
  const [customerRole, setCustomerRole] = useState(scenario?.customerRole ?? "");
  const [customerProfile, setCustomerProfile] = useState(scenario?.customerProfile ?? "");
  const [goal, setGoal] = useState(scenario?.goal ?? "");
  const [objections, setObjections] = useState((scenario?.objections ?? []).join("\n"));
  const [criteria, setCriteria] = useState((scenario?.evaluationCriteria ?? []).join("\n"));
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty>(scenario?.difficulty ?? "normal");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);

  const handleGenerate = async () => {
    if (!selectedProduct || !scenarioCategory || !targetSegment.trim()) {
      onError("AI生成には商材、カテゴリー、ターゲット層を入力してください。");
      return;
    }

    setIsGenerating(true);
    onError(null);
    try {
      const generated = await generateRoleplayScenario({
        companyId,
        product: selectedProduct,
        category: scenarioCategory,
        targetSegment,
        meetingInsights: buildMeetingInsights({
          meetings,
          productName: selectedProduct.name,
          category: scenarioCategory,
          targetSegment,
        }),
      });
      setTitle(generated.title);
      setDescription(generated.description);
      setCustomerRole(generated.customerRole);
      setCustomerProfile(generated.customerProfile);
      setGoal(generated.goal);
      setObjections(generated.objections.join("\n"));
      setCriteria(generated.evaluationCriteria.join("\n"));
      setDifficulty(generated.difficulty);
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "AI生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProduct || !scenarioCategory || !targetSegment.trim() || !title.trim() || !customerRole.trim() || !goal.trim()) {
      onError("商材、カテゴリー、ターゲット層、タイトル、顧客役職、練習ゴールを入力してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      const payload = {
        companyId,
        title: title.trim(),
        description: description.trim(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        scenarioCategory,
        targetSegment: targetSegment.trim(),
        customerRole: customerRole.trim(),
        customerProfile: customerProfile.trim(),
        goal: goal.trim(),
        objections: splitLines(objections),
        evaluationCriteria: splitLines(criteria),
        difficulty,
        createdBy: userId,
      };
      if (scenario) {
        await updateRoleplayScenario(scenario.id, payload);
      } else {
        await createRoleplayScenario(payload);
      }
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
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">{scenario ? "シナリオ編集" : "シナリオ作成"}</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">商材・カテゴリー・ターゲット層からAI生成し、内容を編集して保存できます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="商材" required>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="">商材を選択</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label="カテゴリー" required>
            <select value={scenarioCategory} onChange={(event) => setScenarioCategory(event.target.value as "新規" | "既存" | "")} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="">選択してください</option>
              <option value="新規">新規</option>
              <option value="既存">既存</option>
            </select>
          </Field>
          <Field label="ターゲット層" required>
            <input value={targetSegment} onChange={(event) => setTargetSegment(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：不動産" />
          </Field>
          <div className="flex items-end">
            <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating} className="h-12 w-full rounded-[14px] border border-[#171717] bg-[#171717] px-4 text-[13px] font-black text-white disabled:opacity-60">
              {isGenerating ? "生成中" : "AIでシナリオ生成"}
            </button>
          </div>
          <Field label="タイトル" required className="md:col-span-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：料金が高いと言われた時" />
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
            {isSaving ? "保存中" : scenario ? "更新する" : "作成する"}
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

function AssignmentCard({ assignment }: { assignment: RoleplayAssignment }) {
  return (
    <Link
      href={`/sales/roleplay?scenarioId=${encodeURIComponent(assignment.scenarioId)}`}
      className="block rounded-[16px] border border-[#f4df94] bg-white px-4 py-3 transition hover:border-[#f0c655]"
    >
      <div className="text-[14px] font-black text-[#171717]">{assignment.scenarioTitle}</div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7a5b00]">
        {assignment.reason || "管理者から練習課題として割り当てられています。"}
      </p>
      <div className="mt-3 text-[12px] font-black text-[#8a6500]">開始する</div>
    </Link>
  );
}

function RecommendationCard({ scenario, reason }: { scenario: RoleplayScenario; reason: string }) {
  return (
    <Link
      href={`/sales/roleplay?scenarioId=${encodeURIComponent(scenario.id)}`}
      className="block rounded-[16px] border border-[#e6eaf0] bg-white px-4 py-3 transition hover:border-[#f0c655]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-black text-[#171717]">{scenario.title}</div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#596273]">{reason}</p>
        </div>
        <DifficultyBadge difficulty={scenario.difficulty} />
      </div>
    </Link>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: RoleplayDifficulty }) {
  const label = difficulty === "easy" ? "やさしい" : difficulty === "hard" ? "難しい" : "標準";
  return <span className="shrink-0 rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#9c7600]">{label}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#f1f2f5] px-2.5 py-1 text-[11px] font-bold text-[#596273]">{children}</span>;
}

function buildRecommendedScenarios(meetings: MeetingRecord[], scenarios: RoleplayScenario[]) {
  const analyzedMeetings = meetings
    .filter((meeting) => meeting.aiSummary || meeting.status === "lost")
    .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0));

  if (analyzedMeetings.length === 0 || scenarios.length === 0) {
    return [];
  }

  const recommendations: Array<{ scenario: RoleplayScenario; reason: string; score: number }> = [];

  for (const scenario of scenarios) {
    const relatedMeeting = analyzedMeetings.find((meeting) => {
      const haystack = [
        meeting.productType,
        meeting.customerName,
        meeting.aiSummary?.overview,
        ...(meeting.aiSummary?.bullets ?? []),
      ].join(" ");
      const keywords = [
        scenario.productName,
        scenario.title,
        scenario.goal,
        ...scenario.objections,
      ].filter(Boolean);

      return keywords.some((keyword) => haystack.includes(keyword.slice(0, Math.min(5, keyword.length))));
    }) ?? analyzedMeetings[0];

    let score = 0;
    if (relatedMeeting.productType && scenario.productName && relatedMeeting.productType === scenario.productName) {
      score += 3;
    }
    if (relatedMeeting.status === "lost") {
      score += 2;
    }
    if (relatedMeeting.aiSummary) {
      score += 1;
    }

    recommendations.push({
      scenario,
      reason:
        relatedMeeting.status === "lost"
          ? `${relatedMeeting.customerName || "直近商談"}で失注/要確認があるため、次回商談前の練習におすすめです。`
          : `${relatedMeeting.customerName || "直近商談"}のAI要約から、近いテーマの練習としておすすめです。`,
      score,
    });
  }

  return recommendations
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ scenario, reason }) => ({ scenario, reason }));
}

function splitLines(value: string) {
  return value
    .split(/\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function generateRoleplayScenario(input: {
  companyId: string;
  product: KnowledgeProduct;
  category: "新規" | "既存";
  targetSegment: string;
  meetingInsights?: string[];
}) {
  const response = await fetch("/api/roleplay/generate-scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: input.companyId,
      product: input.product,
      category: input.category,
      targetSegment: input.targetSegment,
      meetingInsights: input.meetingInsights ?? [],
    }),
  });
  const payload = (await response.json()) as {
    scenario?: {
      title?: string;
      description?: string;
      customerRole?: string;
      customerProfile?: string;
      goal?: string;
      objections?: string[];
      evaluationCriteria?: string[];
      difficulty?: RoleplayDifficulty;
    };
    error?: string;
  };
  if (!response.ok || !payload.scenario) {
    throw new Error(payload.error ?? "AI生成に失敗しました。");
  }
  return {
    title: payload.scenario.title ?? "",
    description: payload.scenario.description ?? "",
    customerRole: payload.scenario.customerRole ?? "",
    customerProfile: payload.scenario.customerProfile ?? "",
    goal: payload.scenario.goal ?? "",
    objections: payload.scenario.objections ?? [],
    evaluationCriteria: payload.scenario.evaluationCriteria ?? [],
    difficulty: payload.scenario.difficulty ?? "normal",
  };
}

function buildMeetingInsights(input: {
  meetings: MeetingRecord[];
  productName: string;
  category: "新規" | "既存";
  targetSegment: string;
}) {
  const normalizedProduct = input.productName.trim().toLowerCase();
  const normalizedTarget = input.targetSegment.trim().toLowerCase();
  const category = input.category === "新規" ? "new" : "existing";

  return input.meetings
    .filter((meeting) => meeting.aiSummary || meeting.status === "lost")
    .map((meeting) => {
      let score = 0;
      const productType = meeting.productType.trim().toLowerCase();
      const customerName = meeting.customerName.trim().toLowerCase();
      const memo = meeting.memo.trim().toLowerCase();
      if (normalizedProduct && productType && (productType.includes(normalizedProduct) || normalizedProduct.includes(productType))) score += 4;
      if (meeting.customerType === category) score += 3;
      if (normalizedTarget && [customerName, memo, meeting.location.toLowerCase()].some((value) => value.includes(normalizedTarget))) score += 2;
      if (meeting.status === "lost") score += 2;
      if (meeting.aiSummary?.manualCompliance?.missingCriteria.length) score += 2;
      return { meeting, score };
    })
    .sort((left, right) => right.score - left.score || (right.meeting.recordedAt?.getTime() ?? 0) - (left.meeting.recordedAt?.getTime() ?? 0))
    .slice(0, 5)
    .flatMap(({ meeting }) => {
      const compliance = meeting.aiSummary?.manualCompliance;
      const fillerInsights = buildFillerInsights(meeting);
      return [
        meeting.status === "lost" ? `${meeting.customerName || "過去商談"}は失注/要改善。` : "",
        meeting.aiSummary?.overview ? `要約: ${meeting.aiSummary.overview}` : "",
        ...(meeting.aiSummary?.bullets ?? []).slice(0, 3).map((item) => `分析メモ: ${item}`),
        ...(compliance?.missingCriteria ?? []).slice(0, 4).map((item) => `不足基準: ${item}`),
        ...(compliance?.improvementPhrases ?? []).slice(0, 3).map((item) => `改善フレーズ: ${item}`),
        ...(compliance?.productNotes ?? []).slice(0, 3).map((item) => `商品観点: ${item}`),
        ...fillerInsights,
      ].filter(Boolean);
    })
    .slice(0, 16);
}

const fillerPatterns = [
  { label: "えー", pattern: /えー+/g },
  { label: "えっと", pattern: /えっと/g },
  { label: "あの", pattern: /あの[ー、,\s]/g },
  { label: "その", pattern: /その[ー、,\s]/g },
  { label: "まあ", pattern: /まあ/g },
  { label: "なんか", pattern: /なんか/g },
  { label: "はい", pattern: /はい/g },
  { label: "はぁ", pattern: /はぁ/g },
  { label: "なるほどですね", pattern: /なるほどですね/g },
  { label: "みたいな", pattern: /みたいな/g },
  { label: "ちょっと", pattern: /ちょっと/g },
];

function buildFillerInsights(meeting: MeetingRecord) {
  const text = [
    ...((meeting.conversationLogs ?? [])
      .filter((log) => log.speaker === "speaker_1" || log.label.includes("営業"))
      .map((log) => log.text)),
    ...(meeting.conversationLogs?.length ? [] : [meeting.transcriptionProbeText ?? ""]),
    ...(meeting.transcriptBlocks ?? []).map((block) => block.text),
  ].join(" ");

  if (!text.trim()) return [];

  return fillerPatterns
    .map(({ label, pattern }) => ({ label, count: text.match(pattern)?.length ?? 0 }))
    .filter((item) => item.count >= 3)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4)
    .map((item) => `話し癖改善: 「${item.label}」が${item.count}回程度出ています。ロープレでは間を置いて言い換える練習を入れる。`);
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
