"use client";

import { FirebaseError } from "firebase/app";
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
  const avgDurationMin = useMemo(() => {
    const durations = meetings.map((meeting) => meeting.audioDurationSec).filter((value): value is number => typeof value === "number" && value > 0);
    if (durations.length === 0) return null;
    return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60);
  }, [meetings]);
  const roleplayAverage = useMemo(() => {
    if (roleplayResults.length === 0) return null;
    return Math.round(roleplayResults.reduce((sum, result) => sum + result.score, 0) / roleplayResults.length);
  }, [roleplayResults]);
  const productRows = useMemo(() => buildProductRows(products, knowledgeItems), [knowledgeItems, products]);
  const repRows = useMemo(() => buildRepRows(activeSalesUsers, meetings, roleplayResults), [activeSalesUsers, meetings, roleplayResults]);
  const attentionRows = useMemo(() => repRows.filter((row) => row.tone === "risk" || row.nextAction !== "通常フォロー").slice(0, 5), [repRows]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(meetings), [meetings]);
  const roleplayUsageRate = activeSalesUsers.length > 0
    ? Math.round((new Set(roleplayResults.map((result) => result.userId)).size / activeSalesUsers.length) * 100)
    : null;

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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={<UsersIcon />} label="営業マン数" value={`${salesUsers.length}人`} note={`アクティブ: ${activeSalesUsers.length}人`} />
          <KpiCard icon={<PhoneIcon />} label="通話/商談件数" value={`${meetings.length}件`} note={meetings.length > 0 ? "Firestore連携済み" : "商談データ待ち"} />
          <KpiCard icon={<TargetIcon />} label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "商談なし" : `成約 ${wonMeetings}件`} />
          <KpiCard icon={<ClockIcon />} label="平均通話時間" value={avgDurationMin === null ? "-" : `${avgDurationMin}分`} note={avgDurationMin === null ? "音声時間データ待ち" : "音声メタデータより算出"} />
          <KpiCard icon={<BookIcon />} label="共有ナレッジ" value={`${sharedKnowledgeCount}件`} note={`商品: ${products.length}件 / 全体: ${knowledgeItems.length}件`} />
        </section>

        <section className="mt-5">
          <Panel title="要対応メンバー" actionLabel="商談レビューへ" href="/admin/meetings">
            {attentionRows.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {attentionRows.map((row) => (
                  <article key={row.id} className="rounded-[18px] border border-[#f0e3c1] bg-[#fffaf0] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ffd84d] text-[15px] font-black text-[#171717]">
                          {row.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-[#171717]">{row.name}</div>
                          <div className="truncate text-[12px] text-[#8a909b]">{row.email}</div>
                        </div>
                      </div>
                      <StatusBadge tone={row.tone} label={row.status} />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-white px-3 py-3">
                      <InlineStat label="商談" value={`${row.meetingCount}件`} />
                      <InlineStat label="失注" value={`${row.lostCount}件`} />
                      <InlineStat label="ロープレ" value={`${row.roleplayCount}回`} />
                    </div>
                    <div className="mt-4 rounded-[14px] bg-white px-3 py-3">
                      <div className="text-[12px] font-bold text-[#8a909b]">次に見ること</div>
                      <div className="mt-1 text-[13px] font-black text-[#343b48]">{row.nextAction}</div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-[12px] font-bold text-[#8a909b]">最終活動: {row.latestActivity}</span>
                      <Link href={`/admin/members/${row.id}`} className="rounded-[12px] bg-[#171717] px-3 py-2 text-[12px] font-black text-white">
                        個別確認
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="要対応メンバーはありません" body="失注や未分析、ロープレ不足が見つかるとここに表示されます。" />
            )}
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.7fr)]">
          <Panel title="営業マン別サマリー" actionLabel="一覧を見る" href="/admin/reps">
            {repRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left">
                  <thead>
                    <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                      <th className="px-4 py-3 font-bold">営業マン</th>
                      <th className="px-4 py-3 font-bold">商談</th>
                      <th className="px-4 py-3 font-bold">失注</th>
                      <th className="px-4 py-3 font-bold">成約率</th>
                      <th className="px-4 py-3 font-bold">ロープレ</th>
                      <th className="px-4 py-3 font-bold">平均スコア</th>
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
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f2f5] text-[14px] font-black text-[#343b48]">
                              {row.name.slice(0, 1)}
                            </span>
                            <div>
                              <div className="text-[14px] font-black text-[#171717]">{row.name}</div>
                              <div className="mt-0.5 text-[12px] text-[#8a909b]">{row.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.meetingCount}件</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.lostCount}件</td>
                        <td className="px-4 py-4">
                          <Progress value={row.winRate ?? 0} tone={row.tone} label={row.winRate === null ? "-" : `${row.winRate}%`} />
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.roleplayCount}回</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{row.averageScore === null ? "-" : `${row.averageScore}点`}</td>
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

          <div className="space-y-5">
            <Panel title="商材別 成約率" actionLabel="商品を見る" href="/sales/knowledge">
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

            <Panel title="よく出るワード TOP5" actionLabel="通話一覧" href="/meetings">
              <KeywordList meetings={meetings} />
            </Panel>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(360px,0.85fr)]">
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

        <p className="mt-6 text-[12px] text-[#8a909b]">データはFirestore上の実データを表示しています。</p>
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

function buildProductRows(products: KnowledgeProduct[], items: KnowledgeItem[]) {
  return products.slice(0, 5).map((product) => ({
    id: product.id,
    name: product.name,
    knowledgeCount: items.filter((item) => item.productId === product.id).length,
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
    const userResults = results.filter((result) => result.userId === user.uid);
    const latestActivityAt = [
      ...userMeetings.map((meeting) => meeting.recordedAt),
      ...userResults.map((result) => result.createdAt),
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const winRate = userMeetings.length > 0 ? Math.round((wonCount / userMeetings.length) * 1000) / 10 : null;
    const averageScore = userResults.length > 0 ? Math.round(userResults.reduce((sum, result) => sum + result.score, 0) / userResults.length) : null;
    const tone: "good" | "normal" | "risk" =
      lostCount > 0 || (winRate !== null && winRate < 20)
        ? "risk"
        : averageScore !== null && averageScore >= 80
          ? "good"
          : "normal";
    const nextAction =
      lostCount > 0
        ? "失注商談を確認"
        : unanalyzedCount > 0
          ? "AI分析結果を確認"
          : userResults.length === 0 && userMeetings.length > 0
            ? "ロープレ課題を割り当て"
            : "通常フォロー";

    return {
      id: user.uid,
      name: user.name ?? "未設定",
      email: user.email ?? "",
      meetingCount: userMeetings.length,
      lostCount,
      unanalyzedCount,
      winRate,
      roleplayCount: userResults.length,
      averageScore,
      tone,
      status: tone === "good" ? "好調" : tone === "risk" ? "要支援" : "確認中",
      latestActivity: formatShortDate(latestActivityAt),
      nextAction,
    };
  }).sort((left, right) => {
    const toneWeight = { risk: 0, normal: 1, good: 2 } as const;
    if (toneWeight[left.tone] !== toneWeight[right.tone]) return toneWeight[left.tone] - toneWeight[right.tone];
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

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[16px] font-black text-[#171717]">{value}</div>
    </div>
  );
}

function UsersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M16 19v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V19" /><circle cx="10" cy="7" r="3" /><path d="M20 19v-1.2a3.4 3.4 0 0 0-2.5-3.3" /><path d="M16.5 4.4a3 3 0 0 1 0 5.2" /></svg>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M7 5.5 9.2 4l3 5-2.1 1.4a10.8 10.8 0 0 0 4.5 4.5l1.4-2.1 5 3-1.5 2.2c-.6.9-1.7 1.3-2.8 1.1A16 16 0 0 1 4.9 7.3C4.7 6.2 5.1 5.1 6 4.5Z" /></svg>;
}

function TargetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12h8" /></svg>;
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5Z" /><path d="M5 5.5v16M9 7h7" /></svg>;
}
