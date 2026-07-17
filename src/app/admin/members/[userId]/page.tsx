"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  calcWinRate,
  formatDate,
  getMeetingOutcomeLabel,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToSalesActivityEvents, type SalesActivityEvent } from "@/lib/firebase/activity";
import {
  saveAdminCoachingPlan,
  saveAdminReviewProgress,
  saveNextCoachingMemo,
  type AdminCoachingPriority,
  type AdminCoachingStatus,
  type AdminReviewStatus,
} from "@/lib/firebase/auth";
import {
  subscribeToCustomerLogs,
  subscribeToCustomers,
  type CustomerLogRecord,
  type CustomerRecord,
} from "@/lib/firebase/customers";
import type { KnowledgeItem, KnowledgeProduct } from "@/lib/firebase/knowledge";
import type { MeetingRecord } from "@/lib/firebase/meetings";
import { createAppNotification } from "@/lib/firebase/notifications";
import type { RoleplayResult } from "@/lib/firebase/roleplay";

export default function AdminMemberDetailPage() {
  const params = useParams<{ userId: string }>();
  const { profile: adminProfile } = useAuth();
  const { memberRows, salesUsers, meetings, roleplayResults, products, knowledgeItems, error } = useAdminInsights();
  const [activityEvents, setActivityEvents] = useState<SalesActivityEvent[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customerLogs, setCustomerLogs] = useState<CustomerLogRecord[]>([]);
  const [guidanceComment, setGuidanceComment] = useState("");
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);
  const [isSendingGuidance, setIsSendingGuidance] = useState(false);
  const [nextCoachingMemo, setNextCoachingMemo] = useState("");
  const [nextCoachingMemoMessage, setNextCoachingMemoMessage] = useState<string | null>(null);
  const [isSavingNextCoachingMemo, setIsSavingNextCoachingMemo] = useState(false);
  const [adminCoachingStatus, setAdminCoachingStatus] = useState<AdminCoachingStatus>("none");
  const [adminCoachingPriority, setAdminCoachingPriority] = useState<AdminCoachingPriority>("low");
  const [adminCoachingReason, setAdminCoachingReason] = useState("");
  const [adminNextActionTitle, setAdminNextActionTitle] = useState("");
  const [adminNextActionNote, setAdminNextActionNote] = useState("");
  const [adminNextActionDueDate, setAdminNextActionDueDate] = useState("");
  const [adminActionMessage, setAdminActionMessage] = useState<string | null>(null);
  const [isSavingAdminAction, setIsSavingAdminAction] = useState(false);
  const [adminReviewMemo, setAdminReviewMemo] = useState("");
  const [adminNextReviewDate, setAdminNextReviewDate] = useState("");
  const [adminReviewMessage, setAdminReviewMessage] = useState<string | null>(null);
  const [isSavingAdminReview, setIsSavingAdminReview] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"tenure" | "company">("tenure");
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInputValue(new Date()));
  const member = memberRows.find((row) => row.id === params.userId);
  const profile = salesUsers.find((user) => user.uid === params.userId);
  const allUserMeetings = meetings.filter((meeting) => meeting.userId === params.userId);
  const userMeetings = filterRecordsByMonth(allUserMeetings, selectedMonth, (meeting) => meeting.recordedAt);
  const userCustomers = customers.filter((customer) => customer.assignedUserId === params.userId);
  const userCustomerLogs = filterRecordsByMonth(customerLogs.filter((log) => log.userId === params.userId), selectedMonth, (log) => log.actionDate ?? log.createdAt);
  const userResults = filterRecordsByMonth(roleplayResults.filter((result) => result.userId === params.userId), selectedMonth, (result) => result.createdAt);
  const userKnowledgeItems = knowledgeItems.filter((item) => item.ownerId === params.userId);
  const searchWordRows = useMemo(
    () => buildSearchWordRows(activityEvents, params.userId),
    [activityEvents, params.userId],
  );
  const lostReason = buildLostReason(userMeetings);
  const latestRoleplayFeedback = userResults[0]?.improvementPhrases?.[0] ?? userResults[0]?.summary ?? "ロープレ結果なし";
  const winRate = calcWinRate(userMeetings);
  const lostCount = userMeetings.filter((meeting) => meeting.status === "lost").length;
  const analyzedCount = userMeetings.filter((meeting) => meeting.aiSummary).length;
  const averageDurationMin = calcAverageDurationMin(userMeetings);
  const manualInsights = useMemo(
    () => buildManualInsightSummary(userMeetings, userResults),
    [userMeetings, userResults],
  );

  useEffect(() => {
    if (!adminProfile?.companyId) {
      setActivityEvents([]);
      setCustomers([]);
      setCustomerLogs([]);
      return;
    }

    const handleOptionalCustomerError = () => {
      setCustomers([]);
      setCustomerLogs([]);
    };
    const unsubscribers = [
      subscribeToSalesActivityEvents(
        adminProfile.companyId,
        setActivityEvents,
        () => setActivityEvents([]),
      ),
      subscribeToCustomers(
        { companyId: adminProfile.companyId, isAdmin: true },
        setCustomers,
        handleOptionalCustomerError,
      ),
      subscribeToCustomerLogs(
        { companyId: adminProfile.companyId, isAdmin: true },
        setCustomerLogs,
        handleOptionalCustomerError,
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [adminProfile?.companyId]);

  useEffect(() => {
    setNextCoachingMemo(profile?.nextCoachingMemo ?? "");
    setNextCoachingMemoMessage(null);
  }, [profile?.nextCoachingMemo, profile?.uid]);

  useEffect(() => {
    setAdminCoachingStatus(profile?.adminCoachingStatus ?? "none");
    setAdminCoachingPriority(profile?.adminCoachingPriority ?? "low");
    setAdminCoachingReason(profile?.adminCoachingReason ?? "");
    setAdminNextActionTitle(profile?.adminNextActionTitle ?? "");
    setAdminNextActionNote(profile?.adminNextActionNote ?? "");
    setAdminNextActionDueDate(formatDateInputValue(profile?.adminNextActionDueDate ?? null));
    setAdminActionMessage(null);
  }, [
    profile?.adminCoachingPriority,
    profile?.adminCoachingReason,
    profile?.adminCoachingStatus,
    profile?.adminNextActionDueDate,
    profile?.adminNextActionNote,
    profile?.adminNextActionTitle,
    profile?.uid,
  ]);

  useEffect(() => {
    setAdminReviewMemo(profile?.adminReviewMemo ?? "");
    setAdminNextReviewDate(formatDateInputValue(profile?.adminNextReviewDate ?? null));
    setAdminReviewMessage(null);
  }, [profile?.adminNextReviewDate, profile?.adminReviewMemo, profile?.uid]);

  async function handleSendGuidanceComment() {
    if (!adminProfile?.uid || !adminProfile.companyId || !member) {
      setGuidanceMessage("送信先の営業マン情報を取得できませんでした。");
      return;
    }

    const comment = guidanceComment.trim();
    if (!comment) {
      setGuidanceMessage("指導コメントを入力してください。");
      return;
    }

    setIsSendingGuidance(true);
    setGuidanceMessage(null);
    try {
      await createAppNotification({
        companyId: adminProfile.companyId,
        userId: member.id,
        title: "上司から指導コメントが届きました",
        body: comment,
        href: "/sales/dashboard",
        type: "admin_guidance",
        createdBy: adminProfile.uid,
        metadata: {
          targetUserId: member.id,
          targetUserName: member.name,
        },
      });
      setGuidanceComment("");
      setGuidanceMessage("営業マンへ通知しました。");
    } catch (nextError) {
      setGuidanceMessage(nextError instanceof Error ? nextError.message : "通知の送信に失敗しました。");
    } finally {
      setIsSendingGuidance(false);
    }
  }

  async function handleSaveNextCoachingMemo() {
    if (!adminProfile?.uid || !profile?.uid) {
      setNextCoachingMemoMessage("保存先の営業マン情報を取得できませんでした。");
      return;
    }

    const memo = nextCoachingMemo.trim();
    if (!memo) {
      setNextCoachingMemoMessage("次回指導メモを入力してください。");
      return;
    }

    setIsSavingNextCoachingMemo(true);
    setNextCoachingMemoMessage(null);
    try {
      await saveNextCoachingMemo({
        userId: profile.uid,
        memo,
        updatedBy: adminProfile.uid,
      });
      setNextCoachingMemoMessage("次回指導メモを保存しました。");
    } catch (nextError) {
      setNextCoachingMemoMessage(nextError instanceof Error ? nextError.message : "次回指導メモの保存に失敗しました。");
    } finally {
      setIsSavingNextCoachingMemo(false);
    }
  }

  async function handleSaveAdminAction() {
    if (!adminProfile?.uid || !profile?.uid) {
      setAdminActionMessage("保存先の営業マン情報を取得できませんでした。");
      return;
    }

    setIsSavingAdminAction(true);
    setAdminActionMessage(null);
    try {
      await saveAdminCoachingPlan({
        userId: profile.uid,
        status: adminCoachingStatus,
        priority: adminCoachingStatus === "none" ? "low" : adminCoachingPriority,
        reason: adminCoachingReason,
        nextActionTitle: adminNextActionTitle,
        nextActionNote: adminNextActionNote,
        nextActionDueDate: parseDateInputValue(adminNextActionDueDate),
        updatedBy: adminProfile.uid,
      });
      setAdminActionMessage("管理者アクションを保存しました。");
    } catch (nextError) {
      setAdminActionMessage(nextError instanceof Error ? nextError.message : "管理者アクションの保存に失敗しました。");
    } finally {
      setIsSavingAdminAction(false);
    }
  }

  async function handleSaveAdminReview(status: AdminReviewStatus, markReviewed = false) {
    if (!adminProfile?.uid || !profile?.uid) {
      setAdminReviewMessage("保存先の営業マン情報を取得できませんでした。");
      return;
    }

    setIsSavingAdminReview(true);
    setAdminReviewMessage(null);
    try {
      await saveAdminReviewProgress({
        userId: profile.uid,
        status,
        nextReviewDate: parseDateInputValue(adminNextReviewDate),
        memo: adminReviewMemo,
        updatedBy: adminProfile.uid,
        markReviewed,
      });
      setAdminReviewMessage("確認状況を保存しました。");
    } catch (nextError) {
      setAdminReviewMessage(nextError instanceof Error ? nextError.message : "確認状況の保存に失敗しました。");
    } finally {
      setIsSavingAdminReview(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEMBER DETAIL"
          title={member?.name ?? profile?.name ?? "営業マン詳細"}
          description="この営業マンに何を指導すべきか、商談・ロープレ・ナレッジ状況から確認します。"
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
              <Link href="/admin/members" className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">一覧へ戻る</Link>
            </div>
          )}
        />

        {error ? <ErrorBox message={error} /> : null}

        {member ? (
          <section className="mt-8 rounded-[24px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
            <div>
              <div className="flex flex-wrap items-center gap-4">
                <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[24px] font-black tracking-[-0.04em] text-[#171717]">{member.name}</div>
                    <StatusBadge tone={member.tone} label={member.guidance} />
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-[#596273]">{member.email || "メール未登録"} ・ 営業経験 {member.workExperienceLabel}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <MemberPill label={`最終活動 ${member.lastActivity}`} />
                    {profile?.adminNextActionTitle ? (
                      <MemberPill label={`次アクション ${profile.adminNextActionTitle}`} tone={member.needsCoaching ? "risk" : "normal"} />
                    ) : null}
                    <MemberPill label={`分析済み ${analyzedCount}/${userMeetings.length}件`} />
                  </div>
                </div>
              </div>
            </div>
            <AdminReviewQuickActions
              status={profile?.adminReviewStatus ?? "unchecked"}
              lastReviewedAt={profile?.adminLastReviewedAt ?? null}
              nextReviewDate={adminNextReviewDate}
              memo={adminReviewMemo}
              message={adminReviewMessage}
              isSaving={isSavingAdminReview}
              onNextReviewDateChange={setAdminNextReviewDate}
              onMemoChange={setAdminReviewMemo}
              onSave={handleSaveAdminReview}
            />
          </section>
        ) : null}

        <section className="mt-8 grid gap-5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="商談件数" value={`${userMeetings.length}件`} note="このメンバーの商談" />
          <KpiCard label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "商談なし" : "商談結果より算出"} />
          <KpiCard label="失注数" value={`${lostCount}件`} note="優先レビュー対象" />
          <KpiCard label="平均商談時間" value={averageDurationMin === null ? "-" : `${averageDurationMin}分`} note="録音時間より算出" />
          <KpiCard label="ロープレ実施" value={`${userResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={member?.averageScore === null || !member ? "-" : `${member.averageScore}点`} note={member?.averageScore === null ? "結果なし" : "ロープレ結果より算出"} />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="flex h-full min-h-0 flex-col gap-5">
            <Panel title="優先して見ること">
              <MemberPriorityList member={member} meetings={userMeetings} results={userResults} />
            </Panel>

            <Panel title="管理者アクション">
              <AdminActionEditor
                status={adminCoachingStatus}
                priority={adminCoachingPriority}
                reason={adminCoachingReason}
                nextActionTitle={adminNextActionTitle}
                nextActionNote={adminNextActionNote}
                nextActionDueDate={adminNextActionDueDate}
                updatedAt={profile?.adminNextActionUpdatedAt ?? null}
                message={adminActionMessage}
                isSaving={isSavingAdminAction}
                onStatusChange={setAdminCoachingStatus}
                onPriorityChange={setAdminCoachingPriority}
                onReasonChange={setAdminCoachingReason}
                onNextActionTitleChange={setAdminNextActionTitle}
                onNextActionNoteChange={setAdminNextActionNote}
                onNextActionDueDateChange={setAdminNextActionDueDate}
                onSave={() => void handleSaveAdminAction()}
              />
            </Panel>

            <Panel title="成約率の推移">
              <MemberWinRateTrend meetings={allUserMeetings} />
            </Panel>

            <Panel title="指導コメントを送信">
              <div className="space-y-3">
                <textarea
                  value={guidanceComment}
                  onChange={(event) => setGuidanceComment(event.target.value)}
                  className="min-h-[120px] w-full resize-y rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none transition focus:border-[#e0bd4b]"
                  placeholder="例：価格説明の前に、相手の現状課題をもう一段深掘りしましょう。次回は導入後の効果から話す練習をしてください。"
                />
                <button
                  type="button"
                  onClick={() => void handleSendGuidanceComment()}
                  disabled={isSendingGuidance}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60"
                >
                  {isSendingGuidance ? "送信中" : "営業マンへ通知する"}
                </button>
                {guidanceMessage ? (
                  <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[12px] font-bold leading-5 text-[#596273]">
                    {guidanceMessage}
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel title="次回指導メモ" className="flex flex-1 flex-col" bodyClassName="flex-1">
              <NextCoachingMemoEditor
                memo={nextCoachingMemo}
                updatedAt={profile?.nextCoachingMemoUpdatedAt ?? null}
                message={nextCoachingMemoMessage}
                isSaving={isSavingNextCoachingMemo}
                onChange={setNextCoachingMemo}
                onSave={() => void handleSaveNextCoachingMemo()}
              />
            </Panel>
          </div>

          <div className="flex h-full min-h-0 flex-col gap-5">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <Panel title="商談スコア">
                <MemberMeetingScoreCard meetings={userMeetings} />
              </Panel>
              <Panel title="ロープレスコア">
                <MemberRoleplayScoreCard results={userResults} />
              </Panel>
            </div>

            <Panel title="よく出るワード TOP5">
              <MemberKeywordList meetings={userMeetings} />
            </Panel>

            <Panel title="顧客側の頻出ワード">
              <MemberCustomerWordList meetings={userMeetings} />
            </Panel>

            <Panel title="商材 × マニュアル達成度">
              <MemberProductManualAchievement rows={manualInsights.productRows} />
            </Panel>

            <Panel title="よく抜ける基準 TOP5">
              <MemberMissingManualList rows={manualInsights.missingRows} />
            </Panel>

            <Panel title="商材別 成約率" className="flex flex-1 flex-col" bodyClassName="flex-1">
              <MemberProductWinList products={products} meetings={userMeetings} knowledgeItems={userKnowledgeItems} />
            </Panel>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="space-y-5">
            <Panel title="商談/テレアポ履歴">
              {userMeetings.length > 0 ? (
                <div className="max-h-[344px] overflow-auto rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd]">
                  <div className="grid min-w-[760px] grid-cols-[92px_minmax(180px,1fr)_160px_96px_72px] gap-3 border-b border-[#eef1f5] px-4 py-2.5 text-[11px] font-black text-[#8a909b]">
                    <div>種別</div>
                    <div>顧客</div>
                    <div>商材</div>
                    <div>結果</div>
                    <div className="text-right">詳細</div>
                  </div>
                  {userMeetings.slice(0, 8).map((meeting) => (
                    <Link
                      key={meeting.id}
                      href={`/admin/meetings/${meeting.id}`}
                      className="grid min-w-[760px] grid-cols-[92px_minmax(180px,1fr)_160px_96px_72px] items-center gap-3 border-b border-[#f0f2f6] bg-white px-4 py-3 transition last:border-b-0 hover:bg-[#fffdf7]"
                    >
                      <div className="min-w-0">
                        <span className="rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                          {meeting.salesDomain === "teleapo" ? "テレアポ" : "商談"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-black text-[#171717]">{meeting.customerName || "顧客名未設定"}</div>
                        <div className="mt-1 truncate text-[11px] font-bold text-[#8a909b]">{formatDate(meeting.recordedAt)}</div>
                      </div>
                      <div className="truncate text-[12px] font-bold text-[#596273]">{meeting.productType || "商材未設定"}</div>
                      <div><StatusBadge tone={getOutcomeTone(meeting.status)} label={getMeetingOutcomeLabel(meeting.status)} /></div>
                      <span className="text-right text-[12px] font-black text-[#2672d9]">レビュー</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="商談/テレアポ履歴はまだありません" body="音声アップロードやログ登録後、履歴が表示されます。" />
              )}
            </Panel>

            <Panel title="分析結果">
              {userMeetings.some((meeting) => meeting.aiSummary) ? (
                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {userMeetings.filter((meeting) => meeting.aiSummary).map((meeting) => (
                    <div key={meeting.id} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                      <div className="text-[14px] font-black text-[#171717]">{meeting.customerName}</div>
                      <p className="mt-2 text-[13px] leading-6 text-[#596273]">{meeting.aiSummary?.overview}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="salesの分析結果はまだありません" body="商談分析が完了すると、指導用レビューとしてここに表示されます。" />
              )}
            </Panel>

            <Panel title="ロープレ結果">
              {userResults.length > 0 ? (
                <div className="space-y-3">
                  {userResults.slice(0, 6).map((result) => (
                    <div key={result.id} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[14px] font-black text-[#171717]">{result.scenarioTitle}</h3>
                        <span className="rounded-full bg-[#171717] px-3 py-1 text-[12px] font-black text-white">{result.score}点</span>
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#596273]">{result.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="ロープレ結果はまだありません" body="シナリオを実施すると、スコアと改善ポイントが表示されます。" />
              )}
            </Panel>

            <Panel title="比較サマリー">
              {member ? (
                <MemberComparisonCard
                  member={member}
                  members={memberRows}
                  mode={comparisonMode}
                  onModeChange={setComparisonMode}
                />
              ) : (
                <EmptyState title="比較データはまだありません" body="営業メンバー情報を取得すると、同じ勤務年数や社内全体との比較が表示されます。" />
              )}
            </Panel>

            <Panel title="ロープレと実商談の差分">
              <MemberRoleplayMeetingGapList rows={manualInsights.gapRows} />
            </Panel>
          </div>

          <div className="flex h-full min-h-0 flex-col gap-5">
            <Panel title="顧客管理ログ">
              <AdminCustomerManagementLog customers={userCustomers} logs={userCustomerLogs} />
            </Panel>

            <Panel title="指導判断">
              <div className="space-y-3">
                <InsightRow label="よくある失注理由" value={lostReason} />
                <InsightRow label="改善ポイント" value={latestRoleplayFeedback} />
                <InsightRow label="ナレッジ作成状況" value={`${userKnowledgeItems.length}件`} />
                <InsightRow label="作成済みナレッジ" value={`${userKnowledgeItems.length}件`} />
              </div>
            </Panel>

            <Panel title="よく検索するワード TOP10" className="flex flex-1 flex-col" bodyClassName="min-h-0 flex-1 overflow-y-auto">
              {searchWordRows.length > 0 ? (
                <div className="overflow-hidden rounded-[14px] border border-[#eef1f5]">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_56px_92px] gap-3 border-b border-[#eef1f5] bg-[#fcfcfd] px-3 py-2 text-[11px] font-black text-[#8a909b]">
                    <div>#</div>
                    <div>ワード</div>
                    <div className="text-right">回数</div>
                    <div className="text-right">最終検索</div>
                  </div>
                  {searchWordRows.map((row, index) => (
                    <div key={row.word} className="grid grid-cols-[40px_minmax(0,1fr)_56px_92px] items-center gap-3 border-b border-[#f0f2f6] bg-white px-3 py-2.5 last:border-b-0">
                      <div className="text-[12px] font-black text-[#8a909b]">{index + 1}</div>
                      <div className="min-w-0 truncate text-[13px] font-black text-[#343b48]">{row.word}</div>
                      <div className="text-right text-[12px] font-black text-[#8a6500]">{row.count}回</div>
                      <div className="text-right text-[11px] font-bold text-[#8a909b]">{formatDate(row.lastSearchedAt)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="検索ワードはまだありません" body="この営業マンがナレッジ検索を行うと、よく検索するワードが表示されます。" />
              )}
            </Panel>

          </div>
        </section>
      </div>
    </PageShell>
  );
}

function buildSearchWordRows(events: SalesActivityEvent[], userId: string) {
  const rows = new Map<string, { count: number; noResultCount: number; lastSearchedAt: Date | null }>();

  events
    .filter((event) => event.userId === userId && event.type === "knowledge_searched")
    .forEach((event) => {
      const word = readString(event.metadata.query);
      if (!word) return;
      const current = rows.get(word) ?? { count: 0, noResultCount: 0, lastSearchedAt: null };
      current.count += 1;
      if (readNumber(event.metadata.resultCount) === 0) {
        current.noResultCount += 1;
      }
      if (!current.lastSearchedAt || (event.createdAt && event.createdAt > current.lastSearchedAt)) {
        current.lastSearchedAt = event.createdAt;
      }
      rows.set(word, current);
    });

  return Array.from(rows.entries())
    .map(([word, row]) => ({ word, ...row }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function MonthSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = parseMonthValue(value) ?? new Date();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#e0e4eb] bg-white px-3 py-2">
      <span className="text-[12px] font-black text-[#596273]">{formatMonthRange(selectedDate)}</span>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-[9px] border border-[#e4e8ef] bg-[#fcfcfd] px-2 text-[12px] font-black text-[#343b48] outline-none focus:border-[#e0bd4b]"
      />
    </div>
  );
}

function formatMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const formatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${formatter.format(start)} 〜 ${formatter.format(end)}`;
}

function formatMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function filterRecordsByMonth<T>(records: T[], monthValue: string, getDate: (record: T) => Date | null) {
  const monthDate = parseMonthValue(monthValue);
  if (!monthDate) return records;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return records.filter((record) => {
    const date = getDate(record);
    return date ? date.getFullYear() === year && date.getMonth() === month : false;
  });
}

function formatDateInputValue(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcAverageDurationMin(meetings: MeetingRecord[]) {
  const durations = meetings
    .map((meeting) => meeting.audioDurationSec)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration) && duration > 0);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 60);
}

function buildMonthlyWinRows(meetings: MeetingRecord[]) {
  const rows = new Map<string, { label: string; totalCount: number; wonCount: number; sortKey: string }>();

  meetings.forEach((meeting) => {
    if (!meeting.recordedAt) return;
    const year = meeting.recordedAt.getFullYear();
    const month = meeting.recordedAt.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const current = rows.get(key) ?? { label: `${month}月`, totalCount: 0, wonCount: 0, sortKey: key };
    current.totalCount += 1;
    if (meeting.status === "won") current.wonCount += 1;
    rows.set(key, current);
  });

  return Array.from(rows.values())
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .slice(-6)
    .map((row) => ({
      ...row,
      winRate: row.totalCount > 0 ? Math.round((row.wonCount / row.totalCount) * 100) : 0,
    }));
}

function buildProductWinRows(products: KnowledgeProduct[], meetings: MeetingRecord[], knowledgeItems: KnowledgeItem[]) {
  const knowledgeCountByProduct = new Map<string, number>();
  knowledgeItems.forEach((item) => {
    if (!item.productId) return;
    knowledgeCountByProduct.set(item.productId, (knowledgeCountByProduct.get(item.productId) ?? 0) + 1);
  });

  return products.slice(0, 5).map((product) => {
    const productMeetings = meetings.filter((meeting) => meeting.productType === product.name);
    const wonCount = productMeetings.filter((meeting) => meeting.status === "won").length;
    return {
      id: product.id,
      name: product.name,
      totalCount: productMeetings.length,
      knowledgeCount: knowledgeCountByProduct.get(product.id) ?? 0,
      winRate: productMeetings.length > 0 ? Math.round((wonCount / productMeetings.length) * 1000) / 10 : null,
    };
  });
}

function buildMeetingScoreRows(meetings: MeetingRecord[]) {
  return meetings
    .map((meeting) => ({
      id: meeting.id,
      title: meeting.customerName || meeting.productType || "商談名未設定",
      date: formatDate(meeting.recordedAt),
      score: calcMeetingScore(meeting),
      recordedAt: meeting.recordedAt,
    }))
    .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0));
}

function calcMeetingScore(meeting: MeetingRecord) {
  const manualScore = meeting.aiSummary?.manualCompliance?.score;
  if (typeof manualScore === "number" && Number.isFinite(manualScore)) {
    return Math.max(0, Math.min(100, Math.round(manualScore)));
  }

  return null;
}

function buildMeetingKeywords(meetings: MeetingRecord[]) {
  const ignoredWords = new Set([
    "こと",
    "ため",
    "よう",
    "これ",
    "それ",
    "こちら",
    "について",
    "あります",
    "します",
    "です",
    "ます",
    "商談",
    "顧客",
    "ですか",
    "ですね",
    "ました",
    "ください",
    "お願い",
    "ありがとう",
    "ありがとうございます",
  ]);
  const counts = new Map<string, number>();

  meetings.forEach((meeting) => {
    const text = buildMeetingConversationText(meeting);
    if (!text.trim()) return;

    tokenizeMeetingWords(text)
      .filter((word) => !ignoredWords.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  });

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildCustomerWords(meetings: MeetingRecord[]) {
  const counts = new Map<string, number>();
  const words = ["価格", "料金", "予算", "高い", "検討", "比較", "不安", "難しい", "社内", "決裁", "来月", "興味", "採用", "集客", "効果"];

  meetings.forEach((meeting) => {
    const customerText = (meeting.conversationLogs ?? [])
      .filter((log) => log.speaker === "customer" || log.speaker === "speaker_2")
      .map((log) => log.text)
      .join(" ");

    words.forEach((word) => {
      const count = customerText.split(word).length - 1;
      if (count > 0) counts.set(word, (counts.get(word) ?? 0) + count);
    });
  });

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count);
}

type ManualChecklistItem = {
  category: string;
  label: string;
  status: "done" | "missing";
  scoreImpact?: number | null;
};

function buildManualInsightSummary(meetings: MeetingRecord[], results: RoleplayResult[]) {
  const productMap = new Map<string, {
    productName: string;
    meetingDone: number;
    meetingTotal: number;
    roleplayDone: number;
    roleplayTotal: number;
  }>();
  const missingMap = new Map<string, {
    category: string;
    label: string;
    count: number;
    meetingCount: number;
    roleplayCount: number;
  }>();
  const gapMap = new Map<string, {
    productName: string;
    category: string;
    label: string;
    meetingDone: number;
    meetingTotal: number;
    roleplayDone: number;
    roleplayTotal: number;
  }>();

  meetings.forEach((meeting) => {
    const productName = meeting.productType || "商材未設定";
    const items = meeting.aiSummary?.manualCompliance?.checklistItems ?? [];
    addProductChecklist(productMap, productName, items, "meeting");
    addMissingChecklist(missingMap, items, "meeting");
    addGapChecklist(gapMap, productName, items, "meeting");
  });

  results.forEach((result) => {
    const productName = result.productName || "商材未設定";
    const items = result.manualChecklistItems ?? [];
    addProductChecklist(productMap, productName, items, "roleplay");
    addMissingChecklist(missingMap, items, "roleplay");
    addGapChecklist(gapMap, productName, items, "roleplay");
  });

  const productRows = Array.from(productMap.values())
    .map((row) => {
      const done = row.meetingDone + row.roleplayDone;
      const total = row.meetingTotal + row.roleplayTotal;
      return {
        ...row,
        rate: total > 0 ? Math.round((done / total) * 100) : null,
      };
    })
    .filter((row) => row.meetingTotal + row.roleplayTotal > 0)
    .sort((left, right) => (right.meetingTotal + right.roleplayTotal) - (left.meetingTotal + left.roleplayTotal));

  const missingRows = Array.from(missingMap.values())
    .sort((left, right) => right.count - left.count);

  const gapRows = Array.from(gapMap.values())
    .filter((row) => row.meetingTotal > 0 && row.roleplayTotal > 0)
    .map((row) => {
      const meetingRate = Math.round((row.meetingDone / row.meetingTotal) * 100);
      const roleplayRate = Math.round((row.roleplayDone / row.roleplayTotal) * 100);
      return {
        productName: row.productName,
        category: row.category,
        label: row.label,
        meetingRate,
        roleplayRate,
        gap: Math.abs(roleplayRate - meetingRate),
      };
    })
    .filter((row) => row.gap >= 15)
    .sort((left, right) => right.gap - left.gap);

  return { productRows, missingRows, gapRows };
}

function addProductChecklist(
  map: Map<string, { productName: string; meetingDone: number; meetingTotal: number; roleplayDone: number; roleplayTotal: number }>,
  productName: string,
  items: ManualChecklistItem[],
  source: "meeting" | "roleplay",
) {
  if (items.length === 0) return;
  const row = map.get(productName) ?? { productName, meetingDone: 0, meetingTotal: 0, roleplayDone: 0, roleplayTotal: 0 };
  const done = items.filter((item) => item.status === "done").length;
  if (source === "meeting") {
    row.meetingDone += done;
    row.meetingTotal += items.length;
  } else {
    row.roleplayDone += done;
    row.roleplayTotal += items.length;
  }
  map.set(productName, row);
}

function addMissingChecklist(
  map: Map<string, { category: string; label: string; count: number; meetingCount: number; roleplayCount: number }>,
  items: ManualChecklistItem[],
  source: "meeting" | "roleplay",
) {
  items.filter((item) => item.status === "missing").forEach((item) => {
    const key = `${item.category}:${item.label}`;
    const row = map.get(key) ?? { category: item.category, label: item.label, count: 0, meetingCount: 0, roleplayCount: 0 };
    row.count += 1;
    if (source === "meeting") row.meetingCount += 1;
    if (source === "roleplay") row.roleplayCount += 1;
    map.set(key, row);
  });
}

function addGapChecklist(
  map: Map<string, { productName: string; category: string; label: string; meetingDone: number; meetingTotal: number; roleplayDone: number; roleplayTotal: number }>,
  productName: string,
  items: ManualChecklistItem[],
  source: "meeting" | "roleplay",
) {
  items.forEach((item) => {
    const key = `${productName}:${item.category}:${item.label}`;
    const row = map.get(key) ?? { productName, category: item.category, label: item.label, meetingDone: 0, meetingTotal: 0, roleplayDone: 0, roleplayTotal: 0 };
    if (source === "meeting") {
      row.meetingTotal += 1;
      if (item.status === "done") row.meetingDone += 1;
    } else {
      row.roleplayTotal += 1;
      if (item.status === "done") row.roleplayDone += 1;
    }
    map.set(key, row);
  });
}

function buildMeetingConversationText(meeting: MeetingRecord) {
  const conversationText = meeting.conversationLogs?.map((log) => log.text).join(" ") ?? "";
  const transcriptText = meeting.transcriptBlocks?.map((block) => block.text).join(" ") ?? "";
  return [conversationText, transcriptText, meeting.transcriptionProbeText ?? ""].join(" ");
}

function tokenizeMeetingWords(text: string) {
  return text
    .split(/[\s、。,.!?！？:：/（）()[\]「」『』・\n\r]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && word.length <= 24 && !/^\d+$/.test(word));
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-[#343b48]">{value === "データなし" ? <Placeholder /> : value}</div>
    </div>
  );
}

function MemberPill({ label, tone = "normal" }: { label: string; tone?: "normal" | "risk" }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-black ${tone === "risk" ? "bg-[#fff0ed] text-[#d63c2f]" : "bg-[#f6f7fb] text-[#596273]"}`}>
      {label}
    </span>
  );
}

function MemberPriorityList({
  member,
  meetings,
  results,
}: {
  member: { coachingReasons: string[]; nextAction: string; lostCount: number; lowRoleplayCount: number; unanalyzedCount: number } | undefined;
  meetings: MeetingRecord[];
  results: RoleplayResult[];
}) {
  const lostMeeting = meetings.find((meeting) => meeting.status === "lost");
  const lowRoleplay = results.find((result) => result.score < 70);
  const rows = [
    {
      title: member?.nextAction ?? "管理者アクション未設定",
      body: member?.coachingReasons[0] ?? "-",
      tone: member?.coachingReasons.length ? "risk" : "normal",
    },
    {
      title: "失注レビュー",
      body: lostMeeting ? `${lostMeeting.customerName || "顧客名未設定"} / ${formatDate(lostMeeting.recordedAt)}` : "失注商談はありません。",
      tone: member?.lostCount ? "risk" : "normal",
    },
    {
      title: "低スコアロープレ",
      body: lowRoleplay ? `${lowRoleplay.scenarioTitle} / ${lowRoleplay.score}点` : "70点未満のロープレはありません。",
      tone: member?.lowRoleplayCount ? "risk" : "normal",
    },
    {
      title: "未分析の商談",
      body: member?.unanalyzedCount ? `${member.unanalyzedCount}件の商談が未分析です。` : "未分析の商談はありません。",
      tone: member?.unanalyzedCount ? "risk" : "normal",
    },
  ] as const;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.title} className={`rounded-[16px] border px-4 py-4 ${row.tone === "risk" ? "border-[#f4d4d4] bg-[#fff8f8]" : "border-[#eef1f5] bg-[#fcfcfd]"}`}>
          <div className={`text-[12px] font-black ${row.tone === "risk" ? "text-[#d63c2f]" : "text-[#8a6500]"}`}>{row.title}</div>
          <div className="mt-2 text-[13px] font-bold leading-6 text-[#343b48]">{row.body}</div>
        </div>
      ))}
    </div>
  );
}

function MemberWinRateTrend({ meetings }: { meetings: MeetingRecord[] }) {
  const rows = buildMonthlyWinRows(meetings);

  if (rows.length === 0) {
    return <EmptyState title="成約率の推移はまだありません" body="商談結果が登録されると月別の推移が表示されます。" />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[80px_minmax(0,1fr)_64px] items-center gap-3">
          <div className="text-[12px] font-black text-[#596273]">{row.label}</div>
          <div className="h-3 overflow-hidden rounded-full bg-[#eef1f5]">
            <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${row.winRate}%` }} />
          </div>
          <div className="text-right text-[13px] font-black text-[#171717]">{row.winRate}%</div>
          <div className="col-start-2 text-[11px] font-bold text-[#8a909b]">{row.wonCount}/{row.totalCount}件 成約</div>
        </div>
      ))}
    </div>
  );
}

