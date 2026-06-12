"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { canUseSalesDomain } from "@/lib/sales-domains";

type AnalysisMode = "meeting" | "teleapo";

const modeCopy: Record<AnalysisMode, {
  title: string;
  description: string;
  primaryLabel: string;
  successLabel: string;
  pendingLabel: string;
  lostLabel: string;
  emptyTitle: string;
  nextActionTitle: string;
}> = {
  meeting: {
    title: "商談分析",
    description: "商談の要約、顧客課題、失注要因、次回アクションを確認できます。",
    primaryLabel: "分析済み商談",
    successLabel: "成約",
    pendingLabel: "検討中",
    lostLabel: "失注",
    emptyTitle: "分析済み商談はまだありません",
    nextActionTitle: "次回商談までに見ること",
  },
  teleapo: {
    title: "テレアポ分析",
    description: "架電内容から、受付突破、興味づけ、断り文句、次回改善ポイントを確認できます。",
    primaryLabel: "分析済み架電",
    successLabel: "アポ獲得",
    pendingLabel: "追客中",
    lostLabel: "未獲得",
    emptyTitle: "分析済みテレアポはまだありません",
    nextActionTitle: "次回架電までに見ること",
  },
};

export default function SalesAnalysisPage() {
  const searchParams = useSearchParams();
  const mode: AnalysisMode = searchParams.get("category") === "teleapo" ? "teleapo" : "meeting";
  const copy = modeCopy[mode];
  const { isLoading: isAuthLoading, profile } = useAuth();
  const canAccessDomain = isAuthLoading || canUseSalesDomain(profile, mode);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    return subscribeToMeetings(
      {
        role: profile.role,
        userId: profile.uid,
        companyId: profile.companyId,
      },
      (nextMeetings) => {
        setMeetings(nextMeetings.filter((meeting) => meeting.salesDomain === mode));
        setIsLoading(false);
      },
      (error) => {
        setErrorMessage(
          error.code === "permission-denied"
            ? "分析結果を閲覧する権限がありません。"
            : "分析結果の読み込みに失敗しました。",
        );
        setIsLoading(false);
      },
    );
  }, [canAccessDomain, isAuthLoading, mode, profile?.companyId, profile?.role, profile?.uid]);

  const analyzedMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed"),
    [meetings],
  );
  const waitingMeetings = useMemo(
    () => meetings.filter((meeting) => !meeting.aiSummary && meeting.aiSummaryStatus !== "completed"),
    [meetings],
  );
  const latestAnalyses = useMemo(
    () =>
      [...analyzedMeetings].sort(
        (left, right) =>
          (right.aiSummaryTestedAt?.getTime() ?? right.recordedAt?.getTime() ?? 0) -
          (left.aiSummaryTestedAt?.getTime() ?? left.recordedAt?.getTime() ?? 0),
      ),
    [analyzedMeetings],
  );

  const wonCount = meetings.filter((meeting) => meeting.status === "won").length;
  const pendingCount = meetings.filter((meeting) => meeting.status === "considering").length;
  const lostCount = meetings.filter((meeting) => meeting.status === "lost").length;

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.22em] text-[#b58a00]">
            {mode === "meeting" ? "Meeting Analysis" : "Teleapo Analysis"}
          </div>
          <h1 className="mt-2 text-[34px] font-bold tracking-[-0.04em] text-[#171717]">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-[760px] text-[16px] leading-7 text-[#7a808c]">
            {copy.description}
          </p>
        </div>

        <Link
          href={`/meetings/upload?category=${mode}`}
          className="inline-flex h-12 items-center justify-center rounded-[14px] border border-[#f0c655] bg-white px-5 text-[14px] font-black text-[#171717] shadow-[0_6px_20px_rgba(17,24,39,0.04)]"
        >
          アップロードする
        </Link>
      </section>

      {errorMessage ? (
        <div className="mb-5 rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
          {errorMessage}
        </div>
      ) : null}

      {!canAccessDomain ? (
        <div className="rounded-[24px] border border-[#f2d6d6] bg-white px-6 py-12 text-center">
          <h2 className="text-[26px] font-black tracking-[-0.04em] text-[#171717]">この分析は利用できません</h2>
          <p className="mt-3 text-[15px] leading-7 text-[#596273]">
            {mode === "teleapo" ? "テレアポ" : "商談"}の利用権限がありません。必要な場合は管理者に依頼してください。
          </p>
        </div>
      ) : null}

      {canAccessDomain ? (
      <>
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label={copy.primaryLabel} value={`${analyzedMeetings.length}件`} note={`未分析 ${waitingMeetings.length}件`} />
        <Metric label={copy.successLabel} value={`${wonCount}件`} note={mode === "meeting" ? "成約扱い" : "アポ獲得扱い"} />
        <Metric label={copy.pendingLabel} value={`${pendingCount}件`} note={mode === "meeting" ? "継続確認" : "再架電候補"} />
        <Metric label={copy.lostLabel} value={`${lostCount}件`} note={mode === "meeting" ? "失注理由を確認" : "断り理由を確認"} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-black text-[#171717]">最新の分析結果</h2>
              <p className="mt-1 text-[13px] text-[#7a808c]">分析済みのログから、改善に使える要点だけを表示します。</p>
            </div>
            <Link href={`/meetings?category=${mode}`} className="text-[13px] font-black text-[#8a6500]">
              一覧を見る
            </Link>
          </div>

          {isLoading ? (
            <div className="rounded-[18px] bg-[#fcfcfd] px-4 py-8 text-[14px] text-[#7a808c]">
              分析結果を読み込み中です。
            </div>
          ) : latestAnalyses.length === 0 ? (
            <div className="rounded-[18px] bg-[#fcfcfd] px-4 py-8 text-[14px] text-[#7a808c]">
              {copy.emptyTitle}。アップロード後にAI分析を実行すると、ここに表示されます。
            </div>
          ) : (
            <div className="space-y-3">
              {latestAnalyses.slice(0, 8).map((meeting) => (
                <AnalysisCard key={meeting.id} meeting={meeting} mode={mode} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
            <h2 className="text-[18px] font-black text-[#171717]">{copy.nextActionTitle}</h2>
            <div className="mt-4 space-y-3">
              {buildActionItems(latestAnalyses, mode).map((item) => (
                <div key={item.title} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                  <div className="text-[13px] font-black text-[#171717]">{item.title}</div>
                  <p className="mt-1 text-[12px] leading-5 text-[#596273]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#f0c655] bg-[#fffaf0] p-5 shadow-[0_10px_28px_rgba(245,189,7,0.08)]">
            <h2 className="text-[18px] font-black text-[#171717]">推奨ロープレ</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#6f5a18]">
              {mode === "meeting"
                ? "失注理由や顧客の懸念が出ている商談は、次回商談前に関連シナリオで練習しましょう。"
                : "受付突破、冒頭の興味づけ、断り文句への返答を、次回架電前に練習しましょう。"}
            </p>
            <Link
              href={`/sales/roleplay/scenarios?category=${mode}`}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[#ffd84d] text-[13px] font-black text-[#171717]"
            >
              ロープレを選ぶ
            </Link>
          </div>
        </div>
      </section>
      </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[20px] border border-[#eceef4] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <div className="text-[12px] font-bold text-[#7a808c]">{label}</div>
      <div className="mt-2 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
      <div className="mt-1 text-[12px] font-bold text-[#9aa1ac]">{note}</div>
    </div>
  );
}

function AnalysisCard({ meeting, mode }: { meeting: MeetingRecord; mode: AnalysisMode }) {
  const compliance = meeting.aiSummary?.manualCompliance;
  const primaryPoint = compliance?.missingCriteria[0] ?? meeting.aiSummary?.bullets[0] ?? meeting.aiSummary?.overview ?? "分析結果を確認してください。";
  const nextPhrase = compliance?.improvementPhrases[0] ?? buildFallbackPhrase(mode);

  return (
    <Link href={`/meetings/${meeting.id}`} className="block rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black text-[#171717]">{meeting.customerName || "未設定"}</div>
          <div className="mt-1 text-[12px] font-bold text-[#7a808c]">
            {meeting.productType || "商材未設定"} ・ {meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}
          </div>
        </div>
        <StatusPill status={meeting.status} mode={mode} />
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-[#343b48]">{primaryPoint}</p>
      <div className="mt-3 rounded-[14px] bg-white px-3 py-2 text-[12px] font-bold leading-5 text-[#6f5a18]">
        改善フレーズ: {nextPhrase}
      </div>
    </Link>
  );
}

function StatusPill({ status, mode }: { status: MeetingRecord["status"]; mode: AnalysisMode }) {
  const copy = modeCopy[mode];
  const map = {
    won: { label: copy.successLabel, className: "bg-[#e9f9ee] text-[#30a65b]" },
    considering: { label: copy.pendingLabel, className: "bg-[#fff4df] text-[#cc7a00]" },
    lost: { label: copy.lostLabel, className: "bg-[#ffe8e8] text-[#d94332]" },
  } as const;
  const current = map[status];

  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[12px] font-black ${current.className}`}>
      {current.label}
    </span>
  );
}

function buildActionItems(meetings: MeetingRecord[], mode: AnalysisMode) {
  const latest = meetings[0];
  const missed = latest?.aiSummary?.manualCompliance?.missingCriteria[0];
  const phrase = latest?.aiSummary?.manualCompliance?.improvementPhrases[0];

  if (mode === "teleapo") {
    return [
      {
        title: "冒頭30秒の興味づけを確認",
        body: missed ?? "相手が聞く理由を最初に作れているか確認しましょう。",
      },
      {
        title: "断り文句への返答を準備",
        body: phrase ?? "「必要ないです」に対して、課題確認へ戻す一言を用意しましょう。",
      },
      {
        title: "次回架電前にロープレ",
        body: "受付突破、担当者接続、日程打診の流れを短く練習しましょう。",
      },
    ];
  }

  return [
    {
      title: "顧客課題を言語化",
      body: missed ?? "相手が困っていることを、提案前に一文で言える状態にしましょう。",
    },
    {
      title: "次回提案の切り返しを準備",
      body: phrase ?? "価格・競合・導入時期への返答を、次回商談前に準備しましょう。",
    },
    {
      title: "関連ロープレを実施",
      body: "失注要因や懸念点に近いシナリオを選び、次回商談前に練習しましょう。",
    },
  ];
}

function buildFallbackPhrase(mode: AnalysisMode) {
  if (mode === "teleapo") {
    return "本日は売り込みではなく、同業様で増えている課題が御社にも当てはまるかだけ確認させてください。";
  }

  return "まず御社の現状を確認したうえで、必要な場合だけ具体的な改善案をご提案します。";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
