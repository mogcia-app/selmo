"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { useAuth } from "@/features/auth/auth-provider";
import type { AppUserProfile } from "@/lib/firebase/auth";
import { assertFirebaseClient } from "@/lib/firebase/client";
import {
  markAppNotificationRead,
  subscribeToAppNotifications,
  type AppNotification,
} from "@/lib/firebase/notifications";
import { canUseSalesDomain } from "@/lib/sales-domains";
import { SalesKnowledgeChatWidget } from "@/components/sales-knowledge-chat-widget";

type DashboardShellProps = {
  children: React.ReactNode;
  variant: "admin" | "sales";
};

type NavItem = {
  href: string;
  label: string;
  num: string;
};

type AiUsageState = {
  used: number;
  meetingAnalysisCount: number;
  roleplayCount: number;
  isLoading: boolean;
};

type AiUsageLog = {
  id: string;
  createdAt: Date | null;
};

const adminSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Coaching",
    items: [
      { href: "/admin/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/admin/calendar", label: "カレンダー", num: "02" },
      { href: "/admin/members", label: "営業メンバー", num: "03" },
      { href: "/admin/meetings?category=meeting", label: "商談一覧", num: "04" },
      { href: "/admin/meetings?category=teleapo", label: "テレアポ一覧", num: "05" },
      { href: "/admin/activity", label: "活動ログ", num: "06" },
    ],
  },
  {
    label: "02 — Enablement",
    items: [
      { href: "/admin/knowledge", label: "ナレッジ", num: "07" },
      { href: "/admin/roleplay", label: "ロープレ管理", num: "08" },
      { href: "/admin/products", label: "商材管理", num: "09" },
      { href: "/admin/manuals", label: "マニュアル", num: "10" },
      { href: "/admin/analysis-configs", label: "AI分析設定", num: "11" },
    ],
  },
];

const salesSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Home",
    items: [
      { href: "/sales/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/sales/calendar", label: "カレンダー", num: "02" },
      { href: "/sales/customers", label: "顧客カルテ", num: "03" },
    ],
  },
  {
    label: "02 — 商談",
    items: [
      { href: "/meetings/upload?category=meeting", label: "アップロード", num: "04" },
      { href: "/sales/analysis?category=meeting", label: "商談分析", num: "05" },
      { href: "/meetings?category=meeting", label: "打ち合わせ一覧", num: "06" },
      { href: "/sales/roleplay/scenarios?category=meeting", label: "ロープレ", num: "07" },
    ],
  },
  {
    label: "03 — テレアポ",
    items: [
      { href: "/meetings/upload?category=teleapo", label: "アップロード", num: "08" },
      { href: "/sales/analysis?category=teleapo", label: "テレアポ分析", num: "09" },
      { href: "/meetings?category=teleapo", label: "テレアポ一覧", num: "10" },
      { href: "/sales/roleplay/scenarios?category=teleapo", label: "ロープレ", num: "11" },
    ],
  },
  {
    label: "04 — Knowledge",
    items: [
      { href: "/sales/knowledge", label: "ナレッジ", num: "12" },
    ],
  },
];

const nowLabelPlaceholder = "----/--/-- --:--";

