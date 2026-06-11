"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  formatDate,
  getMeetingOutcomeLabel,
  getMeetingScore,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import type { MeetingRecord } from "@/lib/firebase/meetings";

type DateRangeFilter = "all" | "today" | "7d" | "30d" | "thisMonth";

const dateRangeOptions: Array<[DateRangeFilter, string]> = [
  ["all", "期間すべて"],
  ["today", "今日"],
  ["7d", "直近7日"],
  ["30d", "直近30日"],
  ["thisMonth", "今月"],
];

export default function AdminMeetingsPage() {
  const { meetings, memberRows, error } = useAdminInsights();
  const [memberId, setMemberId] = useState("");
  const [product, setProduct] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("date");
  const products = useMemo(() => Array.from(new Set(meetings.map((meeting) => meeting.productType).filter(Boolean))), [meetings]);
  const filteredMeetings = useMemo(() => {
    const rows = meetings.filter((meeting) => {
      const member = memberRows.find((row) => row.id === meeting.userId);
      const searchText = [
        meeting.customerName,
        meeting.productType,
        meeting.memo,
        member?.name,
        member?.email,
      ].join(" ");
      if (memberId && meeting.userId !== memberId) return false;
      if (product && meeting.productType !== product) return false;
      if (outcome && meeting.status !== outcome) return false;
      if (!isWithinDateRange(meeting.recordedAt, dateRange)) return false;
      if (keyword.trim() && !searchText.toLowerCase().includes(keyword.trim().toLowerCase())) return false;
      return true;
    });

    if (sort === "score") {
      return [...rows].sort((left, right) => String(getMeetingScore(right)).localeCompare(String(getMeetingScore(left))));
    }
    return rows;
  }, [dateRange, keyword, meetings, memberId, memberRows, outcome, product, sort]);

  const activeFilterLabels = [
    memberId ? memberRows.find((member) => member.id === memberId)?.name ?? "営業マン指定" : null,
    product || null,
    outcome ? getMeetingOutcomeLabel(outcome) : null,
    getDateRangeLabel(dateRange),
    keyword.trim() ? `検索: ${keyword.trim()}` : null,
  ].filter(Boolean);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader eyebrow="MEETING REVIEW" title="商談レビュー" description="全営業マンの商談・通話を確認し、要確認の商談を見つけます。" />
        {error ? <ErrorBox message={error} /> : null}

        <Panel title="フィルター">
          <div className="grid gap-3 md:grid-cols-6">
            <Select value={memberId} onChange={setMemberId} options={[["", "営業マンすべて"], ...memberRows.map((member) => [member.id, member.name] as [string, string])]} />
            <Select value={product} onChange={setProduct} options={[["", "商材すべて"], ...products.map((item) => [item, item] as [string, string])]} />
            <Select value={outcome} onChange={setOutcome} options={[["", "結果すべて"], ["won", "成約"], ["lost", "失注"], ["considering", "検討中"]]} />
            <Select value={dateRange} onChange={(value) => setDateRange(value as DateRangeFilter)} options={dateRangeOptions} />
            <Select value={sort} onChange={setSort} options={[["date", "新しい順"], ["score", "スコア順"]]} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="顧客・営業マンで検索"
              className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-[#8a909b]">表示中: {filteredMeetings.length}件</span>
            {activeFilterLabels.map((label) => (
              <span key={label} className="rounded-full bg-[#fff5d8] px-3 py-1 text-[12px] font-black text-[#8a6500]">
                {label}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="商談一覧">
          {filteredMeetings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                    <th className="px-4 py-3 font-bold">顧客</th>
                    <th className="px-4 py-3 font-bold">営業マン</th>
                    <th className="px-4 py-3 font-bold">商材</th>
                    <th className="px-4 py-3 font-bold">結果</th>
                    <th className="px-4 py-3 font-bold">スコア</th>
                    <th className="px-4 py-3 font-bold">AI状態</th>
                    <th className="px-4 py-3 font-bold">次回アクション</th>
                    <th className="px-4 py-3 font-bold">実施日</th>
                    <th className="px-4 py-3 font-bold">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeetings.map((meeting) => {
                    const member = memberRows.find((row) => row.id === meeting.userId);
                    const needsReview = meeting.status === "lost" || meeting.processingStatus === "failed";
                    return (
                      <tr key={meeting.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#171717]">{meeting.customerName || "未設定"}</div>
                          <div className="mt-1 text-[12px] text-[#8a909b]">{meeting.customerType === "existing" ? "既存" : "新規"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fff3cf] text-[13px] font-black text-[#8a6500]">
                              {(member?.name ?? "?").slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-black text-[#171717]">{member?.name ?? "未設定"}</div>
                              <div className="truncate text-[12px] text-[#8a909b]">{member?.email ?? meeting.userId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{meeting.productType || "未設定"}</td>
                        <td className="px-4 py-4"><StatusBadge tone={getOutcomeTone(meeting.status)} label={getMeetingOutcomeLabel(meeting.status)} /></td>
                        <td className="px-4 py-4"><Placeholder>{getMeetingScore(meeting)}</Placeholder></td>
                        <td className="px-4 py-4">{needsReview ? <StatusBadge tone="risk" label="要確認" /> : <StatusBadge tone="normal" label={getAnalysisStatus(meeting)} />}</td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#343b48]">{getNextAction(meeting)}</td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{formatDate(meeting.recordedAt)}</td>
                        <td className="px-4 py-4"><Link href={`/admin/meetings/${meeting.id}`} className="text-[13px] font-bold text-[#2672d9]">レビュー</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="商談はまだありません" body="音声アップロードや商談登録後、一覧に表示されます。" />
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}

function isWithinDateRange(date: Date | null, range: DateRangeFilter) {
  if (range === "all") return true;
  if (!date) return false;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "today") {
    return date >= start;
  }

  if (range === "thisMonth") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  const days = range === "7d" ? 7 : 30;
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return date >= threshold;
}

function getDateRangeLabel(range: DateRangeFilter) {
  return dateRangeOptions.find(([value]) => value === range)?.[1] ?? "期間すべて";
}

function getAnalysisStatus(meeting: MeetingRecord) {
  if (meeting.aiSummaryStatus === "completed" || meeting.aiSummary) return "分析済み";
  if (meeting.aiSummaryStatus === "running") return "分析中";
  if (meeting.transcriptBlockStatus === "completed" || meeting.conversationLogStatus === "completed") return "要約済み";
  if (meeting.processingStatus === "failed") return "失敗";
  return "未分析";
}

function getNextAction(meeting: MeetingRecord) {
  if (meeting.status === "lost") return "失注要因を確認";
  if (meeting.processingStatus === "failed") return "処理エラー確認";
  if (!meeting.aiSummary) return "AI分析結果を確認";
  if (typeof meeting.aiSummary.manualCompliance?.score === "number") return "指導用レビュー";
  return "salesの分析結果を確認";
}
