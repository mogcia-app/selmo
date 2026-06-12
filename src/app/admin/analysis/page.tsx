"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  StatusBadge,
  formatDate,
  getMeetingOutcomeLabel,
  getMeetingScore,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import type { MeetingRecord } from "@/lib/firebase/meetings";

type AnalysisMode = "meeting" | "teleapo";
type DateRangeFilter = "all" | "today" | "7d" | "30d" | "thisMonth";

const modeCopy: Record<AnalysisMode, {
  eyebrow: string;
  title: string;
  description: string;
  listTitle: string;
  successLabel: string;
  pendingLabel: string;
  lostLabel: string;
  reviewLabel: string;
  emptyTitle: string;
}> = {
  meeting: {
    eyebrow: "MEETING ANALYSIS",
    title: "営業マンの商談分析一覧",
    description: "営業マンごとの商談分析結果を確認し、失注要因・改善ポイント・指導対象を絞り込みます。",
    listTitle: "商談分析一覧",
    successLabel: "成約",
    pendingLabel: "検討中",
    lostLabel: "失注",
    reviewLabel: "商談レビュー",
    emptyTitle: "商談分析はまだありません",
  },
  teleapo: {
    eyebrow: "TELEAPO ANALYSIS",
    title: "営業マンのテレアポ分析一覧",
    description: "営業マンごとの架電分析結果を確認し、受付突破・興味づけ・断り理由・次回改善を絞り込みます。",
    listTitle: "テレアポ分析一覧",
    successLabel: "アポ獲得",
    pendingLabel: "追客中",
    lostLabel: "未獲得",
    reviewLabel: "テレアポレビュー",
    emptyTitle: "テレアポ分析はまだありません",
  },
};

const dateRangeOptions: Array<[DateRangeFilter, string]> = [
  ["all", "期間すべて"],
  ["today", "今日"],
  ["7d", "直近7日"],
  ["30d", "直近30日"],
  ["thisMonth", "今月"],
];

