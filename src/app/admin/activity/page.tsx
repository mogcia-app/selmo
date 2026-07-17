"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  StatusBadge,
  formatDateTime,
  getMeetingOutcomeLabel,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToSalesActivityEvents,
  type SalesActivityEvent,
  type SalesActivityType,
} from "@/lib/firebase/activity";
import type { MeetingRecord } from "@/lib/firebase/meetings";

const activityFilters: Array<{ label: string; value: SalesActivityType | "all" }> = [
  { label: "すべて", value: "all" },
  { label: "商談", value: "meeting_uploaded" },
  { label: "貼り付け", value: "transcript_pasted" },
  { label: "検索", value: "knowledge_searched" },
  { label: "ロープレ", value: "roleplay_completed" },
  { label: "分析結果", value: "ai_analysis_completed" },
];

type DateRangeFilter = "all" | "today" | "7d" | "30d" | "thisMonth";

const dateRangeOptions: Array<[DateRangeFilter, string]> = [
  ["all", "期間すべて"],
  ["today", "今日"],
  ["7d", "直近7日"],
  ["30d", "直近30日"],
  ["thisMonth", "今月"],
];

export default function AdminActivityPage() {
  const { profile } = useAuth();
  const { meetings, memberRows, error: insightError } = useAdminInsights();
  const [events, setEvents] = useState<SalesActivityEvent[]>([]);
  const [filter, setFilter] = useState<SalesActivityType | "all">("all");
  const [memberId, setMemberId] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [keyword, setKeyword] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) {
      setEvents([]);
      return;
    }

    return subscribeToSalesActivityEvents(
      profile.companyId,
      setEvents,
      () => setEvents([]),
    );
  }, [profile?.companyId]);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const member = memberRows.find((row) => row.id === event.userId);
        const searchText = [
          event.title,
          event.summary,
          event.detail,
          member?.name,
          member?.email,
          readMetadataText(event.metadata),
        ].join(" ");
        if (filter !== "all" && event.type !== filter) return false;
        if (memberId && event.userId !== memberId) return false;
        if (!isWithinDateRange(event.createdAt, dateRange)) return false;
        if (keyword.trim() && !searchText.toLowerCase().includes(keyword.trim().toLowerCase())) return false;
        return true;
      }),
    [dateRange, events, filter, keyword, memberId, memberRows],
  );
  const recentAnalyzedMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => meeting.aiSummary)
        .sort(
          (left, right) =>
            (right.aiSummaryTestedAt?.getTime() ?? right.recordedAt?.getTime() ?? 0) -
            (left.aiSummaryTestedAt?.getTime() ?? left.recordedAt?.getTime() ?? 0),
        )
        .slice(0, 6),
    [meetings],
  );
  const todayEventCount = useMemo(() => events.filter((event) => isToday(event.createdAt)).length, [events]);
  const searchEventCount = useMemo(
    () => events.filter((event) => event.type === "knowledge_searched").length,
    [events],
  );
  const analysisEventCount = useMemo(
    () => events.filter((event) => event.type === "ai_analysis_completed").length,
    [events],
  );

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="SALES ACTIVITY"
          title="営業活動ログ"
          description="営業メンバーのアップロード、ナレッジ検索、ロープレ、salesの分析結果を時系列で確認できます。"
          action={
            <Link
              href="/admin/meetings"
              className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]"
            >
              商談レビューへ
            </Link>
          }
        />

        {insightError ? (
          <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {insightError}
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <Metric label="今日の活動" value={`${todayEventCount}件`} note="営業メンバーの操作ログ" />
          <Metric label="ナレッジ検索" value={`${searchEventCount}件`} note="検索キーワードを記録" />
          <Metric label="分析結果" value={`${analysisEventCount}件`} note="sales側で作成済み" />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
          <Panel title="活動タイムライン">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <Select value={memberId} onChange={setMemberId} options={[["", "営業マンすべて"], ...memberRows.map((member) => [member.id, member.name] as [string, string])]} />
              <Select value={dateRange} onChange={(value) => setDateRange(value as DateRangeFilter)} options={dateRangeOptions} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="キーワードで検索"
                className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
              />
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activityFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`rounded-full px-3.5 py-2 text-[12px] font-black transition ${
                    filter === item.value
                      ? "bg-[#171717] text-white"
                      : "border border-[#e2e6ee] bg-white text-[#596273] hover:border-[#f0c655] hover:text-[#171717]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <span className="ml-auto text-[12px] font-bold text-[#8a909b]">表示中: {filteredEvents.length}件</span>
            </div>

            {filteredEvents.length > 0 ? (
              <div className="overflow-x-auto rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd]">
                {filteredEvents.map((event) => {
                  const member = memberRows.find((row) => row.id === event.userId);
                  const isExpanded = expandedEventId === event.id;

                  return (
                    <article key={event.id} className="border-b border-[#f0f2f6] last:border-b-0">
                      <div className="grid min-w-[980px] grid-cols-[180px_94px_minmax(220px,1fr)_132px_104px] items-center gap-3 px-4 py-2.5 transition hover:bg-white">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[12px] font-black text-[#8a6500]">
                              {(member?.name ?? "?").slice(0, 1)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-black text-[#171717]">{member?.name ?? "未設定の営業"}</div>
                              <div className="truncate text-[11px] text-[#8a909b]">{member?.email ?? event.userId}</div>
                            </div>
                        </div>
                        <div className="min-w-0">
                          <ActivityBadge type={event.type} />
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 truncate text-[12px] font-black text-[#343b48]">{event.title}</span>
                          <span className="min-w-0 truncate text-[12px] font-bold text-[#8a909b]">{event.summary}</span>
                        </div>
                        <div className="whitespace-nowrap text-[11px] font-bold text-[#8a909b]">
                          {formatDateTime(event.createdAt)}
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                            className="rounded-[10px] border border-[#e2e6ee] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#343b48]"
                          >
                            {isExpanded ? "閉じる" : "詳細"}
                          </button>
                          {event.href ? (
                            <Link
                              href={event.href}
                              className="rounded-[10px] bg-[#ffd84d] px-2.5 py-1.5 text-[11px] font-black text-[#171717]"
                            >
                              開く
                            </Link>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mx-4 mb-3 whitespace-pre-wrap rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3 text-[12px] leading-6 text-[#343b48]">
                          {event.detail || event.summary}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="活動ログはまだありません"
                body="営業メンバーが商談登録、ナレッジ検索、ロープレを行うとここに表示されます。"
              />
            )}
          </Panel>

          <Panel title="最近のsales分析結果">
            {recentAnalyzedMeetings.length > 0 ? (
              <div className="space-y-3">
                {recentAnalyzedMeetings.map((meeting) => {
                  const member = memberRows.find((row) => row.id === meeting.userId);
                  return (
                    <AnalysisCard
                      key={meeting.id}
                      meeting={meeting}
                      memberName={member?.name ?? "未設定"}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="salesの分析結果はまだありません"
                body="sales側で分析結果が作成された商談が、要約つきで表示されます。"
              />
            )}
          </Panel>
        </section>
      </div>
    </PageShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <div className="text-[13px] font-bold text-[#596273]">{label}</div>
      <div className="mt-2 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
      <div className="mt-1 text-[12px] text-[#8a909b]">{note}</div>
    </article>
  );
}

function AnalysisCard({ meeting, memberName }: { meeting: MeetingRecord; memberName: string }) {
  return (
    <article className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-black text-[#171717]">
            {meeting.customerName || "未設定の商談"}
          </h3>
          <p className="mt-1 text-[12px] font-bold text-[#8a909b]">
            {memberName} / {meeting.productType || "商材未設定"}
          </p>
        </div>
        <StatusBadge tone={getOutcomeTone(meeting.status)} label={getMeetingOutcomeLabel(meeting.status)} />
      </div>
      <p className="mt-3 line-clamp-3 text-[13px] leading-6 text-[#596273]">
        {meeting.aiSummary?.overview}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold text-[#8a909b]">
          {formatDateTime(meeting.recordedAt)}
        </span>
        <Link
          href={`/admin/meetings/${meeting.id}`}
          className="rounded-[12px] bg-[#171717] px-3 py-2 text-[12px] font-black text-white"
        >
          詳細を見る
        </Link>
      </div>
    </article>
  );
}

function ActivityBadge({ type }: { type: SalesActivityType }) {
  const label = readActivityLabel(type);
  const className =
    type === "knowledge_searched"
      ? "bg-[#eef6ff] text-[#2672d9]"
      : type === "roleplay_completed"
        ? "bg-[#f0f7ed] text-[#16834f]"
        : type === "ai_analysis_completed"
          ? "bg-[#fff5d8] text-[#8a6500]"
          : "bg-[#f1f2f5] text-[#596273]";

  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function readActivityLabel(type: SalesActivityType) {
  if (type === "meeting_uploaded") return "商談";
  if (type === "transcript_pasted") return "貼り付け";
  if (type === "knowledge_searched") return "検索";
  if (type === "roleplay_completed") return "ロープレ";
  return "分析結果";
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
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

function readMetadataText(metadata: SalesActivityEvent["metadata"]) {
  if (!metadata) return "";
  return Object.values(metadata)
    .map((value) => (typeof value === "string" || typeof value === "number" ? String(value) : ""))
    .join(" ");
}

function isToday(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