export function DashboardShell({ children, variant }: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [aiUsage, setAiUsage] = useState<AiUsageState>({
    used: 0,
    meetingAnalysisCount: 0,
    roleplayCount: 0,
    isLoading: true,
  });
  const [nowLabel, setNowLabel] = useState(nowLabelPlaceholder);
  const sections = variant === "admin" ? adminSections : filterSalesSections(salesSections, profile);
  const initials = (profile?.name ?? profile?.email ?? "S").slice(0, 1);
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const currentLabel = resolveCurrentLabel(pathname, searchParams, sections);
  const shouldShowKnowledgeChat = variant === "sales" && !pathname.startsWith("/sales/knowledge");

  useEffect(() => {
    const updateNowLabel = () => setNowLabel(formatNowLabel());

    updateNowLabel();
    const timer = window.setInterval(updateNowLabel, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (variant !== "sales" || !profile?.companyId || !profile.uid) {
      setNotifications([]);
      return;
    }

    return subscribeToAppNotifications(
      { companyId: profile.companyId, userId: profile.uid },
      setNotifications,
      () => setNotifications([]),
    );
  }, [profile?.companyId, profile?.uid, variant]);

  useEffect(() => {
    if (variant !== "sales" || profile?.role !== "sales" || !profile?.companyId || !profile.uid) {
      setAiUsage({ used: 0, meetingAnalysisCount: 0, roleplayCount: 0, isLoading: false });
      return;
    }

    setAiUsage((current) => ({ ...current, isLoading: true }));

    const canUseMeeting = canUseSalesDomain(profile, "meeting");
    const canUseTeleapo = canUseSalesDomain(profile, "teleapo");
    const canUseRoleplay = canUseMeeting || canUseTeleapo;
    const { firestore } = assertFirebaseClient();
    const meetingsRef = collection(firestore, "meetings");
    const meetingsQueries: Query<DocumentData>[] = [
      ...(canUseMeeting
        ? [
            query(
              meetingsRef,
              where("companyId", "==", profile.companyId),
              where("userId", "==", profile.uid),
              where("salesDomain", "==", "meeting"),
            ),
          ]
        : []),
      ...(canUseTeleapo
        ? [
            query(
              meetingsRef,
              where("companyId", "==", profile.companyId),
              where("userId", "==", profile.uid),
              where("salesDomain", "==", "teleapo"),
            ),
          ]
        : []),
    ];
    let meetingDates: Array<Date | null> = [];
    let roleplayResultDates: Array<Date | null> = [];
    const meetingDatesByIndex = new Map<number, Array<Date | null>>();

    function updateUsage() {
      const meetingAnalysisCount = meetingDates.filter((date) => isCurrentMonth(date)).length;
      const roleplayCount = roleplayResultDates.filter((date) => isCurrentMonth(date)).length;

      setAiUsage({
        used: meetingAnalysisCount + roleplayCount,
        meetingAnalysisCount,
        roleplayCount,
        isLoading: false,
      });
    }

    const unsubscribeMeetings = meetingsQueries.map((meetingsQuery, index) =>
      onSnapshot(
        meetingsQuery,
        (snapshot) => {
          meetingDatesByIndex.set(index, snapshot.docs.map(mapCreatedAtDate));
          meetingDates = Array.from(meetingDatesByIndex.values()).flat();
          updateUsage();
        },
        () => {
          setAiUsage({ used: 0, meetingAnalysisCount: 0, roleplayCount: 0, isLoading: false });
        },
      ),
    );
    const unsubscribeRoleplay = canUseRoleplay
      ? onSnapshot(
          query(
            collection(firestore, "roleplaySessions"),
            where("companyId", "==", profile.companyId),
            where("userId", "==", profile.uid),
          ),
          (snapshot) => {
            roleplayResultDates = snapshot.docs.map((docSnapshot) => {
              const createdAt = docSnapshot.data().createdAt;
              return createdAt instanceof Timestamp ? createdAt.toDate() : null;
            });
            updateUsage();
          },
          () => {
            setAiUsage({ used: 0, meetingAnalysisCount: 0, roleplayCount: 0, isLoading: false });
          },
        )
      : undefined;

    if (meetingsQueries.length === 0 && !canUseRoleplay) {
      setAiUsage({ used: 0, meetingAnalysisCount: 0, roleplayCount: 0, isLoading: false });
    }

    return () => {
      unsubscribeMeetings.forEach((unsubscribe) => unsubscribe());
      unsubscribeRoleplay?.();
    };
  }, [profile, profile?.companyId, profile?.role, profile?.uid, variant]);

  return (
    <div
      className={
        variant === "sales"
          ? "mx-auto max-w-[1680px] bg-white"
          : "mx-auto min-h-screen max-w-[1680px] lg:grid lg:grid-cols-[220px_1fr]"
      }
    >
      {variant === "sales" ? (
        <>
          <aside className="always-visible-scrollbar fixed bottom-0 top-0 left-[max(0px,calc((100vw-1680px)/2))] hidden w-[232px] overflow-y-auto border-r border-[#eceef4] bg-white px-4 py-7 lg:block">
            <div className="text-[13px] font-semibold tracking-[0.34em] text-[#171717]">
              selmo<span className="text-[#ffc400]">.</span>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[#9aa1ad]">
              sales dashboard
            </div>

            <div className="mt-8 px-4 py-5">
              <Image
                src="/sels1.png"
                alt="selmo"
                width={170}
                height={130}
                className="mx-auto h-auto w-[112px] object-contain"
              />
            </div>

            <nav className="mt-7 space-y-6">
              {sections.map((section) => (
                <div key={section.label}>
                  <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3aab5]">
                    {section.label}
                  </div>
                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const isActive = isNavItemActive(pathname, item.href, searchParams);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`group flex items-center gap-3 rounded-[18px] px-4 py-3.5 text-[15px] font-medium transition ${
                            isActive
                              ? "bg-[linear-gradient(180deg,#fff2c8_0%,#ffe7a0_100%)] text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)]"
                              : "text-[#616875] hover:bg-[#f7f7fa] hover:text-[#171717]"
                          }`}
                        >
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black transition ${
                              isActive
                                ? "bg-white text-[#d79d00]"
                                : "bg-[#f1f2f5] text-[#8d94a1] group-hover:text-[#171717]"
                            }`}
                          >
                            {item.num}
                          </span>
                          <span className="flex-1">{item.label}</span>
                          <span
                            className={`text-[12px] transition ${
                              isActive ? "text-[#d79d00]" : "text-[#c6ccd5] group-hover:text-[#8d94a1]"
                            }`}
                          >
                            ›
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <Link
              href="/sales/account"
              className={`mt-8 block rounded-[20px] border px-4 py-3.5 shadow-[0_8px_22px_rgba(17,24,39,0.04)] transition ${
                pathname === "/sales/account"
                  ? "border-[#f0c655] bg-[#fff8e4]"
                  : "border-[#e8ebf0] bg-white hover:border-[#f0c655] hover:bg-[#fffdf7]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Image
                  src="/sels1.png"
                  alt="avatar"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#20242c]">
                    {profile?.name ?? profile?.email ?? "アカウント"}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#7d8490]">
                    {profile?.role === "admin" ? "管理者" : "営業担当"}
                  </div>
                </div>
                <span className="text-[13px] text-[#9aa1ad]">›</span>
              </div>
            </Link>
          </aside>

          <div className="min-w-0 bg-[#f5f5f6] lg:ml-[232px] lg:min-h-screen">
            <header className="sticky top-0 z-20 border-b border-[#eceef4] bg-white/92 px-4 py-3 backdrop-blur md:px-6 lg:px-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#9aa1ad]">
                  <span>selmo<span className="text-[#ffc400]">.</span></span>
                  <span className="text-[#d8dde6]">/</span>
                  <span className="text-[#171717]">{currentLabel}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:gap-[14px]">
                  <AiUsageGauge profile={profile} usage={aiUsage} />
                  <span className="rounded-full border border-[#e8ebf0] bg-[#f7f7fa] px-3 py-2 text-[12px] font-semibold text-[#7d8490]">
                    {nowLabel}
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsNotificationOpen((current) => !current)}
                      className="relative inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#e8ebf0] bg-white shadow-[0_8px_20px_rgba(17,24,39,0.04)] transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                      aria-label="通知を開く"
                      aria-expanded={isNotificationOpen}
                    >
                      <Image src="/nareji.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
                      {unreadNotificationCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[11px] font-black leading-none text-white shadow-[0_4px_10px_rgba(255,59,48,0.3)]">
                          {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                        </span>
                      ) : null}
                    </button>

                    {isNotificationOpen ? (
                      <div className="absolute right-0 top-[58px] z-30 w-[min(340px,calc(100vw-32px))] rounded-[20px] border border-[#eceef4] bg-white p-3 shadow-[0_18px_42px_rgba(17,24,39,0.14)]">
                        <div className="flex items-center justify-between px-2 py-1">
                          <div className="text-[13px] font-black text-[#171717]">通知</div>
                          <div className="text-[11px] font-bold text-[#8a909b]">{notifications.length}件</div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {notifications.length > 0 ? (
                            notifications.map((notification) => (
                              <Link
                                key={notification.id}
                                href={notification.href}
                                onClick={() => {
                                  setIsNotificationOpen(false);
                                  void markAppNotificationRead(notification.id);
                                }}
                                className={`block rounded-[16px] border px-4 py-3 transition hover:border-[#f0c655] hover:bg-[#fffdf7] ${
                                  notification.read ? "border-[#eef1f5] bg-[#fcfcfd]" : "border-[#f0c655] bg-[#fffaf0]"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  {!notification.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ff3b30]" /> : null}
                                  <div className="min-w-0">
                                    <div className="truncate text-[13px] font-black text-[#171717]">{notification.title}</div>
                                    <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6f7480]">{notification.body}</div>
                                  </div>
                                </div>
                              </Link>
                            ))
                          ) : (
                            <div className="rounded-[16px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-4 py-6 text-center text-[13px] font-bold text-[#8a909b]">
                              新しい通知はありません
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <MobileNav
                sections={sections}
                pathname={pathname}
                searchParams={searchParams}
                accountHref="/sales/account"
                accountLabel="アカウント"
              />
            </header>

            {children}
            {shouldShowKnowledgeChat ? <SalesKnowledgeChatWidget /> : null}
          </div>
        </>
      ) : (
        <>
      <aside className="always-visible-scrollbar hidden min-h-screen overflow-y-auto border-r border-[#eceef4] bg-white px-4 py-7 lg:block">
        <div className="text-[13px] font-semibold tracking-[0.34em] text-[#171717]">
          selmo<span className="text-[#ffc400]">.</span>
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[#9aa1ad]">
          manager console
        </div>

        <div className="mt-8 px-4 py-5">
          <Image
            src="/sels1.png"
            alt="selmo"
            width={170}
            height={130}
            className="mx-auto h-auto w-[112px] object-contain"
          />
        </div>

        <nav className="mt-7 space-y-6">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3aab5]">
                {section.label}
              </div>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const isActive = isNavItemActive(pathname, item.href, searchParams);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-[18px] px-4 py-3.5 text-[14px] font-medium transition ${
                        isActive
                          ? "bg-[linear-gradient(180deg,#fff2c8_0%,#ffe7a0_100%)] text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)]"
                          : "text-[#616875] hover:bg-[#f7f7fa] hover:text-[#171717]"
                      }`}
                    >
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black transition ${
                          isActive
                            ? "bg-white text-[#d79d00]"
                            : "bg-[#f1f2f5] text-[#8d94a1] group-hover:text-[#171717]"
                        }`}
                      >
                        {item.num}
                      </span>
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      <span
                        className={`text-[12px] transition ${
                          isActive ? "text-[#d79d00]" : "text-[#c6ccd5] group-hover:text-[#8d94a1]"
                        }`}
                      >
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <Link
          href="/admin/account"
          className={`mt-8 block rounded-[20px] border px-4 py-3.5 shadow-[0_8px_22px_rgba(17,24,39,0.04)] transition hover:border-[#f0c655] hover:bg-[#fffdf7] ${
            pathname === "/admin/account" ? "border-[#f0c655] bg-[#fff8e4]" : "border-[#e8ebf0] bg-white"
          }`}
        >
          <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fff1bf] text-[14px] font-black text-[#8a6500]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-[#20242c]">
              {profile?.name ?? profile?.email ?? "Guest"}
            </div>
            <div className="mt-0.5 text-[12px] text-[#7d8490]">
              管理者
            </div>
          </div>
          <span className="text-[13px] text-[#9aa1ad]">›</span>
          </div>
        </Link>
      </aside>

      <div className={`min-w-0 ${pathname.startsWith("/admin/knowledge") ? "bg-white" : "bg-[#f5f5f6]"}`}>
        <header className="sticky top-0 z-10 border-b border-[#eceef4] bg-white/92 px-4 py-3 backdrop-blur md:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#9aa1ad]">
              <span>Selmo</span>
              <span className="text-[#d8dde6]">/</span>
              <span className="text-[#171717]">{currentLabel}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-[14px]">
              <AiUsageGauge profile={profile} usage={aiUsage} />
              <span className="rounded-full border border-[#e8ebf0] bg-[#f7f7fa] px-3 py-2 text-[12px] font-semibold text-[#7d8490]">
                {nowLabel}
              </span>
            </div>
          </div>
          <MobileNav
            sections={sections}
            pathname={pathname}
            searchParams={searchParams}
            accountHref="/admin/account"
            accountLabel="アカウント"
          />
        </header>

        {children}
      </div>
        </>
      )}
    </div>
  );
}

function MobileNav({
  sections,
  pathname,
  searchParams,
  accountHref,
  accountLabel,
}: {
  sections: Array<{ label: string; items: NavItem[] }>;
  pathname: string;
  searchParams: { get: (name: string) => string | null };
  accountHref: string;
  accountLabel: string;
}) {
  const items = [
    ...sections.flatMap((section) => section.items),
    { href: accountHref, label: accountLabel, num: "" },
  ];

  return (
    <nav className="-mx-4 mt-3 flex gap-2 overflow-x-auto border-t border-[#eef1f5] px-4 pt-3 lg:hidden">
      {items.map((item) => {
        const isActive = item.href === accountHref
          ? pathname === accountHref
          : isNavItemActive(pathname, item.href, searchParams);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] border px-3 text-[13px] font-bold transition ${
              isActive
                ? "border-[#f0c655] bg-[#fff1bf] text-[#171717]"
                : "border-[#e8ebf0] bg-white text-[#596273] hover:border-[#f0c655] hover:bg-[#fffdf7]"
            }`}
          >
            {item.num ? (
              <span className={`text-[11px] ${isActive ? "text-[#8a6500]" : "text-[#9aa1ad]"}`}>
                {item.num}
              </span>
            ) : null}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function resolveCurrentLabel(
  pathname: string,
  searchParams: { get: (name: string) => string | null },
  sections: Array<{ label: string; items: NavItem[] }>,
) {
  if (pathname === "/admin/account" || pathname === "/sales/account") return "アカウント設定";
  if (pathname === "/meetings/upload") return getCategoryLabel(searchParams, "アップロード");
  if (pathname === "/meetings") return getCategoryLabel(searchParams, "一覧");
  if (pathname.match(/^\/meetings\/[^/]+\/summary$/)) return "AIサマリー";
  if (pathname.match(/^\/meetings\/[^/]+$/)) return "文字起こし";
  if (pathname.match(/^\/admin\/meetings\/[^/]+$/)) return "レビュー詳細";
  if (pathname.match(/^\/admin\/knowledge\/[^/]+$/)) return "ナレッジ詳細";
  if (pathname.match(/^\/admin\/members\/[^/]+$/)) return "メンバー詳細";
  if (pathname === "/sales/roleplay" || pathname === "/sales/roleplay/scenarios" || pathname === "/sales/roleplay/results") return "ロープレ";
  if (pathname.match(/^\/sales\/knowledge\/products\/[^/]+$/)) return "商材ナレッジ";
  if (pathname.match(/^\/sales\/knowledge\/categories\/[^/]+\/knowledge\/[^/]+\/edit$/)) return "ナレッジ編集";
  if (pathname.match(/^\/sales\/knowledge\/categories\/[^/]+\/knowledge\/[^/]+$/)) return "ナレッジ詳細";
  if (pathname.match(/^\/sales\/knowledge\/categories\/[^/]+$/)) return "カテゴリナレッジ";

  return sections
    .flatMap((section) => section.items)
    .find((item) => isNavItemActive(pathname, item.href, searchParams))?.label ?? "ダッシュボード";
}

function getCategoryLabel(searchParams: { get: (name: string) => string | null }, suffix: string) {
  return searchParams.get("category") === "teleapo" ? `テレアポ${suffix}` : `商談${suffix}`;
}

function formatNowLabel() {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

function isNavItemActive(pathname: string, href: string, searchParams: { get: (name: string) => string | null }) {
  const currentPathname = normalizeDemoPathname(pathname);
  const target = new URL(href, "https://selmo.local");
  const hasQuery = target.searchParams.size > 0;

  if (hasQuery) {
    if (currentPathname !== target.pathname) return false;

    const targetCategory = target.searchParams.get("category");
    const targetView = target.searchParams.get("view") ?? "";
    const currentCategory = searchParams.get("category") ?? getDefaultSalesCategory(currentPathname);
    const currentView = searchParams.get("view") ?? "";

    if (targetCategory && currentCategory !== targetCategory) return false;
    return targetView === currentView;
  }

  if (href === "/meetings") {
    return currentPathname === href;
  }

  if (href === "/meetings/upload") {
    return currentPathname === href;
  }

  if (href.includes("/meetings/")) {
    return currentPathname.startsWith("/meetings/") && currentPathname !== "/meetings/upload";
  }

  if (href.startsWith("/sales/")) {
    return currentPathname === href || currentPathname.startsWith(`${href}/`);
  }

  if (href.startsWith("/admin/")) {
    return currentPathname === href || currentPathname.startsWith(`${href}/`);
  }

  return currentPathname === href;
}

function normalizeDemoPathname(pathname: string) {
  if (pathname === "/admin/demo" || pathname === "/admin/demo/dashboard") return "/admin/dashboard";
  if (pathname === "/sales/demo" || pathname === "/sales/demo/dashboard") return "/sales/dashboard";
  if (pathname === "/sales/demo/customers") return "/sales/customers";
  if (pathname === "/sales/demo/knowledge") return "/sales/knowledge";
  if (pathname === "/sales/demo/roleplay") return "/sales/roleplay/scenarios";
  return pathname;
}

function filterSalesSections(
  sections: Array<{ label: string; items: NavItem[] }>,
  profile: AppUserProfile | null,
) {
  if (!profile) return sections;

  const canUseMeeting = canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = canUseSalesDomain(profile, "teleapo");
  const canUseRoleplay = canUseMeeting || canUseTeleapo;
  const canUseKnowledge = canUseMeeting || canUseTeleapo;

  return sections
    .map((section) => {
      if (section.label.includes("商談") && !canUseMeeting) return null;
      if (section.label.includes("テレアポ") && !canUseTeleapo) return null;
      if (section.label.includes("Knowledge") && !canUseKnowledge) return null;
      return {
        ...section,
        items: section.items.filter((item) => !item.href.startsWith("/sales/roleplay") || canUseRoleplay),
      };
    })
    .filter((section): section is Array<{ label: string; items: NavItem[] }>[number] => Boolean(section));
}

function AiUsageGauge({ profile, usage }: { profile: AppUserProfile | null; usage: AiUsageState }) {
  if (!profile || profile.role !== "sales") {
    return null;
  }

  const quota = resolveMonthlyAiQuota(profile);
  const percent = quota && quota > 0 ? Math.min(100, Math.round((usage.used / quota) * 100)) : 0;
  const barColor = percent >= 100 ? "bg-[#ef4444]" : percent >= 80 ? "bg-[#f59e0b]" : "bg-[#ffc400]";
  const label = quota ? `${usage.used} / ${quota}回` : `${usage.used}回 / 無制限`;

  return (
    <div
      className="min-w-[168px] px-1 py-1"
      title={`今月の商談・テレアポ分析 ${usage.meetingAnalysisCount}回 / ロープレ ${usage.roleplayCount}回`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-black text-[#8a6500]">AI回数</span>
        <span className="text-[12px] font-black text-[#171717]">
          {usage.isLoading ? "集計中" : label}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: usage.isLoading ? "28%" : quota ? `${percent}%` : "100%" }}
        />
      </div>
    </div>
  );
}

function resolveMonthlyAiQuota(profile: AppUserProfile) {
  if (profile.role !== "sales") return null;
  if (profile.monthlyTranscriptionQuota === null || profile.monthlyRoleplayQuota === null) return null;
  return profile.monthlyTranscriptionQuota + profile.monthlyRoleplayQuota;
}

function mapAiUsageLog(snapshot: QueryDocumentSnapshot<DocumentData>): AiUsageLog {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.recordedAt instanceof Timestamp ? data.recordedAt.toDate() : null,
  };
}

function mapCreatedAtDate(snapshot: QueryDocumentSnapshot<DocumentData>) {
  return mapAiUsageLog(snapshot).createdAt;
}

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function getDefaultSalesCategory(pathname: string) {
  if (
    pathname === "/meetings" ||
    pathname === "/meetings/upload" ||
    pathname === "/sales/roleplay" ||
    pathname === "/sales/roleplay/scenarios" ||
    pathname === "/sales/roleplay/results"
  ) {
    return "meeting";
  }

  return "";
}
