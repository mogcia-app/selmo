"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  markAppNotificationRead,
  subscribeToAppNotifications,
  type AppNotification,
} from "@/lib/firebase/notifications";

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
      { href: "/admin/members", label: "営業メンバー", num: "02" },
      { href: "/admin/meetings", label: "商談レビュー", num: "03" },
      { href: "/admin/activity", label: "活動ログ", num: "04" },
    ],
  },
  {
    label: "02 — Enablement",
    items: [
      { href: "/admin/knowledge", label: "ナレッジ管理", num: "05" },
      { href: "/admin/roleplay", label: "ロープレ管理", num: "06" },
      { href: "/admin/products", label: "商材管理", num: "07" },
      { href: "/admin/manuals", label: "営業基準マニュアル", num: "08" },
    ],
  },
  {
    label: "03 — System",
    items: [
      { href: "/admin/users", label: "ユーザー管理", num: "09" },
    ],
  },
];

const salesSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Dashboard",
    items: [
      { href: "/sales/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/meetings", label: "打ち合わせ一覧", num: "02" },
      { href: "/meetings/upload", label: "アップロード", num: "03" },
      { href: "/sales/knowledge", label: "ナレッジ", num: "04" },
      { href: "/sales/roleplay", label: "AIロープレ", num: "05" },
    ],
  },
];

export function DashboardShell({ children, variant }: DashboardShellProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const sections = variant === "admin" ? adminSections : salesSections;
  const initials = (profile?.name ?? profile?.email ?? "S").slice(0, 1);
  const currentLabel =
    sections
      .flatMap((section) => section.items)
      .find((item) => isNavItemActive(pathname, item.href))?.label ?? "ダッシュボード";
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
        variant === "sales" ? "bg-[#f5f5f6] md:grid-cols-[228px_1fr]" : "md:grid-cols-[240px_1fr]"
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

            <nav className="mt-7">
              <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3aab5]">
                Navigation
              </div>
              <div className="space-y-2">
                {sections[0].items.map((item, index) => {
                  const isActive = isNavItemActive(pathname, item.href);
                  const Icon = salesIconMap[index] ?? MenuDotIcon;

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
                        className={`transition ${
                          isActive
                            ? "text-[#f0b400]"
                            : "text-[#8d94a1] group-hover:text-[#171717]"
                        }`}
                      >
                        <Icon />
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
            </nav>

            {notifications.length > 0 ? (
              <div className="mt-6 rounded-[18px] border border-[#f0c655] bg-[#fffaf0] px-4 py-3 shadow-[0_8px_20px_rgba(245,189,7,0.12)]">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a6500]">
                  通知
                </div>
                {notifications.slice(0, 1).map((notification) => (
                  <Link
                    key={notification.id}
                    href={notification.href}
                    onClick={() => void markAppNotificationRead(notification.id)}
                    className="block"
                  >
                    <div className="text-[13px] font-bold text-[#171717]">{notification.title}</div>
                    <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#6f7480]">
                      {notification.body}
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}

            <Link
              href="/sales/account"
              className={`mt-8 block rounded-[20px] border px-4 py-3.5 shadow-[0_8px_22px_rgba(17,24,39,0.04)] transition md:absolute md:bottom-6 md:left-5 md:right-5 md:mt-0 ${
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

          <div className="min-w-0 bg-[#f5f5f6]">{children}</div>
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
                  const isActive = isNavItemActive(pathname, item.href);

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
          className="mt-8 block rounded-[20px] border border-[#e8ebf0] bg-white px-4 py-3.5 shadow-[0_8px_22px_rgba(17,24,39,0.04)] transition hover:border-[#f0c655] hover:bg-[#fffdf7] md:absolute md:bottom-6 md:left-5 md:right-5 md:mt-0"
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
            {variant === "admin" ? (
              <button
                type="button"
                className="rounded-[14px] border border-[#e8ebf0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
              >
                CSV出力
              </button>
            ) : (
              <Link
                href="/meetings/upload"
                className="rounded-[14px] border border-[#171717] bg-[#171717] px-4 py-2.5 text-[13px] font-black text-white transition hover:bg-[#343b48]"
              >
                ＋ 打ち合わせアップロード
              </Link>
            )}
          </div>
        </header>

        {children}
      </div>
        </>
      )}
    </div>
  );
}

function isNavItemActive(pathname: string, href: string) {
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

const salesIconMap = [
  HomeIcon,
  ListIcon,
  UploadIcon,
  ManualIcon,
  RoleplayIcon,
];

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5v9h11v-9" />
      <path d="M10 18.5v-5h4v5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M8 7h11M8 12h11M8 17h11" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function ManualIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16.5H7.8A2.8 2.8 0 0 0 5 22Z" />
      <path d="M5 5.5V22" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" />
    </svg>
  );
}

function RoleplayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7.5 12.5a4 4 0 1 1 8 0" />
      <path d="M5 19c.8-2.3 3.1-3.5 6.5-3.5S17.2 16.7 18 19" />
      <path d="M18.5 8.5h1.2a1.8 1.8 0 0 1 1.8 1.8v2.2a1.8 1.8 0 0 1-1.8 1.8h-1.2" />
      <path d="M5.5 8.5H4.3a1.8 1.8 0 0 0-1.8 1.8v2.2a1.8 1.8 0 0 0 1.8 1.8h1.2" />
      <path d="M12 3.5v2" />
    </svg>
  );
}

function MenuDotIcon() {
  return <span className="block h-2 w-2 rounded-full bg-current" />;
}
