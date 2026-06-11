"use client";

import Image from "next/image";
import Link from "next/link";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  getWorkExperienceBucket,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminRepsPage() {
  const { memberRows, meetings, roleplayResults, error } = useAdminInsights();
  const sortedRows = [...memberRows].sort((left, right) => {
    const rightScore = right.winRate ?? -1;
    const leftScore = left.winRate ?? -1;
    return rightScore - leftScore;
  });
  const growthRows = buildExperienceGrowthRows(memberRows, meetings, roleplayResults);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="REPS"
          title="営業マン別一覧"
          description="商談件数、成約率、ロープレ結果をもとに営業担当ごとの状況を確認します。"
        />

        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <KpiCard label="経験年数登録" value={`${memberRows.filter((member) => member.workExperienceTotalMonths !== null).length}人`} note="users の勤務年数から集計" />
          <KpiCard label="新人・1年未満" value={`${memberRows.filter((member) => getWorkExperienceBucket(member.workExperienceTotalMonths) === "新卒・1年未満").length}人`} note="育成対象の把握" />
          <KpiCard label="指導必要" value={`${memberRows.filter((member) => member.needsCoaching).length}人`} note="失注・未分析・低スコアを検知" />
        </section>

        <div className="mt-8">
          <Panel title="勤務年数別の伸び">
            {growthRows.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
                {growthRows.map((row) => (
                  <article key={row.bucket} className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                    <div className="text-[13px] font-black text-[#171717]">{row.bucket}</div>
                    <div className="mt-3 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{row.growthLabel}</div>
                    <div className="mt-2 h-2 rounded-full bg-[#edf0f5]">
                      <div className="h-full rounded-full bg-[#ffd84d]" style={{ width: `${Math.min(Math.max(row.growth + 50, 0), 100)}%` }} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] font-bold text-[#596273]">
                      <span>{row.memberCount}人</span>
                      <span>{row.meetingCount}商談</span>
                      <span>ロープレ {row.roleplayCount}回</span>
                      <span>平均 {row.averageScoreLabel}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="勤務年数別の伸びはまだ出せません" body="勤務年数とロープレ結果が蓄積されると、経験年数別の伸びを表示します。" />
            )}
          </Panel>
        </div>

        <div className="mt-8">
        <Panel title="営業担当別サマリー">
          {sortedRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] font-bold text-[#7a808c]">
                    <th className="px-5 py-4">No</th>
                    <th className="px-5 py-4">営業マン</th>
                    <th className="px-5 py-4">勤務年数</th>
                    <th className="px-5 py-4">商談</th>
                    <th className="px-5 py-4">成約率</th>
                    <th className="px-5 py-4">ロープレ</th>
                    <th className="px-5 py-4">平均スコア</th>
                    <th className="px-5 py-4">状態</th>
                    <th className="px-5 py-4">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((member, index) => (
                    <tr key={member.id} className="border-b border-[#f0f2f6] last:border-b-0 hover:bg-[#fffdf7]">
                      <td className="px-5 py-4 text-[13px] font-bold text-[#8a909b]">{String(index + 1).padStart(2, "0")}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
                          <div>
                            <div className="text-[14px] font-black text-[#171717]">{member.name}</div>
                            <div className="mt-1 text-[12px] text-[#8a909b]">{member.email || "未登録"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{member.workExperienceLabel}</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{member.meetingCount}件</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{member.winRate === null ? <Placeholder /> : `${member.winRate}%`}</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{member.roleplayCount}回</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{member.averageScore === null ? <Placeholder /> : `${member.averageScore}点`}</td>
                      <td className="px-5 py-4"><StatusBadge tone={member.tone} label={member.guidance} /></td>
                      <td className="px-5 py-4">
                        <Link href={`/admin/members/${member.id}`} className="text-[13px] font-bold text-[#2672d9]">
                          詳細を見る
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="営業担当はまだ登録されていません" body="営業ユーザーが登録されると、担当者別の実績が表示されます。" />
          )}
        </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function buildExperienceGrowthRows(
  members: ReturnType<typeof useAdminInsights>["memberRows"],
  meetings: ReturnType<typeof useAdminInsights>["meetings"],
  results: ReturnType<typeof useAdminInsights>["roleplayResults"],
) {
  const bucketOrder = ["新卒・1年未満", "1〜2年", "3〜5年", "6年以上", "未設定"];
  return bucketOrder.map((bucket) => {
    const bucketMembers = members.filter((member) => getWorkExperienceBucket(member.workExperienceTotalMonths) === bucket);
    const memberIds = new Set(bucketMembers.map((member) => member.id));
    const bucketResults = results
      .filter((result) => memberIds.has(result.userId))
      .filter((result) => result.createdAt)
      .sort((left, right) => (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0));
    const bucketMeetings = meetings.filter((meeting) => memberIds.has(meeting.userId));
    const averageScore = bucketResults.length > 0
      ? Math.round(bucketResults.reduce((sum, result) => sum + result.score, 0) / bucketResults.length)
      : null;
    const windowSize = Math.min(3, Math.floor(bucketResults.length / 2));
    const growth = windowSize > 0
      ? Math.round(avg(bucketResults.slice(-windowSize).map((result) => result.score)) - avg(bucketResults.slice(0, windowSize).map((result) => result.score)))
      : 0;

    return {
      bucket,
      memberCount: bucketMembers.length,
      meetingCount: bucketMeetings.length,
      roleplayCount: bucketResults.length,
      averageScoreLabel: averageScore === null ? "-" : `${averageScore}点`,
      growth,
      growthLabel: windowSize > 0 ? `${growth >= 0 ? "+" : ""}${growth}pt` : "-",
    };
  }).filter((row) => row.memberCount > 0);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }

  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[14px] font-black text-[#8a6500]">
      {name.slice(0, 1)}
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
