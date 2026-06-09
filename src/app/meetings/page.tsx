"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";

const productIconMap: Record<string, React.ReactNode> = {
  "SaaSプランA": <CloudIcon color="#60a5fa" bg="#eef5ff" />,
  "SaaSプランB": <MonitorIcon color="#53c7b8" bg="#ecfbf8" />,
  コンサルティング: <UsersIcon color="#f5a623" bg="#fff6e7" />,
  オプションサービス: <StarIcon color="#a76cf5" bg="#f5efff" />,
};

export default function MeetingsPage() {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  useEffect(() => {
    if (!profile?.uid || !profile.role) {
      return;
    }

    const unsubscribe = subscribeToMeetings(
      {
        role: profile.role,
        userId: profile.uid,
      },
      (nextMeetings) => {
        setMeetings(nextMeetings);
        setIsLoading(false);
      },
      (error) => {
        setErrorMessage(
          error.code === "permission-denied"
            ? "打ち合わせ一覧を閲覧する権限がありません。"
            : "打ち合わせ一覧の読み込みに失敗しました。",
        );
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [profile?.role, profile?.uid]);

  const productOptions = useMemo(() => {
    const options = new Set<string>();
    meetings.forEach((meeting) => {
      if (meeting.productType) {
        options.add(meeting.productType);
      }
    });
    return ["all", ...Array.from(options)];
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return meetings.filter((meeting) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [meeting.customerName, meeting.productType, meeting.location, meeting.audioFileName]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesStatus = statusFilter === "all" || meeting.status === statusFilter;
      const matchesProduct =
        productFilter === "all" || meeting.productType === productFilter;

      return matchesSearch && matchesStatus && matchesProduct;
    });
  }, [meetings, productFilter, search, statusFilter]);

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
      <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.04em] text-[#171717]">
            打ち合わせ一覧
          </h1>
          <p className="mt-2 text-[16px] text-[#7a808c]">
            すべての打ち合わせの予定・履歴を確認できます。
          </p>
        </div>

        <div className="flex items-start gap-3 self-start">
          <button
            type="button"
            className="flex items-center gap-3 rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] font-medium text-[#303544] shadow-[0_6px_20px_rgba(17,24,39,0.04)]"
          >
            <CalendarIcon />
            <span>2024/05/01 〜 2024/05/31</span>
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#e6e8ee] bg-white text-[#6e7480] shadow-[0_6px_20px_rgba(17,24,39,0.04)]"
            aria-label="通知"
          >
            <BellIcon />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[#ffc400]" />
          </button>
        </div>
      </section>

      {errorMessage ? (
        <div className="mb-5 rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-[#eceef4] bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
        <div className="mb-4 grid gap-3 xl:grid-cols-[1.5fr_0.75fr_0.75fr_0.42fr]">
          <label className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#96a0ad]">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="会社名・担当者名・目的で検索"
              className="w-full rounded-[14px] border border-[#e6e8ee] bg-white py-3 pl-12 pr-4 text-[14px] text-[#171717] outline-none transition placeholder:text-[#96a0ad] focus:border-[#d7dae2] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
            />
          </label>

          <SelectLike
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ["all", "すべてのステータス"],
              ["won", "成約"],
              ["considering", "検討中"],
              ["lost", "失注"],
            ]}
          />

          <SelectLike
            value={productFilter}
            onChange={setProductFilter}
            options={productOptions.map((option) => [
              option,
              option === "all" ? "すべての商材" : option,
            ])}
          />

          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] font-medium text-[#303544]"
          >
            <ExportIcon />
            <span>エクスポート</span>
          </button>
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-[14px] text-[#7a808c]">
            打ち合わせ一覧を読み込み中です。
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="px-3 py-8 text-[14px] text-[#7a808c]">
            条件に一致する打ち合わせがありません。検索条件を変更してください。
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[20px] border border-[#f0f1f5]">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="border-b border-[#f0f1f5] bg-white">
                  <tr className="text-[13px] font-semibold text-[#171717]">
                    <th className="px-5 py-5">日時</th>
                    <th className="px-5 py-5">会社名 / 担当者</th>
                    <th className="px-5 py-5">商材</th>
                    <th className="px-5 py-5">目的</th>
                    <th className="px-5 py-5">ステータス</th>
                    <th className="px-5 py-5">打ち合わせ時間</th>
                    <th className="px-5 py-5">メモ</th>
                    <th className="px-5 py-5">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeetings.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-b border-[#f3f4f7] text-[14px] text-[#303544] last:border-b-0"
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium text-[#495160]">
                          {meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}
                        </div>
                        <div className="mt-1 text-[#66707d]">
                          {meeting.recordedAt ? formatTimeRange(meeting.recordedAt, meeting.audioDurationSec) : "—"}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium text-[#20242c]">
                          {meeting.customerName || "未設定"}
                        </div>
                        <div className="mt-1 text-[#66707d]">
                          {profile?.name ?? "担当者未設定"} 様
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-3">
                          {productIconMap[meeting.productType || ""] ?? (
                            <CloudIcon color="#60a5fa" bg="#eef5ff" />
                          )}
                          <span>{meeting.productType || "未設定"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {mapMeetingPurpose(meeting.status, meeting.customerType)}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <StatusBadge value={meeting.status} />
                      </td>
                      <td className="px-5 py-4 align-top">
                        {meeting.audioDurationSec
                          ? `${Math.max(1, Math.round(meeting.audioDurationSec / 60))}分`
                          : "—"}
                      </td>
                      <td className="px-5 py-4 align-top text-[#7a808c]">
                        <MemoIcon />
                      </td>
                      <td className="px-5 py-4 align-top">
                        <Link
                          href={`/meetings/${meeting.id}`}
                          className="inline-flex items-center gap-2 rounded-[12px] border border-[#e4e7ed] bg-white px-3 py-2 text-[13px] font-medium text-[#575f6d]"
                        >
                          詳細を見る
                          <span>›</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-[14px] text-[#66707d]">
                全 {filteredMeetings.length} 件中 1 - {Math.min(filteredMeetings.length, 10)} 件を表示
              </div>

              <div className="flex items-center gap-2">
                <PageButton label="‹" />
                <PageButton label="1" active />
                <PageButton label="2" />
                <PageButton label="3" />
                <PageButton label="›" />
              </div>

              <div className="flex items-center gap-3 text-[14px] text-[#66707d]">
                <span>表示件数</span>
                <div className="rounded-[12px] border border-[#e6e8ee] bg-white px-3 py-2 text-[#303544]">
                  10件
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function SelectLike({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 pr-10 text-[14px] text-[#303544] outline-none transition focus:border-[#d7dae2] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#96a0ad]">
        <ChevronDownIcon />
      </span>
    </label>
  );
}

function StatusBadge({ value }: { value: MeetingRecord["status"] }) {
  const map = {
    won: {
      label: "成功",
      className: "bg-[#e9f9ee] text-[#30a65b]",
    },
    considering: {
      label: "検討中",
      className: "bg-[#fff4df] text-[#ff9b38]",
    },
    lost: {
      label: "失注",
      className: "bg-[#ffe8e8] text-[#ff5d47]",
    },
  } as const;

  const current = map[value];

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${current.className}`}>
      {current.label}
    </span>
  );
}

function PageButton({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`flex h-9 w-9 items-center justify-center rounded-[12px] border text-[14px] font-medium ${
        active
          ? "border-[#f2d980] bg-[#fff2c9] text-[#171717]"
          : "border-[#e6e8ee] bg-white text-[#6d7482]"
      }`}
    >
      {label}
    </button>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function formatTimeRange(date: Date, durationSec: number | null) {
  const start = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (!durationSec) {
    return `${start} - --:--`;
  }

  const endDate = new Date(date.getTime() + durationSec * 1000);
  const end = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(endDate);

  return `${start} - ${end}`;
}

function mapMeetingPurpose(
  status: MeetingRecord["status"],
  customerType: MeetingRecord["customerType"],
) {
  if (status === "won") {
    return customerType === "existing" ? "フォローアップ" : "提案";
  }

  if (status === "lost") {
    return customerType === "existing" ? "見積もり" : "ヒアリング";
  }

  return customerType === "existing" ? "情報共有" : "提案";
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="3.75" y="5.5" width="16.5" height="14.5" rx="2.2" />
      <path d="M7.5 3.75v3.5M16.5 3.75v3.5M3.75 9.2h16.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M6.5 15.8V10.9a5.5 5.5 0 1 1 11 0v4.9l1.2 1.8H5.3l1.2-1.8Z" />
      <path d="M10.2 19a2.2 2.2 0 0 0 3.6 0" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function MemoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M6 3.5h9l3 3v14H6z" />
      <path d="M15 3.5v3h3" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function CloudIcon({ color, bg }: { color: string; bg: string }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-current stroke-[1.8]">
        <path d="M7.3 18a4.3 4.3 0 0 1-.5-8.57A5.8 5.8 0 0 1 17.7 10a3.8 3.8 0 0 1-.1 7.6H7.3Z" />
      </svg>
    </span>
  );
}

function MonitorIcon({ color, bg }: { color: string; bg: string }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-current stroke-[1.8]">
        <rect x="4.5" y="5.5" width="15" height="10" rx="1.8" />
        <path d="M9 19h6M12 15.5V19" />
      </svg>
    </span>
  );
}

function UsersIcon({ color, bg }: { color: string; bg: string }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-current stroke-[1.8]">
        <circle cx="8.5" cy="9" r="2.2" />
        <circle cx="15.7" cy="10" r="1.8" />
        <path d="M4.5 17c.7-2.2 2.4-3.6 4.5-3.6s3.8 1.4 4.5 3.6" />
        <path d="M14.3 16c.4-1.4 1.5-2.3 2.8-2.3.9 0 1.7.4 2.3 1" />
      </svg>
    </span>
  );
}

function StarIcon({ color, bg }: { color: string; bg: string }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-current stroke-[1.8]">
        <path d="m12 5 2.16 4.39L19 10.1l-3.5 3.42.83 4.83L12 16.1l-4.33 2.25.83-4.83L5 10.1l4.84-.71L12 5Z" />
      </svg>
    </span>
  );
}
