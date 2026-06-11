"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
import {
  createRoleplayAssignment,
  subscribeToRoleplayAssignments,
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
          action={<Link href="/sales/roleplay/scenarios" className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]">シナリオ作成</Link>}
        />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <KpiCard label="シナリオ" value={`${roleplayScenarios.length}件`} note="登録済み" />
          <KpiCard label="実施回数" value={`${roleplayResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={averageScore === null ? "-" : `${averageScore}点`} note={averageScore === null ? "集計準備中" : "全体平均"} />
          <KpiCard label="未実施者" value={`${inactiveMembers.length}人`} note="結果未保存の営業メンバー" />
          <KpiCard label="割り当て中" value={`${activeAssignments.length}件`} note="未完了の課題" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
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
                      <span className="text-[13px] font-bold text-[#596273]">{score === null ? "集計準備中" : `${score}点`}</span>
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
    </PageShell>
  );
}

function formatDifficulty(value: string) {
  if (value === "easy") return "やさしい";
  if (value === "hard") return "難しい";
  return "標準";
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
