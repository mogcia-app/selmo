"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";
import type { MeetingPurpose } from "@/types/domain";

type CalendarVariant = "admin" | "sales";
type DomainFilter = "all" | SalesDomain;

export function MeetingCalendarScreen({ variant }: { variant: CalendarVariant }) {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const canUseMeeting = variant === "admin" || !profile || canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = variant === "admin" || !profile || canUseSalesDomain(profile, "teleapo");
  const defaultDomain: DomainFilter = canUseMeeting && canUseTeleapo ? "all" : canUseTeleapo ? "teleapo" : "meeting";
  const [domainFilter, setDomainFilter] = useState<DomainFilter>(defaultDomain);

  useEffect(() => {
    setDomainFilter(defaultDomain);
  }, [defaultDomain]);

  useEffect(() => {
    if (!profile?.uid || !profile.companyId || !profile.role) return;
    return subscribeToMeetings(
      { role: profile.role, userId: profile.uid, companyId: profile.companyId },
      (nextMeetings) => {
        setMeetings(nextMeetings);
        setErrorMessage(null);
      },
      () => setErrorMessage("カレンダー情報の読み込みに失敗しました。"),
    );
  }, [profile?.companyId, profile?.role, profile?.uid]);

  const availableMeetings = useMemo(
    () =>
      meetings.filter((meeting) => {
        if (domainFilter !== "all" && meeting.salesDomain !== domainFilter) return false;
        if (meeting.salesDomain === "meeting" && !canUseMeeting) return false;
        if (meeting.salesDomain === "teleapo" && !canUseTeleapo) return false;
        return Boolean(meeting.recordedAt);
      }),
    [canUseMeeting, canUseTeleapo, domainFilter, meetings],
  );
  const monthMeetings = useMemo(
    () => availableMeetings.filter((meeting) => isSameMonth(meeting.recordedAt, viewDate)),
    [availableMeetings, viewDate],
  );
  const selectedMeetings = useMemo(
    () =>
      availableMeetings
        .filter((meeting) => isSameDay(meeting.recordedAt, selectedDate))
        .sort((left, right) => (left.recordedAt?.getTime() ?? 0) - (right.recordedAt?.getTime() ?? 0)),
    [availableMeetings, selectedDate],
  );
  const upcomingMeetings = useMemo(
    () =>
      availableMeetings
        .filter((meeting) => (meeting.recordedAt?.getTime() ?? 0) >= startOfDay(new Date()).getTime())
        .sort((left, right) => (left.recordedAt?.getTime() ?? 0) - (right.recordedAt?.getTime() ?? 0))
        .slice(0, 5),
    [availableMeetings],
  );
  const meetingsByDate = useMemo(() => groupMeetingsByDate(monthMeetings), [monthMeetings]);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const domainLabel = domainFilter === "teleapo" ? "架電" : domainFilter === "meeting" ? "商談" : "すべて";

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <div className="mx-auto max-w-[1380px] space-y-4">
        <section className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Calendar</p>
              <h1 className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#171717]">カレンダー</h1>
              <p className="mt-2 text-[13px] leading-6 text-[#707783]">
                {variant === "admin" ? "チーム全体の商談・架電を日付別に確認できます。" : "自分の商談・架電を日付別に確認できます。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canUseMeeting && canUseTeleapo ? <FilterButton active={domainFilter === "all"} onClick={() => setDomainFilter("all")}>すべて</FilterButton> : null}
              {canUseMeeting ? <FilterButton active={domainFilter === "meeting"} onClick={() => setDomainFilter("meeting")}>商談</FilterButton> : null}
              {canUseTeleapo ? <FilterButton active={domainFilter === "teleapo"} onClick={() => setDomainFilter("teleapo")}>架電</FilterButton> : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[13px] font-bold text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-[24px] border border-[#e2e6ee] bg-white p-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[22px] font-black text-[#171717]">{formatMonth(viewDate)}</h2>
                <p className="mt-1 text-[13px] text-[#7a808c]">{domainLabel}の予定 {monthMeetings.length}件</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setViewDate(addMonths(viewDate, -1))} className="h-10 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-black text-[#343b48]">前月</button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setViewDate(startOfMonth(today));
                    setSelectedDate(startOfDay(today));
                  }}
                  className="h-10 rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717]"
                >
                  今日
                </button>
                <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-10 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-black text-[#343b48]">翌月</button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[12px] font-black text-[#8f96a3]">
              {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const dayMeetings = meetingsByDate.get(toDateKey(day.date)) ?? [];
                const isSelected = isSameDay(day.date, selectedDate);
                const isToday = isSameDay(day.date, new Date());
                return (
                  <button
                    key={day.date.toISOString()}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className={`min-h-[112px] rounded-[16px] border p-2 text-left transition ${
                      isSelected
                        ? "border-[#f0c655] bg-[#fff9e6] shadow-[0_8px_20px_rgba(245,189,7,0.12)]"
                        : day.inMonth
                          ? "border-[#e6eaf0] bg-[#fcfcfd] hover:border-[#ead8a8]"
                          : "border-[#edf0f4] bg-[#f7f8fb] opacity-55"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[13px] font-black ${isToday ? "text-[#8a6500]" : "text-[#343b48]"}`}>{day.date.getDate()}</span>
                      {dayMeetings.length > 0 ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#8a6500]">{dayMeetings.length}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayMeetings.slice(0, 2).map((meeting) => (
                        <div key={meeting.id} className="truncate rounded-[10px] bg-white px-2 py-1 text-[11px] font-bold text-[#4c5565]">
                          {formatTime(meeting.recordedAt)} {meeting.customerName || getDomainLabel(meeting.salesDomain)}
                        </div>
                      ))}
                      {dayMeetings.length > 2 ? <div className="px-1 text-[11px] font-bold text-[#8f96a3]">+{dayMeetings.length - 2}件</div> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-[24px] border border-[#e2e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Selected Day</p>
              <h2 className="mt-1 text-[20px] font-black text-[#171717]">{formatFullDate(selectedDate)}</h2>
              <div className="mt-4 space-y-3">
                {selectedMeetings.length > 0 ? (
                  selectedMeetings.map((meeting) => <MeetingCalendarCard key={meeting.id} meeting={meeting} variant={variant} />)
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-4 py-8 text-center text-[13px] font-bold text-[#8f96a3]">
                    この日の予定はありません
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#e2e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Upcoming</p>
              <h2 className="mt-1 text-[20px] font-black text-[#171717]">直近の予定</h2>
              <div className="mt-4 space-y-3">
                {upcomingMeetings.length > 0 ? (
                  upcomingMeetings.map((meeting) => <MeetingCalendarCard key={meeting.id} meeting={meeting} variant={variant} compact />)
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-4 py-8 text-center text-[13px] font-bold text-[#8f96a3]">
                    直近の予定はありません
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function MeetingCalendarCard({ meeting, variant, compact = false }: { meeting: MeetingRecord; variant: CalendarVariant; compact?: boolean }) {
  const href = variant === "admin" ? `/admin/meetings/${meeting.id}` : `/meetings/${meeting.id}`;
  return (
    <Link href={href} className="block rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 transition hover:border-[#ead8a8] hover:bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#8a6500]">{getDomainLabel(meeting.salesDomain)}</span>
            <span className="text-[12px] font-bold text-[#7a808c]">{formatTimeRange(meeting.recordedAt, meeting.audioDurationSec)}</span>
          </div>
          <h3 className="mt-2 truncate text-[14px] font-black text-[#171717]">{meeting.customerName || `${getDomainLabel(meeting.salesDomain)}名未設定`}</h3>
          <p className="mt-1 truncate text-[12px] font-bold text-[#7a808c]">{meeting.productType || "商材未設定"}</p>
          {!compact && meeting.memo ? <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#596273]">{meeting.memo}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-[#e4e8ef] bg-white px-2.5 py-1 text-[11px] font-black text-[#596273]">
          {getPurposeLabel(meeting.meetingPurpose)}
        </span>
      </div>
    </Link>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-[12px] border px-4 text-[13px] font-black transition ${
        active ? "border-[#f0c655] bg-[#ffd84d] text-[#171717]" : "border-[#e4e8ef] bg-white text-[#596273] hover:border-[#ead8a8]"
      }`}
    >
      {children}
    </button>
  );
}

function buildCalendarDays(viewDate: Date) {
  const firstDay = startOfMonth(viewDate);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: startOfDay(date), inMonth: date.getMonth() === viewDate.getMonth() };
  });
}

function groupMeetingsByDate(meetings: MeetingRecord[]) {
  const map = new Map<string, MeetingRecord[]>();
  meetings.forEach((meeting) => {
    if (!meeting.recordedAt) return;
    const key = toDateKey(meeting.recordedAt);
    map.set(key, [...(map.get(key) ?? []), meeting]);
  });
  map.forEach((items, key) => {
    map.set(key, items.sort((left, right) => (left.recordedAt?.getTime() ?? 0) - (right.recordedAt?.getTime() ?? 0)));
  });
  return map;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameMonth(date: Date | null, monthDate: Date) {
  return Boolean(date && date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth());
}

function isSameDay(date: Date | null, day: Date) {
  return Boolean(date && toDateKey(date) === toDateKey(day));
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(date);
}

function formatTime(date: Date | null) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatTimeRange(date: Date | null, durationSec: number | null) {
  if (!date) return "--:--";
  if (!durationSec) return formatTime(date);
  return `${formatTime(date)} - ${formatTime(new Date(date.getTime() + durationSec * 1000))}`;
}

function getDomainLabel(domain: SalesDomain) {
  return domain === "teleapo" ? "架電" : "商談";
}

function getPurposeLabel(purpose: MeetingPurpose) {
  const labels: Record<MeetingPurpose, string> = {
    new_proposal: "新規提案",
    closing: "クロージング",
    existing_followup: "既存フォロー",
    relationship_building: "関係構築",
    check_in: "近況確認",
    upsell_cross_sell: "追加提案",
    onboarding: "導入支援",
    retention: "継続支援",
  };
  return labels[purpose] ?? "目的未設定";
}
