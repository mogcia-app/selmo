"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  type RoleplayScenarioCustomField,
} from "@/lib/firebase/roleplay";

export default function SalesRoleplayScenariosPage() {
  const searchParams = useSearchParams();
  const roleplayType = readRoleplayType(searchParams.get("category"));
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
  const activeAssignmentScenarioIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.status === "assigned").map((assignment) => assignment.scenarioId)),
    [assignments],
  );
  const visibleScenarios = useMemo(
    () =>
      scenarios.filter((scenario) => {
        if (scenario.roleplayType !== roleplayType) return false;
        return scenario.visibility === "all" || scenario.createdBy === userId || activeAssignmentScenarioIds.has(scenario.id);
      }),
    [activeAssignmentScenarioIds, roleplayType, scenarios, userId],
  );
  const activeScenario = useMemo(
    () => visibleScenarios.find((scenario) => scenario.id === activeScenarioId) ?? visibleScenarios[0] ?? null,
    [activeScenarioId, visibleScenarios],
  );

  useEffect(() => {
    if (searchParams.get("openCreate") === "1") {
      setDialogOpen(true);
    }
  }, [searchParams]);

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

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="scenario" roleplayType={roleplayType} />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[12px] font-bold text-[#8a6500]">SCENARIOS</p>
                <h2 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">シナリオを選択</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                  商材・顧客条件・反論パターンを選んで、AI顧客との練習を開始できます。
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
                    <AssignmentCard key={assignment.id} assignment={assignment} roleplayType={roleplayType} />
                  ))}
                </div>
              </section>
            ) : null}

            {visibleScenarios.length > 0 ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {visibleScenarios.map((scenario) => (
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
                      <Pill>{scenario.productName || "商材未設定"}</Pill>
                      <Pill>{scenario.scenarioCategory || "分類未設定"}</Pill>
                      <Pill>{scenario.targetSegment || "ターゲット未設定"}</Pill>
                      <Pill>{scenario.customerRole}</Pill>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                  <ScenarioIcon />
                </span>
                <h3 className="mt-4 text-[20px] font-black text-[#171717]">シナリオはまだありません</h3>
                <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-7 text-[#7a808c]">
                  管理者が商材別の練習テーマを追加すると、ここからロープレを開始できます。
                </p>
              </div>
            )}
          </article>

          <aside className="h-fit rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)] xl:sticky xl:top-5">
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
                {activeScenario.customFields.map((field) => (
                  <InfoBlock key={field.id} label={field.label} value={field.value} />
                ))}
                <button
                  type="button"
                  onClick={() => setEditingScenario(activeScenario)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white text-[14px] font-black text-[#343b48]"
                >
                  シナリオを編集
                </button>
                <Link
                  href={`/sales/roleplay?category=${roleplayType}&scenarioId=${encodeURIComponent(activeScenario.id)}`}
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
          roleplayType={roleplayType}
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
          roleplayType={roleplayType}
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
  roleplayType,
  scenario,
  onClose,
  onCreated,
  onError,
}: {
  products: KnowledgeProduct[];
  meetings: MeetingRecord[];
  userId: string;
  companyId: string;
  roleplayType: RoleplayType;
  scenario?: RoleplayScenario;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const prefillProductName = searchParams.get("prefillProductName") ?? "";
  const prefillCustomerType = searchParams.get("prefillCustomerType") === "existing" ? "既存" : searchParams.get("prefillCustomerType") === "new" ? "新規" : "";
  const prefillTargetSegment = searchParams.get("prefillTargetSegment") ?? "";
  const prefillCustomerName = searchParams.get("prefillCustomerName") ?? "";
  const prefillPurpose = searchParams.get("prefillPurpose") ?? "";
  const prefillIssues = searchParams.get("prefillIssues") ?? "";
  const prefillMemo = searchParams.get("prefillMemo") ?? "";
  const [title, setTitle] = useState(scenario?.title ?? (prefillProductName ? `${prefillProductName} 事前ロープレ` : ""));
  const [description, setDescription] = useState(scenario?.description ?? (prefillPurpose ? `${prefillPurpose}に向けた事前ロープレ` : ""));
  const [productId, setProductId] = useState(scenario?.productId ?? "");
  const [scenarioCategory, setScenarioCategory] = useState<"新規" | "既存" | "">(scenario?.scenarioCategory ?? prefillCustomerType);
  const [targetSegment, setTargetSegment] = useState(scenario?.targetSegment ?? prefillTargetSegment);
  const [customerRole, setCustomerRole] = useState(scenario?.customerRole ?? "");
  const [customerProfile, setCustomerProfile] = useState(scenario?.customerProfile ?? buildPrefillCustomerProfile({ prefillCustomerName, prefillPurpose, prefillIssues, prefillMemo }));
  const [goal, setGoal] = useState(scenario?.goal ?? (prefillPurpose ? `${prefillPurpose}の予定に向けて、顧客課題を確認し次回アクションまで進める。` : ""));
  const [objections, setObjections] = useState((scenario?.objections ?? (prefillIssues ? splitLines(prefillIssues) : [])).join("\n"));
  const [criteria, setCriteria] = useState((scenario?.evaluationCriteria ?? []).join("\n"));
  const [customFields, setCustomFields] = useState<RoleplayScenarioCustomField[]>(scenario?.customFields ?? []);
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty>(scenario?.difficulty ?? "hard");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);

  useEffect(() => {
    if (scenario || productId || !prefillProductName) return;
    const product = products.find((item) => item.name === prefillProductName);
    if (product) setProductId(product.id);
  }, [prefillProductName, productId, products, scenario]);

  const handleGenerate = async () => {
    if (!selectedProduct || !scenarioCategory) {
      onError("AI生成には商材、カテゴリーを選択してください。");
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
        roleplayType,
        meetingInsights: buildMeetingInsights({
          meetings,
          productName: selectedProduct.name,
          category: scenarioCategory,
          targetSegment,
        }),
      });
      setTitle(generated.title);
      setDescription(generated.description);
      setTargetSegment(generated.targetSegment);
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
    if (!selectedProduct || !scenarioCategory || !goal.trim()) {
      onError("商材、カテゴリー、練習ゴールを入力してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      const normalizedCustomFields = normalizeCustomFields(customFields);
      if (hasInvalidCustomFields(customFields)) {
        onError("自由項目は項目名と中身を両方入力してください。");
        setIsSaving(false);
        return;
      }

      const payload = {
        companyId,
        roleplayType,
        title: title.trim() || `${selectedProduct.name} ${scenarioCategory}ロープレ`,
        description: description.trim(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        scenarioCategory,
        targetSegment: targetSegment.trim(),
        customerRole: customerRole.trim() || "担当者",
        customerProfile: customerProfile.trim(),
        goal: goal.trim(),
        objections: splitLines(objections),
        evaluationCriteria: splitLines(criteria),
        customFields: normalizedCustomFields,
        difficulty,
        visibility: scenario?.visibility ?? "draft",
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
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">商材・カテゴリーからAI生成し、ターゲット層もAIに選ばせられます。</p>
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
          <Field label="ターゲット層">
            <input value={targetSegment} onChange={(event) => setTargetSegment(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="空欄ならAIが選定" />
          </Field>
          <div className="flex items-end">
            <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating} className="h-12 w-full rounded-[14px] border border-[#171717] bg-[#171717] px-4 text-[13px] font-black text-white disabled:opacity-60">
              {isGenerating ? "生成中" : "AIでシナリオ生成"}
            </button>
          </div>
          <Field label="タイトル" className="md:col-span-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：料金が高いと言われた時" />
          </Field>
          <Field label="顧客役職">
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
          <div className="md:col-span-2 rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-bold text-[#343b48]">自由項目</div>
                <p className="mt-1 text-[12px] text-[#7a808c]">シナリオに必要な項目名と中身を自由に追加できます。</p>
              </div>
              <button type="button" onClick={() => setCustomFields((current) => [...current, createCustomField()])} className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#e4e8ef] bg-white px-4 text-[13px] font-black text-[#343b48]">
                項目を追加
              </button>
            </div>
            {customFields.length > 0 ? (
              <div className="mt-4 space-y-3">
                {customFields.map((field, index) => (
                  <div key={field.id} className="rounded-[16px] border border-[#e6eaf0] bg-white px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[12px] font-bold text-[#8a909b]">自由項目 {index + 1}</div>
                      <button type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))} className="text-[12px] font-bold text-[#b4232a]">
                        削除
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                      <input
                        value={field.label}
                        onChange={(event) => updateCustomField(setCustomFields, field.id, "label", event.target.value)}
                        className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                        placeholder="項目名"
                      />
                      <textarea
                        value={field.value}
                        onChange={(event) => updateCustomField(setCustomFields, field.id, "value", event.target.value)}
                        className="min-h-[88px] resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                        placeholder="中身"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
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

function createCustomField(): RoleplayScenarioCustomField {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    value: "",
  };
}

function updateCustomField(
  setCustomFields: React.Dispatch<React.SetStateAction<RoleplayScenarioCustomField[]>>,
  id: string,
  key: "label" | "value",
  value: string,
) {
  setCustomFields((current) =>
    current.map((field) => (field.id === id ? { ...field, [key]: value } : field)),
  );
}

function normalizeCustomFields(fields: RoleplayScenarioCustomField[]) {
  return fields
    .map((field) => ({
      id: field.id,
      label: field.label.trim(),
      value: field.value.trim(),
    }))
    .filter((field) => field.label && field.value)
    .slice(0, 12);
}

function hasInvalidCustomFields(fields: RoleplayScenarioCustomField[]) {
  return fields.some((field) => {
    const hasLabel = Boolean(field.label.trim());
    const hasValue = Boolean(field.value.trim());
    return hasLabel !== hasValue;
  });
}

function RoleplayHeader({ activeStep, roleplayType }: { activeStep: "scenario" | "practice" | "results"; roleplayType: RoleplayType }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <span className="sr-only">ロープレナビゲーション</span>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href={`/sales/roleplay/scenarios?category=${roleplayType}`} />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href={`/sales/roleplay?category=${roleplayType}`} />
        <Step number="3" label="分析結果" active={activeStep === "results"} href={`/sales/roleplay/results?category=${roleplayType}`} />
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

function AssignmentCard({ assignment, roleplayType }: { assignment: RoleplayAssignment; roleplayType: RoleplayType }) {
  return (
    <Link
      href={`/sales/roleplay?category=${roleplayType}&scenarioId=${encodeURIComponent(assignment.scenarioId)}`}
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

function buildPrefillCustomerProfile(input: {
  prefillCustomerName: string;
  prefillPurpose: string;
  prefillIssues: string;
  prefillMemo: string;
}) {
  return [
    input.prefillCustomerName ? `顧客名: ${input.prefillCustomerName}` : "",
    input.prefillPurpose ? `予定目的: ${input.prefillPurpose}` : "",
    input.prefillIssues ? `想定課題・不安: ${input.prefillIssues}` : "",
    input.prefillMemo ? `事前準備メモ: ${input.prefillMemo}` : "",
  ].filter(Boolean).join("\n");
}

async function generateRoleplayScenario(input: {
  companyId: string;
  product: KnowledgeProduct;
  category: "新規" | "既存";
  targetSegment: string;
  roleplayType: RoleplayType;
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
      roleplayType: input.roleplayType,
      meetingInsights: input.meetingInsights ?? [],
    }),
  });
  const payload = (await response.json()) as {
    scenario?: {
      title?: string;
      description?: string;
      targetSegment?: string;
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
    targetSegment: payload.scenario.targetSegment ?? "",
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
      const lowEvaluationInsights = buildLowEvaluationInsights(meeting);
      const fillerInsights = buildFillerInsights(meeting);
      return [
        meeting.status === "lost" ? `${meeting.customerName || "過去商談"}は失注/要改善。` : "",
        meeting.aiSummary?.overview ? `要約: ${meeting.aiSummary.overview}` : "",
        ...(meeting.aiSummary?.bullets ?? []).slice(0, 3).map((item) => `分析メモ: ${item}`),
        ...(meeting.aiSummary?.diagnosis?.status?.label ? [`商談の現在地: ${meeting.aiSummary.diagnosis.status.label}`] : []),
        ...(meeting.aiSummary?.diagnosis?.temperature?.label ? [`温度感: ${meeting.aiSummary.diagnosis.temperature.label}`] : []),
        ...(meeting.aiSummary?.diagnosis?.consideration?.label ? [`検討度: ${meeting.aiSummary.diagnosis.consideration.label} ${meeting.aiSummary.diagnosis.consideration.score}点`] : []),
        ...lowEvaluationInsights,
        ...(compliance?.missingCriteria ?? []).slice(0, 4).map((item) => `不足基準: ${item}`),
        ...(compliance?.improvementPhrases ?? []).slice(0, 3).map((item) => `改善フレーズ: ${item}`),
        ...(compliance?.productNotes ?? []).slice(0, 3).map((item) => `商材観点: ${item}`),
        ...fillerInsights,
      ].filter(Boolean);
    })
    .slice(0, 16);
}

function buildLowEvaluationInsights(meeting: MeetingRecord) {
  return (meeting.aiSummary?.diagnosis?.salesEvaluation ?? [])
    .filter((item) => item.score <= 65)
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((item) => {
      const evidence = item.evidence.slice(0, 2).join(" / ");
      return `弱点項目: ${item.label} ${item.score}点。${item.description}${evidence ? ` 根拠: ${evidence}` : ""}`;
    });
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

type RoleplayType = "meeting" | "teleapo";

function readRoleplayType(value: string | null): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
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
