"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import type { AppUserProfile } from "@/lib/firebase/auth";
import {
  markAppNotificationRead,
  subscribeToAppNotifications,
  type AppNotification,
} from "@/lib/firebase/notifications";
import { canUseSalesDomain } from "@/lib/sales-domains";

type DashboardShellProps = {
  children: React.ReactNode;
  variant: "admin" | "sales";
};

type NavItem = {
  href: string;
  label: string;
  num: string;
};

const adminSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Coaching",
    items: [
      { href: "/admin/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/admin/calendar", label: "カレンダー", num: "02" },
      { href: "/admin/members", label: "営業メンバー", num: "03" },
      { href: "/admin/analysis?category=meeting", label: "商談分析", num: "04" },
      { href: "/admin/analysis?category=teleapo", label: "テレアポ分析", num: "05" },
      { href: "/admin/meetings?category=meeting", label: "商談一覧 / レビュー", num: "06" },
      { href: "/admin/meetings?category=teleapo", label: "テレアポ一覧 / レビュー", num: "07" },
      { href: "/admin/activity", label: "活動ログ", num: "08" },
    ],
  },
  {
    label: "02 — Enablement",
    items: [
      { href: "/admin/knowledge", label: "ナレッジ管理", num: "09" },
      { href: "/admin/roleplay", label: "ロープレ管理", num: "10" },
      { href: "/admin/products", label: "商材管理", num: "11" },
      { href: "/admin/manuals", label: "マニュアル", num: "12" },
    ],
  },
  {
    label: "03 — System",
    items: [
      { href: "/admin/users", label: "ユーザー管理", num: "13" },
    ],
  },
];

const salesSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Home",
    items: [
      { href: "/sales/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/sales/calendar", label: "カレンダー", num: "02" },
    ],
  },
  {
    label: "02 — 商談",
    items: [
      { href: "/meetings/upload?category=meeting", label: "アップロード", num: "03" },
      { href: "/sales/analysis?category=meeting", label: "商談分析", num: "04" },
      { href: "/meetings?category=meeting", label: "打ち合わせ一覧", num: "05" },
      { href: "/sales/roleplay/scenarios?category=meeting", label: "ロープレ", num: "06" },
    ],
  },
  {
    label: "03 — テレアポ",
    items: [
      { href: "/meetings/upload?category=teleapo", label: "アップロード", num: "07" },
      { href: "/sales/analysis?category=teleapo", label: "テレアポ分析", num: "08" },
      { href: "/meetings?category=teleapo", label: "架電一覧", num: "09" },
      { href: "/sales/roleplay/scenarios?category=teleapo", label: "ロープレ", num: "10" },
    ],
  },
  {
    label: "04 — Knowledge",
    items: [
      { href: "/sales/knowledge", label: "ナレッジ", num: "11" },
    ],
  },
];

export function DashboardShell({ children, variant }: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const sections = variant === "admin" ? adminSections : filterSalesSections(salesSections, profile);
  const initials = (profile?.name ?? profile?.email ?? "S").slice(0, 1);
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const currentLabel = resolveCurrentLabel(pathname, searchParams, sections);
  const nowLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());

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

  return (
    <div
      className={`mx-auto grid min-h-screen max-w-[1680px] ${
        variant === "sales" ? "bg-[#f5f5f6] md:grid-cols-[260px_1fr]" : "md:grid-cols-[240px_1fr]"
      }`}
    >
      {variant === "sales" ? (
        <>
          <aside className="relative border-b border-[#eceef4] bg-white px-5 py-8 md:min-h-screen md:border-b-0 md:border-r">
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

          <div className="min-w-0 bg-[#f5f5f6]">
            <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-[#eceef4] bg-white/92 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#9aa1ad]">
                <span>selmo<span className="text-[#ffc400]">.</span></span>
                <span className="text-[#d8dde6]">/</span>
                <span className="text-[#171717]">{currentLabel}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 md:gap-[14px]">
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
            </header>

            {children}
          </div>
        </>
      ) : (
        <>
      <aside className="relative border-b border-[#eceef4] bg-white px-5 py-8 md:min-h-screen md:border-b-0 md:border-r">
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
          href="/admin/account"
          className={`mt-8 block rounded-[20px] border px-4 py-3.5 shadow-[0_8px_22px_rgba(17,24,39,0.04)] transition hover:border-[#f0c655] hover:bg-[#fffdf7] md:absolute md:bottom-6 md:left-5 md:right-5 md:mt-0 ${
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

      <div className="min-w-0 bg-[#f5f5f6]">
        <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-[#eceef4] bg-white/92 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#9aa1ad]">
            <span>Selmo</span>
            <span className="text-[#d8dde6]">/</span>
            <span className="text-[#171717]">{currentLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-[14px]">
            <span className="rounded-full border border-[#e8ebf0] bg-[#f7f7fa] px-3 py-2 text-[12px] font-semibold text-[#7d8490]">
              {nowLabel}
            </span>
            <button
              type="button"
              className="rounded-[14px] border border-[#e8ebf0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
            >
              CSV出力
            </button>
          </div>
        </header>

        {children}
      </div>
        </>
      )}
    </div>
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
  return searchParams.get("category") === "teleapo" ? `架電${suffix}` : `商談${suffix}`;
}

function isNavItemActive(pathname: string, href: string, searchParams: { get: (name: string) => string | null }) {
  const target = new URL(href, "https://selmo.local");
  const hasQuery = target.searchParams.size > 0;

  if (hasQuery) {
    if (pathname !== target.pathname) return false;

    const targetCategory = target.searchParams.get("category");
    const targetView = target.searchParams.get("view") ?? "";
    const currentCategory = searchParams.get("category") ?? getDefaultSalesCategory(pathname);
    const currentView = searchParams.get("view") ?? "";

    if (targetCategory && currentCategory !== targetCategory) return false;
    return targetView === currentView;
  }

  if (href === "/meetings") {
    return pathname === href;
  }

  if (href === "/meetings/upload") {
    return pathname === href;
  }

  if (href.includes("/meetings/")) {
    return pathname.startsWith("/meetings/") && pathname !== "/meetings/upload";
  }

  if (href.startsWith("/sales/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href;
}

function filterSalesSections(
  sections: Array<{ label: string; items: NavItem[] }>,
  profile: AppUserProfile | null,
) {
  if (!profile) return sections;

  const canUseMeeting = canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = canUseSalesDomain(profile, "teleapo");
  const canUseRoleplay = canUseMeeting || canUseTeleapo;

  return sections
    .map((section) => {
      if (section.label.includes("商談") && !canUseMeeting) return null;
      if (section.label.includes("テレアポ") && !canUseTeleapo) return null;
      if (section.label.includes("Knowledge") && !canUseMeeting) return null;
      return {
        ...section,
        items: section.items.filter((item) => !item.href.startsWith("/sales/roleplay") || canUseRoleplay),
      };
    })
    .filter((section): section is Array<{ label: string; items: NavItem[] }>[number] => Boolean(section));
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
