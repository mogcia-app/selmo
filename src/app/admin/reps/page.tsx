"use client";

import Link from "next/link";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminRepsPage() {
  const { memberRows, error } = useAdminInsights();
  const sortedRows = [...memberRows].sort((left, right) => {
    const rightScore = right.winRate ?? -1;
    const leftScore = left.winRate ?? -1;
    return rightScore - leftScore;
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="REPS"
          title="営業マン別一覧"
          description="商談件数、成約率、ロープレ結果をもとに営業担当ごとの状況を確認します。"
        />

        {error ? <ErrorBox message={error} /> : null}

        <Panel title="営業担当別サマリー">
          {sortedRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] font-bold text-[#7a808c]">
                    <th className="px-5 py-4">No</th>
                    <th className="px-5 py-4">営業マン</th>
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
                        <div className="text-[14px] font-black text-[#171717]">{member.name}</div>
                        <div className="mt-1 text-[12px] text-[#8a909b]">{member.email || "未登録"}</div>
                      </td>
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
    </PageShell>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
