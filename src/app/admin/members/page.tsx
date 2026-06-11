"use client";

import Link from "next/link";

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

export default function AdminMembersPage() {
  const { memberRows, meetings, roleplayResults, error } = useAdminInsights();

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEMBERS"
          title="営業メンバー"
          description="営業メンバーごとの商談・ロープレ状況を確認し、指導対象を見つけます。"
        />

        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <KpiCard label="営業メンバー" value={`${memberRows.length}人`} note="Firestore usersより集計" />
          <KpiCard label="商談件数" value={`${meetings.length}件`} note="全営業メンバー合計" />
          <KpiCard label="ロープレ実施" value={`${roleplayResults.length}回`} note="結果保存済みの件数" />
        </section>

        <Panel title="営業マン一覧">
          {memberRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                    <th className="px-4 py-3 font-bold">営業マン名</th>
                    <th className="px-4 py-3 font-bold">メールアドレス</th>
                    <th className="px-4 py-3 font-bold">商談件数</th>
                    <th className="px-4 py-3 font-bold">成約率</th>
                    <th className="px-4 py-3 font-bold">平均スコア</th>
                    <th className="px-4 py-3 font-bold">ロープレ</th>
                    <th className="px-4 py-3 font-bold">最終活動</th>
                    <th className="px-4 py-3 font-bold">ステータス</th>
                    <th className="px-4 py-3 font-bold">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map((member) => (
                    <tr key={member.id} className="border-b border-[#f0f2f6] last:border-b-0">
                      <td className="px-4 py-4 text-[14px] font-black text-[#171717]">{member.name}</td>
                      <td className="px-4 py-4 text-[13px] text-[#596273]">{member.email || "未登録"}</td>
                      <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.meetingCount}件</td>
                      <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.winRate === null ? <Placeholder /> : `${member.winRate}%`}</td>
                      <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.averageScore === null ? <Placeholder /> : `${member.averageScore}点`}</td>
                      <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.roleplayCount}回</td>
                      <td className="px-4 py-4 text-[13px] font-bold text-[#596273]">{member.lastActivity}</td>
                      <td className="px-4 py-4"><StatusBadge tone={member.tone} label={member.guidance} /></td>
                      <td className="px-4 py-4">
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
            <EmptyState title="営業メンバーはまだいません" body="営業メンバーが追加されると、メンバー別の状況が表示されます。" />
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
