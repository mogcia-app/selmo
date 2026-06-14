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
          <KpiCard label="指導必要" value={`${coachingMembers.length}人`} note="管理者が指導必要に設定" />
          <KpiCard label="ロープレ実施" value={`${roleplayResults.length}回`} note="結果保存済みの件数" />
        </section>

        <div className="mt-8">
          <Panel title="指導必要ユーザー">
            {coachingMembers.length > 0 ? (
              <div>
                <div className="mb-4 rounded-[16px] border border-[#f0e3c1] bg-[#fffaf0] px-4 py-3 text-[13px] font-bold leading-6 text-[#6f5500]">
                  指導理由と次アクションは、メンバー詳細で管理者が保存した内容を表示します。
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[1060px] text-left">
                  <thead>
                    <tr className="border-b border-[#eef1f5] bg-[#fcfcfd] text-[12px] text-[#7a808c]">
                      <th className="px-4 py-3 font-bold">優先度</th>
                      <th className="px-4 py-3 font-bold">営業マン</th>
                      <th className="px-4 py-3 font-bold">なぜ指導が必要か</th>
                      <th className="px-4 py-3 font-bold">商談</th>
                      <th className="px-4 py-3 font-bold">成約率</th>
                      <th className="px-4 py-3 font-bold">失注</th>
                      <th className="px-4 py-3 font-bold">低スコア</th>
                      <th className="px-4 py-3 font-bold">未分析</th>
                      <th className="px-4 py-3 font-bold">次アクション</th>
                      <th className="px-4 py-3 font-bold">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coachingMembers.map((member) => (
                      <tr key={member.id} className="border-b border-[#f0f2f6] last:border-b-0 hover:bg-[#fffdf6]">
                        <td className="px-4 py-4 align-top">
                          <PriorityBadge priority={member.coachingPriority} />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex min-w-[190px] items-center gap-3">
                            <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-black text-[#171717]">{member.name}</div>
                              <div className="mt-1 truncate text-[12px] text-[#8a909b]">{member.email || "未登録"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <CoachingReasonList reasons={member.coachingReasons} />
                        </td>
                        <td className="px-4 py-4 align-top text-[13px] font-black text-[#343b48]">{member.meetingCount}件</td>
                        <td className={`px-4 py-4 align-top text-[13px] font-black ${member.winRate !== null && member.winRate < 20 ? "text-[#d63c2f]" : "text-[#343b48]"}`}>
                          {member.winRate === null ? "-" : `${member.winRate}%`}
                        </td>
                        <td className={`px-4 py-4 align-top text-[13px] font-black ${member.lostCount > 0 ? "text-[#d63c2f]" : "text-[#343b48]"}`}>
                          {member.lostCount}件
                        </td>
                        <td className={`px-4 py-4 align-top text-[13px] font-black ${member.lowRoleplayCount > 0 ? "text-[#d63c2f]" : "text-[#343b48]"}`}>
                          {member.lowRoleplayCount}件
                        </td>
                        <td className={`px-4 py-4 align-top text-[13px] font-black ${member.unanalyzedCount > 0 ? "text-[#d63c2f]" : "text-[#343b48]"}`}>
                          {member.unanalyzedCount}件
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="max-w-[180px] text-[13px] font-bold leading-5 text-[#596273]">{member.nextAction}</div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Link href={`/admin/members/${member.id}`} className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#171717] px-3 text-[12px] font-black text-white">
                            詳細を見る
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
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
                <table className="w-full min-w-[1580px] table-fixed text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                      <th className="w-[180px] whitespace-nowrap px-4 py-3 font-bold">営業マン名</th>
                      <th className="w-[210px] whitespace-nowrap px-4 py-3 font-bold">メールアドレス</th>
                      <th className="w-[82px] whitespace-nowrap px-4 py-3 font-bold">勤務年数</th>
                      <th className="w-[82px] whitespace-nowrap px-4 py-3 font-bold">商談件数</th>
                      <th className="w-[72px] whitespace-nowrap px-4 py-3 font-bold">成約率</th>
                      <th className="w-[92px] whitespace-nowrap px-4 py-3 font-bold">平均スコア</th>
                      <th className="w-[78px] whitespace-nowrap px-4 py-3 font-bold">ロープレ</th>
                      <th className="w-[240px] whitespace-nowrap px-4 py-3 font-bold">指導理由</th>
                      <th className="w-[118px] whitespace-nowrap px-4 py-3 font-bold">確認状況</th>
                      <th className="w-[106px] whitespace-nowrap px-4 py-3 font-bold">最終確認日</th>
                      <th className="w-[106px] whitespace-nowrap px-4 py-3 font-bold">次回確認日</th>
                      <th className="w-[220px] whitespace-nowrap px-4 py-3 font-bold">管理者メモ</th>
                      <th className="w-[92px] whitespace-nowrap px-4 py-3 font-bold">最終活動</th>
                      <th className="w-[118px] whitespace-nowrap px-4 py-3 font-bold">ステータス</th>
                      <th className="w-[80px] whitespace-nowrap px-4 py-3 font-bold">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                            <span className="min-w-0 truncate text-[13px] font-black text-[#171717]">{member.name}</span>
                          </div>
                        </td>
                        <td className="truncate whitespace-nowrap px-4 py-4 align-middle text-[#596273]">{member.email || "未登録"}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#343b48]">{member.workExperienceLabel}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#343b48]">{member.meetingCount}件</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#343b48]">{member.winRate === null ? "-" : `${member.winRate}%`}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#343b48]">{member.averageScore === null ? "-" : `${member.averageScore}点`}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#343b48]">{member.roleplayCount}回</td>
                        <td className="px-4 py-4 align-middle">
                          {member.coachingReasons.length > 0 ? (
                            <div className="flex min-w-0 gap-1.5 overflow-hidden">
                              {member.coachingReasons.map((reason) => (
                                <span key={reason} className="shrink-0 rounded-full bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                                  {reason}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-bold text-[#8a909b]">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle"><ReviewStatusBadge status={member.adminReviewStatus} /></td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#596273]">{formatShortDate(member.adminLastReviewedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#596273]">{formatShortDate(member.adminNextReviewDate)}</td>
                        <td className="px-4 py-4 align-middle">
                          <div className="truncate font-bold text-[#596273]">{member.adminReviewMemo || "-"}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle font-bold text-[#596273]">{member.lastActivity}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle"><StatusBadge tone={member.tone} label={member.guidance} /></td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle">
                          <Link href={`/admin/members/${member.id}`} className="text-[12px] font-bold text-[#2672d9]">
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

function ReviewStatusBadge({ status }: { status: "unchecked" | "checked" | "in_progress" | "follow_up" | "done" }) {
  const label = getReviewStatusLabel(status);
  const className =
    status === "done" || status === "checked"
      ? "bg-[#edf7f0] text-[#16834f]"
      : status === "in_progress"
        ? "bg-[#fff3cf] text-[#8a6500]"
        : status === "follow_up"
          ? "bg-[#eef6ff] text-[#2672d9]"
          : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function getReviewStatusLabel(status: "unchecked" | "checked" | "in_progress" | "follow_up" | "done") {
  if (status === "checked") return "確認済み";
  if (status === "in_progress") return "対応中";
  if (status === "follow_up") return "次回確認";
  if (status === "done") return "完了";
  return "未確認";
}

function formatShortDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
}

function CoachingReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <span className="font-bold text-[#8a909b]">-</span>;

  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <span key={reason} className="rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
          {reason}
        </span>
      ))}
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
