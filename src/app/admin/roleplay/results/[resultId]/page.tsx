"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { EmptyState, PageHeader, PageShell, Panel, useAdminInsights } from "@/app/admin/_components/admin-insights";
import { RoleplayEmotionAnalysisBlock } from "@/app/sales/roleplay/results/roleplay-result-analysis";
import { useAuth } from "@/features/auth/auth-provider";
import { createAppNotification } from "@/lib/firebase/notifications";
import {
  createRoleplayAssignment,
  createRoleplayResultComment,
  subscribeToRoleplayResultComments,
  updateRoleplayScenario,
  updateRoleplayScenarioVisibility,
  type RoleplayResult,
  type RoleplayResultComment,
} from "@/lib/firebase/roleplay";

export default function AdminRoleplayResultDetailPage() {
  const params = useParams<{ resultId: string }>();
  const { profile } = useAuth();
  const { roleplayResults, roleplayScenarios, memberRows, products, error } = useAdminInsights();
  const result = roleplayResults.find((item) => item.id === params.resultId) ?? null;
  const scenario = result ? roleplayScenarios.find((item) => item.id === result.scenarioId) ?? null : null;
  const member = result ? memberRows.find((row) => row.id === result.userId) ?? null : null;
  const [comments, setComments] = useState<RoleplayResultComment[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [objections, setObjections] = useState("");
  const [criteria, setCriteria] = useState("");
  const [isSavingScenario, setIsSavingScenario] = useState(false);
  const selectedMembers = useMemo(
    () => memberRows.filter((row) => selectedUserIds.includes(row.id)),
    [memberRows, selectedUserIds],
  );

  useEffect(() => {
    if (!scenario) return;
    setTitle(scenario.title);
    setGoal(scenario.goal);
    setObjections(scenario.objections.join("\n"));
    setCriteria(scenario.evaluationCriteria.join("\n"));
  }, [scenario]);

  useEffect(() => {
    if (!profile?.companyId || !params.resultId) return;
    return subscribeToRoleplayResultComments(
      { companyId: profile.companyId, resultId: params.resultId },
      setComments,
      () => setMessage("コメントの読み込みに失敗しました。"),
    );
  }, [params.resultId, profile?.companyId]);

  async function handleSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile?.uid || !profile.companyId || !result || !comment.trim()) {
      setMessage("コメントを入力してください。");
      return;
    }

    setIsSavingComment(true);
    setMessage(null);
    try {
      await createRoleplayResultComment({
        companyId: profile.companyId,
        resultId: result.id,
        scenarioId: result.scenarioId,
        userId: result.userId,
        comment: comment.trim(),
        createdBy: profile.uid,
      });
      await createAppNotification({
        companyId: profile.companyId,
        userId: result.userId,
        title: "ロープレ分析にコメントが届きました",
        body: comment.trim(),
        href: "/sales/roleplay/results",
        type: "roleplay_comment",
        createdBy: profile.uid,
        metadata: {
          resultId: result.id,
          scenarioId: result.scenarioId,
        },
      });
      setComment("");
      setMessage("営業マンへコメントを送信しました。");
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : "コメント送信に失敗しました。");
    } finally {
      setIsSavingComment(false);
    }
  }

  async function handleSaveScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scenario || !profile?.uid || !profile.companyId || !goal.trim()) {
      setMessage("シナリオの練習ゴールを入力してください。");
      return;
    }

    setIsSavingScenario(true);
    setMessage(null);
    try {
      await updateRoleplayScenario(scenario.id, {
        companyId: profile.companyId,
        title: title.trim() || scenario.title,
        description: scenario.description,
        productId: scenario.productId,
        productName: scenario.productName,
        scenarioCategory: scenario.scenarioCategory,
        targetSegment: scenario.targetSegment,
        customerRole: scenario.customerRole,
        customerProfile: scenario.customerProfile,
        goal: goal.trim(),
        objections: splitLines(objections),
        evaluationCriteria: splitLines(criteria),
        customFields: scenario.customFields,
        difficulty: scenario.difficulty,
        visibility: scenario.visibility,
        createdBy: scenario.createdBy ?? profile.uid,
      });
      setMessage("シナリオを更新しました。");
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : "シナリオ更新に失敗しました。");
    } finally {
      setIsSavingScenario(false);
    }
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scenario || !profile?.uid || !profile.companyId || selectedMembers.length === 0) {
      setMessage("表示する営業メンバーを1人以上選択してください。");
      return;
    }

    setIsAssigning(true);
    setMessage(null);
    try {
      await Promise.all(
        selectedMembers.map((targetMember) =>
          createRoleplayAssignment({
            companyId: profile.companyId,
            userId: targetMember.id,
            scenario,
            assignedBy: profile.uid,
            reason: assignmentReason.trim() || `${member?.name ?? "営業マン"}のロープレ結果から共有された練習シナリオです。`,
          }),
        ),
      );
      setSelectedUserIds([]);
      setAssignmentReason("");
      setMessage(`${selectedMembers.length}人にシナリオを表示しました。`);
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : "シナリオ表示に失敗しました。");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handlePublishAll() {
    if (!scenario) return;
    setIsPublishing(true);
    setMessage(null);
    try {
      await updateRoleplayScenarioVisibility(scenario.id, "all");
      setMessage("このシナリオをsales全員に表示しました。");
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : "全員表示に失敗しました。");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ROLEPLAY DETAIL"
          title="ロープレ結果詳細"
          description="営業マンが実施したシナリオ内容、結果、会話ログを確認し、コメントや展開判断につなげます。"
          action={<Link href="/admin/roleplay" className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">一覧へ戻る</Link>}
        />
        {error ? <MessageBox message={error} tone="error" /> : null}
        {message ? <MessageBox message={message} tone="normal" /> : null}

        {!result ? (
          <div className="mt-6">
            <EmptyState title="ロープレ結果が見つかりません" body="結果が削除されたか、読み込み権限がありません。" />
          </div>
        ) : (
          <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
            <div className="space-y-6">
              <Panel title="実施結果">
                <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
                  <div className="rounded-[18px] bg-[#171717] px-4 py-5 text-center text-white">
                    <div className="text-[38px] font-black leading-none">{result.score}</div>
                    <div className="mt-1 text-[11px] font-bold text-white/70">score</div>
                  </div>
                  <div>
                    <h2 className="text-[22px] font-black text-[#171717]">{result.scenarioTitle}</h2>
                    <p className="mt-1 text-[13px] font-bold text-[#7a808c]">
                      {member?.name ?? "営業マン未設定"} ・ {result.productName || "商材未設定"} ・ {formatDate(result.createdAt)}
                    </p>
                    <p className="mt-4 text-[14px] leading-7 text-[#343b48]">{result.summary || "分析サマリーはありません。"}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ListBlock title="良かった点" items={result.strengths} />
                  <ListBlock title="改善ポイント" items={result.improvements} />
                  <DetailBlock title="実施情報" body={`営業マン: ${member?.name ?? "未設定"}\n会話数: ${result.messages.length}件\n実施日: ${formatDate(result.createdAt)}`} />
                </div>
                <RoleplayEmotionAnalysisBlock messages={result.messages} />
                {result.manualChecklistItems && result.manualChecklistItems.length > 0 ? (
                  <ManualChecklistBlock items={result.manualChecklistItems} score={result.score} />
                ) : null}
              </Panel>

              <Panel title="実施トーク">
                <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {result.messages.length > 0 ? (
                    result.messages.map((talk, index) => (
                      <div key={`${talk.createdAt}-${index}`} className={`rounded-[14px] px-4 py-3 ${talk.role === "sales" ? "bg-[#171717] text-white" : "border border-[#e6eaf0] bg-[#fcfcfd] text-[#343b48]"}`}>
                        <div className={`text-[11px] font-black ${talk.role === "sales" ? "text-white/70" : "text-[#8a909b]"}`}>
                          {talk.role === "sales" ? "営業" : "AI顧客"}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6">{talk.content}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="会話ログはありません" body="この結果には会話ログが保存されていません。" />
                  )}
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="adminコメント">
                <form onSubmit={handleSaveComment} className="space-y-3">
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                    placeholder="例：課題確認は良かったです。次回は予算と決裁者確認まで進めましょう。"
                  />
                  <button type="submit" disabled={isSavingComment} className="h-11 w-full rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60">
                    {isSavingComment ? "送信中" : "コメントを送信"}
                  </button>
                </form>
                <div className="mt-4 space-y-2">
                  {comments.length > 0 ? comments.map((item) => (
                    <div key={item.id} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#343b48]">{item.comment}</p>
                      <div className="mt-2 text-[11px] font-bold text-[#8a909b]">{formatDate(item.createdAt)}</div>
                    </div>
                  )) : <p className="text-[13px] font-bold text-[#8a909b]">コメントはまだありません。</p>}
                </div>
              </Panel>

              {scenario ? (
                <Panel title="シナリオ内容">
                  <form onSubmit={handleSaveScenario} className="space-y-3">
                    <Field label="タイトル">
                      <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]" />
                    </Field>
                    <DetailBlock title="商材 / タイプ" body={`${products.find((product) => product.id === scenario.productId)?.name || scenario.productName || "商材未設定"} / ${scenario.scenarioCategory || "分類未設定"}`} />
                    <Field label="練習ゴール">
                      <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="min-h-[92px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" />
                    </Field>
                    <Field label="想定反論">
                      <textarea value={objections} onChange={(event) => setObjections(event.target.value)} className="min-h-[92px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" />
                    </Field>
                    <Field label="採点基準">
                      <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="min-h-[92px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]" />
                    </Field>
                    <button type="submit" disabled={isSavingScenario} className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white text-[13px] font-black text-[#343b48] disabled:opacity-60">
                      {isSavingScenario ? "更新中" : "シナリオを更新"}
                    </button>
                  </form>
                </Panel>
              ) : (
                <Panel title="シナリオ内容">
                  <EmptyState title="シナリオが見つかりません" body="元シナリオが削除された可能性があります。" />
                </Panel>
              )}

              {scenario ? (
                <Panel title="他のsalesへ表示">
                  <form onSubmit={handleAssign} className="space-y-3">
                    <div className="rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12px] font-black text-[#343b48]">営業メンバー</div>
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds((current) => (current.length === memberRows.length ? [] : memberRows.map((row) => row.id)))}
                          className="text-[12px] font-black text-[#8a6500]"
                        >
                          {selectedUserIds.length === memberRows.length ? "全解除" : "全選択"}
                        </button>
                      </div>
                      <div className="mt-2 max-h-[170px] space-y-2 overflow-y-auto">
                        {memberRows.map((row) => (
                          <label key={row.id} className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-bold text-[#343b48] hover:bg-[#fcfcfd]">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(row.id)}
                              onChange={(event) => {
                                setSelectedUserIds((current) =>
                                  event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                                );
                              }}
                            />
                            {row.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={assignmentReason}
                      onChange={(event) => setAssignmentReason(event.target.value)}
                      className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                      placeholder="表示理由"
                    />
                    <button type="submit" disabled={isAssigning} className="h-11 w-full rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60">
                      {isAssigning ? "表示中" : "選択したsalesに表示"}
                    </button>
                    <button type="button" onClick={() => void handlePublishAll()} disabled={isPublishing || scenario.visibility === "all"} className="h-11 w-full rounded-[14px] border border-[#171717] bg-[#171717] text-[13px] font-black text-white disabled:opacity-50">
                      {isPublishing ? "表示中" : scenario.visibility === "all" ? "全員表示済み" : "全員に表示"}
                    </button>
                  </form>
                </Panel>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <h3 className="text-[13px] font-black text-[#171717]">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#596273]">{body || "未登録"}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <h3 className="text-[13px] font-black text-[#171717]">{title}</h3>
      <ul className="mt-2 space-y-1 text-[13px] leading-6 text-[#596273]">
        {(items.length > 0 ? items : ["未登録"]).map((item) => (
          <li key={item}>・{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ManualChecklistBlock({
  items,
  score,
}: {
  items: NonNullable<RoleplayResult["manualChecklistItems"]>;
  score: number;
}) {
  const positive = items.reduce((sum, item) => sum + Math.max(item.scoreImpact ?? 0, 0), 0);
  const negative = items.reduce((sum, item) => sum + Math.min(item.scoreImpact ?? 0, 0), 0);
  const hasImpacts = items.some((item) => typeof item.scoreImpact === "number" && item.scoreImpact !== 0);
  const visibleScore = calculateScoreFromImpacts(items) ?? score;

  return (
    <div className="mt-4 rounded-[24px] border border-[#f0e3c1] bg-[#fffaf0] p-5 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-bold text-[#171717]">会社基準に沿った改善ポイント</h3>
            <span className="rounded-full border border-[#f0d992] bg-white px-3 py-1 text-[12px] font-bold text-[#8a6500]">
              会社基準: 適用済み
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[#6f6250]">
            管理者が登録した成功基準・商品情報をもとに、次のロープレで直すべきポイントを整理しています。
          </p>
        </div>
        <div className="rounded-[18px] border border-[#f0d992] bg-white px-5 py-4 text-center">
          <div className="text-[12px] font-bold text-[#8a909b]">準拠スコア</div>
          <div className="mt-1 text-[28px] font-black text-[#171717]">
            {visibleScore}<span className="ml-1 text-[14px] font-bold text-[#8a909b]">点</span>
          </div>
          <div className="mt-3 border-t border-[#f0e3c1] pt-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] font-bold text-[#8a909b]">達成</div>
                <div className="mt-0.5 text-[12px] font-black text-[#171717]">{items.filter((item) => item.status === "done").length}/{items.length}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#8a909b]">加点</div>
                <div className="mt-0.5 text-[12px] font-black text-[#15803d]">{hasImpacts ? `+${positive}` : "-"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#8a909b]">減点</div>
                <div className="mt-0.5 text-[12px] font-black text-[#d63c2f]">{hasImpacts ? negative : "-"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-[18px] border border-[#f0e3c1] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-black text-[#171717]">マニュアルチェック</div>
            <div className="mt-1 text-[12px] font-bold text-[#8a909b]">登録項目ごとに、ロープレ会話を当てはめています。</div>
          </div>
          <div className="text-[12px] font-bold text-[#8a909b]">
            {items.filter((item) => item.status === "done").length} / {items.length}
          </div>
        </div>
        <div className="mt-4 max-h-[460px] overflow-y-auto pr-1">
          <div className="divide-y divide-[#f3ead4]">
            {items.map((item) => {
              const isDone = item.status === "done";
              return (
                <div key={`${item.category}-${item.label}`} className="grid gap-3 py-3 md:grid-cols-[140px_1fr_72px_96px] md:items-start">
                  <span className="w-fit rounded-full border border-[#f0e3c1] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                    {item.category}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold leading-5 text-[#171717]">{item.label}</div>
                    {item.reason ? <div className="mt-1 text-[12px] leading-5 text-[#7a808c]">{item.reason}</div> : null}
                  </div>
                  <span className={`text-[12px] font-black ${typeof item.scoreImpact === "number" ? item.scoreImpact >= 0 ? "text-[#15803d]" : "text-[#d63c2f]" : "text-[#a1a7b3]"}`}>
                    {formatScoreImpact(item.scoreImpact)}
                  </span>
                  <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[11px] font-black ${isDone ? "bg-[#eaf8ef] text-[#15803d]" : "bg-[#fff0ed] text-[#d63c2f]"}`}>
                    {isDone ? "できている" : "要改善"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateScoreFromImpacts(items: NonNullable<RoleplayResult["manualChecklistItems"]>) {
  const positive = items.reduce((sum, item) => sum + Math.max(item.scoreImpact ?? 0, 0), 0);
  const negative = items.reduce((sum, item) => sum + Math.min(item.scoreImpact ?? 0, 0), 0);
  if (positive <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((positive + negative) / positive) * 100)));
}

function formatScoreImpact(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "-";
  return value > 0 ? `+${value}` : `${value}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-[13px] font-bold text-[#343b48]">{label}</span>
      {children}
    </label>
  );
}

function MessageBox({ message, tone }: { message: string; tone: "normal" | "error" }) {
  return (
    <div className={`mt-5 rounded-[16px] border px-4 py-3 text-[13px] font-bold ${tone === "error" ? "border-[#f4d4d4] bg-[#fff8f8] text-[#b4232a]" : "border-[#d9edc8] bg-[#f7fff2] text-[#4e7a24]"}`}>
      {message}
    </div>
  );
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
