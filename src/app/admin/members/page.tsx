"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";

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
  const { memberRows, roleplayResults, error } = useAdminInsights();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "needs" | "risk" | "normal" | "good">("all");
  const coachingMembers = useMemo(() => memberRows.filter((member) => member.needsCoaching), [memberRows]);
  const filteredMembers = useMemo(
    () =>
      memberRows.filter((member) => {
        const searchText = [member.name, member.email, member.guidance, ...member.coachingReasons].join(" ").toLowerCase();
        if (statusFilter === "needs" && !member.needsCoaching) return false;
        if (statusFilter !== "all" && statusFilter !== "needs" && member.tone !== statusFilter) return false;
        if (keyword.trim() && !searchText.includes(keyword.trim().toLowerCase())) return false;
        return true;
      }),
    [keyword, memberRows, statusFilter],
  );

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEMBERS"
          title="営業メンバー"
          description="営業メンバーごとの商談・ロープレ状況を確認し、指導対象を見つけます。"
        />

        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <KpiCard label="営業メンバー" value={`${memberRows.length}人`} note="登録済みメンバー" />
          <KpiCard label="指導必要" value={`${coachingMembers.length}人`} note="失注・未分析・低スコアを検知" />
          <KpiCard label="ロープレ実施" value={`${roleplayResults.length}回`} note="結果保存済みの件数" />
        </section>

        <div className="mt-8">
          <Panel title="指導必要ユーザー">
            {coachingMembers.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {coachingMembers.slice(0, 9).map((member) => (
                  <article key={member.id} className="rounded-[20px] border border-[#f0e3c1] bg-[#fffaf0] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-black text-[#171717]">{member.name}</div>
                          <div className="mt-1 truncate text-[12px] text-[#8a909b]">{member.email || "未登録"}</div>
                        </div>
                      </div>
                      <PriorityBadge priority={member.coachingPriority} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {member.coachingReasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-white px-3 py-1 text-[12px] font-black text-[#8a6500]">
                          {reason}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-white px-3 py-3">
                      <InlineStat label="商談" value={`${member.meetingCount}件`} />
                      <InlineStat label="失注" value={`${member.lostCount}件`} />
                      <InlineStat label="低スコア" value={`${member.lowRoleplayCount}件`} />
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-[12px] font-bold text-[#596273]">{member.nextAction}</span>
                      <Link href={`/admin/members/${member.id}`} className="rounded-[12px] bg-[#171717] px-3 py-2 text-[12px] font-black text-white">
                        詳細を見る
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="指導が必要なユーザーはいません" body="失注・未分析・低スコアのロープレが見つかると、ここに優先表示されます。" />
            )}
          </Panel>
        </div>

        <div className="mt-8">
          <Panel title="営業マン一覧">
            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="営業マン名・メールで検索"
                className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "needs" | "risk" | "normal" | "good")}
                className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
              >
                <option value="all">状態すべて</option>
                <option value="needs">指導必要</option>
                <option value="risk">要支援</option>
                <option value="normal">確認中</option>
                <option value="good">好調</option>
              </select>
            </div>
            <div className="mb-4 text-[12px] font-bold text-[#8a909b]">
              表示中: {filteredMembers.length}人 / 全体: {memberRows.length}人
            </div>
            {filteredMembers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                      <th className="px-4 py-3 font-bold">営業マン名</th>
                      <th className="px-4 py-3 font-bold">メールアドレス</th>
                      <th className="px-4 py-3 font-bold">勤務年数</th>
                      <th className="px-4 py-3 font-bold">商談件数</th>
                      <th className="px-4 py-3 font-bold">成約率</th>
                      <th className="px-4 py-3 font-bold">平均スコア</th>
                      <th className="px-4 py-3 font-bold">ロープレ</th>
                      <th className="px-4 py-3 font-bold">指導理由</th>
                      <th className="px-4 py-3 font-bold">最終活動</th>
                      <th className="px-4 py-3 font-bold">ステータス</th>
                      <th className="px-4 py-3 font-bold">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                            <span className="text-[14px] font-black text-[#171717]">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{member.email || "未登録"}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.workExperienceLabel}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.meetingCount}件</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.winRate === null ? <Placeholder /> : `${member.winRate}%`}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.averageScore === null ? <Placeholder /> : `${member.averageScore}点`}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{member.roleplayCount}回</td>
                        <td className="px-4 py-4">
                          {member.coachingReasons.length > 0 ? (
                            <div className="flex max-w-[280px] flex-wrap gap-1.5">
                              {member.coachingReasons.map((reason) => (
                                <span key={reason} className="rounded-full bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                                  {reason}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <Placeholder>なし</Placeholder>
                          )}
                        </td>
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
              <EmptyState title="条件に一致する営業メンバーはいません" body="検索条件や状態フィルタを変更してください。" />
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
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

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[16px] font-black text-[#171717]">{value}</div>
    </div>
  );
}

function MemberAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: "sm" | "md" }) {
  const className = size === "md" ? "h-11 w-11 text-[15px]" : "h-9 w-9 text-[13px]";
  if (avatarUrl) {
    const sizePx = size === "md" ? 44 : 36;
    return <Image src={avatarUrl} alt="" width={sizePx} height={sizePx} className={`${className} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-[#ffd84d] font-black text-[#171717]`}>
      {name.slice(0, 1)}
    </span>
  );
}
