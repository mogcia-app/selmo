"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import type { KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createRoleplayAssignment,
  createRoleplayScenario,
  subscribeToRoleplayAssignments,
  type RoleplayDifficulty,
  type RoleplayAssignment,
} from "@/lib/firebase/roleplay";

export default function AdminRoleplayPage() {
  const { profile } = useAuth();
  const { roleplayScenarios, roleplayResults, memberRows, products, error } = useAdminInsights();
  const [assignments, setAssignments] = useState<RoleplayAssignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const completedUserIds = new Set(roleplayResults.map((result) => result.userId));
  const inactiveMembers = memberRows.filter((member) => !completedUserIds.has(member.id));
  const averageScore = roleplayResults.length > 0 ? Math.round(roleplayResults.reduce((sum, result) => sum + result.score, 0) / roleplayResults.length) : null;
  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "assigned"),
    [assignments],
  );

  useEffect(() => {
    if (!profile?.companyId) return;
    return subscribeToRoleplayAssignments(
      { companyId: profile.companyId, isAdmin: true },
      setAssignments,
      () => undefined,
    );
  }, [profile?.companyId]);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignmentMessage(null);

    const member = memberRows.find((row) => row.id === selectedUserId);
    const scenario = roleplayScenarios.find((item) => item.id === selectedScenarioId);

    if (!profile?.uid || !profile.companyId || !member || !scenario) {
      setAssignmentMessage("営業メンバーとシナリオを選択してください。");
      return;
    }

    setIsAssigning(true);
    try {
      await createRoleplayAssignment({
        companyId: profile.companyId,
        userId: member.id,
        scenario,
        assignedBy: profile.uid,
        reason: assignmentReason.trim() || "次回商談に向けた練習課題です。",
      });
      setAssignmentMessage(`${member.name}さんに課題を割り当てました。`);
      setAssignmentReason("");
    } catch (nextError) {
      setAssignmentMessage(nextError instanceof Error ? nextError.message : "割り当てに失敗しました。");
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ROLEPLAY MANAGEMENT"
          title="ロープレ管理"
          description="商品別シナリオと実施状況を確認し、未実施者や低スコアのメンバーに指導をつなげます。"
          action={
            <button
              type="button"
              onClick={() => {
                setScenarioMessage(null);
                setIsScenarioDialogOpen(true);
              }}
              className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717] transition hover:bg-[#ffcf24]"
            >
              シナリオ作成
            </button>
          }
        />
        {error ? <ErrorBox message={error} /> : null}
        {scenarioMessage ? (
          <div className="mt-5 rounded-[16px] border border-[#d9edc8] bg-[#f7fff2] px-4 py-3 text-[13px] font-bold text-[#4e7a24]">
            {scenarioMessage}
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <KpiCard label="シナリオ" value={`${roleplayScenarios.length}件`} note="登録済み" />
          <KpiCard label="実施回数" value={`${roleplayResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={averageScore === null ? "-" : `${averageScore}点`} note={averageScore === null ? "結果なし" : "全体平均"} />
          <KpiCard label="未実施者" value={`${inactiveMembers.length}人`} note="結果未保存の営業メンバー" />
          <KpiCard label="割り当て中" value={`${activeAssignments.length}件`} note="未完了の課題" />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <Panel title="シナリオ一覧">
            {roleplayScenarios.length > 0 ? (
              <div className="space-y-3">
                {roleplayScenarios.map((scenario) => {
                  const results = roleplayResults.filter((result) => result.scenarioId === scenario.id);
                  const score = results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null;
                  const product = products.find((item) => item.id === scenario.productId);
                  return (
                    <div key={scenario.id} className="grid gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px_120px]">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{scenario.title}</div>
                        <div className="mt-1 truncate text-[12px] text-[#7a808c]">{product?.name || scenario.productName || "商材未設定"} ・ {scenario.customerRole}</div>
                      </div>
                      <span className="text-[13px] font-bold text-[#596273]">{formatDifficulty(scenario.difficulty)}</span>
                      <span className="text-[13px] font-bold text-[#596273]">{results.length}回実施</span>
                      <span className="text-[13px] font-bold text-[#596273]">{score === null ? "結果なし" : `${score}点`}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="シナリオはまだありません" body="シナリオ作成後、実施状況を確認できます。" />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel title="未実施者一覧">
              {inactiveMembers.length > 0 ? (
                <div className="space-y-2">
                  {inactiveMembers.map((member) => (
                    <Link key={member.id} href={`/admin/members/${member.id}`} className="flex items-center justify-between rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <span className="text-[13px] font-black text-[#171717]">{member.name}</span>
                      <StatusBadge tone="risk" label="未実施" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="未実施者はいません" body="全員にロープレ結果が保存されています。" />
              )}
            </Panel>

            <Panel title="ロープレ課題を割り当て">
              <form onSubmit={handleAssign} className="space-y-3">
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
                >
                  <option value="">営業メンバーを選択</option>
                  {memberRows.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
                <select
                  value={selectedScenarioId}
                  onChange={(event) => setSelectedScenarioId(event.target.value)}
                  className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
                >
                  <option value="">シナリオを選択</option>
                  {roleplayScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                  ))}
                </select>
                <textarea
                  value={assignmentReason}
                  onChange={(event) => setAssignmentReason(event.target.value)}
                  className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  placeholder="割り当て理由。例：価格説明の改善が必要なため"
                />
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60"
                >
                  {isAssigning ? "割り当て中" : "課題を割り当てる"}
                </button>
                {assignmentMessage ? (
                  <p className="rounded-[12px] bg-[#fcfcfd] px-3 py-2 text-[12px] leading-5 text-[#596273]">
                    {assignmentMessage}
                  </p>
                ) : null}
              </form>
            </Panel>

            <Panel title="割り当て中の課題">
              {activeAssignments.length > 0 ? (
                <div className="space-y-2">
                  {activeAssignments.slice(0, 6).map((assignment) => {
                    const member = memberRows.find((row) => row.id === assignment.userId);
                    return (
                      <div key={assignment.id} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                        <div className="text-[13px] font-black text-[#171717]">{member?.name ?? "未設定"}</div>
                        <div className="mt-1 text-[12px] font-bold text-[#596273]">{assignment.scenarioTitle}</div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7a808c]">{assignment.reason}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Placeholder>未完了の割り当てはありません</Placeholder>
              )}
            </Panel>
          </div>
        </section>
      </div>
      {isScenarioDialogOpen && profile?.uid && profile.companyId ? (
        <ScenarioCreateDialog
          products={products}
          userId={profile.uid}
          companyId={profile.companyId}
          onClose={() => setIsScenarioDialogOpen(false)}
          onCreated={() => {
            setIsScenarioDialogOpen(false);
            setScenarioMessage("シナリオを作成しました。sales側のロープレにも表示されます。");
          }}
          onError={setScenarioMessage}
        />
      ) : null}
    </PageShell>
  );
}

function ScenarioCreateDialog({
  products,
  userId,
  companyId,
  onClose,
  onCreated,
  onError,
}: {
  products: KnowledgeProduct[];
  userId: string;
  companyId: string;
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !customerRole.trim() || !goal.trim()) {
      onError("タイトル、顧客役職、練習ゴールを入力してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      await createRoleplayScenario({
        companyId,
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
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">管理者シナリオ作成</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">商品・顧客条件・反論・採点基準を登録します。作成後はsales側のロープレに表示されます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="タイトル" required>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：価格反論を受けた時の切り返し" />
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
            {isSaving ? "保存中" : "作成してsalesに表示"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
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

function splitLines(value: string) {
  return value
    .split(/\r?\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDifficulty(value: string) {
  if (value === "easy") return "やさしい";
  if (value === "hard") return "難しい";
  return "標準";
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
