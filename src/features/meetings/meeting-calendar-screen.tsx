"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  createCalendarEvent,
  subscribeToCalendarEvents,
  type CalendarEvent,
  type CalendarEventCustomerType,
} from "@/lib/firebase/calendar-events";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";
import type { MeetingPurpose } from "@/types/domain";

type CalendarVariant = "admin" | "sales";
type DomainFilter = "all" | SalesDomain;
type CalendarDetailSelection =
  | { type: "event"; event: CalendarEvent }
  | { type: "meeting"; meeting: MeetingRecord };

export function MeetingCalendarScreen({ variant }: { variant: CalendarVariant }) {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [salesUsers, setSalesUsers] = useState<AppUserProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [detailSelection, setDetailSelection] = useState<CalendarDetailSelection | null>(null);
  const canUseMeeting = variant === "admin" || !profile || canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = variant === "admin" || !profile || canUseSalesDomain(profile, "teleapo");
  const defaultDomain: DomainFilter = canUseMeeting && canUseTeleapo ? "all" : canUseTeleapo ? "teleapo" : "meeting";
  const [domainFilter, setDomainFilter] = useState<DomainFilter>(defaultDomain);

  useEffect(() => {
    setDomainFilter(defaultDomain);
  }, [defaultDomain]);

  useEffect(() => {
    if (!profile?.uid || !profile.companyId || !profile.role) return;
    const handleMeetingsError = () => setErrorMessage("商談・テレアポの読み込みに失敗しました。");
    const handleEventsError = () => setErrorMessage("予定の読み込みに失敗しました。");
    const enabledDomains: SalesDomain[] = [
      ...(canUseMeeting ? (["meeting"] as const) : []),
      ...(canUseTeleapo ? (["teleapo"] as const) : []),
    ];
    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId, salesDomains: enabledDomains },
        (nextMeetings) => {
          setMeetings(nextMeetings);
          setErrorMessage(null);
        },
        handleMeetingsError,
      ),
      subscribeToCalendarEvents(
        { companyId: profile.companyId, userId: profile.uid, isAdmin: variant === "admin", salesDomains: enabledDomains },
        (nextEvents) => {
          setCalendarEvents(nextEvents);
          setErrorMessage(null);
        },
        handleEventsError,
      ),
      subscribeToKnowledgeProducts(
        profile.companyId,
        setProducts,
        () => {
          setProducts([]);
        },
      ),
      subscribeToUserProfiles(
        (profiles) => setSalesUsers(profiles.filter((user) => user.role === "sales")),
        () => setSalesUsers([]),
        profile.companyId,
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [canUseMeeting, canUseTeleapo, profile?.companyId, profile?.role, profile?.uid, variant]);

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
  const availableEvents = useMemo(
    () =>
      calendarEvents.filter((event) => {
        if (domainFilter !== "all" && event.salesDomain !== domainFilter) return false;
        if (event.salesDomain === "meeting" && !canUseMeeting) return false;
        if (event.salesDomain === "teleapo" && !canUseTeleapo) return false;
        return Boolean(event.scheduledAt);
      }),
    [calendarEvents, canUseMeeting, canUseTeleapo, domainFilter],
  );
  const monthEvents = useMemo(
    () => availableEvents.filter((event) => isSameMonth(event.scheduledAt, viewDate)),
    [availableEvents, viewDate],
  );
  const selectedMeetings = useMemo(
    () =>
      availableMeetings
        .filter((meeting) => isSameDay(meeting.recordedAt, selectedDate))
        .sort((left, right) => (left.recordedAt?.getTime() ?? 0) - (right.recordedAt?.getTime() ?? 0)),
    [availableMeetings, selectedDate],
  );
  const selectedEvents = useMemo(
    () =>
      availableEvents
        .filter((event) => isSameDay(event.scheduledAt, selectedDate))
        .sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0)),
    [availableEvents, selectedDate],
  );
  const upcomingMeetings = useMemo(
    () =>
      availableMeetings
        .filter((meeting) => (meeting.recordedAt?.getTime() ?? 0) >= startOfDay(new Date()).getTime())
        .sort((left, right) => (left.recordedAt?.getTime() ?? 0) - (right.recordedAt?.getTime() ?? 0))
        .slice(0, 5),
    [availableMeetings],
  );
  const upcomingEvents = useMemo(
    () =>
      availableEvents
        .filter((event) => (event.scheduledAt?.getTime() ?? 0) >= startOfDay(new Date()).getTime())
        .sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0))
        .slice(0, 5),
    [availableEvents],
  );
  const meetingsByDate = useMemo(() => groupMeetingsByDate(monthMeetings), [monthMeetings]);
  const eventsByDate = useMemo(() => groupEventsByDate(monthEvents), [monthEvents]);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const userNameById = useMemo(() => buildUserNameById(salesUsers, profile), [profile, salesUsers]);
  const domainLabel = domainFilter === "teleapo" ? "テレアポ" : domainFilter === "meeting" ? "商談" : "すべて";
  const plannedCount = monthMeetings.length + monthEvents.length;

  async function handleCreateEvent(input: CalendarEventFormState) {
    if (!profile?.uid || !profile.companyId) return;
    if (!input.customerName.trim() || !input.productName.trim() || !input.scheduledAt) {
      setErrorMessage("顧客名、商材、予定日時を入力してください。");
      return;
    }

    setIsSavingEvent(true);
    setErrorMessage(null);
    try {
      await createCalendarEvent({
        companyId: profile.companyId,
        userId: profile.uid,
        salesDomain: input.salesDomain,
        customerName: input.customerName,
        productId: input.productId || null,
        productName: input.productName,
        customerType: input.customerType,
        targetSegment: input.targetSegment,
        meetingPurpose: input.meetingPurpose,
        scheduledAt: new Date(input.scheduledAt),
        location: input.location,
        agenda: input.agenda,
        customerIssues: input.customerIssues,
        preparationMemo: input.preparationMemo,
      });
      setEventFormOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予定の保存に失敗しました。");
    } finally {
      setIsSavingEvent(false);
    }
  }

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1380px] space-y-4">
        <section className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Calendar</p>
              <h1 className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#171717]">カレンダー</h1>
              <p className="mt-2 text-[13px] leading-6 text-[#707783]">
                {variant === "admin" ? "チーム全体の商談・テレアポを日付別に確認できます。" : "自分の商談・テレアポを日付別に確認できます。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {variant === "sales" ? (
                <button
                  type="button"
                  onClick={() => setEventFormOpen((current) => !current)}
                  className="h-10 rounded-[12px] border border-[#171717] bg-[#171717] px-4 text-[13px] font-black text-white"
                >
                  予定を追加
                </button>
              ) : null}
              {canUseMeeting && canUseTeleapo ? <FilterButton active={domainFilter === "all"} onClick={() => setDomainFilter("all")}>すべて</FilterButton> : null}
              {canUseMeeting ? <FilterButton active={domainFilter === "meeting"} onClick={() => setDomainFilter("meeting")}>商談</FilterButton> : null}
              {canUseTeleapo ? <FilterButton active={domainFilter === "teleapo"} onClick={() => setDomainFilter("teleapo")}>テレアポ</FilterButton> : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[13px] font-bold text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        {eventFormOpen && variant === "sales" ? (
          <CalendarEventForm
            products={products}
            defaultDomain={domainFilter === "teleapo" ? "teleapo" : "meeting"}
            selectedDate={selectedDate}
            isSaving={isSavingEvent}
            onCancel={() => setEventFormOpen(false)}
            onSubmit={(input) => void handleCreateEvent(input)}
          />
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-[24px] border border-[#e2e6ee] bg-white p-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[22px] font-black text-[#171717]">{formatMonth(viewDate)}</h2>
                <p className="mt-1 text-[13px] text-[#7a808c]">{domainLabel}の予定 {plannedCount}件</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={viewDate.getFullYear()}
                  onChange={(event) => {
                    const nextDate = new Date(Number(event.target.value), viewDate.getMonth(), 1);
                    setViewDate(nextDate);
                    setSelectedDate(startOfDay(nextDate));
                  }}
                  className="h-10 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-black text-[#343b48] outline-none transition focus:border-[#f0c655]"
                  aria-label="対象年"
                >
                  {buildYearOptions(viewDate).map((year) => (
                    <option key={year} value={year}>{year}年</option>
                  ))}
                </select>
                <select
                  value={viewDate.getMonth()}
                  onChange={(event) => {
                    const nextDate = new Date(viewDate.getFullYear(), Number(event.target.value), 1);
                    setViewDate(nextDate);
                    setSelectedDate(startOfDay(nextDate));
                  }}
                  className="h-10 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-black text-[#343b48] outline-none transition focus:border-[#f0c655]"
                  aria-label="対象月"
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index} value={index}>{index + 1}月</option>
                  ))}
                </select>
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
                const dayEvents = eventsByDate.get(toDateKey(day.date)) ?? [];
                const dayItemCount = dayMeetings.length + dayEvents.length;
                const isSelected = isSameDay(day.date, selectedDate);
                const isToday = isSameDay(day.date, new Date());
                return (
                  <div
                    key={day.date.toISOString()}
                    onClick={() => setSelectedDate(day.date)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedDate(day.date);
                    }}
                    role="button"
                    tabIndex={0}
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
                      {dayItemCount > 0 ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#8a6500]">{dayItemCount}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <span
                          key={event.id}
                          role="button"
                          tabIndex={0}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setSelectedDate(day.date);
                            setDetailSelection({ type: "event", event });
                          }}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                            keyEvent.preventDefault();
                            keyEvent.stopPropagation();
                            setSelectedDate(day.date);
                            setDetailSelection({ type: "event", event });
                          }}
                          className="block truncate rounded-[10px] bg-[#ffd12f] px-2 py-1 text-[11px] font-black text-[#171717] shadow-[0_2px_6px_rgba(245,189,7,0.18)] transition hover:bg-[#ffc400]"
                        >
                          {formatTime(event.scheduledAt)} {event.customerName || getDomainLabel(event.salesDomain)}
                        </span>
                      ))}
                      {dayMeetings.slice(0, 2).map((meeting) => (
                        <span
                          key={meeting.id}
                          role="button"
                          tabIndex={0}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setSelectedDate(day.date);
                            setDetailSelection({ type: "meeting", meeting });
                          }}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                            keyEvent.preventDefault();
                            keyEvent.stopPropagation();
                            setSelectedDate(day.date);
                            setDetailSelection({ type: "meeting", meeting });
                          }}
                          className="block truncate rounded-[10px] bg-[#ffd12f] px-2 py-1 text-[11px] font-black text-[#171717] shadow-[0_2px_6px_rgba(245,189,7,0.18)] transition hover:bg-[#ffc400]"
                        >
                          {formatTime(meeting.recordedAt)} {meeting.customerName || getDomainLabel(meeting.salesDomain)}
                        </span>
                      ))}
                      {dayItemCount > 4 ? <div className="px-1 text-[11px] font-bold text-[#8f96a3]">+{dayItemCount - 4}件</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-[24px] border border-[#e2e6ee] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Selected Day</p>
              <h2 className="mt-1 text-[20px] font-black text-[#171717]">{formatFullDate(selectedDate)}</h2>
              <div className="mt-4 space-y-3">
                {selectedEvents.length + selectedMeetings.length > 0 ? (
                  <>
                    {selectedEvents.map((event) => <CalendarEventCard key={event.id} event={event} ownerName={userNameById.get(event.userId)} variant={variant} />)}
                    {selectedMeetings.map((meeting) => <MeetingCalendarCard key={meeting.id} meeting={meeting} ownerName={userNameById.get(meeting.userId)} variant={variant} />)}
                  </>
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
                {upcomingEvents.length + upcomingMeetings.length > 0 ? (
                  <>
                    {upcomingEvents.map((event) => <CalendarEventCard key={event.id} event={event} ownerName={userNameById.get(event.userId)} variant={variant} compact />)}
                    {upcomingMeetings.map((meeting) => <MeetingCalendarCard key={meeting.id} meeting={meeting} ownerName={userNameById.get(meeting.userId)} variant={variant} compact />)}
                  </>
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
      {detailSelection ? (
        <CalendarDetailModal
          selection={detailSelection}
          variant={variant}
          ownerName={userNameById.get(detailSelection.type === "event" ? detailSelection.event.userId : detailSelection.meeting.userId)}
          onClose={() => setDetailSelection(null)}
        />
      ) : null}
    </main>
  );
}

function MeetingCalendarCard({ meeting, ownerName, variant, compact = false }: { meeting: MeetingRecord; ownerName?: string; variant: CalendarVariant; compact?: boolean }) {
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
          {variant === "admin" ? <p className="mt-1 truncate text-[12px] font-black text-[#8a6500]">担当: {ownerName ?? "未設定"}</p> : null}
          {!compact && meeting.memo ? <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#596273]">{meeting.memo}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-[#e4e8ef] bg-white px-2.5 py-1 text-[11px] font-black text-[#596273]">
          {getPurposeLabel(meeting.meetingPurpose)}
        </span>
      </div>
    </Link>
  );
}

function CalendarDetailModal({
  selection,
  variant,
  ownerName,
  onClose,
}: {
  selection: CalendarDetailSelection;
  variant: CalendarVariant;
  ownerName?: string;
  onClose: () => void;
}) {
  const isEvent = selection.type === "event";
  const title = isEvent
    ? selection.event.customerName || "予定詳細"
    : selection.meeting.customerName || `${getDomainLabel(selection.meeting.salesDomain)}詳細`;
  const domain = isEvent ? selection.event.salesDomain : selection.meeting.salesDomain;
  const productName = isEvent ? selection.event.productName : selection.meeting.productType;
  const scheduledAt = isEvent ? selection.event.scheduledAt : selection.meeting.recordedAt;
  const purpose = isEvent ? selection.event.meetingPurpose : selection.meeting.meetingPurpose;
  const meetingHref = !isEvent
    ? variant === "admin"
      ? `/admin/meetings/${selection.meeting.id}`
      : `/meetings/${selection.meeting.id}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/35 px-4 py-6">
      <section className="max-h-[min(720px,calc(100vh-48px))] w-full max-w-[560px] overflow-hidden rounded-[24px] border border-[#f0c655] bg-white shadow-[0_24px_70px_rgba(17,24,39,0.22)]">
        <div className="border-b border-[#f1dfaa] bg-[#fff4c2] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#171717] px-2.5 py-1 text-[11px] font-black text-white">
                  {isEvent ? "予定" : "アップロード済み"}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                  {getDomainLabel(domain)}
                </span>
              </div>
              <h2 className="mt-3 truncate text-[20px] font-black text-[#171717]">{title}</h2>
              <p className="mt-1 text-[13px] font-bold text-[#6f5500]">
                {formatFullDate(scheduledAt ?? new Date())} {formatTime(scheduledAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f0c655] bg-white text-[20px] leading-none text-[#8a6500] transition hover:bg-[#fffaf0]"
              aria-label="詳細を閉じる"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <CalendarDetailRow label="商材" value={productName || "未設定"} />
            {variant === "admin" ? <CalendarDetailRow label="担当者" value={ownerName ?? "未設定"} /> : null}
            <CalendarDetailRow label="目的" value={getPurposeLabel(purpose)} />
            <CalendarDetailRow
              label="顧客種別"
              value={
                isEvent
                  ? selection.event.customerType === "new" ? "新規" : "既存"
                  : selection.meeting.customerType === "new" ? "新規" : "既存"
              }
            />
            <CalendarDetailRow
              label="場所 / URL"
              value={isEvent ? selection.event.location || "未設定" : selection.meeting.location || "未設定"}
            />
          </div>

          {isEvent ? (
            <div className="mt-4 space-y-3">
              <CalendarDetailBlock label="ターゲット層" value={selection.event.targetSegment || "未登録"} />
              <CalendarDetailBlock label="話すこと" value={selection.event.agenda || "未登録"} />
              <CalendarDetailBlock label="想定課題・不安" value={selection.event.customerIssues || "未登録"} />
              <CalendarDetailBlock label="事前準備メモ" value={selection.event.preparationMemo || "未登録"} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <CalendarDetailBlock label="メモ" value={selection.meeting.memo || "未登録"} />
              <CalendarDetailBlock label="ステータス" value={getMeetingStatusLabel(selection.meeting.status)} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#eef1f5] px-5 py-4">
          {isEvent ? (
            <>
              <Link href={buildPreRoleplayHref(selection.event)} className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[#171717] px-4 text-[13px] font-black text-white">
                事前ロープレ
              </Link>
              <Link href={buildUploadHref(selection.event)} className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[13px] font-black text-[#343b48]">
                アップロード
              </Link>
            </>
          ) : meetingHref ? (
            <Link href={meetingHref} className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[#171717] px-4 text-[13px] font-black text-white">
              詳細を見る
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CalendarDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[11px] font-black text-[#8d94a1]">{label}</div>
      <div className="mt-1 text-[13px] font-bold leading-5 text-[#20242c]">{value}</div>
    </div>
  );
}

function CalendarDetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[11px] font-black text-[#8d94a1]">{label}</div>
      <p className="mt-2 whitespace-pre-wrap text-[13px] font-semibold leading-6 text-[#343b48]">{value}</p>
    </section>
  );
}

type CalendarEventFormState = {
  salesDomain: SalesDomain;
  customerName: string;
  productId: string;
  productName: string;
  customerType: CalendarEventCustomerType;
  targetSegment: string;
  meetingPurpose: MeetingPurpose;
  scheduledAt: string;
  location: string;
  agenda: string;
  customerIssues: string;
  preparationMemo: string;
};

function CalendarEventForm({
  products,
  defaultDomain,
  selectedDate,
  isSaving,
  onCancel,
  onSubmit,
}: {
  products: KnowledgeProduct[];
  defaultDomain: SalesDomain;
  selectedDate: Date;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (input: CalendarEventFormState) => void;
}) {
  const [form, setForm] = useState<CalendarEventFormState>(() => ({
    salesDomain: defaultDomain,
    customerName: "",
    productId: "",
    productName: "",
    customerType: "new",
    targetSegment: "",
    meetingPurpose: defaultDomain === "teleapo" ? "new_proposal" : "new_proposal",
    scheduledAt: toDateTimeLocalValue(selectedDate),
    location: "",
    agenda: "",
    customerIssues: "",
    preparationMemo: "",
  }));

  function update<K extends keyof CalendarEventFormState>(key: K, value: CalendarEventFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Plan</p>
          <h2 className="mt-1 text-[22px] font-black text-[#171717]">詳しい予定を追加</h2>
        </div>
        <button type="button" onClick={onCancel} className="text-[22px] leading-none text-[#9aa1ac]" aria-label="閉じる">×</button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="種別">
          <select value={form.salesDomain} onChange={(event) => update("salesDomain", event.target.value as SalesDomain)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none">
            <option value="meeting">商談</option>
            <option value="teleapo">テレアポ</option>
          </select>
        </Field>
        <Field label="予定日時">
          <input type="datetime-local" value={form.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none" />
        </Field>
        <Field label="顧客名">
          <input value={form.customerName} onChange={(event) => update("customerName", event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none" placeholder="例：株式会社〇〇" />
        </Field>
        <Field label="商材">
          <select
            value={form.productId}
            onChange={(event) => {
              const product = products.find((item) => item.id === event.target.value);
              update("productId", event.target.value);
              update("productName", product?.name ?? "");
            }}
            className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none"
          >
            <option value="">商材を選択</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </Field>
        <Field label="顧客種別">
          <select value={form.customerType} onChange={(event) => update("customerType", event.target.value as CalendarEventCustomerType)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none">
            <option value="new">新規</option>
            <option value="existing">既存</option>
          </select>
        </Field>
        <Field label="商談目的">
          <select value={form.meetingPurpose} onChange={(event) => update("meetingPurpose", event.target.value as MeetingPurpose)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none">
            {meetingPurposeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="ターゲット層">
          <input value={form.targetSegment} onChange={(event) => update("targetSegment", event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none" placeholder="例：SNS担当者が不在の企業" />
        </Field>
        <Field label="場所 / URL">
          <input value={form.location} onChange={(event) => update("location", event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] outline-none" placeholder="例：Zoom / 訪問 / 電話" />
        </Field>
        <Field label="話すこと" className="md:col-span-2">
          <textarea value={form.agenda} onChange={(event) => update("agenda", event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none" placeholder="当日話したい議題や流れ" />
        </Field>
        <Field label="想定課題・不安" className="md:col-span-1">
          <textarea value={form.customerIssues} onChange={(event) => update("customerIssues", event.target.value)} className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none" placeholder="顧客が不安に思っていそうなこと" />
        </Field>
        <Field label="事前準備メモ" className="md:col-span-1">
          <textarea value={form.preparationMemo} onChange={(event) => update("preparationMemo", event.target.value)} className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none" placeholder="確認事項、送付資料、上司に確認したいことなど" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[13px] font-black text-[#343b48]">キャンセル</button>
        <button type="submit" disabled={isSaving} className="h-11 rounded-[14px] bg-[#ffd12f] px-5 text-[13px] font-black text-[#171717] disabled:opacity-60">
          {isSaving ? "保存中" : "予定を保存"}
        </button>
      </div>
    </form>
  );
}

function CalendarEventCard({
  event,
  ownerName,
  variant,
  compact = false,
}: {
  event: CalendarEvent;
  ownerName?: string;
  variant: CalendarVariant;
  compact?: boolean;
}) {
  const roleplayHref = buildPreRoleplayHref(event);
  const uploadHref = buildUploadHref(event);

  return (
    <div className="rounded-[18px] border border-[#f0c655] bg-[#fff4c2] px-4 py-3 shadow-[0_8px_18px_rgba(245,189,7,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#171717] px-2.5 py-1 text-[11px] font-black text-white">予定</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#8a6500]">{getDomainLabel(event.salesDomain)}</span>
            <span className="text-[12px] font-black text-[#6f5500]">{formatTime(event.scheduledAt)}</span>
          </div>
          <h3 className="mt-2 truncate text-[14px] font-black text-[#171717]">{event.customerName || "顧客名未設定"}</h3>
          <p className="mt-1 truncate text-[12px] font-bold text-[#6f5500]">{event.productName || "商材未設定"} / {event.customerType === "new" ? "新規" : "既存"}</p>
          {variant === "admin" ? <p className="mt-1 truncate text-[12px] font-black text-[#8a6500]">担当: {ownerName ?? "未設定"}</p> : null}
          {!compact && event.agenda ? <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#596273]">{event.agenda}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-[#f0c655] bg-white px-2.5 py-1 text-[11px] font-black text-[#6f5500]">
          {getPurposeLabel(event.meetingPurpose)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link href={roleplayHref} className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[#171717] text-[13px] font-black text-white">
          事前ロープレ
        </Link>
        <Link href={uploadHref} className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white text-[13px] font-black text-[#343b48]">
          アップロード
        </Link>
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[13px] font-bold text-[#343b48]">{label}</span>
      {children}
    </label>
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

function groupEventsByDate(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    if (!event.scheduledAt) return;
    const key = toDateKey(event.scheduledAt);
    map.set(key, [...(map.get(key) ?? []), event]);
  });
  map.forEach((items, key) => {
    map.set(key, items.sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0)));
  });
  return map;
}

function buildPreRoleplayHref(event: CalendarEvent) {
  const params = new URLSearchParams({
    category: event.salesDomain,
    prefillProductName: event.productName,
    prefillCustomerType: event.customerType,
    prefillTargetSegment: event.targetSegment,
    prefillCustomerName: event.customerName,
    prefillPurpose: getPurposeLabel(event.meetingPurpose),
    openCreate: "1",
  });

  if (event.customerIssues) params.set("prefillIssues", event.customerIssues);
  if (event.preparationMemo) params.set("prefillMemo", event.preparationMemo);
  return `/sales/roleplay/scenarios?${params.toString()}`;
}

function buildUploadHref(event: CalendarEvent) {
  const params = new URLSearchParams({
    category: event.salesDomain,
    eventId: event.id,
  });
  return `/meetings/upload?${params.toString()}`;
}

function toDateTimeLocalValue(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(10, 0, 0, 0);
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  const hour = String(nextDate.getHours()).padStart(2, "0");
  const minute = String(nextDate.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

const meetingPurposeOptions: Array<{ value: MeetingPurpose; label: string }> = [
  { value: "new_proposal", label: "新規提案" },
  { value: "closing", label: "クロージング" },
  { value: "existing_followup", label: "既存フォロー" },
  { value: "relationship_building", label: "関係構築" },
  { value: "check_in", label: "近況確認" },
  { value: "upsell_cross_sell", label: "追加提案" },
  { value: "onboarding", label: "導入支援" },
  { value: "retention", label: "継続支援" },
];

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildYearOptions(viewDate: Date) {
  const currentYear = new Date().getFullYear();
  const centerYear = viewDate.getFullYear();
  const startYear = Math.min(currentYear, centerYear) - 5;
  const endYear = Math.max(currentYear, centerYear) + 5;
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
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
  return domain === "teleapo" ? "テレアポ" : "商談";
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

function getMeetingStatusLabel(status: MeetingRecord["status"]) {
  if (status === "won") return "成約";
  if (status === "lost") return "失注";
  return "検討中";
}

function buildUserNameById(users: AppUserProfile[], currentProfile: AppUserProfile | null) {
  const rows = new Map<string, string>();
  users.forEach((user) => {
    rows.set(user.uid, user.name || user.email || "名前未設定");
  });
  if (currentProfile) {
    rows.set(currentProfile.uid, currentProfile.name || currentProfile.email || "名前未設定");
  }
  return rows;
}
