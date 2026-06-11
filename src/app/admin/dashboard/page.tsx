"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  subscribeToKnowledgeProducts,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  subscribeToRoleplayResults,
  subscribeToRoleplayScenarios,
  type RoleplayResult,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayScenarios, setRoleplayScenarios] = useState<RoleplayScenario[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "members">("overview");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const adminUserId = users.find((user) => user.role === "admin")?.uid;

  useEffect(() => {
    if (!profile?.companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToUserProfiles(setUsers, handleError, profile.companyId),
      subscribeToMeetings({ role: "admin", userId: "admin", companyId: profile.companyId }, setMeetings, handleError),
      subscribeToKnowledgeProducts(profile?.companyId, setProducts, handleError),
      subscribeToRoleplayScenarios(profile.companyId, setRoleplayScenarios, handleError),
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
  const sharedKnowledgeCount = useMemo(() => knowledgeItems.filter((item) => item.scope === "shared").length, [knowledgeItems]);
  const wonMeetings = useMemo(() => meetings.filter((meeting) => meeting.status === "won").length, [meetings]);
  const winRate = meetings.length > 0 ? Math.round((wonMeetings / meetings.length) * 1000) / 10 : null;
  const analyzedMeetingCount = useMemo(() => meetings.filter((meeting) => meeting.aiSummary).length, [meetings]);
  const roleplayAverage = useMemo(() => {
    if (roleplayResults.length === 0) return null;
    return Math.round(roleplayResults.reduce((sum, result) => sum + result.score, 0) / roleplayResults.length);
  }, [roleplayResults]);
  const productRows = useMemo(() => buildProductRows(products, knowledgeItems), [knowledgeItems, products]);
  const repRows = useMemo(() => buildRepRows(activeSalesUsers, meetings, roleplayResults), [activeSalesUsers, meetings, roleplayResults]);
  const attentionRows = useMemo(() => repRows.filter((row) => row.needsCoaching).slice(0, 6), [repRows]);
  const selectedRep = useMemo(
    () => repRows.find((row) => row.id === selectedMemberId) ?? repRows[0] ?? null,
    [repRows, selectedMemberId],
  );
  const selectedMeetings = useMemo(
    () => selectedRep ? meetings.filter((meeting) => meeting.userId === selectedRep.id) : [],
    [meetings, selectedRep],
  );
  const selectedResults = useMemo(
    () => selectedRep ? roleplayResults.filter((result) => result.userId === selectedRep.id) : [],
    [roleplayResults, selectedRep],
  );
  const alertRows = useMemo(() => buildAlertRows(repRows, meetings), [meetings, repRows]);
  const rankingRows = useMemo(() => buildRankingRows(repRows), [repRows]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(meetings), [meetings]);
  const roleplayUsageRate = activeSalesUsers.length > 0
    ? Math.round((new Set(roleplayResults.map((result) => result.userId)).size / activeSalesUsers.length) * 100)
    : null;

  useEffect(() => {
    if (!selectedMemberId && repRows[0]) {
      setSelectedMemberId(repRows[0].id);
    }
  }, [repRows, selectedMemberId]);

  return (
    <main className="min-h-screen bg-[#f5f5f6] px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8a6500]">MANAGER DASHBOARD</p>
            <h1 className="mt-1 text-[32px] font-black tracking-[-0.04em] text-[#171717] md:text-[34px]">
              ダッシュボード
            </h1>
            <p className="mt-2 text-[14px] leading-7 text-[#596273]">
              チーム全体の営業状況と、ナレッジ・ロープレの運用状況を確認できます。
            </p>
          </div>
          <div className="rounded-full border border-[#e8ebf0] bg-white px-4 py-3 text-[13px] font-bold text-[#596273] shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
            {formatMonthRange(new Date())}
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#eceef4] bg-white p-2 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
          <button
            type="button"
            onClick={() => setViewMode("overview")}
            className={`rounded-[14px] px-4 py-2.5 text-[13px] font-black transition ${
              viewMode === "overview" ? "bg-[#171717] text-white" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
            }`}
          >
            総合
          </button>
          <button
            type="button"
            onClick={() => setViewMode("members")}
            className={`rounded-[14px] px-4 py-2.5 text-[13px] font-black transition ${
              viewMode === "members" ? "bg-[#171717] text-white" : "text-[#596273] hover:bg-[#f7f7fa] hover:text-[#171717]"
            }`}
          >
            個別
          </button>
        </div>

        {viewMode === "overview" ? (
          <>
            <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard icon={<UsersIcon />} label="営業マン数" value={`${salesUsers.length}人`} note={`アクティブ: ${activeSalesUsers.length}人`} />
                <KpiCard icon={<MeetingIcon />} label="商談件数" value={`${meetings.length}件`} note={meetings.length > 0 ? "登録済み商談" : "商談データ待ち"} />
                <KpiCard icon={<TargetIcon />} label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "商談なし" : `成約 ${wonMeetings}件`} />
                <KpiCard icon={<SparkIcon />} label="分析済み商談" value={`${analyzedMeetingCount}件`} note={meetings.length > 0 ? `${Math.round((analyzedMeetingCount / meetings.length) * 100)}% 分析済み` : "商談データ待ち"} />
                <KpiCard icon={<BookIcon />} label="共有ナレッジ" value={`${sharedKnowledgeCount}件`} note={`商品: ${products.length}件 / 全体: ${knowledgeItems.length}件`} />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.95fr)_minmax(320px,0.7fr)]">
              <Panel title="指導必要ユーザー" actionLabel="営業マン一覧へ" href="/admin/members">
                {attentionRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left">
                      <thead>
                        <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                          <th className="px-3 py-3 font-bold">メンバー</th>
                          <th className="px-3 py-3 font-bold">状態</th>
                          <th className="px-3 py-3 font-bold">主な理由</th>
                          <th className="px-3 py-3 font-bold">直近指標</th>
                          <th className="px-3 py-3 font-bold">最終商談</th>
                          <th className="px-3 py-3 font-bold"></th>
                        </tr>
                      </thead>
                      <tbody>
                    {attentionRows.map((row) => (
                      <tr key={row.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <MemberAvatar name={row.name} avatarUrl={row.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-black text-[#171717]">{row.name}</div>
                              <div className="truncate text-[11px] text-[#8a909b]">{row.workExperienceLabel}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><PriorityBadge priority={row.coachingPriority} /></td>
                        <td className="px-3 py-3 text-[12px] font-bold text-[#343b48]">{row.coachingReasons[0] ?? row.nextAction}</td>
                        <td className="px-3 py-3 text-[12px] font-bold text-[#343b48]">成率 {row.winRate === null ? "-" : `${row.winRate}%`}</td>
                        <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{row.latestActivity}</td>
                        <td className="px-3 py-3">
                          <Link href={`/admin/members/${row.id}`} className="text-[13px] font-black text-[#8a6500]">›</Link>
                        </td>
                      </tr>
                    ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="指導が必要なユーザーはいません" body="失注・未分析・低スコアのロープレが見つかると、ここに優先表示されます。" />
                )}
              </Panel>

              <Panel title="営業パフォーマンス分布">
                {repRows.length > 0 ? <PerformanceMap rows={repRows} /> : <EmptyState title="分布データはまだありません" body="営業メンバーと商談結果が蓄積されると表示します。" />}
              </Panel>

              <div className="space-y-6">
                <Panel title="今週のアラート">
                  <div className="space-y-3">
                    {alertRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
                        <span className="text-[13px] font-black text-[#343b48]">{row.label}</span>
                        <span className="text-[22px] font-black tracking-[-0.04em] text-[#171717]">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="営業ランキング">
                  <RankingList rows={rankingRows} />
                </Panel>
              </div>
            </section>
          </>
        ) : (
          <section className="mt-8">
            {selectedRep ? (
              <>
                <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
                  <article className="rounded-[24px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
                    <select
                      value={selectedRep.id}
                      onChange={(event) => setSelectedMemberId(event.target.value)}
                      className="mb-5 h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-black text-[#343b48] outline-none focus:border-[#e0bd4b]"
                    >
                      {repRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                    </select>
                    <div className="flex items-center gap-4">
                      <MemberAvatar name={selectedRep.name} avatarUrl={selectedRep.avatarUrl} size="lg" />
                      <div className="min-w-0">
                        <div className="truncate text-[24px] font-black tracking-[-0.04em] text-[#171717]">{selectedRep.name}</div>
                        <div className="mt-1 text-[13px] font-bold text-[#596273]">{selectedRep.workExperienceLabel}</div>
                        <div className="mt-1 truncate text-[12px] text-[#8a909b]">{selectedRep.email}</div>
                      </div>
                    </div>
                    <div className="mt-5">
                      <StatusBadge tone={selectedRep.tone} label={selectedRep.status} />
                    </div>
                  </article>

                  <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <KpiCard icon={<TargetIcon />} label="成約率" value={selectedRep.winRate === null ? "-" : `${selectedRep.winRate}%`} note="本人の商談結果" />
                    <KpiCard icon={<MeetingIcon />} label="商談数" value={`${selectedRep.meetingCount}件`} note={`分析済み ${selectedRep.analyzedCount}件`} />
                    <KpiCard icon={<RiskIcon />} label="失注率" value={selectedRep.meetingCount === 0 ? "-" : `${Math.round((selectedRep.lostCount / selectedRep.meetingCount) * 1000) / 10}%`} note={`失注 ${selectedRep.lostCount}件`} />
                    <KpiCard icon={<ClockIcon />} label="平均商談時間" value={selectedRep.avgDurationMin === null ? "-" : `${selectedRep.avgDurationMin}分`} note="音声データのみ" />
                    <KpiCard icon={<PlayIcon />} label="ロープレ" value={`${selectedRep.roleplayCount}回`} note={`低スコア ${selectedRep.lowRoleplayCount}件`} />
                    <KpiCard icon={<SparkIcon />} label="AI評価" value={selectedRep.averageScore === null ? "-" : `${selectedRep.averageScore}点`} note="ロープレ平均" />
                  </div>
                </div>

                <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)_minmax(320px,0.7fr)]">
                  <Panel title="成約率の推移">
                    <TrendBars rows={buildMonthlyTrend(selectedMeetings)} />
                  </Panel>

                  <Panel title="改善が必要なポイント">
                    <ImprovementList row={selectedRep} />
                  </Panel>

                  <div className="space-y-6">
                    <Panel title="管理者アクション">
                      <ActionList row={selectedRep} />
                    </Panel>
                    <Panel title="次にやるべきアクション">
                      <NextActionList row={selectedRep} />
                    </Panel>
                  </div>
                </section>

                <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
                  <Panel title="失注理由">
                    <LossSummary meetings={selectedMeetings} />
                  </Panel>
                  <Panel title="ロープレスコア">
                    <RoleplayScoreCard results={selectedResults} />
                  </Panel>
                  <Panel title="直近の商談">
                    <LatestMeetingTable rows={buildLatestReviews(selectedMeetings, [selectedRep])} />
                  </Panel>
                </section>
              </>
            ) : (
              <EmptyState title="営業メンバーはまだいません" body="営業メンバーが追加されると、個別の育成状況が表示されます。" />
            )}
          </section>
        )}

        {viewMode === "members" ? (
        <section className="mt-8">
          <Panel title="営業マン別サマリー" actionLabel="一覧を見る" href="/admin/reps">
            {repRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-left">
                  <thead>
                    <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                      <th className="px-4 py-3 font-bold">営業マン</th>
                      <th className="px-4 py-3 font-bold">商談</th>
                      <th className="px-4 py-3 font-bold">失注</th>
                      <th className="px-4 py-3 font-bold">分析済み</th>
                      <th className="px-4 py-3 font-bold">平均商談時間</th>
                      <th className="px-4 py-3 font-bold">成約率</th>
                      <th className="px-4 py-3 font-bold">ロープレ</th>
                      <th className="px-4 py-3 font-bold">平均スコア</th>
                      <th className="px-4 py-3 font-bold">指導理由</th>
                      <th className="px-4 py-3 font-bold">最終活動</th>
                      <th className="px-4 py-3 font-bold">次回対応</th>
                      <th className="px-4 py-3 font-bold">状態</th>
                      <th className="px-4 py-3 font-bold">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.map((row) => (
                      <tr key={row.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <MemberAvatar name={row.name} avatarUrl={row.avatarUrl} size="md" />
                            <div>
                              <div className="text-[14px] font-black text-[#171717]">{row.name}</div>
                              <div className="mt-0.5 text-[12px] text-[#8a909b]">{row.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.meetingCount}件</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.lostCount}件</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.analyzedCount}件</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.avgDurationMin === null ? "-" : `${row.avgDurationMin}分`}</td>
                        <td className="px-4 py-4">
                          <Progress value={row.winRate ?? 0} tone={row.tone} label={row.winRate === null ? "-" : `${row.winRate}%`} />
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.roleplayCount}回</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.averageScore === null ? "-" : `${row.averageScore}点`}</td>
                        <td className="px-4 py-4">
                          {row.coachingReasons.length > 0 ? (
                            <div className="flex max-w-[280px] flex-wrap gap-1.5">
                              {row.coachingReasons.map((reason) => (
                                <span key={reason} className="rounded-full bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                                  {reason}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[13px] font-bold text-[#8a909b]">なし</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#596273]">{row.latestActivity}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.nextAction}</td>
                        <td className="px-4 py-4"><StatusBadge tone={row.tone} label={row.status} /></td>
                        <td className="px-4 py-4">
                          <Link href={`/admin/members/${row.id}`} className="text-[13px] font-bold text-[#2672d9]">
                            個別確認
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="営業ユーザーはまだいません" body="営業メンバーが追加されると、営業マン別の状況が表示されます。" />
            )}
          </Panel>

        </section>
        ) : null}

        {viewMode === "overview" ? (
        <>
        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
          <Panel title="商材別 成約率" actionLabel="商品を見る" href="/admin/products">
            {productRows.length > 0 ? (
              <div className="space-y-3">
                {productRows.map((row) => {
                  const productMeetings = meetings.filter((meeting) => meeting.productType === row.name);
                  const productWinRate = calcWinRate(productMeetings);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-4 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{row.name}</div>
                        <div className="mt-1 text-[12px] text-[#8a909b]">ナレッジ {row.knowledgeCount}件</div>
                      </div>
                      <span className="text-[13px] font-bold text-[#8a6500]">{productWinRate === null ? "商談なし" : `${productWinRate}%`}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="商品はまだありません" body="商品別ナレッジを追加すると、商材別の状況が表示されます。" />
            )}
          </Panel>

          <Panel title="よく出るワード TOP5" actionLabel="商談一覧" href="/admin/meetings">
            <KeywordList meetings={meetings} />
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(360px,0.85fr)]">
          <Panel title="成約率の推移">
            {monthlyTrend.length > 0 ? (
              <TrendBars rows={monthlyTrend} />
            ) : (
              <AnalyticsPlaceholder title="商談データはまだありません" body="商談結果が蓄積されると、月別の成約率を表示します。" />
            )}
          </Panel>

          <Panel title="ロープレ活用状況">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="シナリオ" value={`${roleplayScenarios.length}件`} />
              <MiniMetric label="実施回数" value={`${roleplayResults.length}回`} />
              <MiniMetric label="平均スコア" value={roleplayAverage === null ? "-" : `${roleplayAverage}点`} />
              <MiniMetric label="活用率" value={roleplayUsageRate === null ? "-" : `${roleplayUsageRate}%`} />
            </div>
          </Panel>

          <Panel title="指導コメント">
            <div className="rounded-[18px] border border-[#f0e3c1] bg-[#fffaf0] px-5 py-5">
              <p className="text-[14px] leading-7 text-[#343b48]">
                {buildTeamComment({
                  meetingCount: meetings.length,
                  knowledgeCount: knowledgeItems.length,
                  roleplayCount: roleplayResults.length,
                })}
              </p>
            </div>
          </Panel>
        </section>
        </>
        ) : null}

      </div>
    </main>
  );
}

function KpiCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <article className="rounded-[22px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
      <div className="flex items-center gap-4">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#fff3cf] text-[#f0b400]">
          {icon}
        </span>
        <div>
          <div className="text-[13px] font-bold text-[#343b48]">{label}</div>
          <div className="mt-1 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
          <div className="mt-1 text-[12px] text-[#7a808c]">{note}</div>
        </div>
      </div>
    </article>
  );
}

function Panel({ title, actionLabel, href, children }: { title: string; actionLabel?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#eceef4] bg-white shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
      <div className="flex items-center justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-[18px] font-black text-[#171717]">{title}</h2>
        {actionLabel && href ? (
          <Link href={href} className="rounded-full border border-[#ead8a8] bg-[#fffaf0] px-3 py-1.5 text-[12px] font-black text-[#8a6500] transition hover:bg-[#fff3cd]">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Progress({ value, label, tone }: { value: number; label: string; tone: "good" | "normal" | "risk" }) {
  const color = tone === "good" ? "bg-[#20a66a]" : tone === "risk" ? "bg-[#f24d4d]" : "bg-[#f5b400]";
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-[13px] font-bold text-[#343b48]">{label}</span>
      <div className="h-2 w-28 rounded-full bg-[#edf0f5]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
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
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function MemberAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: "sm" | "md" | "lg" }) {
  const className =
    size === "lg"
      ? "h-20 w-20 text-[28px]"
      : size === "md"
        ? "h-10 w-10 text-[14px]"
        : "h-9 w-9 text-[13px]";

  if (avatarUrl) {
    const sizePx = size === "lg" ? 80 : size === "md" ? 40 : 36;
    return <Image src={avatarUrl} alt="" width={sizePx} height={sizePx} className={`${className} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-[#fff3cf] font-black text-[#8a6500]`}>
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
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
      <h3 className="text-[17px] font-black text-[#171717]">{title}</h3>
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
        <div key={keyword.word} className="flex items-center gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black text-[#171717]">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#343b48]">{keyword.word}</span>
          <span className="text-[12px] text-[#8a909b]">{keyword.count}回</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-[20px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 text-center">
      <div>
        <h3 className="text-[17px] font-black text-[#171717]">{title}</h3>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
      </div>
    </div>
  );
}

function TrendBars({ rows }: { rows: Array<{ label: string; meetingCount: number; winRate: number }> }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-black text-[#171717]">{row.label}</div>
              <div className="mt-1 text-[12px] text-[#8a909b]">{row.meetingCount}件</div>
            </div>
            <span className="text-[13px] font-black text-[#8a6500]">{row.winRate}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#edf0f5]">
            <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${Math.min(row.winRate, 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-2 text-[24px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
    </div>
  );
}

function PerformanceMap({ rows }: { rows: ReturnType<typeof buildRepRows> }) {
  return (
    <div className="relative h-[300px] rounded-[18px] border border-[#eef1f5] bg-[#fffdf7] px-4 py-4">
      <div className="absolute left-1/2 top-4 bottom-10 w-px bg-[#ead8a8]" />
      <div className="absolute left-10 right-4 top-1/2 h-px bg-[#ead8a8]" />
      <span className="absolute left-4 top-4 text-[11px] font-bold text-[#8a909b]">成約率</span>
      <span className="absolute bottom-3 right-4 text-[11px] font-bold text-[#8a909b]">商談数</span>
      {rows.map((row) => {
        const x = Math.min((row.meetingCount / Math.max(...rows.map((item) => item.meetingCount), 1)) * 82 + 10, 92);
        const y = 88 - Math.min(row.winRate ?? 0, 100) * 0.72;
        const color = row.tone === "risk" ? "bg-[#ef6658]" : row.tone === "good" ? "bg-[#23a96d]" : "bg-[#f5b400]";
        return (
          <Link
            key={row.id}
            href={`/admin/members/${row.id}`}
            className={`absolute h-3.5 w-3.5 rounded-full ${color} ring-4 ring-white transition hover:scale-125`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={`${row.name} 成約率 ${row.winRate ?? "-"}% / 商談 ${row.meetingCount}件`}
          />
        );
      })}
      <div className="absolute left-4 top-8 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#596273]">成約率は高いが商談数が少ない</div>
      <div className="absolute bottom-8 left-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#d63c2f]">改善が必要</div>
      <div className="absolute right-4 top-8 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#16834f]">高パフォーマンス</div>
    </div>
  );
}

function RankingList({ rows }: { rows: ReturnType<typeof buildRankingRows> }) {
  if (rows.length === 0) return <EmptyState title="ランキングはまだありません" body="商談結果が蓄積されると表示されます。" />;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <Link key={row.id} href={`/admin/members/${row.id}`} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-5 text-[13px] font-black text-[#8a6500]">{index + 1}</span>
            <span className="truncate text-[13px] font-black text-[#343b48]">{row.name}</span>
          </div>
          <span className="text-[13px] font-black text-[#171717]">{row.value}</span>
        </Link>
      ))}
    </div>
  );
}

function ImprovementList({ row }: { row: ReturnType<typeof buildRepRows>[number] }) {
  const items = row.coachingReasons.length > 0
    ? row.coachingReasons
    : row.tone === "good"
      ? ["好調な商談をチームへ共有", "成功パターンをナレッジ化"]
      : ["直近商談レビュー", "ナレッジ活用状況を確認"];
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div>
            <div className="text-[13px] font-black text-[#343b48]">{item}</div>
            <div className="mt-1 text-[12px] text-[#8a909b]">{index === 0 ? row.nextAction : "次回商談前に確認"}</div>
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
          href={index === 2 ? `/admin/members/${row.id}` : index === 3 ? "/admin/knowledge" : "/admin/roleplay"}
          className={`block rounded-[14px] border px-4 py-3 text-[13px] font-black ${index === 0 ? "border-[#f0c655] bg-[#ffd84d] text-[#171717]" : "border-[#eef1f5] bg-white text-[#343b48]"}`}
        >
          {action}
        </Link>
      ))}
    </div>
  );
}

function NextActionList({ row }: { row: ReturnType<typeof buildRepRows>[number] }) {
  const items = [row.nextAction, row.lowRoleplayCount > 0 ? "低スコアのロープレを再実施" : "商談前ロープレを実施", row.unanalyzedCount > 0 ? "未分析商談を確認" : "成功商談を共有"];
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item} className="flex gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
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

function RoleplayScoreCard({ results }: { results: RoleplayResult[] }) {
  const latest = results[0] ?? null;
  const average = results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null;
  return (
    <div className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-5 py-5">
      <div className="text-[13px] font-bold text-[#8a909b]">平均スコア</div>
      <div className="mt-2 text-[36px] font-black tracking-[-0.04em] text-[#171717]">{average === null ? "-" : average}</div>
      <div className="mt-3 text-[13px] font-bold text-[#596273]">直近: {latest ? `${latest.scenarioTitle} / ${latest.score}点` : "未実施"}</div>
    </div>
  );
}

function LatestMeetingTable({ rows }: { rows: ReturnType<typeof buildLatestReviews> }) {
  if (rows.length === 0) return <EmptyState title="直近商談はありません" body="商談が登録されると表示されます。" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left">
        <thead>
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

function buildAlertRows(rows: ReturnType<typeof buildRepRows>, meetings: MeetingRecord[]) {
  return [
    { label: "ロープレ未実施メンバー", value: `${rows.filter((row) => row.meetingCount > 0 && row.roleplayCount === 0).length}人` },
    { label: "未分析商談", value: `${meetings.filter((meeting) => !meeting.aiSummary).length}件` },
    { label: "要支援メンバー", value: `${rows.filter((row) => row.needsCoaching).length}人` },
    { label: "未確認レビュー", value: `${meetings.filter((meeting) => meeting.status === "considering").length}件` },
  ];
}

function buildRankingRows(rows: ReturnType<typeof buildRepRows>) {
  return [...rows]
    .filter((row) => row.winRate !== null)
    .sort((left, right) => (right.winRate ?? 0) - (left.winRate ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      value: `${row.winRate}%`,
    }));
}

function buildLatestReviews(meetings: MeetingRecord[], rows: Array<{ id: string; name: string }>) {
  return [...meetings]
    .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0))
    .slice(0, 6)
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
    const coachingReasons = buildCoachingReasons({
      lostCount,
      lowRoleplayCount,
      meetingCount: userMeetings.length,
      roleplayCount: userResults.length,
      unanalyzedCount,
      winRate,
    });
    const needsCoaching = coachingReasons.length > 0;
    const coachingPriority: "high" | "medium" | "low" =
      lostCount > 0 || lowRoleplayCount > 0 || (winRate !== null && winRate < 20)
        ? "high"
        : needsCoaching
          ? "medium"
          : "low";
    const tone: "good" | "normal" | "risk" =
      coachingPriority === "high"
        ? "risk"
        : averageScore !== null && averageScore >= 80 && lostCount === 0
          ? "good"
          : "normal";
    const nextAction =
      lostCount > 0
        ? "失注商談を確認"
        : lowRoleplayCount > 0
          ? "ロープレ結果をレビュー"
          : unanalyzedCount > 0
            ? "AI分析結果を確認"
            : userResults.length === 0 && userMeetings.length > 0
              ? "ロープレ課題を割り当て"
              : "通常フォロー";

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
      status: tone === "good" ? "好調" : tone === "risk" ? "要支援" : "確認中",
      latestActivity: formatShortDate(latestActivityAt),
      nextAction,
      needsCoaching,
      coachingPriority,
      coachingReasons,
    };
  }).sort((left, right) => {
    const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
    if (priorityWeight[left.coachingPriority] !== priorityWeight[right.coachingPriority]) {
      return priorityWeight[left.coachingPriority] - priorityWeight[right.coachingPriority];
    }
    return right.lostCount - left.lostCount;
  });
}

function buildCoachingReasons(input: {
  lostCount: number;
  lowRoleplayCount: number;
  meetingCount: number;
  roleplayCount: number;
  unanalyzedCount: number;
  winRate: number | null;
}) {
  const reasons: string[] = [];
  if (input.lostCount > 0) reasons.push(`失注 ${input.lostCount}件`);
  if (input.winRate !== null && input.winRate < 20) reasons.push(`成約率 ${input.winRate}%`);
  if (input.lowRoleplayCount > 0) reasons.push(`低スコアロープレ ${input.lowRoleplayCount}件`);
  if (input.unanalyzedCount > 0) reasons.push(`未分析商談 ${input.unanalyzedCount}件`);
  if (input.meetingCount > 0 && input.roleplayCount === 0) reasons.push("ロープレ未実施");
  return reasons;
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

function buildTeamComment(input: { meetingCount: number; knowledgeCount: number; roleplayCount: number }) {
  if (input.meetingCount === 0 && input.roleplayCount === 0) {
    return "まずは商談データとロープレ結果を蓄積すると、チーム全体の改善ポイントを確認できるようになります。";
  }

  if (input.roleplayCount > 0) {
    return `ロープレが${input.roleplayCount}回実施されています。結果一覧からスコアの低いシナリオを確認し、次の研修テーマに反映しましょう。`;
  }

  return `ナレッジは${input.knowledgeCount}件登録されています。商談データと紐づけることで、よく出る反論と不足している資料を見つけやすくなります。`;
}

function formatMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const formatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${formatter.format(start)} 〜 ${formatter.format(end)}`;
}

function formatShortDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
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
