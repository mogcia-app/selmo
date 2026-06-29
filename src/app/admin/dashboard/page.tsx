"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToSalesActivityEvents,
  type SalesActivityEvent,
  type SalesActivityType,
} from "@/lib/firebase/activity";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  subscribeToKnowledgeProducts,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import {
  subscribeToCustomerLogs,
  subscribeToCustomers,
  type CustomerLogRecord,
  type CustomerRecord,
} from "@/lib/firebase/customers";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  subscribeToRoleplayResults,
  type RoleplayResult,
} from "@/lib/firebase/roleplay";

const SELMO_OPERATION_ACTOR = {
  name: "selmo.運営",
  avatarUrl: "/nini.png",
};

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [activityEvents, setActivityEvents] = useState<SalesActivityEvent[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customerLogs, setCustomerLogs] = useState<CustomerLogRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "members">("overview");
  const [scoreDomain, setScoreDomain] = useState<"meeting" | "teleapo">("meeting");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInputValue(new Date()));
  const adminUserId = users.find((user) => user.role === "admin")?.uid;

  useEffect(() => {
    if (!profile?.companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const handleOptionalCustomerError = () => {
      setCustomers([]);
      setCustomerLogs([]);
    };
    const unsubscribers = [
      subscribeToUserProfiles(setUsers, handleError, profile.companyId),
      subscribeToMeetings({ role: "admin", userId: "admin", companyId: profile.companyId }, setMeetings, handleError),
      subscribeToKnowledgeProducts(profile?.companyId, setProducts, handleError),
      subscribeToSalesActivityEvents(profile.companyId, setActivityEvents, handleError),
      subscribeToCustomers({ companyId: profile.companyId, isAdmin: true }, setCustomers, handleOptionalCustomerError),
      subscribeToCustomerLogs({ companyId: profile.companyId, isAdmin: true }, setCustomerLogs, handleOptionalCustomerError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile?.companyId]);

  useEffect(() => {
    if (!adminUserId || !profile?.companyId) return;

    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToVisibleKnowledgeItems({ userId: adminUserId, companyId: profile?.companyId }, setKnowledgeItems, handleError),
      subscribeToRoleplayResults({ userId: adminUserId, companyId: profile.companyId, isAdmin: true }, setRoleplayResults, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [adminUserId, profile?.companyId]);

  const salesUsers = useMemo(() => users.filter((user) => user.role === "sales"), [users]);
  const activeSalesUsers = useMemo(() => salesUsers.filter((user) => user.status === "active"), [salesUsers]);
  const selectedMeetingsForMonth = useMemo(() => filterRecordsByMonth(meetings, selectedMonth, (meeting) => meeting.recordedAt), [meetings, selectedMonth]);
  const selectedRoleplayResultsForMonth = useMemo(() => filterRecordsByMonth(roleplayResults, selectedMonth, (result) => result.createdAt), [roleplayResults, selectedMonth]);
  const selectedActivityEventsForMonth = useMemo(() => filterRecordsByMonth(activityEvents, selectedMonth, (event) => event.createdAt), [activityEvents, selectedMonth]);
  const selectedCustomerLogsForMonth = useMemo(() => filterRecordsByMonth(customerLogs, selectedMonth, (log) => log.actionDate ?? log.createdAt), [customerLogs, selectedMonth]);
  const sharedKnowledgeCount = useMemo(() => knowledgeItems.filter((item) => item.scope === "shared").length, [knowledgeItems]);
  const wonMeetings = useMemo(() => selectedMeetingsForMonth.filter((meeting) => meeting.status === "won").length, [selectedMeetingsForMonth]);
  const winRate = selectedMeetingsForMonth.length > 0 ? Math.round((wonMeetings / selectedMeetingsForMonth.length) * 1000) / 10 : null;
  const analyzedMeetingCount = useMemo(() => selectedMeetingsForMonth.filter((meeting) => meeting.aiSummary).length, [selectedMeetingsForMonth]);
  const productRows = useMemo(() => buildProductRows(products, knowledgeItems), [knowledgeItems, products]);
  const repRows = useMemo(() => buildRepRows(activeSalesUsers, selectedMeetingsForMonth, selectedRoleplayResultsForMonth), [activeSalesUsers, selectedMeetingsForMonth, selectedRoleplayResultsForMonth]);
  const attentionRows = useMemo(() => repRows.filter((row) => row.needsCoaching).slice(0, 6), [repRows]);
  const selectedRep = useMemo(
    () => repRows.find((row) => row.id === selectedMemberId) ?? repRows[0] ?? null,
    [repRows, selectedMemberId],
  );
  const selectedMeetings = useMemo(
    () => selectedRep ? selectedMeetingsForMonth.filter((meeting) => meeting.userId === selectedRep.id) : [],
    [selectedMeetingsForMonth, selectedRep],
  );
  const selectedCustomers = useMemo(
    () => selectedRep ? customers.filter((customer) => customer.assignedUserId === selectedRep.id) : [],
    [customers, selectedRep],
  );
  const selectedCustomerLogs = useMemo(
    () => selectedRep ? selectedCustomerLogsForMonth.filter((log) => log.userId === selectedRep.id) : [],
    [selectedCustomerLogsForMonth, selectedRep],
  );
  const selectedResults = useMemo(
    () => selectedRep ? selectedRoleplayResultsForMonth.filter((result) => result.userId === selectedRep.id) : [],
    [selectedRoleplayResultsForMonth, selectedRep],
  );
  const selectedManualInsights = useMemo(
    () => buildManualInsightSummary(selectedMeetings, selectedResults),
    [selectedMeetings, selectedResults],
  );
  const selectedRepAllMeetings = useMemo(
    () => selectedRep ? meetings.filter((meeting) => meeting.userId === selectedRep.id) : [],
    [meetings, selectedRep],
  );
  const rankingRows = useMemo(() => buildRankingRows(repRows), [repRows]);

  useEffect(() => {
    if (!selectedMemberId && repRows[0]) {
      setSelectedMemberId(repRows[0].id);
    }
  }, [repRows, selectedMemberId]);

  return (
    <main className="overflow-x-hidden bg-[#f6f7f9] px-4 pb-5 pt-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        {error ? (
          <div className="mt-4 rounded-[12px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
          <div className="inline-flex flex-wrap items-center gap-1 rounded-[12px] border border-[#e3e7ee] bg-white p-1 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={`rounded-[9px] px-4 py-2 text-[13px] font-black transition ${
                viewMode === "overview" ? "bg-[#171717] text-white shadow-sm" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
              }`}
            >
              総合
            </button>
            <button
              type="button"
              onClick={() => setViewMode("members")}
              className={`rounded-[9px] px-4 py-2 text-[13px] font-black transition ${
                viewMode === "members" ? "bg-[#171717] text-white shadow-sm" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
              }`}
            >
              個別
            </button>
          </div>
        </div>

        {viewMode === "overview" ? (
          <>
            <section className="mt-5 overflow-hidden rounded-[16px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
              <div className="border-b border-[#eef1f5] bg-white px-4 py-4 lg:px-5">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8a6500]">Overview</p>
                  <h2 className="mt-1 text-[22px] font-black tracking-[-0.03em] text-[#171717]">チーム営業サマリー</h2>
                  <p className="mt-1.5 max-w-[720px] text-[13px] leading-6 text-[#596273]">
                    指導が必要なメンバー、商談の分析状況、ナレッジ整備状況をまとめて確認します。
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-5">
                <OverviewMetric icon={<UsersIcon />} label="営業マン数" value={`${salesUsers.length}人`} note={`アクティブ ${activeSalesUsers.length}人`} />
                <OverviewMetric icon={<MeetingIcon />} label="商談件数" value={`${selectedMeetingsForMonth.length}件`} note="選択月の商談" />
                <OverviewMetric icon={<TargetIcon />} label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "商談なし" : `成約 ${wonMeetings}件`} tone={winRate !== null && winRate >= 30 ? "good" : "normal"} />
                <OverviewMetric icon={<SparkIcon />} label="分析済み商談" value={`${analyzedMeetingCount}件`} note={selectedMeetingsForMonth.length > 0 ? `${Math.round((analyzedMeetingCount / selectedMeetingsForMonth.length) * 100)}% 分析済み` : "商談データ待ち"} />
                <OverviewMetric icon={<BookIcon />} label="共有ナレッジ" value={`${sharedKnowledgeCount}件`} note={`商材 ${products.length}件`} />
              </div>
            </section>

            <section className="mt-5 grid gap-5 xl:min-h-[900px] xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
              <div className="flex flex-col gap-5 xl:h-full">
                <Panel title="指導必要ユーザー" actionLabel="営業マン一覧へ" href="/admin/members">
                  {attentionRows.length > 0 ? (
                    <CoachingList rows={attentionRows} />
                  ) : (
                    <EmptyState title="指導が必要なユーザーはいません" body="失注・未分析・低スコアのロープレが見つかると、ここに優先表示されます。" />
                  )}
                </Panel>

                <Panel
                  title="直近の商談レビュー"
                  actionLabel="レビュー一覧"
                  href="/admin/meetings"
                  className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden"
                  bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-auto"
                >
                  <LatestMeetingTable rows={buildLatestReviews(meetings, repRows)} />
                </Panel>
              </div>

              <div className="space-y-5">
                <Panel title="営業パフォーマンス分布">
                  {repRows.length > 0 ? <PerformanceMap rows={repRows} /> : <EmptyState title="分布データはまだありません" body="営業メンバーと商談結果が蓄積されると表示します。" />}
                </Panel>

                <Panel
                  title="営業ランキング"
                  actionLabel="営業メンバー一覧"
                  href="/admin/members"
                  className="xl:flex xl:h-[360px] xl:min-h-0 xl:flex-col xl:overflow-hidden"
                  bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-auto"
                >
                  <RankingList rows={rankingRows} />
                </Panel>
              </div>
            </section>
          </>
        ) : (
          <section className="mt-5">
            {selectedRep ? (
              <div className="min-w-0 space-y-5">
                  <section className="overflow-hidden rounded-[16px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
                    <div className="grid gap-5 border-b border-[#eef1f5] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:px-5">
                      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center">
                        <MemberAvatar name={selectedRep.name} avatarUrl={selectedRep.avatarUrl} size="xl" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-[26px] font-black tracking-[-0.03em] text-[#171717]">{selectedRep.name}</h2>
                            <StatusBadge tone={selectedRep.tone} label={selectedRep.status} />
                            <PriorityBadge priority={selectedRep.coachingPriority} />
                          </div>
                          <p className="mt-1.5 text-[13px] font-bold text-[#596273]">
                            {selectedRep.workExperienceLabel} ・ {selectedRep.email || "メール未登録"}
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
                            <div className="rounded-[12px] border border-[#ead8a8] bg-[#fffbf1] px-4 py-3">
                              <div className="text-[12px] font-bold text-[#8a909b]">次に見ること</div>
                              <div className="mt-1 text-[16px] font-black text-[#171717]">{selectedRep.nextAction}</div>
                            </div>
                            <div className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                              <div className="text-[12px] font-bold text-[#8a909b]">直近活動</div>
                              <div className="mt-1 text-[16px] font-black text-[#343b48]">{selectedRep.latestActivity}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <select
                        value={selectedRep.id}
                        onChange={(event) => setSelectedMemberId(event.target.value)}
                        className="h-11 w-full rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-black text-[#343b48] outline-none focus:border-[#d7aa1f]"
                      >
                        {repRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                      </select>
                      <Link href={`/admin/members/${selectedRep.id}`} className="flex h-11 items-center justify-center rounded-[10px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717] transition hover:bg-[#ffcf33]">
                        詳細ページを見る
                      </Link>
                    </div>

                    <div className="grid gap-0 md:grid-cols-3 2xl:grid-cols-6">
                      <IndividualMetric icon={<TargetIcon />} label="成約率" value={selectedRep.winRate === null ? "-" : `${selectedRep.winRate}%`} note="商談結果" tone={selectedRep.tone} />
                      <IndividualMetric icon={<MeetingIcon />} label="商談数" value={`${selectedRep.meetingCount}件`} note={`分析済み ${selectedRep.analyzedCount}件`} />
                      <IndividualMetric icon={<RiskIcon />} label="失注率" value={selectedRep.meetingCount === 0 ? "-" : `${Math.round((selectedRep.lostCount / selectedRep.meetingCount) * 1000) / 10}%`} note={`失注 ${selectedRep.lostCount}件`} tone={selectedRep.lostCount > 0 ? "risk" : "normal"} />
                      <IndividualMetric icon={<ClockIcon />} label="平均商談時間" value={selectedRep.avgDurationMin === null ? "-" : `${selectedRep.avgDurationMin}分`} note="音声のみ" />
                      <IndividualMetric icon={<PlayIcon />} label="ロープレ" value={`${selectedRep.roleplayCount}回`} note={`低スコア ${selectedRep.lowRoleplayCount}件`} tone={selectedRep.lowRoleplayCount > 0 ? "risk" : "normal"} />
                      <IndividualMetric icon={<SparkIcon />} label="AI評価" value={selectedRep.averageScore === null ? "-" : `${selectedRep.averageScore}点`} note="ロープレ平均" tone={selectedRep.averageScore !== null && selectedRep.averageScore >= 80 ? "good" : "normal"} />
                    </div>
                  </section>

                  <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                    <div className="flex flex-col gap-5 xl:h-full">
                    <Panel title="優先して見ること">
                      <ImprovementList row={selectedRep} />
                    </Panel>
                    <Panel title="成約率の推移" className="overflow-hidden">
                      <TrendBars rows={buildMonthlyTrend(selectedRepAllMeetings)} />
                    </Panel>
                    <Panel
                      title="直近の商談"
                      className="xl:flex xl:h-[420px] xl:min-h-0 xl:flex-col xl:overflow-hidden"
                      bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-auto"
                    >
                      <LatestMeetingTable rows={buildLatestReviews(selectedMeetings, [selectedRep], 12)} />
                    </Panel>
                    <Panel title="商談レビューの注目ポイント">
                      <MeetingReviewFocusList meetings={selectedMeetings} />
                    </Panel>
                    <Panel
                      title="顧客管理ログ"
                      className="xl:flex xl:min-h-[260px] xl:flex-1 xl:flex-col xl:overflow-hidden"
                      bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-auto"
                    >
                      <CustomerManagementLog customers={selectedCustomers} logs={selectedCustomerLogs} />
                    </Panel>
                  </div>

                    <div className="flex flex-col gap-5 xl:h-full">
                    <Panel title="管理者アクション">
                      <ActionList row={selectedRep} />
                    </Panel>
                    <Panel title="次にやるべきアクション">
                      <NextActionList row={selectedRep} />
                    </Panel>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                      <Panel title="商材別 成約率">
                        {productRows.length > 0 ? (
                          <ProductWinList rows={productRows} meetings={selectedMeetings} />
                        ) : (
                          <EmptyState title="商材はまだありません" body="商材別ナレッジを追加すると、個別の商材別状況が表示されます。" />
                        )}
                      </Panel>

                      <Panel title="よく出るワード TOP5">
                        <KeywordList meetings={selectedMeetings} />
                      </Panel>
                      <Panel title="顧客側の頻出ワード">
                        <CustomerWordList meetings={selectedMeetings} />
                      </Panel>
                      <Panel title="商材 × マニュアル達成度">
                        <ProductManualAchievement rows={selectedManualInsights.productRows} />
                      </Panel>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                      <Panel title="よく抜ける基準 TOP5">
                        <MissingManualList rows={selectedManualInsights.missingRows} />
                      </Panel>
                      <Panel title="ロープレと実商談の差分">
                        <RoleplayMeetingGapList rows={selectedManualInsights.gapRows} />
                      </Panel>
                      <Panel title="商談スコア">
                        <MeetingScoreCard meetings={selectedMeetings} activeDomain={scoreDomain} onDomainChange={setScoreDomain} />
                      </Panel>
                      <Panel title="失注理由">
                        <LossSummary meetings={selectedMeetings} />
                      </Panel>
                      <Panel title="ロープレスコア">
                        <RoleplayScoreCard results={selectedResults} activeDomain={scoreDomain} onDomainChange={setScoreDomain} />
                      </Panel>
                    </div>
                  </div>
                  </section>
              </div>
            ) : (
              <EmptyState title="営業メンバーはまだいません" body="営業メンバーが追加されると、個別の育成状況が表示されます。" />
            )}
          </section>
        )}

        {viewMode === "overview" ? (
        <section className="mt-5">
          <Panel
            title="最近の活動状況"
            actionLabel="活動ログを見る"
            href="/admin/activity"
            className="flex h-[460px] min-h-0 flex-col overflow-hidden"
            bodyClassName="min-h-0 flex-1 overflow-hidden"
          >
            <RecentActivityCard events={selectedActivityEventsForMonth} knowledgeItems={knowledgeItems} users={users} />
          </Panel>
        </section>
        ) : null}

      </div>
    </main>
  );
}

function OverviewMetric({
  icon,
  label,
  value,
  note,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "good" | "normal" | "risk";
}) {
  const iconClass =
    tone === "good"
      ? "bg-[#eaf8ef] text-[#16834f]"
      : tone === "risk"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : "bg-[#fff3cf] text-[#f0b400]";

  return (
    <article className="border-b border-[#eef1f5] px-4 py-4 md:border-r md:last:border-r-0 xl:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${iconClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-black text-[#596273]">{label}</div>
          <div className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#171717]">{value}</div>
          <div className="mt-1 text-[11px] font-bold text-[#8a909b]">{note}</div>
        </div>
      </div>
    </article>
  );
}

function MonthSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = parseMonthValue(value) ?? new Date();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[#e0e4eb] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
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

function IndividualMetric({
  icon,
  label,
  value,
  note,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "good" | "normal" | "risk";
}) {
  const iconClass =
    tone === "good"
      ? "bg-[#eaf8ef] text-[#16834f]"
      : tone === "risk"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : "bg-[#fff3cf] text-[#f0b400]";

  return (
    <article className="border-b border-[#eef1f5] px-4 py-4 md:border-r md:last:border-r-0 xl:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${iconClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-black text-[#596273]">{label}</div>
          <div className="mt-1 text-[24px] font-black tracking-[-0.03em] text-[#171717]">{value}</div>
          <div className="mt-1 text-[11px] font-bold text-[#8a909b]">{note}</div>
        </div>
      </div>
    </article>
  );
}

function Panel({
  title,
  actionLabel,
  href,
  children,
  compact = false,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  actionLabel?: string;
  href?: string;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-[16px] border border-[#e4e8ef] bg-white shadow-[0_6px_16px_rgba(17,24,39,0.04)] ${className}`}>
      <div className={`flex items-center justify-between gap-4 border-b border-[#eef1f5] py-3.5 ${compact ? "px-3" : "px-4"}`}>
        <h2 className="text-[16px] font-black text-[#171717]">{title}</h2>
        {actionLabel && href ? (
          <Link href={href} className="rounded-[9px] border border-[#ead8a8] bg-[#fffaf0] px-3 py-1.5 text-[12px] font-black text-[#8a6500] transition hover:bg-[#fff3cd]">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className={`${compact ? "p-3" : "p-4"} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function CoachingList({ rows }: { rows: ReturnType<typeof buildRepRows> }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/admin/members/${row.id}`}
          className="grid gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3.5 transition hover:border-[#ead8a8] hover:bg-[#fffdf7] md:grid-cols-[minmax(0,1fr)_150px_130px_28px]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <MemberAvatar name={row.name} avatarUrl={row.avatarUrl} size="md" />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
              <div className="mt-0.5 truncate text-[12px] font-bold text-[#8a909b]">{row.workExperienceLabel} ・ {row.latestActivity}</div>
            </div>
          </div>
          <div className="flex items-center md:justify-center">
            <PriorityBadge priority={row.coachingPriority} />
          </div>
          <div className="text-[12px] font-bold text-[#343b48]">
            <div>{row.coachingReasons[0] ?? row.nextAction}</div>
            <div className="mt-1 text-[#8a909b]">成約率 {row.winRate === null ? "-" : `${row.winRate}%`}</div>
          </div>
          <div className="flex items-center justify-end text-[20px] font-black text-[#8a6500]">›</div>
        </Link>
      ))}
    </div>
  );
}

function ProductWinList({ rows, meetings }: { rows: ReturnType<typeof buildProductRows>; meetings: MeetingRecord[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const productMeetings = meetings.filter((meeting) => meeting.productType === row.name);
        const productWinRate = calcWinRate(productMeetings);
        const barValue = productWinRate ?? 0;
        return (
          <div key={row.id} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
                <div className="mt-1 text-[12px] font-bold text-[#8a909b]">商談 {productMeetings.length}件 / ナレッジ {row.knowledgeCount}件</div>
              </div>
              <span className="shrink-0 text-[14px] font-black text-[#8a6500]">{productWinRate === null ? "-" : `${productWinRate}%`}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[#edf0f5]">
              <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${Math.min(barValue, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: "good" | "normal" | "risk"; label: string }) {
  const className =
    tone === "good"
      ? "bg-[#eaf8ef] text-[#16834f]"
      : tone === "risk"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${className}`}>{label}</span>;
}

function MemberAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: "sm" | "md" | "lg" | "xl" }) {
  const className =
    size === "xl"
      ? "h-20 w-20 text-[28px]"
      : size === "lg"
      ? "h-20 w-20 text-[28px]"
      : size === "md"
        ? "h-10 w-10 text-[14px]"
        : "h-9 w-9 text-[13px]";

  if (avatarUrl) {
    const sizePx = size === "xl" ? 80 : size === "lg" ? 80 : size === "md" ? 40 : 36;
    return <Image src={avatarUrl} alt="" width={sizePx} height={sizePx} className={`${className} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-[#fff3cf] font-black text-[#8a6500]`}>
      {name.slice(0, 1)}
    </span>
  );
}

function TimelineActorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full bg-white object-cover" />;
  }

  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[12px] font-black text-[#8a6500]">
      {name.slice(0, 1)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const label = priority === "high" ? "優先対応" : priority === "medium" ? "要確認" : "通常";
  const className =
    priority === "high"
      ? "bg-[#fff0ed] text-[#d63c2f]"
      : priority === "medium"
        ? "bg-[#fff3cf] text-[#8a6500]"
        : "bg-[#edf7f0] text-[#16834f]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${className}`}>{label}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
      <h3 className="text-[16px] font-black text-[#171717]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function KeywordList({ meetings }: { meetings: MeetingRecord[] }) {
  const keywords = buildKeywords(meetings).slice(0, 5);
  if (keywords.length === 0) {
    return <EmptyState title="ワード集計は準備中です" body="文字起こしや会話ログが蓄積されると、頻出ワードを表示します。" />;
  }

  return (
    <div className="space-y-2">
      {keywords.map((keyword, index) => (
        <div key={keyword.word} className="flex items-center gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black text-[#171717]">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#343b48]">{keyword.word}</span>
          <span className="text-[12px] text-[#8a909b]">{keyword.count}回</span>
        </div>
      ))}
    </div>
  );
}

function CustomerWordList({ meetings }: { meetings: MeetingRecord[] }) {
  const words = buildCustomerWords(meetings).slice(0, 8);
  if (words.length === 0) {
    return <EmptyState title="顧客ワードはまだありません" body="話者分離済みの顧客発話が増えると、顧客側の頻出ワードを表示します。" />;
  }

  return (
    <div className="space-y-2">
      {words.map((word, index) => (
        <div key={word.word} className="flex items-center gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff3cf] text-[12px] font-black text-[#8a6500]">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#343b48]">{word.word}</span>
          <span className="text-[12px] text-[#8a909b]">{word.count}回</span>
        </div>
      ))}
    </div>
  );
}

function ProductManualAchievement({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["productRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="基準達成データはまだありません" body="マニュアルチェック済みの商談やロープレが増えると、商材別の達成度を表示します。" />;
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row) => (
        <div key={row.productName} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
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

function MissingManualList({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["missingRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="未達項目はまだありません" body="マニュアルチェックが保存されると、よく抜ける基準を表示します。" />;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => (
        <div key={`${row.category}-${row.label}`} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
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

function RoleplayMeetingGapList({ rows }: { rows: ReturnType<typeof buildManualInsightSummary>["gapRows"] }) {
  if (rows.length === 0) {
    return <EmptyState title="差分はまだありません" body="同じ基準の商談・ロープレ結果が揃うと、ロープレとのギャップを表示します。" />;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => (
        <div key={`${row.productName}-${row.label}`} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
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

function AnalyticsPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-[12px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 text-center">
      <div>
        <h3 className="text-[16px] font-black text-[#171717]">{title}</h3>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
      </div>
    </div>
  );
}

function TrendBars({ rows }: { rows: Array<{ label: string; meetingCount: number; winRate: number }> }) {
  if (rows.length === 0) {
    return <AnalyticsPlaceholder title="推移データはまだありません" body="商談結果が蓄積されると、成約率の推移を表示します。" />;
  }

  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const diff = previous ? Math.round((latest.winRate - previous.winRate) * 10) / 10 : null;
  const totalMeetings = rows.reduce((sum, row) => sum + row.meetingCount, 0);

  return (
    <div className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-[#8a909b]">最新月の成約率</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-[30px] font-black tracking-[-0.03em] text-[#171717]">{latest.winRate}%</span>
            {diff !== null ? (
              <span className={`mb-1 rounded-full px-2 py-1 text-[11px] font-black ${diff >= 0 ? "bg-[#edf7f0] text-[#16834f]" : "bg-[#fff0ed] text-[#d63c2f]"}`}>
                {diff >= 0 ? "+" : ""}{diff}pt
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-[10px] border border-[#eef1f5] bg-white px-3 py-2 text-right">
          <div className="text-[11px] font-bold text-[#8a909b]">対象商談</div>
          <div className="mt-0.5 text-[16px] font-black text-[#343b48]">{totalMeetings}件</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[54px_minmax(0,1fr)_52px] items-center gap-3">
            <div className="text-[12px] font-black text-[#596273]">{row.label.slice(5)}</div>
            <div className="h-8 overflow-hidden rounded-[9px] bg-[#edf0f5]">
              <div
                className={`flex h-full min-w-[34px] items-center justify-end rounded-[9px] px-2 text-[11px] font-black ${row.winRate >= 30 ? "bg-[#23a96d] text-white" : "bg-[#ffd84d] text-[#171717]"}`}
                style={{ width: `${Math.min(row.winRate, 100)}%` }}
              >
                {row.winRate}%
              </div>
            </div>
            <div className="text-right text-[12px] font-bold text-[#8a909b]">{row.meetingCount}件</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ActivityTimelineRow = {
  id: string;
  userId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
  type: SalesActivityType | "knowledge_updated";
  title: string;
  summary: string;
  href: string | null;
  createdAt: Date | null;
};

function RecentActivityCard({
  events,
  knowledgeItems,
  users,
}: {
  events: SalesActivityEvent[];
  knowledgeItems: KnowledgeItem[];
  users: AppUserProfile[];
}) {
  const userById = new Map(users.map((user) => [user.uid, user]));
  const activityRows: ActivityTimelineRow[] = [
    ...events.map((event) => ({
      id: event.id,
      userId: event.userId,
      actorName: null,
      actorAvatarUrl: null,
      type: event.type,
      title: event.title,
      summary: event.summary,
      href: event.href,
      createdAt: event.createdAt,
    })),
    ...knowledgeItems
      .filter((item) => item.updatedAt)
      .map((item) => ({
        id: `knowledge-${item.id}`,
        userId: item.ownerId,
        actorName: item.ownerId ? null : SELMO_OPERATION_ACTOR.name,
        actorAvatarUrl: item.ownerId ? null : SELMO_OPERATION_ACTOR.avatarUrl,
        type: "knowledge_updated" as const,
        title: "ナレッジ更新",
        summary: item.title,
        href: `/admin/knowledge/${item.id}`,
        createdAt: item.updatedAt,
      })),
  ];
  const latestRows = activityRows
    .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))
    .slice(0, 30);
  const counts = {
    meeting: events.filter((event) => event.type === "meeting_uploaded" || event.type === "transcript_pasted").length,
    roleplay: events.filter((event) => event.type === "roleplay_completed").length,
    knowledge: events.filter((event) => event.type === "knowledge_searched").length + knowledgeItems.filter((item) => item.updatedAt).length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="grid gap-3 md:grid-cols-3">
        <ActivitySummary label="アップロード" value={`${counts.meeting}件`} tone="meeting" />
        <ActivitySummary label="ロープレ" value={`${counts.roleplay}件`} tone="roleplay" />
        <ActivitySummary label="ナレッジ" value={`${counts.knowledge}件`} tone="knowledge" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd]">
        <div className="shrink-0 border-b border-[#eef1f5] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-black text-[#171717]">活動タイムライン</div>
            <div className="mt-0.5 text-[12px] font-bold text-[#8a909b]">アップロード、ロープレ、ナレッジ利用を時系列で確認</div>
          </div>
          <div className="text-[12px] font-bold text-[#8a909b]">最新 {latestRows.length}件</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {latestRows.length > 0 ? (
            latestRows.map((event) => {
              const user = event.userId ? userById.get(event.userId) : null;
              const actorName = event.actorName ?? user?.name ?? "未設定の営業";
              const actorAvatarUrl = event.actorAvatarUrl ?? user?.avatarUrl ?? null;
              const content = (
                <div className="grid min-w-[860px] grid-cols-[170px_112px_minmax(0,1fr)_128px_64px] items-center gap-3 border-b border-[#f0f2f6] px-4 py-2.5 transition last:border-b-0 hover:bg-white">
                  <div className="flex min-w-0 items-center gap-2">
                    <TimelineActorAvatar name={actorName} avatarUrl={actorAvatarUrl} />
                    <div className="min-w-0 truncate text-[12px] font-black text-[#171717]">{actorName}</div>
                  </div>
                  <div className="min-w-0">
                    <ActivityTypeBadge type={event.type} />
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="shrink-0 truncate text-[12px] font-black text-[#343b48]">{event.title}</div>
                    <div className="min-w-0 truncate text-[12px] font-bold text-[#8a909b]">{event.summary}</div>
                  </div>
                  <div className="truncate text-[11px] font-bold text-[#8a909b]">{formatDateTime(event.createdAt)}</div>
                  <div className="flex justify-end">
                    {event.href ? (
                      <span className="rounded-[9px] border border-[#e2e6ee] bg-white px-2.5 py-1 text-[11px] font-black text-[#343b48]">
                        詳細
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-[#c0c6d0]">-</span>
                    )}
                  </div>
                </div>
              );

              return event.href ? (
                <Link key={event.id} href={event.href} className="block min-w-0">
                  {content}
                </Link>
              ) : (
                <article key={event.id}>{content}</article>
              );
            })
          ) : (
            <div className="px-4 py-10 text-center">
              <div className="text-[15px] font-black text-[#171717]">活動ログはまだありません</div>
              <p className="mt-2 text-[13px] leading-6 text-[#8a909b]">
                営業メンバーがアップロード、ロープレ、ナレッジ検索を行うとここに表示されます。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivitySummary({ label, value, tone }: { label: string; value: string; tone: "meeting" | "roleplay" | "knowledge" }) {
  const className =
    tone === "roleplay"
      ? "bg-[#edf7f0] text-[#16834f]"
      : tone === "knowledge"
        ? "bg-[#eef6ff] text-[#2672d9]"
        : "bg-[#fff3cf] text-[#8a6500]";

  return (
    <div className="rounded-[12px] border border-[#eef1f5] bg-white px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">{value}</div>
        <span className={`h-3 w-3 rounded-full ${className}`} />
      </div>
    </div>
  );
}

function ActivityTypeBadge({ type }: { type: ActivityTimelineRow["type"] }) {
  const className =
    type === "knowledge_searched" || type === "knowledge_updated"
      ? "bg-[#eef6ff] text-[#2672d9]"
      : type === "roleplay_completed"
        ? "bg-[#edf7f0] text-[#16834f]"
        : type === "ai_analysis_completed"
          ? "bg-[#fff5d8] text-[#8a6500]"
          : "bg-[#f1f2f5] text-[#596273]";

  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{readActivityLabel(type)}</span>;
}

function readActivityLabel(type: ActivityTimelineRow["type"]) {
  if (type === "meeting_uploaded") return "アップロード";
  if (type === "transcript_pasted") return "貼り付け";
  if (type === "knowledge_searched") return "ナレッジ";
  if (type === "knowledge_updated") return "ナレッジ更新";
  if (type === "roleplay_completed") return "ロープレ";
  return "分析結果";
}

function PerformanceMap({ rows }: { rows: ReturnType<typeof buildRepRows> }) {
  const maxMeetings = Math.max(...rows.map((item) => item.meetingCount), 1);
  const sortedRows = [...rows].sort((left, right) => {
    if (left.coachingPriority !== right.coachingPriority) {
      const weight = { high: 0, medium: 1, low: 2 } as const;
      return weight[left.coachingPriority] - weight[right.coachingPriority];
    }
    return right.meetingCount - left.meetingCount;
  });
  const plottedRows = sortedRows.slice(0, 8);
  const featured = sortedRows.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="relative h-[320px] overflow-hidden rounded-[12px] border border-[#eef1f5] bg-[#fffdf7] px-4 py-4">
        <div className="absolute inset-x-10 top-1/2 h-px bg-[#ead8a8]" />
        <div className="absolute bottom-12 top-8 left-1/2 w-px bg-[#ead8a8]" />
        <div className="absolute left-4 top-4 text-[11px] font-black text-[#8a909b]">成約率</div>
        <div className="absolute bottom-4 right-5 text-[11px] font-black text-[#8a909b]">商談数</div>
        <div className="absolute left-5 top-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#596273] shadow-sm">成約率は高い / 商談数は少ない</div>
        <div className="absolute right-5 top-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#16834f] shadow-sm">高パフォーマンス</div>
        <div className="absolute bottom-12 left-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#d63c2f] shadow-sm">改善が必要</div>
        <div className="absolute bottom-12 right-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#2672d9] shadow-sm">商談数は多い / 成約率は低い</div>
        {[25, 50, 75].map((value) => (
          <div key={value} className="absolute left-10 right-8 h-px bg-[#f0e3c1]/70" style={{ top: `${92 - value * 0.72}%` }} />
        ))}
        {plottedRows.map((row, index) => {
          const baseX = Math.min((row.meetingCount / maxMeetings) * 76 + 12, 90);
          const baseY = 88 - Math.min(row.winRate ?? 0, 100) * 0.72;
          const samePointRows = plottedRows.filter((item) => item.meetingCount === row.meetingCount && (item.winRate ?? 0) === (row.winRate ?? 0));
          const samePointIndex = plottedRows
            .slice(0, index)
            .filter((item) => item.meetingCount === row.meetingCount && (item.winRate ?? 0) === (row.winRate ?? 0)).length;
          const offsetIndex = samePointIndex - (samePointRows.length - 1) / 2;
          const offsetX = samePointRows.length > 1 ? offsetIndex * 4 : 0;
          const offsetY = samePointRows.length > 1 ? (samePointIndex % 2 === 0 ? -2 : 2) : 0;
          const x = Math.max(8, Math.min(92, baseX + offsetX));
          const y = Math.max(8, Math.min(92, baseY + offsetY));
          const color = row.tone === "risk" ? "bg-[#ef6658]" : row.tone === "good" ? "bg-[#23a96d]" : "bg-[#f5b400]";
          const alignRight = x > 72;
          return (
            <Link
              key={row.id}
              href={`/admin/members/${row.id}`}
              className="group absolute z-[1] h-3 w-3 rounded-full outline-none transition hover:z-10 focus-visible:z-10"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
              title={`${row.name} 成約率 ${row.winRate ?? "-"}% / 商談 ${row.meetingCount}件`}
            >
              <span className={`block h-3 w-3 rounded-full border border-white shadow-[0_4px_10px_rgba(17,24,39,0.18)] ${color}`} />
              <span
                className={`pointer-events-none absolute top-1/2 hidden min-w-[150px] -translate-y-1/2 rounded-[12px] border border-[#e5e7ed] bg-white px-3 py-2 text-left shadow-[0_10px_24px_rgba(17,24,39,0.16)] group-hover:block group-focus-visible:block ${
                  alignRight ? "right-6" : "left-6"
                }`}
              >
                <span className="block truncate text-[12px] font-black text-[#171717]">{row.name}</span>
                <span className="mt-1 block text-[11px] font-bold text-[#596273]">
                  商談 {row.meetingCount}件 / 成約率 {row.winRate ?? "-"}%
                </span>
                <span className={`mt-1 block text-[11px] font-black ${row.coachingPriority === "high" ? "text-[#d63c2f]" : row.coachingPriority === "medium" ? "text-[#8a6500]" : "text-[#16834f]"}`}>
                  {row.coachingPriority === "high" ? "優先対応" : row.coachingPriority === "medium" ? "確認" : "通常"}
                </span>
              </span>
            </Link>
          );
        })}
        {rows.length > plottedRows.length ? (
          <div className="absolute bottom-4 left-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#8a909b] shadow-sm">
            表示中 {plottedRows.length}/{rows.length}人
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#eef1f5]">
        <div className="grid grid-cols-[minmax(0,1fr)_64px_72px_82px] gap-2 border-b border-[#eef1f5] bg-[#fcfcfd] px-3 py-2 text-[11px] font-black text-[#8a909b]">
          <div>メンバー</div>
          <div className="text-right">商談</div>
          <div className="text-right">成約率</div>
          <div className="text-right">状態</div>
        </div>
        <div className="max-h-[180px] overflow-y-auto">
          {featured.map((row) => (
            <Link
              key={row.id}
              href={`/admin/members/${row.id}`}
              className="grid grid-cols-[minmax(0,1fr)_64px_72px_82px] items-center gap-2 border-b border-[#f0f2f6] bg-white px-3 py-2.5 transition last:border-b-0 hover:bg-[#fffdf7]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={row.name} avatarUrl={row.avatarUrl} size="sm" />
                <span className="truncate text-[13px] font-black text-[#171717]">{row.name}</span>
              </div>
              <div className="text-right text-[13px] font-black text-[#343b48]">{row.meetingCount}件</div>
              <div className={`text-right text-[13px] font-black ${row.tone === "risk" ? "text-[#d63c2f]" : row.tone === "good" ? "text-[#16834f]" : "text-[#343b48]"}`}>
                {row.winRate ?? "-"}%
              </div>
              <div className="flex justify-end">
                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.coachingPriority === "high" ? "bg-[#fff0ed] text-[#d63c2f]" : row.coachingPriority === "medium" ? "bg-[#fff3cf] text-[#8a6500]" : "bg-[#edf7f0] text-[#16834f]"}`}>
                  {row.coachingPriority === "high" ? "優先" : row.coachingPriority === "medium" ? "確認" : "通常"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function RankingList({ rows }: { rows: ReturnType<typeof buildRankingRows> }) {
  if (rows.length === 0) return <EmptyState title="ランキングはまだありません" body="商談結果が蓄積されると表示されます。" />;
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <Link
          key={row.id}
          href={`/admin/members/${row.id}`}
          className="grid gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 transition hover:border-[#ead8a8] hover:bg-[#fffdf7] sm:grid-cols-[minmax(0,1fr)_110px_90px]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-black ${index === 0 ? "bg-[#ffd84d] text-[#171717]" : "bg-white text-[#8a6500]"}`}>
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
              <div className="mt-0.5 text-[12px] font-bold text-[#8a909b]">商談 {row.meetingCount}件</div>
            </div>
          </div>
          <div className="flex items-center sm:justify-end">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-black ${row.tone === "good" ? "bg-[#edf7f0] text-[#16834f]" : row.tone === "risk" ? "bg-[#fff0ed] text-[#d63c2f]" : "bg-[#f1f2f5] text-[#596273]"}`}>
              {row.status}
            </span>
          </div>
          <div className="flex items-center sm:justify-end">
            <span className="text-[18px] font-black tracking-[-0.03em] text-[#171717]">{row.value}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ImprovementList({ row }: { row: ReturnType<typeof buildRepRows>[number] }) {
  const items = row.coachingReasons.length > 0 ? row.coachingReasons : [];
  if (items.length === 0) {
    return <EmptyState title="管理者判断は未登録です" body="メンバー詳細で指導理由や次アクションを保存すると表示されます。" />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div>
            <div className="text-[13px] font-black text-[#343b48]">{item}</div>
            <div className="mt-1 text-[12px] text-[#8a909b]">{row.nextAction}</div>
          </div>
          <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-[12px] font-black text-[#8a6500]">{index === 0 ? "高" : "中"}</span>
        </div>
      ))}
    </div>
  );
}

function ActionList({ row }: { row: ReturnType<typeof buildRepRows>[number] }) {
  const actions = ["指導コメントを書く", "ロープレ課題を割り当てる", "商談レビューを見る", "ナレッジ利用状況を見る"];
  return (
    <div className="space-y-2">
      {actions.map((action, index) => (
        <Link
          key={action}
          href={index === 0 || index === 2 ? `/admin/members/${row.id}` : index === 3 ? "/admin/knowledge" : "/admin/roleplay"}
          className={`block rounded-[10px] border px-4 py-3 text-[13px] font-black transition ${index === 0 ? "border-[#f0c655] bg-[#ffd84d] text-[#171717] hover:bg-[#ffcf33]" : "border-[#eef1f5] bg-white text-[#343b48] hover:border-[#ead8a8] hover:bg-[#fffdf7]"}`}
        >
          {action}
        </Link>
      ))}
    </div>
  );
}

function NextActionList({ row }: { row: ReturnType<typeof buildRepRows>[number] }) {
  const items = row.nextAction === "管理者アクション未設定" ? [] : [row.nextAction];
  if (items.length === 0) {
    return <EmptyState title="次アクションは未登録です" body="メンバー詳細で管理者アクションを保存すると表示されます。" />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item} className="flex gap-3 rounded-[10px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black text-[#171717]">{index + 1}</span>
          <span className="text-[13px] font-black text-[#343b48]">{item}</span>
        </div>
      ))}
    </div>
  );
}

function LossSummary({ meetings }: { meetings: MeetingRecord[] }) {
  const lostCount = meetings.filter((meeting) => meeting.status === "lost").length;
  const consideringCount = meetings.filter((meeting) => meeting.status === "considering").length;
  const wonCount = meetings.filter((meeting) => meeting.status === "won").length;
  const total = Math.max(meetings.length, 1);
  const rows = [
    { label: "失注", value: lostCount, color: "bg-[#ef6658]" },
    { label: "検討中", value: consideringCount, color: "bg-[#f5b400]" },
    { label: "成約", value: wonCount, color: "bg-[#23a96d]" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between text-[13px] font-bold text-[#343b48]">
            <span>{row.label}</span>
            <span>{row.value}件</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#edf0f5]">
            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(row.value / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreDomainTabs({
  activeDomain,
  onDomainChange,
}: {
  activeDomain: "meeting" | "teleapo";
  onDomainChange: (domain: "meeting" | "teleapo") => void;
}) {
  const tabs: Array<{ value: "meeting" | "teleapo"; label: string }> = [
    { value: "meeting", label: "商談" },
    { value: "teleapo", label: "テレアポ" },
  ];

  return (
    <div className="mb-4 inline-flex w-full items-center gap-1 rounded-[10px] border border-[#e3e7ee] bg-white p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onDomainChange(tab.value)}
          className={`h-9 flex-1 rounded-[8px] px-3 text-[12px] font-black transition ${
            activeDomain === tab.value ? "bg-[#ffd84d] text-[#171717] shadow-sm" : "text-[#596273] hover:bg-[#fff7d8] hover:text-[#8a6500]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function MeetingScoreCard({
  meetings,
  activeDomain,
  onDomainChange,
}: {
  meetings: MeetingRecord[];
  activeDomain: "meeting" | "teleapo";
  onDomainChange: (domain: "meeting" | "teleapo") => void;
}) {
  const domainMeetings = meetings.filter((meeting) => meeting.salesDomain === activeDomain);
  const scoredMeetings = domainMeetings
    .map((meeting) => ({
      meeting,
      score: calcMeetingScore(meeting),
      rows: getMeetingScoreRows(meeting),
    }))
    .filter((item): item is { meeting: MeetingRecord; score: number; rows: Array<{ label: string; score: number; description: string }> } => item.score !== null)
    .sort((left, right) => (right.meeting.recordedAt?.getTime() ?? 0) - (left.meeting.recordedAt?.getTime() ?? 0));
  const average = scoredMeetings.length > 0
    ? Math.round(scoredMeetings.reduce((sum, item) => sum + item.score, 0) / scoredMeetings.length)
    : null;
  const latest = scoredMeetings[0] ?? null;
  const weakRows = buildWeakMeetingScoreRows(scoredMeetings).slice(0, 4);
  const analyzedCount = domainMeetings.filter((meeting) => meeting.aiSummary).length;
  const emptyLabel = activeDomain === "teleapo" ? "テレアポ" : "商談";

  return (
    <div className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] p-4">
      <ScoreDomainTabs activeDomain={activeDomain} onDomainChange={onDomainChange} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-bold text-[#8a909b]">評価サマリー平均</div>
          <div className="mt-2 text-[36px] font-black tracking-[-0.03em] text-[#171717]">{average === null ? "-" : average}</div>
        </div>
        <div className="rounded-[10px] border border-[#f0e3c1] bg-white px-3 py-2 text-right">
          <div className="text-[11px] font-bold text-[#8a909b]">分析済み</div>
          <div className="mt-1 text-[16px] font-black text-[#8a6500]">{analyzedCount}/{domainMeetings.length}件</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {weakRows.length > 0 ? (
          weakRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-3 text-[12px] font-bold">
                <span className="min-w-0 truncate text-[#343b48]">{row.label}</span>
                <span className={row.score < 70 ? "text-[#d63c2f]" : "text-[#16834f]"}>{row.score}点</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#edf0f5]">
                <div className={`h-full rounded-full ${row.score < 70 ? "bg-[#ef6658]" : "bg-[#ffd84d]"}`} style={{ width: `${Math.min(row.score, 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[10px] border border-dashed border-[#dfe4ec] bg-white px-4 py-5 text-center text-[13px] font-bold text-[#8a909b]">分析済み{emptyLabel}なし</div>
        )}
      </div>

      <div className="mt-4 rounded-[10px] bg-white px-4 py-3 text-[13px] font-bold leading-6 text-[#596273]">
        直近: {latest ? `${latest.meeting.customerName || "未設定"} / ${latest.score}点` : "未分析"}
      </div>
    </div>
  );
}

function calcMeetingScore(meeting: MeetingRecord) {
  const evaluationRows = getMeetingScoreRows(meeting);
  if (evaluationRows.length > 0) {
    return Math.round(evaluationRows.reduce((sum, row) => sum + row.score, 0) / evaluationRows.length);
  }

  const complianceScore = meeting.aiSummary?.manualCompliance?.score;
  if (typeof complianceScore === "number") return Math.round(complianceScore);

  const considerationScore = meeting.aiSummary?.diagnosis?.consideration?.score;
  return typeof considerationScore === "number" ? Math.round(considerationScore) : null;
}

function getMeetingScoreRows(meeting: MeetingRecord) {
  return (meeting.aiSummary?.diagnosis?.salesEvaluation ?? [])
    .map((item) => ({
      label: meeting.salesDomain === "teleapo" && item.label === "クロージング" ? "アポ打診" : item.label,
      score: Math.round(item.score),
      description: item.description,
    }))
    .filter((item) => item.label && Number.isFinite(item.score));
}

function buildWeakMeetingScoreRows(scoredMeetings: Array<{ rows: Array<{ label: string; score: number; description: string }> }>) {
  const grouped = new Map<string, number[]>();
  scoredMeetings.forEach((item) => {
    item.rows.forEach((row) => {
      grouped.set(row.label, [...(grouped.get(row.label) ?? []), row.score]);
    });
  });

  return Array.from(grouped.entries())
    .map(([label, scores]) => ({
      label,
      score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    }))
    .sort((left, right) => left.score - right.score);
}

function MeetingReviewFocusList({ meetings }: { meetings: MeetingRecord[] }) {
  const rows = buildMeetingReviewFocusRows(meetings).slice(0, 5);

  if (rows.length === 0) {
    return <EmptyState title="注目ポイントはまだありません" body="商談分析が増えると、優先して見るべき改善点を表示します。" />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <Link
          key={`${row.meetingId}-${row.title}-${row.detail}`}
          href={`/admin/meetings/${row.meetingId}`}
          className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-black text-[#171717]">{row.customerName}</div>
              <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{row.date} ・ {row.productType}</div>
            </div>
            <StatusBadge tone={row.tone} label={row.statusLabel} />
          </div>
          <div className="mt-3 rounded-[10px] bg-white px-3 py-2">
            <div className="text-[12px] font-black text-[#8a6500]">{row.title}</div>
            <div className="mt-1 line-clamp-2 text-[12px] font-bold leading-5 text-[#596273]">{row.detail}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function buildMeetingReviewFocusRows(meetings: MeetingRecord[]) {
  return [...meetings]
    .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0))
    .flatMap((meeting) => {
      const compliance = meeting.aiSummary?.manualCompliance;
      const lowestEvaluation = getMeetingScoreRows(meeting).sort((left, right) => left.score - right.score)[0] ?? null;
      const base = {
        meetingId: meeting.id,
        customerName: meeting.customerName || "未設定",
        productType: meeting.productType || "未設定",
        date: formatShortDate(meeting.recordedAt),
        statusLabel: getOutcomeLabel(meeting.status),
        tone: getOutcomeTone(meeting.status),
      };
      const rows: Array<typeof base & { title: string; detail: string }> = [];

      if (compliance?.missingCriteria?.[0]) {
        rows.push({ ...base, title: "未達項目", detail: compliance.missingCriteria[0] });
      }
      if (compliance?.improvementPhrases?.[0]) {
        rows.push({ ...base, title: "改善フレーズ", detail: compliance.improvementPhrases[0] });
      }
      if (lowestEvaluation) {
        rows.push({
          ...base,
          title: `${lowestEvaluation.label}を確認`,
          detail: `${lowestEvaluation.score}点: ${lowestEvaluation.description || "評価が低い項目です。"}`,
        });
      }
      return rows.slice(0, 2);
    });
}

function CustomerManagementLog({
  customers,
  logs,
}: {
  customers: CustomerRecord[];
  logs: CustomerLogRecord[];
}) {
  const rows = buildCustomerRowsFromCustomers(customers, logs).slice(0, 8);

  if (rows.length === 0) {
    return <EmptyState title="顧客ログはまだありません" body="顧客カルテや商談が登録されると、顧客ごとの最終接点と次アクションを表示します。" />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid gap-3 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 md:grid-cols-[minmax(0,1fr)_120px]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-[13px] font-black text-[#171717]">{row.customerName}</div>
              <StatusBadge tone={row.tone} label={row.statusLabel} />
            </div>
            <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{row.date} ・ {row.productType}</div>
            <div className="mt-2 line-clamp-2 text-[12px] font-bold leading-5 text-[#596273]">{row.log}</div>
          </div>
          <div className="flex items-center md:justify-end">
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <span className={`rounded-full px-3 py-1 text-[12px] font-black ${row.actionTone === "risk" ? "bg-[#fff0ed] text-[#d63c2f]" : row.actionTone === "good" ? "bg-[#edf7f0] text-[#16834f]" : "bg-[#fff3cf] text-[#8a6500]"}`}>
                {row.actionLabel}
              </span>
              <Link href={`/admin/customers/${row.id}`} className="rounded-[9px] border border-[#ead8a8] bg-white px-3 py-2 text-[12px] font-black text-[#8a6500]">
                詳細
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCustomerRowsFromCustomers(customers: CustomerRecord[], logs: CustomerLogRecord[]) {
  const latestLogByCustomer = new Map<string, CustomerLogRecord>();
  logs.forEach((log) => {
    const current = latestLogByCustomer.get(log.customerId);
    const currentTime = current?.actionDate?.getTime() ?? current?.createdAt?.getTime() ?? 0;
    const nextTime = log.actionDate?.getTime() ?? log.createdAt?.getTime() ?? 0;
    if (!current || nextTime > currentTime) latestLogByCustomer.set(log.customerId, log);
  });

  return [...customers]
    .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0))
    .map((customer) => {
      const latestLog = latestLogByCustomer.get(customer.id);
      const overdue = isCustomerActionOverdue(customer);
      return {
        id: customer.id,
        customerName: customer.companyName || "未設定",
        productType: customer.productNames.join(" / ") || customer.industry || customer.contractPlan || "顧客カルテ",
        date: formatShortDate(customer.lastContactDate ?? latestLog?.actionDate ?? latestLog?.createdAt ?? customer.updatedAt),
        statusLabel: readCustomerStatusLabel(customer.status),
        tone: customer.status === "contracted" ? "good" as const : customer.status === "lost" || overdue ? "risk" as const : "normal" as const,
        actionLabel: overdue ? "期限超過" : customer.nextActionTitle ? "次回予定" : readCustomerContractStatusLabel(customer.contractStatus),
        actionTone: overdue ? "risk" as const : customer.contractStatus === "contracted" || customer.isContracted ? "good" as const : customer.contractStatus === "needs_consultation" ? "risk" as const : "normal" as const,
        log: latestLog ? `${readCustomerLogTypeLabel(latestLog.type)}: ${latestLog.title}` : customer.nextActionTitle || customer.memo || "ログ未登録",
      };
    });
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

function readCustomerContractStatusLabel(status: CustomerRecord["contractStatus"]) {
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

function isCustomerActionOverdue(customer: CustomerRecord) {
  if (!customer.nextActionDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return customer.nextActionDate.getTime() < today.getTime() && customer.status !== "contracted";
}

function RoleplayScoreCard({
  results,
  activeDomain,
  onDomainChange,
}: {
  results: RoleplayResult[];
  activeDomain: "meeting" | "teleapo";
  onDomainChange: (domain: "meeting" | "teleapo") => void;
}) {
  const domainResults = results.filter((result) => result.roleplayType === activeDomain);
  const latest = [...domainResults].sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))[0] ?? null;
  const average = domainResults.length > 0 ? Math.round(domainResults.reduce((sum, result) => sum + result.score, 0) / domainResults.length) : null;
  const scenarioScores = buildRoleplayScenarioScores(domainResults).slice(0, 5);
  const emptyLabel = activeDomain === "teleapo" ? "テレアポロープレ" : "商談ロープレ";
  return (
    <div className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] p-4">
      <ScoreDomainTabs activeDomain={activeDomain} onDomainChange={onDomainChange} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-bold text-[#8a909b]">平均スコア</div>
          <div className="mt-2 text-[36px] font-black tracking-[-0.03em] text-[#171717]">{average === null ? "-" : average}</div>
        </div>
        <div className="rounded-[10px] border border-[#f0e3c1] bg-white px-3 py-2 text-right">
          <div className="text-[11px] font-bold text-[#8a909b]">実施</div>
          <div className="mt-1 text-[16px] font-black text-[#8a6500]">{domainResults.length}回</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {scenarioScores.length > 0 ? (
          scenarioScores.map((row) => (
            <div key={row.title}>
              <div className="flex items-center justify-between gap-3 text-[12px] font-bold">
                <span className="min-w-0 truncate text-[#343b48]">{row.title}</span>
                <span className={row.score < 70 ? "text-[#d63c2f]" : "text-[#16834f]"}>{row.score}点</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#edf0f5]">
                <div className={`h-full rounded-full ${row.score < 70 ? "bg-[#ef6658]" : "bg-[#ffd84d]"}`} style={{ width: `${Math.min(row.score, 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[10px] border border-dashed border-[#dfe4ec] bg-white px-4 py-5 text-center text-[13px] font-bold text-[#8a909b]">{emptyLabel}未実施</div>
        )}
      </div>

      <div className="mt-4 rounded-[10px] bg-white px-4 py-3 text-[13px] font-bold leading-6 text-[#596273]">
        直近: {latest ? `${latest.scenarioTitle} / ${latest.score}点` : "未実施"}
      </div>
    </div>
  );
}

function buildRoleplayScenarioScores(results: RoleplayResult[]) {
  const grouped = new Map<string, RoleplayResult[]>();
  results.forEach((result) => {
    grouped.set(result.scenarioTitle, [...(grouped.get(result.scenarioTitle) ?? []), result]);
  });

  return Array.from(grouped.entries())
    .map(([title, scenarioResults]) => ({
      title,
      count: scenarioResults.length,
      score: Math.round(scenarioResults.reduce((sum, result) => sum + result.score, 0) / scenarioResults.length),
      latestAt: scenarioResults
        .map((result) => result.createdAt?.getTime() ?? 0)
        .sort((left, right) => right - left)[0] ?? 0,
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return right.latestAt - left.latestAt;
    });
}

function LatestMeetingTable({ rows }: { rows: ReturnType<typeof buildLatestReviews> }) {
  if (rows.length === 0) return <EmptyState title="直近商談はありません" body="商談が登録されると表示されます。" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
            <th className="px-3 py-3 font-bold">商談日</th>
            <th className="px-3 py-3 font-bold">顧客名</th>
            <th className="px-3 py-3 font-bold">商材</th>
            <th className="px-3 py-3 font-bold">結果</th>
            <th className="px-3 py-3 font-bold">担当</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#f0f2f6] last:border-b-0">
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{row.date}</td>
              <td className="px-3 py-3 text-[13px] font-black text-[#171717]">{row.customerName}</td>
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{row.productType}</td>
              <td className="px-3 py-3"><StatusBadge tone={row.tone} label={row.statusLabel} /></td>
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{row.memberName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildProductRows(products: KnowledgeProduct[], items: KnowledgeItem[]) {
  return products.slice(0, 5).map((product) => ({
    id: product.id,
    name: product.name,
    knowledgeCount: items.filter((item) => item.productId === product.id).length,
  }));
}

function buildRankingRows(rows: ReturnType<typeof buildRepRows>) {
  return [...rows]
    .filter((row) => row.winRate !== null)
    .sort((left, right) => (right.winRate ?? 0) - (left.winRate ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      meetingCount: row.meetingCount,
      status: row.status,
      tone: row.tone,
      value: `${row.winRate}%`,
    }));
}

function buildLatestReviews(meetings: MeetingRecord[], rows: Array<{ id: string; name: string }>, limit = 6) {
  return [...meetings]
    .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((meeting) => ({
      id: meeting.id,
      date: formatShortDate(meeting.recordedAt),
      customerName: meeting.customerName || "未設定",
      productType: meeting.productType || "未設定",
      statusLabel: getOutcomeLabel(meeting.status),
      tone: getOutcomeTone(meeting.status),
      memberName: rows.find((row) => row.id === meeting.userId)?.name ?? "未設定",
    }));
}

function calcWinRate(meetings: MeetingRecord[]) {
  if (meetings.length === 0) return null;
  return Math.round((meetings.filter((meeting) => meeting.status === "won").length / meetings.length) * 1000) / 10;
}

function buildMonthlyTrend(meetings: MeetingRecord[]) {
  const rowsByMonth = new Map<string, MeetingRecord[]>();
  meetings.forEach((meeting) => {
    if (!meeting.recordedAt) return;
    const key = `${meeting.recordedAt.getFullYear()}/${String(meeting.recordedAt.getMonth() + 1).padStart(2, "0")}`;
    rowsByMonth.set(key, [...(rowsByMonth.get(key) ?? []), meeting]);
  });

  return Array.from(rowsByMonth.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([label, monthMeetings]) => ({
      label,
      meetingCount: monthMeetings.length,
      winRate: calcWinRate(monthMeetings) ?? 0,
    }));
}

function buildRepRows(users: AppUserProfile[], meetings: MeetingRecord[], results: RoleplayResult[]) {
  return users.map((user) => {
    const userMeetings = meetings.filter((meeting) => meeting.userId === user.uid);
    const wonCount = userMeetings.filter((meeting) => meeting.status === "won").length;
    const lostCount = userMeetings.filter((meeting) => meeting.status === "lost").length;
    const unanalyzedCount = userMeetings.filter((meeting) => !meeting.aiSummary).length;
    const analyzedCount = userMeetings.length - unanalyzedCount;
    const durations = userMeetings
      .map((meeting) => meeting.audioDurationSec)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const avgDurationMin = durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60)
      : null;
    const userResults = results.filter((result) => result.userId === user.uid);
    const lowRoleplayCount = userResults.filter((result) => result.score < 70).length;
    const latestActivityAt = [
      ...userMeetings.map((meeting) => meeting.recordedAt),
      ...userResults.map((result) => result.createdAt),
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const winRate = userMeetings.length > 0 ? Math.round((wonCount / userMeetings.length) * 1000) / 10 : null;
    const averageScore = userResults.length > 0 ? Math.round(userResults.reduce((sum, result) => sum + result.score, 0) / userResults.length) : null;
    const coachingReasons = user.adminCoachingReason ? [user.adminCoachingReason] : [];
    const needsCoaching = user.adminCoachingStatus === "needs_coaching";
    const coachingPriority: "high" | "medium" | "low" =
      user.adminCoachingStatus === "none" ? "low" : user.adminCoachingPriority;
    const tone: "good" | "normal" | "risk" =
      coachingPriority === "high"
        ? "risk"
        : averageScore !== null && averageScore >= 80 && lostCount === 0
          ? "good"
          : "normal";
    const nextAction = user.adminNextActionTitle || "管理者アクション未設定";

    return {
      id: user.uid,
      name: user.name ?? "未設定",
      email: user.email ?? "",
      avatarUrl: user.avatarUrl ?? null,
      workExperienceLabel: formatWorkExperience(user),
      meetingCount: userMeetings.length,
      lostCount,
      unanalyzedCount,
      analyzedCount,
      avgDurationMin,
      winRate,
      roleplayCount: userResults.length,
      lowRoleplayCount,
      averageScore,
      tone,
      status: user.adminCoachingStatus === "needs_coaching" ? "指導必要" : user.adminCoachingStatus === "watch" ? "要確認" : "通常",
      latestActivity: formatShortDate(latestActivityAt),
      nextAction,
      needsCoaching,
      coachingPriority,
      coachingReasons,
    };
  }).sort((left, right) => {
    const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
    if (left.needsCoaching !== right.needsCoaching) {
      return left.needsCoaching ? -1 : 1;
    }
    if (priorityWeight[left.coachingPriority] !== priorityWeight[right.coachingPriority]) {
      return priorityWeight[left.coachingPriority] - priorityWeight[right.coachingPriority];
    }
    return right.lostCount - left.lostCount;
  });
}

function buildKeywords(meetings: MeetingRecord[]) {
  const counts = new Map<string, number>();
  const words = ["価格", "料金", "検討", "導入", "比較", "予算", "サポート", "難しい", "高い"];

  meetings.forEach((meeting) => {
    const text = [
      meeting.customerName,
      meeting.productType,
      meeting.transcriptionProbeText,
      ...(meeting.conversationLogs?.map((log) => log.text) ?? []),
    ].join(" ");

    words.forEach((word) => {
      const count = text.split(word).length - 1;
      if (count > 0) counts.set(word, (counts.get(word) ?? 0) + count);
    });
  });

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count);
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

function formatShortDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatWorkExperience(user: Pick<AppUserProfile, "workExperienceYears" | "workExperienceMonths">) {
  if (user.workExperienceYears === null && user.workExperienceMonths === null) return "未設定";
  const totalMonths = (user.workExperienceYears ?? 0) * 12 + (user.workExperienceMonths ?? 0);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}ヶ月`;
  if (months === 0) return `${years}年`;
  return `${years}年${months}ヶ月`;
}

function getOutcomeLabel(status: string) {
  if (status === "won") return "成約";
  if (status === "lost") return "失注";
  if (status === "considering") return "検討中";
  return "未設定";
}

function getOutcomeTone(status: string): "good" | "normal" | "risk" {
  if (status === "won") return "good";
  if (status === "lost") return "risk";
  return "normal";
}

function UsersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M16 19v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V19" /><circle cx="10" cy="7" r="3" /><path d="M20 19v-1.2a3.4 3.4 0 0 0-2.5-3.3" /><path d="M16.5 4.4a3 3 0 0 1 0 5.2" /></svg>;
}

function MeetingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5Z" /><path d="M5 5.5v16" /><path d="M9 8h6M9 12h6M9 16h3.5" /></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z" /></svg>;
}

function TargetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12h8" /></svg>;
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
}

function RiskIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><path d="m10 8 6 4-6 4Z" /></svg>;
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5Z" /><path d="M5 5.5v16M9 7h7" /></svg>;
}
