"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { getMeetingPurposeLabel, subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { canUseSalesDomain } from "@/lib/sales-domains";

const productIconMap: Record<string, React.ReactNode> = {
  "SaaSプランA": <CloudIcon color="#60a5fa" bg="#eef5ff" />,
  "SaaSプランB": <MonitorIcon color="#53c7b8" bg="#ecfbf8" />,
  コンサルティング: <UsersIcon color="#f5a623" bg="#fff6e7" />,
  オプションサービス: <StarIcon color="#a76cf5" bg="#f5efff" />,
};

export default function MeetingsPage() {
  const searchParams = useSearchParams();
  const category = searchParams.get("category") === "teleapo" ? "teleapo" : "meeting";
  const copy = category === "teleapo"
    ? {
        title: "架電一覧",
        description: "過去のテレアポ・架電ログを検索し、文字起こしや詳細を確認できます。",
        loading: "架電一覧を読み込み中です。",
        empty: "条件に一致する架電ログがありません。検索条件を変更してください。",
        uploadLabel: "架電ログをアップロード",
        searchPlaceholder: "会社名・担当者名・商材で検索",
        purposeLabel: "架電目的",
        backLabel: "ダッシュボードへ戻る",
      }
    : {
        title: "打ち合わせ一覧",
        description: "過去の商談・打ち合わせデータを検索し、文字起こしや詳細を確認できます。",
        loading: "打ち合わせ一覧を読み込み中です。",
        empty: "条件に一致する打ち合わせがありません。検索条件を変更してください。",
        uploadLabel: "音声をアップロード",
        searchPlaceholder: "会社名・担当者名・商材で検索",
        purposeLabel: "目的",
        backLabel: "ダッシュボードへ戻る",
      };
  const { isLoading: isAuthLoading, profile } = useAuth();
  const canAccessDomain = isAuthLoading || canUseSalesDomain(profile, category);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedInfoMeeting, setSelectedInfoMeeting] = useState<MeetingRecord | null>(null);

  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }

    if (!profile?.uid || !profile.role || !profile.companyId || !canAccessDomain) {
      setMeetings([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const unsubscribe = subscribeToMeetings(
      {
        role: profile.role,
        userId: profile.uid,
        companyId: profile.companyId,
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
  }, [canAccessDomain, isAuthLoading, profile?.companyId, profile?.role, profile?.uid]);

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
      if (meeting.salesDomain !== category) return false;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [meeting.customerName, meeting.productType, meeting.location, meeting.audioFileName, meeting.memo]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesStatus = statusFilter === "all" || meeting.status === statusFilter;
      const matchesProduct =
        productFilter === "all" || meeting.productType === productFilter;
      const matchesDate = dateFilter === "all" || isWithinDateFilter(meeting.recordedAt, dateFilter);

      return matchesSearch && matchesStatus && matchesProduct && matchesDate;
    });
  }, [category, dateFilter, meetings, productFilter, search, statusFilter]);

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <section className="mb-4 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.04em] text-[#171717]">
            {copy.title}
          </h1>
          <p className="mt-2 text-[16px] text-[#7a808c]">
            {copy.description}
          </p>
        </div>

        <div className="flex items-start gap-3 self-start">
          <Link
            href={`/meetings/upload?category=${category}`}
            className="flex items-center gap-3 rounded-[14px] border border-[#f0c655] bg-white px-4 py-3 text-[14px] font-semibold text-[#303544] shadow-[0_6px_20px_rgba(17,24,39,0.04)]"
          >
            <UploadIcon />
            <span>{copy.uploadLabel}</span>
          </Link>
        </div>
      </section>

      {errorMessage ? (
        <div className="mb-5 rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
          {errorMessage}
        </div>
      ) : null}

      {!canAccessDomain ? (
        <div className="rounded-[24px] border border-[#f2d6d6] bg-white px-6 py-12 text-center shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <h2 className="text-[26px] font-black tracking-[-0.04em] text-[#171717]">この一覧は利用できません</h2>
          <p className="mt-3 text-[15px] leading-7 text-[#596273]">
            {category === "teleapo" ? "テレアポ" : "商談"}の利用権限がありません。必要な場合は管理者に依頼してください。
          </p>
        </div>
      ) : null}

      {canAccessDomain ? (
      <section className="rounded-[24px] border border-[#eceef4] bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
        <div className="mb-4 grid gap-3 xl:grid-cols-[1.35fr_0.68fr_0.68fr_0.68fr]">
          <label className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#96a0ad]">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-[14px] border border-[#e6e8ee] bg-white py-3 pl-12 pr-4 text-[14px] text-[#171717] outline-none transition placeholder:text-[#96a0ad] focus:border-[#d7dae2] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
            />
          </label>

          <SelectLike
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ["all", "成約/失注すべて"],
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

          <SelectLike
            value={dateFilter}
            onChange={setDateFilter}
            options={[
              ["all", "すべての日付"],
              ["thisMonth", "今月"],
              ["lastMonth", "先月"],
              ["last90Days", "直近90日"],
            ]}
          />
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-[14px] text-[#7a808c]">
            {copy.loading}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="px-3 py-8 text-[14px] text-[#7a808c]">
            {copy.empty}
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
                    <th className="px-5 py-5">{copy.purposeLabel}</th>
                    <th className="px-5 py-5">成約/失注</th>
                    <th className="px-5 py-5">処理状況</th>
                    <th className="px-5 py-5">AIスコア</th>
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
                        {getMeetingPurposeLabel(meeting.meetingPurpose)}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <StatusBadge value={meeting.status} />
                      </td>
                      <td className="px-5 py-4 align-top">
                        <ProcessingBadge meeting={meeting} />
                      </td>
                      <td className="px-5 py-4 align-top">
                        <AiScoreCell meeting={meeting} />
                      </td>
                      <td className="px-5 py-4 align-top text-[#7a808c]">
                        <button
                          type="button"
                          onClick={() => setSelectedInfoMeeting(meeting)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#e4e7ed] bg-white text-[#6b7280] transition hover:border-[#f0c655] hover:bg-[#fffaf0] hover:text-[#8b6a00]"
                          aria-label="打ち合わせ情報を見る"
                        >
                          <MemoIcon />
                        </button>
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
                全 {filteredMeetings.length} 件を表示
              </div>
              <Link href="/sales/dashboard" className="text-[14px] font-semibold text-[#8b6a00]">
                {copy.backLabel}
              </Link>
            </div>
          </>
        )}
      </section>
      ) : null}

      {selectedInfoMeeting ? (
        <MeetingInfoModal
          meeting={selectedInfoMeeting}
          ownerName={profile?.name ?? "担当者未設定"}
          purposeLabel={copy.purposeLabel}
          onClose={() => setSelectedInfoMeeting(null)}
        />
      ) : null}
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

function MeetingInfoModal({
  meeting,
  ownerName,
  purposeLabel,
  onClose,
}: {
  meeting: MeetingRecord;
  ownerName: string;
  purposeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
      <div className="w-full max-w-[680px] overflow-hidden rounded-[24px] border border-[#eceef4] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-6 py-5">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.03em] text-[#171717]">打ち合わせ情報</h2>
            <p className="mt-1 text-[13px] text-[#7a808c]">{meeting.customerName || "未設定"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e4e7ed] bg-white text-[20px] leading-none text-[#667085] transition hover:bg-[#f7f7f8]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <InfoRow
              label="日時"
              value={
                meeting.recordedAt
                  ? `${formatDate(meeting.recordedAt)} ${formatTimeRange(meeting.recordedAt, meeting.audioDurationSec)}`
                  : "日時未設定"
              }
            />
            <InfoRow label="担当者" value={ownerName} />
            <InfoRow label="会社名 / 顧客名" value={meeting.customerName || "未設定"} />
            <InfoRow label="商材" value={meeting.productType || "未設定"} />
            <InfoRow label={purposeLabel} value={getMeetingPurposeLabel(meeting.meetingPurpose)} />
            <InfoRow label="成約/失注ステータス" value={getMeetingStatusLabel(meeting.status)} />
            <InfoRow label="場所" value={meeting.location || "未入力"} />
          </div>

          <div className="mt-4 rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
            <div className="text-[12px] font-semibold text-[#8a909b]">営業メモ</div>
            <div className="mt-2 whitespace-pre-wrap text-[14px] leading-7 text-[#303544]">
              {meeting.memo.trim() || "未入力"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-white px-4 py-3">
      <div className="text-[12px] font-semibold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[14px] leading-6 text-[#303544]">{value}</div>
    </div>
  );
}

function getMeetingStatusLabel(value: MeetingRecord["status"]) {
  const map = {
    won: "成約",
    considering: "検討中",
    lost: "失注",
  } as const;

  return map[value];
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function isWithinDateFilter(date: Date | null, filter: string) {
  if (!date) {
    return false;
  }

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (filter === "thisMonth") {
    return date >= startOfThisMonth && date < startOfNextMonth;
  }

  if (filter === "lastMonth") {
    return date >= startOfLastMonth && date < startOfThisMonth;
  }

  if (filter === "last90Days") {
    const threshold = new Date(now);
    threshold.setDate(now.getDate() - 90);
    return date >= threshold;
  }

  return true;
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ProcessingBadge({ meeting }: { meeting: MeetingRecord }) {
  const status = readMeetingListStatus(meeting);
  const label =
    status === "uploaded"
      ? "文字起こし待ち"
      : status === "processing"
        ? "処理中"
        : status === "completed"
          ? "完了"
          : status === "failed"
            ? "失敗"
            : status === "uploading"
              ? "アップロード中"
              : "確認中";
  const className =
    status === "completed"
      ? "bg-[#e9f9ee] text-[#30a65b]"
      : status === "failed"
        ? "bg-[#ffe8e8] text-[#ff5d47]"
        : "bg-[#fff4df] text-[#b07c00]";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function AiScoreCell({ meeting }: { meeting: MeetingRecord }) {
  const score = meeting.aiSummary?.manualCompliance?.score;

  if (typeof score === "number") {
    return <span className="font-semibold text-[#171717]">{score}点</span>;
  }

  if (meeting.aiSummary || meeting.aiSummaryStatus === "completed") {
    return <span className="font-semibold text-[#30a65b]">分析済み</span>;
  }

  return <span className="text-[#7a808c]">集計準備中</span>;
}

function readMeetingListStatus(meeting: MeetingRecord): MeetingRecord["processingStatus"] {
  if (meeting.processingStatus === "failed" || meeting.aiSummaryStatus === "failed") {
    return "failed";
  }

  if (meeting.processingStatus === "uploading") {
    return "uploading";
  }

  if (
    meeting.processingStatus === "completed" ||
    meeting.aiSummaryStatus === "completed" ||
    meeting.conversationLogStatus === "completed" ||
    meeting.transcriptionProbeStatus === "completed" ||
    Boolean(meeting.aiSummary)
  ) {
    return "completed";
  }

  if (
    meeting.processingStatus === "processing" ||
    meeting.aiSummaryStatus === "running" ||
    meeting.conversationLogStatus === "running" ||
    meeting.transcriptionProbeStatus === "running"
  ) {
    return "processing";
  }

  return meeting.processingStatus;
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="m6 9 6 6 6-6" />
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