function MemberProductWinList({
  products,
  meetings,
  knowledgeItems,
}: {
  products: KnowledgeProduct[];
  meetings: MeetingRecord[];
  knowledgeItems: KnowledgeItem[];
}) {
  const rows = buildProductWinRows(products, meetings, knowledgeItems);

  if (rows.length === 0) {
    return <EmptyState title="商材別データはまだありません" body="商談か商材ナレッジが登録されると表示されます。" />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
              <div className="mt-1 text-[12px] font-bold text-[#8a909b]">商談 {row.totalCount}件 / ナレッジ {row.knowledgeCount}件</div>
            </div>
            <span className="shrink-0 text-[14px] font-black text-[#8a6500]">{row.winRate === null ? "-" : `${row.winRate}%`}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#edf0f5]">
            <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${Math.min(row.winRate ?? 0, 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberMeetingScoreCard({ meetings }: { meetings: MeetingRecord[] }) {
  const rows = buildMeetingScoreRows(meetings);
  const scoredRows = rows.filter((row): row is typeof row & { score: number } => row.score !== null);
  const averageScore = scoredRows.length > 0 ? Math.round(scoredRows.reduce((sum, row) => sum + row.score, 0) / scoredRows.length) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
        <div className="text-[12px] font-bold text-[#8a909b]">平均商談スコア</div>
        <div className="mt-1 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{averageScore === null ? "-" : `${averageScore}点`}</div>
        <div className="mt-2 text-[12px] font-bold text-[#8a909b]">AI評価サマリーに保存されたスコアのみ表示</div>
      </div>
      <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
        {rows.length > 0 ? rows.slice(0, 8).map((row) => (
          <Link key={row.id} href={`/admin/meetings/${row.id}`} className="block rounded-[14px] border border-[#eef1f5] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[13px] font-black text-[#343b48]">{row.title}</span>
              <span className={`shrink-0 text-[13px] font-black ${row.score === null ? "text-[#8a909b]" : row.score < 70 ? "text-[#d63c2f]" : "text-[#16834f]"}`}>
                {row.score === null ? "未評価" : `${row.score}点`}
              </span>
            </div>
            <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{row.date}</div>
          </Link>
        )) : <EmptyState title="商談スコアはまだありません" body="商談分析が完了すると表示されます。" />}
      </div>
    </div>
  );
}

function MemberRoleplayScoreCard({ results }: { results: RoleplayResult[] }) {
  const averageScore = results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null;
  const lowCount = results.filter((result) => result.score < 70).length;

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
        <div className="text-[12px] font-bold text-[#8a909b]">平均ロープレスコア</div>
        <div className="mt-1 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{averageScore === null ? "-" : `${averageScore}点`}</div>
        <div className={`mt-2 text-[12px] font-bold ${lowCount > 0 ? "text-[#d63c2f]" : "text-[#8a909b]"}`}>70点未満 {lowCount}件</div>
      </div>
      <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
        {results.length > 0 ? results.slice(0, 8).map((result) => (
          <div key={result.id} className="rounded-[14px] border border-[#eef1f5] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[13px] font-black text-[#343b48]">{result.scenarioTitle}</span>
              <span className={`shrink-0 text-[13px] font-black ${result.score < 70 ? "text-[#d63c2f]" : "text-[#16834f]"}`}>{result.score}点</span>
            </div>
            <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{formatDate(result.createdAt)} ・ {result.productName || "商材未設定"}</div>
          </div>
        )) : <EmptyState title="ロープレスコアはまだありません" body="ロープレ実施後、スコア推移が表示されます。" />}
      </div>
    </div>
  );
}

function MemberKeywordList({ meetings }: { meetings: MeetingRecord[] }) {
  const rows = buildMeetingKeywords(meetings);

  if (rows.length === 0) {
    return <EmptyState title="ワードはまだありません" body="文字起こしや会話ログがある商談/テレアポから頻出ワードを表示します。" />;
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#eef1f5]">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_56px] gap-3 border-b border-[#eef1f5] bg-[#fcfcfd] px-3 py-2 text-[11px] font-black text-[#8a909b]">
        <div>#</div>
        <div>ワード</div>
        <div className="text-right">回数</div>
      </div>
      {rows.map((row, index) => (
        <div key={row.word} className="grid grid-cols-[40px_minmax(0,1fr)_56px] items-center gap-3 border-b border-[#f0f2f6] bg-white px-3 py-2.5 last:border-b-0">
          <div className="text-[12px] font-black text-[#8a909b]">{index + 1}</div>
          <div className="min-w-0 truncate text-[13px] font-black text-[#343b48]">{row.word}</div>
          <div className="text-right text-[12px] font-black text-[#8a6500]">{row.count}回</div>
        </div>
      ))}
    </div>
  );
}

function MemberCustomerWordList({ meetings }: { meetings: MeetingRecord[] }) {
  const rows = buildCustomerWords(meetings).slice(0, 8);

  if (rows.length === 0) {
    return <EmptyState title="顧客ワードはまだありません" body="話者分離済みの顧客発話が増えると、顧客側の頻出ワードを表示します。" />;
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#eef1f5]">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_56px] gap-3 border-b border-[#eef1f5] bg-[#fcfcfd] px-3 py-2 text-[11px] font-black text-[#8a909b]">
        <div>#</div>
        <div>ワード</div>
        <div className="text-right">回数</div>
      </div>
      {rows.map((row, index) => (
        <div key={row.word} className="grid grid-cols-[40px_minmax(0,1fr)_56px] items-center gap-3 border-b border-[#f0f2f6] bg-white px-3 py-2.5 last:border-b-0">
          <div className="text-[12px] font-black text-[#8a909b]">{index + 1}</div>
          <div className="min-w-0 truncate text-[13px] font-black text-[#343b48]">{row.word}</div>
          <div className="text-right text-[12px] font-black text-[#8a6500]">{row.count}回</div>
        </div>
      ))}
    </div>
  );
}

function MemberProductManualAchievement({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["productRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="基準達成データはまだありません" body="マニュアルチェック済みの商談やロープレが増えると、商材別の達成度を表示します。" />;
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row) => (
        <div key={row.productName} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-black text-[#171717]">{row.productName}</div>
              <div className="mt-1 text-[11px] font-bold text-[#8a909b]">実商談 {row.meetingDone}/{row.meetingTotal} ・ ロープレ {row.roleplayDone}/{row.roleplayTotal}</div>
            </div>
            <div className="text-[16px] font-black text-[#8a6500]">{row.rate === null ? "-" : `${row.rate}%`}</div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#edf0f5]">
            <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${row.rate ?? 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberMissingManualList({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["missingRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="未達項目はまだありません" body="マニュアルチェックが保存されると、よく抜ける基準を表示します。" />;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => (
        <div key={`${row.category}-${row.label}`} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-black text-[#171717]">{row.label}</div>
              <div className="mt-1 text-[11px] font-bold text-[#8a909b]">{row.category} ・ 実商談 {row.meetingCount} / ロープレ {row.roleplayCount}</div>
            </div>
            <span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-[11px] font-black text-[#d63c2f]">{row.count}件</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberRoleplayMeetingGapList({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["gapRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="差分はまだありません" body="同じ基準の商談・ロープレ結果が揃うと、ロープレとのギャップを表示します。" />;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => (
        <div key={`${row.productName}-${row.label}`} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-black text-[#171717]">{row.label}</div>
              <div className="mt-1 text-[11px] font-bold text-[#8a909b]">{row.productName} ・ 実商談 {row.meetingRate}% / ロープレ {row.roleplayRate}%</div>
            </div>
            <span className="rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">{row.gap}pt差</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NextCoachingMemoEditor({
  memo,
  updatedAt,
  message,
  isSaving,
  onChange,
  onSave,
}: {
  memo: string;
  updatedAt: Date | null;
  message: string | null;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
        <div>
          <div className="text-[12px] font-black text-[#343b48]">次回に確認すること</div>
          <div className="mt-0.5 text-[11px] font-bold text-[#8a909b]">
            {updatedAt ? `更新日 ${formatDate(updatedAt)}` : "未保存"}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-black ${memo.trim() ? "bg-[#fff3cf] text-[#8a6500]" : "bg-[#f1f2f5] text-[#8a909b]"}`}>
          {memo.trim() ? "メモあり" : "未入力"}
        </span>
      </div>
      <textarea
        value={memo}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[160px] flex-1 resize-none rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none transition placeholder:text-[#a1a8b3] focus:border-[#e0bd4b] focus:shadow-[0_0_0_3px_rgba(255,216,77,0.16)]"
        placeholder="次回の指導で確認する内容を入力"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] font-bold text-[#8a909b]">
          {memo.trim().length > 0 ? `${memo.trim().length}文字` : "保存すると次回もここに残ります"}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex h-10 min-w-[140px] items-center justify-center rounded-[13px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717] disabled:opacity-60"
        >
          {isSaving ? "保存中" : "保存"}
        </button>
      </div>
      {message ? (
        <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[12px] font-bold leading-5 text-[#596273]">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function AdminReviewQuickActions({
  status,
  lastReviewedAt,
  nextReviewDate,
  memo,
  message,
  isSaving,
  onNextReviewDateChange,
  onMemoChange,
  onSave,
}: {
  status: AdminReviewStatus;
  lastReviewedAt: Date | null;
  nextReviewDate: string;
  memo: string;
  message: string | null;
  isSaving: boolean;
  onNextReviewDateChange: (value: string) => void;
  onMemoChange: (value: string) => void;
  onSave: (status: AdminReviewStatus, markReviewed?: boolean) => void;
}) {
  return (
    <div className="mt-5 rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-black text-[#8a909b]">管理者の確認状況</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={status} />
            <span className="text-[12px] font-bold text-[#8a909b]">最終確認 {formatDate(lastReviewedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onSave("checked", true)} disabled={isSaving} className="h-10 rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[12px] font-black text-[#171717] disabled:opacity-60">
            確認済みにする
          </button>
          <button type="button" onClick={() => onSave("in_progress")} disabled={isSaving} className="h-10 rounded-[12px] border border-[#f0c655] bg-[#fff3cf] px-4 text-[12px] font-black text-[#8a6500] disabled:opacity-60">
            対応中にする
          </button>
          <button type="button" onClick={() => onSave("follow_up")} disabled={isSaving} className="h-10 rounded-[12px] border border-[#d9e8ff] bg-[#eef6ff] px-4 text-[12px] font-black text-[#2672d9] disabled:opacity-60">
            次回確認にする
          </button>
          <button type="button" onClick={() => onSave("done", true)} disabled={isSaving} className="h-10 rounded-[12px] border border-[#d7eadf] bg-[#edf7f0] px-4 text-[12px] font-black text-[#16834f] disabled:opacity-60">
            完了にする
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
        <label className="space-y-1.5">
          <span className="text-[11px] font-black text-[#8a909b]">次回確認日</span>
          <input
            type="date"
            value={nextReviewDate}
            onChange={(event) => onNextReviewDateChange(event.target.value)}
            className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[11px] font-black text-[#8a909b]">管理者メモ</span>
          <input
            value={memo}
            onChange={(event) => onMemoChange(event.target.value)}
            className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
            placeholder="確認した内容や次に見るポイント"
          />
        </label>
      </div>
      {message ? (
        <div className="mt-3 rounded-[14px] border border-[#eef1f5] bg-white px-4 py-3 text-[12px] font-bold text-[#596273]">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: AdminReviewStatus }) {
  const label = status === "checked" ? "確認済み" : status === "in_progress" ? "対応中" : status === "follow_up" ? "次回確認" : status === "done" ? "完了" : "未確認";
  const className =
    status === "checked" || status === "done"
      ? "bg-[#edf7f0] text-[#16834f]"
      : status === "in_progress"
        ? "bg-[#fff3cf] text-[#8a6500]"
        : status === "follow_up"
          ? "bg-[#eef6ff] text-[#2672d9]"
          : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function AdminActionEditor({
  status,
  priority,
  reason,
  nextActionTitle,
  nextActionNote,
  nextActionDueDate,
  updatedAt,
  message,
  isSaving,
  onStatusChange,
  onPriorityChange,
  onReasonChange,
  onNextActionTitleChange,
  onNextActionNoteChange,
  onNextActionDueDateChange,
  onSave,
}: {
  status: AdminCoachingStatus;
  priority: AdminCoachingPriority;
  reason: string;
  nextActionTitle: string;
  nextActionNote: string;
  nextActionDueDate: string;
  updatedAt: Date | null;
  message: string | null;
  isSaving: boolean;
  onStatusChange: (value: AdminCoachingStatus) => void;
  onPriorityChange: (value: AdminCoachingPriority) => void;
  onReasonChange: (value: string) => void;
  onNextActionTitleChange: (value: string) => void;
  onNextActionNoteChange: (value: string) => void;
  onNextActionDueDateChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-[11px] font-black text-[#8a909b]">指導ステータス</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as AdminCoachingStatus)}
            className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
          >
            <option value="none">通常</option>
            <option value="watch">要確認</option>
            <option value="needs_coaching">指導必要</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-[11px] font-black text-[#8a909b]">優先度</span>
          <select
            value={priority}
            onChange={(event) => onPriorityChange(event.target.value as AdminCoachingPriority)}
            disabled={status === "none"}
            className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b] disabled:bg-[#f6f7fb] disabled:text-[#a1a8b3]"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-[11px] font-black text-[#8a909b]">期限</span>
          <input
            type="date"
            value={nextActionDueDate}
            onChange={(event) => onNextActionDueDateChange(event.target.value)}
            className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[11px] font-black text-[#8a909b]">指導が必要な理由</span>
        <input
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
          placeholder="例：ヒアリング項目が浅く、提案前の課題整理が不足"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[11px] font-black text-[#8a909b]">次アクション</span>
        <input
          value={nextActionTitle}
          onChange={(event) => onNextActionTitleChange(event.target.value)}
          className="h-11 w-full rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
          placeholder="例：次回商談前に料金説明のロープレを実施"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[11px] font-black text-[#8a909b]">補足メモ</span>
        <textarea
          value={nextActionNote}
          onChange={(event) => onNextActionNoteChange(event.target.value)}
          className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
          placeholder="管理者だけが把握しておきたい補足を入力"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] font-bold text-[#8a909b]">
          {updatedAt ? `最終更新 ${formatDate(updatedAt)}` : "まだ保存されていません"}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex h-10 min-w-[150px] items-center justify-center rounded-[13px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717] disabled:opacity-60"
        >
          {isSaving ? "保存中" : "保存"}
        </button>
      </div>

      {message ? (
        <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[12px] font-bold leading-5 text-[#596273]">
          {message}
        </div>
      ) : null}
    </div>
  );
}

type ComparisonMember = {
  id: string;
  name: string;
  meetingCount: number;
  winRate: number | null;
  averageScore: number | null;
  roleplayCount: number;
  workExperienceTotalMonths: number | null;
  workExperienceLabel: string;
};

function MemberComparisonCard({
  member,
  members,
  mode,
  onModeChange,
}: {
  member: ComparisonMember;
  members: ComparisonMember[];
  mode: "tenure" | "company";
  onModeChange: (mode: "tenure" | "company") => void;
}) {
  const peerMembers = buildComparisonPeers(member, members, mode);
  const metrics = buildComparisonMetrics(member, peerMembers);
  const rank = buildMemberRank(member, peerMembers);
  const peerLabel = mode === "tenure" ? buildTenureComparisonLabel(member, peerMembers) : `全メンバー ${peerMembers.length}人`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#f6f7fb] p-1">
        <button
          type="button"
          onClick={() => onModeChange("tenure")}
          className={`h-10 rounded-[12px] text-[13px] font-black transition ${mode === "tenure" ? "bg-[#ffd84d] text-[#171717] shadow-sm" : "text-[#596273]"}`}
        >
          経験年数別
        </button>
        <button
          type="button"
          onClick={() => onModeChange("company")}
          className={`h-10 rounded-[12px] text-[13px] font-black transition ${mode === "company" ? "bg-[#ffd84d] text-[#171717] shadow-sm" : "text-[#596273]"}`}
        >
          全体比較
        </button>
      </div>

      <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold text-[#8a909b]">比較対象</div>
            <div className="mt-1 text-[15px] font-black text-[#171717]">{peerLabel}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-bold text-[#8a909b]">立ち位置</div>
            <div className="mt-1 text-[18px] font-black text-[#171717]">
              {rank === null ? "-" : `${rank}位 / ${peerMembers.length}人`}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[13px] font-bold leading-6 text-[#596273]">
          {buildComparisonComment(member, metrics, rank, peerMembers.length, mode)}
        </p>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <ComparisonMetricBar key={metric.label} metric={metric} />
        ))}
      </div>

      <ComparisonPeerList member={member} peers={peerMembers} />
    </div>
  );
}

function ComparisonPeerList({ member, peers }: { member: ComparisonMember; peers: ComparisonMember[] }) {
  const rankedPeers = buildRankedPeers(peers);
  const memberIndex = rankedPeers.findIndex((row) => row.id === member.id);
  const startIndex = Math.max(0, Math.min(memberIndex - 2, rankedPeers.length - 5));
  const visiblePeers = rankedPeers.slice(startIndex, startIndex + 5);

  if (rankedPeers.length <= 1) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-4 py-5 text-center text-[13px] font-bold text-[#8a909b]">
        比較できる同条件のメンバーはまだいません。
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd]">
      <div className="flex items-center justify-between gap-3 border-b border-[#eef1f5] px-4 py-3">
        <div>
          <div className="text-[13px] font-black text-[#171717]">比較対象メンバー</div>
          <div className="mt-0.5 text-[11px] font-bold text-[#8a909b]">本人の周辺順位を表示</div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#8a6500]">{rankedPeers.length}人</span>
      </div>
      <div className="max-h-[230px] overflow-y-auto">
        {visiblePeers.map((peer) => {
          const isCurrent = peer.id === member.id;
          return (
            <div
              key={peer.id}
              className={`grid grid-cols-[42px_minmax(0,1fr)_72px_70px_70px] items-center gap-2 border-b border-[#f0f2f6] px-4 py-2.5 last:border-b-0 ${
                isCurrent ? "bg-[#fff8df]" : "bg-white"
              }`}
            >
              <div className={`text-[12px] font-black ${isCurrent ? "text-[#8a6500]" : "text-[#8a909b]"}`}>{peer.rank}位</div>
              <div className="min-w-0">
                <div className={`truncate text-[13px] font-black ${isCurrent ? "text-[#171717]" : "text-[#343b48]"}`}>
                  {peer.name}{isCurrent ? "（本人）" : ""}
                </div>
              </div>
              <div className="text-right text-[12px] font-bold text-[#596273]">{peer.meetingCount}件</div>
              <div className="text-right text-[12px] font-bold text-[#596273]">{peer.winRate === null ? "-" : `${peer.winRate}%`}</div>
              <div className="text-right text-[12px] font-bold text-[#596273]">{peer.averageScore === null ? "-" : `${peer.averageScore}点`}</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[42px_minmax(0,1fr)_72px_70px_70px] gap-2 border-t border-[#eef1f5] px-4 py-2 text-[10px] font-black text-[#8a909b]">
        <div>順位</div>
        <div>名前</div>
        <div className="text-right">商談</div>
        <div className="text-right">成約率</div>
        <div className="text-right">ロープレ</div>
      </div>
    </div>
  );
}

function ComparisonMetricBar({
  metric,
}: {
  metric: {
    label: string;
    value: number | null;
    average: number | null;
    unit: string;
    max: number;
    better: "higher" | "neutral";
  };
}) {
  const valueWidth = metric.value === null ? 0 : Math.min(100, Math.round((metric.value / metric.max) * 100));
  const averageWidth = metric.average === null ? 0 : Math.min(100, Math.round((metric.average / metric.max) * 100));
  const valueLabel = metric.value === null ? "-" : `${metric.value}${metric.unit}`;
  const averageLabel = metric.average === null ? "-" : `${metric.average}${metric.unit}`;
  const isAboveAverage = metric.value !== null && metric.average !== null && metric.value >= metric.average;

  return (
    <div className="rounded-[14px] border border-[#eef1f5] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-black text-[#343b48]">{metric.label}</div>
        <div className={`text-[12px] font-black ${isAboveAverage ? "text-[#16834f]" : "text-[#8a6500]"}`}>
          {valueLabel} / 平均 {averageLabel}
        </div>
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-[#eef1f5]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#ffd84d]" style={{ width: `${valueWidth}%` }} />
        {metric.average !== null ? (
          <div className="absolute top-[-2px] h-7 w-[2px] rounded-full bg-[#171717]" style={{ left: `${averageWidth}%` }} />
        ) : null}
      </div>
    </div>
  );
}

function buildComparisonPeers(member: ComparisonMember, members: ComparisonMember[], mode: "tenure" | "company") {
  if (mode === "company") return members;
  const exactPeers = members.filter(
    (row) =>
      member.workExperienceTotalMonths !== null &&
      row.workExperienceTotalMonths === member.workExperienceTotalMonths,
  );
  if (exactPeers.length > 1) return exactPeers;
  const bucket = getExperienceBucket(member.workExperienceTotalMonths);
  const peers = members.filter((row) => getExperienceBucket(row.workExperienceTotalMonths) === bucket);
  return peers.length > 0 ? peers : members;
}

function buildComparisonMetrics(member: ComparisonMember, peers: ComparisonMember[]) {
  const meetingMax = Math.max(...peers.map((row) => row.meetingCount), member.meetingCount, 1);
  const roleplayMax = Math.max(...peers.map((row) => row.roleplayCount), member.roleplayCount, 1);
  return [
    {
      label: "商談数",
      value: member.meetingCount,
      average: averageNumber(peers.map((row) => row.meetingCount)),
      unit: "件",
      max: meetingMax,
      better: "higher" as const,
    },
    {
      label: "成約率",
      value: member.winRate,
      average: averageNumber(peers.map((row) => row.winRate)),
      unit: "%",
      max: 100,
      better: "higher" as const,
    },
    {
      label: "ロープレスコア",
      value: member.averageScore,
      average: averageNumber(peers.map((row) => row.averageScore)),
      unit: "点",
      max: 100,
      better: "higher" as const,
    },
    {
      label: "ロープレ回数",
      value: member.roleplayCount,
      average: averageNumber(peers.map((row) => row.roleplayCount)),
      unit: "回",
      max: roleplayMax,
      better: "higher" as const,
    },
  ];
}

function buildMemberRank(member: ComparisonMember, peers: ComparisonMember[]) {
  if (peers.length === 0) return null;
  const sorted = buildRankedPeers(peers);
  const index = sorted.findIndex((row) => row.id === member.id);
  return index === -1 ? null : index + 1;
}

function buildRankedPeers(peers: ComparisonMember[]) {
  const scoreOf = (row: ComparisonMember) =>
    (row.winRate ?? 0) * 1.2 + (row.averageScore ?? 0) + row.meetingCount * 2 + row.roleplayCount;
  return [...peers]
    .sort((left, right) => scoreOf(right) - scoreOf(left))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildComparisonComment(
  member: ComparisonMember,
  metrics: ReturnType<typeof buildComparisonMetrics>,
  rank: number | null,
  peerCount: number,
  mode: "tenure" | "company",
) {
  const above = metrics.filter((metric) => metric.value !== null && metric.average !== null && metric.value >= metric.average);
  const best = above[0];
  const scope = mode === "tenure" ? "同じ経験年数のメンバー内" : "全メンバー内";
  if (rank !== null && peerCount > 1 && rank <= Math.ceil(peerCount / 3)) {
    return `${scope}では上位寄りです。特に${best?.label ?? "実績"}が平均以上で、強みとして見られます。`;
  }
  if (best) {
    return `${scope}では${best.label}が平均以上です。平均との差が小さい項目を次回指導テーマにすると良さそうです。`;
  }
  return `${scope}ではこれから伸ばせる余地があります。まずは商談レビューとロープレ回数を増やして比較データを厚くしましょう。`;
}

function averageNumber(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (validValues.length === 0) return null;
  return Math.round((validValues.reduce((sum, value) => sum + value, 0) / validValues.length) * 10) / 10;
}

function getExperienceBucket(totalMonths: number | null) {
  if (totalMonths === null) return "unknown";
  if (totalMonths < 12) return "under_1";
  if (totalMonths < 36) return "year_1_2";
  if (totalMonths < 72) return "year_3_5";
  return "year_6_plus";
}

function getExperienceBucketLabel(totalMonths: number | null) {
  const bucket = getExperienceBucket(totalMonths);
  if (bucket === "under_1") return "1年未満";
  if (bucket === "year_1_2") return "1〜2年";
  if (bucket === "year_3_5") return "3〜5年";
  if (bucket === "year_6_plus") return "6年以上";
  return "勤務年数未設定";
}

function buildTenureComparisonLabel(member: ComparisonMember, peers: ComparisonMember[]) {
  const hasExactPeers =
    member.workExperienceTotalMonths !== null &&
    peers.some((row) => row.id !== member.id && row.workExperienceTotalMonths === member.workExperienceTotalMonths);

  if (hasExactPeers) {
    return `同じ経験年数（${member.workExperienceLabel}） ${peers.length}人`;
  }

  return `近い経験年数（${getExperienceBucketLabel(member.workExperienceTotalMonths)}） ${peers.length}人`;
}

function AdminCustomerManagementLog({ customers, logs }: { customers: CustomerRecord[]; logs: CustomerLogRecord[] }) {
  const contractedCount = customers.filter((customer) => customer.contractStatus === "contracted" || customer.isContracted || customer.status === "contracted").length;
  const proposalCount = customers.filter((customer) => customer.status === "proposal").length;
  const lostCount = customers.filter((customer) => customer.status === "lost").length;
  const overdueCustomers = customers.filter(isActionOverdue);
  const recentCustomers = [...customers]
    .sort((left, right) => (right.lastContactDate?.getTime() ?? 0) - (left.lastContactDate?.getTime() ?? 0))
    .slice(0, 3);
  const neglectedCustomers = customers
    .filter((customer) => {
      if (!customer.lastContactDate) return true;
      const diffDays = Math.floor((Date.now() - customer.lastContactDate.getTime()) / 86400000);
      return diffDays >= 30 && customer.status !== "contracted" && customer.status !== "lost";
    })
    .slice(0, 3);
  const nextActions = [...customers]
    .filter((customer) => customer.nextActionTitle || customer.nextActionDate)
    .sort((left, right) => (left.nextActionDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.nextActionDate?.getTime() ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 4);
  const recentLogs = [...logs]
    .sort((left, right) => (right.actionDate?.getTime() ?? right.createdAt?.getTime() ?? 0) - (left.actionDate?.getTime() ?? left.createdAt?.getTime() ?? 0))
    .slice(0, 4);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="担当顧客" value={`${customers.length}件`} />
        <MiniStat label="契約中" value={`${contractedCount}件`} tone="good" />
        <MiniStat label="提案中" value={`${proposalCount}件`} />
        <MiniStat label="失注" value={`${lostCount}件`} tone="risk" />
        <MiniStat label="期限超過" value={`${overdueCustomers.length}件`} tone={overdueCustomers.length > 0 ? "risk" : "normal"} />
        <MiniStat label="放置顧客" value={`${neglectedCustomers.length}件`} tone={neglectedCustomers.length > 0 ? "risk" : "normal"} />
      </div>

      <AdminCustomerKarteList customers={customers} logs={logs} />

      <AdminCustomerList title="直近接触顧客" customers={recentCustomers} empty="直近接触はまだありません" />
      <AdminCustomerList title="放置顧客" customers={neglectedCustomers} empty="放置顧客はありません" />

      <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
        <div className="text-[13px] font-black text-[#171717]">次回アクション一覧</div>
        <div className="mt-3 space-y-2">
          {nextActions.length > 0 ? nextActions.map((customer) => (
            <div key={customer.id} className={`rounded-[12px] border px-3 py-2 ${isActionOverdue(customer) ? "border-[#f4d4d4] bg-[#fff8f8]" : "border-[#eef1f5] bg-white"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-black text-[#343b48]">{customer.companyName}</span>
                <span className={`shrink-0 text-[12px] font-black ${isActionOverdue(customer) ? "text-[#d63c2f]" : "text-[#8a6500]"}`}>{formatDate(customer.nextActionDate)}</span>
              </div>
              <div className="mt-1 truncate text-[12px] font-bold text-[#8a909b]">{customer.nextActionTitle || "内容未設定"}</div>
            </div>
          )) : <div className="text-[13px] font-bold text-[#8a909b]">次回アクションはありません</div>}
        </div>
      </div>

      <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
        <div className="text-[13px] font-black text-[#171717]">顧客別の直近ログ</div>
        <div className="mt-3 space-y-2">
          {recentLogs.length > 0 ? recentLogs.map((log) => {
            const customer = customerById.get(log.customerId);
            return (
              <div key={log.id} className="rounded-[12px] border border-[#eef1f5] bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-black text-[#343b48]">{customer?.companyName ?? "顧客未設定"}</span>
                  <span className="text-[12px] font-bold text-[#8a909b]">{formatDate(log.actionDate ?? log.createdAt)}</span>
                </div>
                <div className="mt-1 text-[12px] font-bold text-[#596273]">{log.title}</div>
              </div>
            );
          }) : <div className="text-[13px] font-bold text-[#8a909b]">顧客ログはまだありません</div>}
        </div>
      </div>
    </div>
  );
}

function AdminCustomerKarteList({ customers, logs }: { customers: CustomerRecord[]; logs: CustomerLogRecord[] }) {
  const latestLogByCustomer = new Map<string, CustomerLogRecord>();
  logs.forEach((log) => {
    const current = latestLogByCustomer.get(log.customerId);
    const currentTime = current?.actionDate?.getTime() ?? current?.createdAt?.getTime() ?? 0;
    const nextTime = log.actionDate?.getTime() ?? log.createdAt?.getTime() ?? 0;
    if (!current || nextTime > currentTime) {
      latestLogByCustomer.set(log.customerId, log);
    }
  });

  const sortedCustomers = [...customers]
    .sort((left, right) => {
      const leftOverdue = isActionOverdue(left) ? 1 : 0;
      const rightOverdue = isActionOverdue(right) ? 1 : 0;
      if (leftOverdue !== rightOverdue) return rightOverdue - leftOverdue;
      return (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
    })
    .slice(0, 6);

  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-black text-[#171717]">担当顧客カルテ</div>
          <div className="mt-1 text-[12px] font-bold text-[#8a909b]">営業マンが見ている顧客情報の要約</div>
        </div>
        <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-[12px] font-black text-[#8a6500]">{customers.length}件</span>
      </div>

      <div className="mt-3 space-y-3">
        {sortedCustomers.length > 0 ? sortedCustomers.map((customer) => {
          const latestLog = latestLogByCustomer.get(customer.id);
          const overdue = isActionOverdue(customer);
          return (
            <div key={customer.id} className={`rounded-[14px] border px-4 py-3 ${overdue ? "border-[#f4d4d4] bg-[#fff8f8]" : "border-[#eef1f5] bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-black text-[#171717]">{customer.companyName || "会社名未設定"}</div>
                  <div className="mt-1 text-[12px] font-bold text-[#8a909b]">
                    {customer.contactName || "先方担当者未設定"} ・ {customer.phone || customer.email || "連絡先未設定"}
                  </div>
                  {customer.collaboratorUserNames.length > 0 ? (
                    <div className="mt-1 text-[12px] font-bold text-[#8a6500]">共同: {customer.collaboratorUserNames.join(" / ")}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CustomerBadge label={readCustomerStatusLabel(customer.status)} tone={customer.status === "contracted" ? "good" : customer.status === "lost" ? "risk" : "normal"} />
                  <CustomerBadge label={`温度 ${readTemperatureLabel(customer.temperature)}`} tone={customer.temperature === "high" ? "risk" : customer.temperature === "low" ? "info" : "normal"} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SmallInfo label="次回アクション" value={`${customer.nextActionTitle || "未設定"} / ${formatDate(customer.nextActionDate)}`} tone={overdue ? "risk" : "normal"} />
                <SmallInfo label="商材" value={customer.productNames.length > 0 ? customer.productNames.join(" / ") : "未設定"} />
                <SmallInfo label="契約状況" value={customer.contractStatus === "contracted" || customer.isContracted || customer.status === "contracted" ? `${customer.contractPlan || readContractStatusLabel(customer.contractStatus)} / ${formatCurrency(customer.monthlyAmount)}` : readContractStatusLabel(customer.contractStatus)} tone={customer.contractStatus === "contracted" || customer.isContracted ? "good" : customer.contractStatus === "needs_consultation" ? "risk" : "normal"} />
                <SmallInfo label="契約経過" value={customer.contractStartDate ? `${calcContractMonths(customer.contractStartDate)}ヶ月` : "未設定"} />
                <SmallInfo label="解約リスク" value={readChurnRiskLabel(customer.churnRisk)} tone={customer.churnRisk === "high" ? "risk" : customer.churnRisk === "low" ? "good" : "normal"} />
              </div>

              <div className="mt-3 rounded-[10px] bg-[#fcfcfd] px-3 py-2 text-[12px] font-bold leading-5 text-[#596273]">
                {latestLog ? `直近ログ: ${readCustomerLogTypeLabel(latestLog.type)} / ${latestLog.title}` : customer.memo || "顧客メモはまだありません"}
              </div>
              <div className="mt-3 flex justify-end">
                <Link href={`/admin/customers/${customer.id}`} className="rounded-[9px] border border-[#ead8a8] bg-[#fffaf0] px-3 py-2 text-[12px] font-black text-[#8a6500]">
                  詳細
                </Link>
              </div>
            </div>
          );
        }) : <div className="text-[13px] font-bold text-[#8a909b]">担当顧客カルテはまだありません</div>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "good" | "risk" }) {
  const valueClass = tone === "good" ? "text-[#16834f]" : tone === "risk" ? "text-[#d63c2f]" : "text-[#171717]";
  return (
    <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className={`mt-1 text-[20px] font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

function CustomerBadge({ label, tone }: { label: string; tone: "normal" | "good" | "risk" | "info" }) {
  const className =
    tone === "good"
      ? "bg-[#edf7f0] text-[#16834f]"
      : tone === "risk"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : tone === "info"
          ? "bg-[#eef6ff] text-[#2672d9]"
          : "bg-[#fff3cf] text-[#8a6500]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function SmallInfo({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "good" | "risk" }) {
  const valueClass = tone === "good" ? "text-[#16834f]" : tone === "risk" ? "text-[#d63c2f]" : "text-[#343b48]";
  return (
    <div className="rounded-[10px] border border-[#eef1f5] bg-white px-3 py-2">
      <div className="text-[11px] font-bold text-[#8a909b]">{label}</div>
      <div className={`mt-1 truncate text-[12px] font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

function AdminCustomerList({ title, customers, empty }: { title: string; customers: CustomerRecord[]; empty: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[13px] font-black text-[#171717]">{title}</div>
      <div className="mt-3 space-y-2">
        {customers.length > 0 ? customers.map((customer) => (
          <div key={customer.id} className="rounded-[12px] border border-[#eef1f5] bg-white px-3 py-2">
            <div className="truncate text-[13px] font-black text-[#343b48]">{customer.companyName}</div>
            <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{readCustomerStatusLabel(customer.status)} ・ 最終接触 {formatDate(customer.lastContactDate)}</div>
          </div>
        )) : <div className="text-[13px] font-bold text-[#8a909b]">{empty}</div>}
      </div>
    </div>
  );
}

function readCustomerStatusLabel(status: CustomerRecord["status"]) {
  const labels: Record<CustomerRecord["status"], string> = {
    not_contacted: "未接触",
    called: "テレアポ済",
    meeting_scheduled: "商談予定",
    meeting_done: "商談済",
    proposal: "提案中",
    contracted: "契約中",
    lost: "失注",
    dormant: "休眠",
  };
  return labels[status];
}

function readTemperatureLabel(temperature: CustomerRecord["temperature"]) {
  const labels: Record<CustomerRecord["temperature"], string> = {
    high: "高",
    middle: "中",
    low: "低",
  };
  return labels[temperature];
}

function readChurnRiskLabel(risk: CustomerRecord["churnRisk"]) {
  const labels: Record<CustomerRecord["churnRisk"], string> = {
    high: "高",
    middle: "中",
    low: "低",
  };
  return labels[risk];
}

function readContractStatusLabel(status: CustomerRecord["contractStatus"]) {
  const labels: Record<CustomerRecord["contractStatus"], string> = {
    not_contracted: "未契約",
    considering: "検討中",
    needs_consultation: "要相談",
    contracted: "契約中",
    paused: "保留",
    cancelled: "解約",
  };
  return labels[status];
}

function readCustomerLogTypeLabel(type: CustomerLogRecord["type"]) {
  const labels: Record<CustomerLogRecord["type"], string> = {
    teleapo: "テレアポ",
    meeting: "商談",
    email: "メール",
    quote: "見積送付",
    contract: "契約",
    follow: "フォロー",
    memo: "メモ",
  };
  return labels[type];
}

function formatCurrency(value: number | null) {
  if (value === null) return "金額未設定";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function calcContractMonths(date: Date | null) {
  if (!date) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth());
}

function isActionOverdue(customer: CustomerRecord) {
  if (!customer.nextActionDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return customer.nextActionDate.getTime() < today.getTime() && customer.status !== "contracted";
}

function buildLostReason(meetings: MeetingRecord[]) {
  const lostMeetings = meetings.filter((meeting) => meeting.status === "lost");
  if (lostMeetings.length === 0) return "-";
  const latest = lostMeetings[0];
  return latest.aiSummary?.bullets[0] ?? latest.aiSummary?.overview ?? "-";
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full object-cover" />;
  }

  return (
    <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[22px] font-black text-[#8a6500]">
      {name.slice(0, 1)}
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