export default function AdminAnalysisPage() {
  const searchParams = useSearchParams();
  const mode: AnalysisMode = searchParams.get("category") === "teleapo" ? "teleapo" : "meeting";
  const copy = modeCopy[mode];
  const { meetings, memberRows, error } = useAdminInsights();
  const [memberId, setMemberId] = useState("");
  const [product, setProduct] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [keyword, setKeyword] = useState("");
  const [analysisOnly, setAnalysisOnly] = useState(true);

  const products = useMemo(
    () => Array.from(new Set(meetings.map((meeting) => meeting.productType).filter(Boolean))),
    [meetings],
  );

  const filteredMeetings = useMemo(() => {
    return meetings
      .filter((meeting) => {
        if (meeting.salesDomain !== mode) return false;
        const member = memberRows.find((row) => row.id === meeting.userId);
        const searchText = [
          meeting.customerName,
          meeting.productType,
          meeting.memo,
          meeting.aiSummary?.overview,
          ...(meeting.aiSummary?.bullets ?? []),
          member?.name,
          member?.email,
        ].join(" ");

        if (analysisOnly && !meeting.aiSummary && meeting.aiSummaryStatus !== "completed") return false;
        if (memberId && meeting.userId !== memberId) return false;
        if (product && meeting.productType !== product) return false;
        if (outcome && meeting.status !== outcome) return false;
        if (!isWithinDateRange(meeting.recordedAt, dateRange)) return false;
        if (keyword.trim() && !searchText.toLowerCase().includes(keyword.trim().toLowerCase())) return false;
        return true;
      })
      .sort(
        (left, right) =>
          (right.aiSummaryTestedAt?.getTime() ?? right.recordedAt?.getTime() ?? 0) -
          (left.aiSummaryTestedAt?.getTime() ?? left.recordedAt?.getTime() ?? 0),
      );
  }, [analysisOnly, dateRange, keyword, meetings, memberId, memberRows, mode, outcome, product]);

  const modeMeetings = meetings.filter((meeting) => meeting.salesDomain === mode);
  const analyzedCount = modeMeetings.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed").length;
  const needsReviewCount = filteredMeetings.filter((meeting) => meeting.status === "lost" || hasLowManualScore(meeting)).length;
  const activeMemberCount = new Set(filteredMeetings.map((meeting) => meeting.userId)).size;
  const lostCount = filteredMeetings.filter((meeting) => meeting.status === "lost").length;

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <Metric label="分析済み" value={`${analyzedCount}件`} note="全営業マン合計" />
          <Metric label="表示中の営業マン" value={`${activeMemberCount}人`} note="絞り込み結果" />
          <Metric label="要レビュー" value={`${needsReviewCount}件`} note={mode === "meeting" ? "失注・低評価" : "未獲得・低評価"} tone="risk" />
          <Metric label={copy.lostLabel} value={`${lostCount}件`} note="改善対象" />
        </section>

        <div className="mt-8">
          <Panel title="フィルター">
            <div className="grid gap-3 md:grid-cols-6">
              <Select value={memberId} onChange={setMemberId} options={[["", "営業マンすべて"], ...memberRows.map((member) => [member.id, member.name] as [string, string])]} />
              <Select value={product} onChange={setProduct} options={[["", "商材すべて"], ...products.map((item) => [item, item] as [string, string])]} />
              <Select value={outcome} onChange={setOutcome} options={[["", "結果すべて"], ["won", copy.successLabel], ["lost", copy.lostLabel], ["considering", copy.pendingLabel]]} />
              <Select value={dateRange} onChange={(value) => setDateRange(value as DateRangeFilter)} options={dateRangeOptions} />
              <Select value={analysisOnly ? "analyzed" : "all"} onChange={(value) => setAnalysisOnly(value === "analyzed")} options={[["analyzed", "分析済みのみ"], ["all", "未分析も含む"]]} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="顧客・営業マン・要約で検索"
                className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-[#8a909b]">表示中: {filteredMeetings.length}件</span>
              {memberId ? <FilterChip label={memberRows.find((member) => member.id === memberId)?.name ?? "営業マン指定"} /> : null}
              {product ? <FilterChip label={product} /> : null}
              {outcome ? <FilterChip label={copyOutcome(outcome, copy)} /> : null}
              <FilterChip label={getDateRangeLabel(dateRange)} />
            </div>
          </Panel>
        </div>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Panel title={copy.listTitle}>
            {filteredMeetings.length > 0 ? (
              <div className="space-y-3">
                {filteredMeetings.map((meeting) => {
                  const member = memberRows.find((row) => row.id === meeting.userId);
                  return (
                    <AnalysisRow key={meeting.id} meeting={meeting} memberName={member?.name ?? "未設定"} memberEmail={member?.email ?? meeting.userId} mode={mode} />
                  );
                })}
              </div>
            ) : (
              <EmptyState title={copy.emptyTitle} body="条件を変更するか、sales側で分析が完了するとここに表示されます。" />
            )}
          </Panel>

          <div className="space-y-6">
            <Panel title="指導が必要な営業マン">
              <div className="space-y-3">
                {buildCoachingTargets(filteredMeetings, memberRows).length > 0 ? (
                  buildCoachingTargets(filteredMeetings, memberRows).map((target) => (
                    <Link key={target.id} href={`/admin/members/${target.id}`} className="block rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 transition hover:border-[#f0c655]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-black text-[#171717]">{target.name}</div>
                          <div className="mt-1 text-[12px] text-[#7a808c]">{target.reason}</div>
                        </div>
                        <span className="text-[12px] font-black text-[#d94332]">{target.count}件</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <EmptyState title="要指導の候補はありません" body="失注や低評価の分析が増えると、ここに営業マン別で表示されます。" />
                )}
              </div>
            </Panel>

            <Panel title={mode === "meeting" ? "商談で見る観点" : "テレアポで見る観点"}>
              <div className="space-y-3">
                {buildReviewPoints(mode).map((point) => (
                  <div key={point.title} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                    <div className="text-[13px] font-black text-[#171717]">{point.title}</div>
                    <p className="mt-1 text-[12px] leading-5 text-[#596273]">{point.body}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function AnalysisRow({ meeting, memberName, memberEmail, mode }: { meeting: MeetingRecord; memberName: string; memberEmail: string; mode: AnalysisMode }) {
  const copy = modeCopy[mode];
  const score = getMeetingScore(meeting);
  const issue = meeting.aiSummary?.manualCompliance?.missingCriteria[0] ?? meeting.aiSummary?.bullets[0] ?? meeting.aiSummary?.overview ?? "分析結果を確認してください";
  const nextPhrase = meeting.aiSummary?.manualCompliance?.improvementPhrases[0] ?? (mode === "meeting" ? "次回商談で顧客課題を確認" : "次回架電で冒頭の興味づけを改善");

  return (
    <Link href={`/admin/meetings/${meeting.id}`} className="block rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-white">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_180px_120px_120px] lg:items-start">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black text-[#171717]">{meeting.customerName || "未設定"}</div>
          <div className="mt-1 text-[12px] font-bold text-[#7a808c]">{meeting.productType || "商材未設定"} ・ {formatDate(meeting.recordedAt)}</div>
          <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-[#343b48]">{issue}</p>
          <div className="mt-2 rounded-[14px] bg-white px-3 py-2 text-[12px] font-bold leading-5 text-[#6f5a18]">
            次回: {nextPhrase}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-[#8a909b]">営業マン</div>
          <div className="mt-1 truncate text-[13px] font-black text-[#171717]">{memberName}</div>
          <div className="mt-1 truncate text-[12px] text-[#7a808c]">{memberEmail}</div>
        </div>
        <div>
          <div className="text-[12px] font-bold text-[#8a909b]">結果</div>
          <div className="mt-2">
            <StatusBadge tone={getOutcomeTone(meeting.status)} label={copyOutcome(meeting.status, copy)} />
          </div>
        </div>
        <div>
          <div className="text-[12px] font-bold text-[#8a909b]">評価</div>
          <div className="mt-2 text-[14px] font-black text-[#171717]">{score}</div>
          <div className="mt-1 text-[12px] font-bold text-[#2672d9]">{copy.reviewLabel}</div>
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value, note, tone = "normal" }: { label: string; value: string; note: string; tone?: "normal" | "risk" }) {
  return (
    <div className={`rounded-[20px] border px-5 py-4 shadow-[0_8px_22px_rgba(17,24,39,0.04)] ${tone === "risk" ? "border-[#ffd9d9] bg-[#fff8f8]" : "border-[#eceef4] bg-white"}`}>
      <div className="text-[12px] font-bold text-[#7a808c]">{label}</div>
      <div className="mt-2 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
      <div className="mt-1 text-[12px] font-bold text-[#9aa1ac]">{note}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function FilterChip({ label }: { label: string }) {
  return <span className="rounded-full bg-[#fff5d8] px-3 py-1 text-[12px] font-black text-[#8a6500]">{label}</span>;
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

  if (range === "today") return date >= start;
  if (range === "thisMonth") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();

  const threshold = new Date(now);
  threshold.setDate(now.getDate() - (range === "7d" ? 7 : 30));
  return date >= threshold;
}

function getDateRangeLabel(range: DateRangeFilter) {
  return dateRangeOptions.find(([value]) => value === range)?.[1] ?? "期間すべて";
}

function copyOutcome(status: string, copy: typeof modeCopy[AnalysisMode]) {
  if (status === "won") return copy.successLabel;
  if (status === "lost") return copy.lostLabel;
  if (status === "considering") return copy.pendingLabel;
  return getMeetingOutcomeLabel(status);
}

function hasLowManualScore(meeting: MeetingRecord) {
  const score = meeting.aiSummary?.manualCompliance?.score;
  return typeof score === "number" && score < 60;
}

function buildCoachingTargets(meetings: MeetingRecord[], members: Array<{ id: string; name: string }>) {
  const counts = new Map<string, { count: number; reason: string }>();
  meetings.forEach((meeting) => {
    if (meeting.status !== "lost" && !hasLowManualScore(meeting)) return;
    const current = counts.get(meeting.userId) ?? { count: 0, reason: "" };
    counts.set(meeting.userId, {
      count: current.count + 1,
      reason: meeting.status === "lost" ? "失注/未獲得が多い" : "分析評価が低い",
    });
  });

  return Array.from(counts.entries())
    .map(([id, value]) => ({
      id,
      name: members.find((member) => member.id === id)?.name ?? "未設定",
      ...value,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function buildReviewPoints(mode: AnalysisMode) {
  if (mode === "teleapo") {
    return [
      { title: "受付突破", body: "受付で止まっているのか、担当者接続後に断られているのかを分けて見ます。" },
      { title: "冒頭の興味づけ", body: "相手が聞く理由を最初に作れているかを確認します。" },
      { title: "断り文句", body: "不要・忙しい・資料送付など、断り文句別に改善ロープレへつなげます。" },
    ];
  }

  return [
    { title: "課題ヒアリング", body: "提案前に顧客課題を確認できているかを見ます。" },
    { title: "失注要因", body: "価格・競合・導入時期・決裁者不在などの理由を分けて確認します。" },
    { title: "次回アクション", body: "次回商談までに準備すべき資料やロープレを確認します。" },
  ];
}
