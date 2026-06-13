"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToRecentKnowledgeSearches,
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
  type KnowledgeSearchHistory,
} from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";
import { canUseSalesDomain } from "@/lib/sales-domains";

type MetricCardData = {
  label: string;
  value: string;
  subValue: string;
  caption: string;
  percentage?: number;
};

type SkillScore = {
  label: string;
  score: number;
  previousScore: number | null;
  stars: string;
  caption: string;
};

type RankingItem = {
  label: string;
  value: string;
  caption: string;
  percentage?: number;
};

type ReportData = {
  monthlySummary: MetricCardData[];
  aiDiagnosis: {
    title: string;
    body: string;
    evidence: string;
  };
  skillScores: SkillScore[];
  strongestSkills: RankingItem[];
  weakestSkills: RankingItem[];
  unmetRankings: RankingItem[];
  unmetByProduct: RankingItem[];
  unmetByCustomerType: RankingItem[];
  objectionRankings: RankingItem[];
  improvementRankings: RankingItem[];
  roleplayMetrics: MetricCardData[];
  roleplayVariance: RankingItem[];
  roleplayPatterns: RankingItem[];
  knowledgeSearchRankings: RankingItem[];
  knowledgeSearchInsights: RankingItem[];
  productPerformances: RankingItem[];
  customerTypePerformances: RankingItem[];
  purposePerformances: RankingItem[];
  coachingPriority: {
    title: string;
    body: string;
    evidence: string;
  };
};

export default function SalesReportsPage() {
  const { isLoading: isAuthLoading, profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<KnowledgeSearchHistory[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!profile?.uid || !profile.role || !profile.companyId) {
      setMeetings([]);
      setRoleplayResults([]);
      setKnowledgeItems([]);
      setSearchHistory([]);
      return;
    }

    const canUseMeeting = canUseSalesDomain(profile, "meeting");
    const canUseTeleapo = canUseSalesDomain(profile, "teleapo");

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId },
        (nextMeetings) => {
          setMeetings(
            nextMeetings.filter(
              (meeting) =>
                (meeting.salesDomain === "meeting" && canUseMeeting) ||
                (meeting.salesDomain === "teleapo" && canUseTeleapo),
            ),
          );
          setErrorMessage(null);
        },
        () => setErrorMessage("レポート用の商談データを取得できませんでした。"),
      ),
      subscribeToRoleplayResults(
        { userId: profile.uid, companyId: profile.companyId, isAdmin: profile.role === "admin" },
        setRoleplayResults,
        () => setErrorMessage("ロープレ結果を取得できませんでした。"),
      ),
      subscribeToVisibleKnowledgeItems(
        { userId: profile.uid, companyId: profile.companyId },
        setKnowledgeItems,
        () => setErrorMessage("ナレッジデータを取得できませんでした。"),
      ),
      subscribeToRecentKnowledgeSearches(
        profile.uid,
        setSearchHistory,
        () => setErrorMessage("ナレッジ検索履歴を取得できませんでした。"),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [isAuthLoading, profile]);

  const report = useMemo(
    () => buildInstructionReport(meetings, roleplayResults, knowledgeItems, searchHistory),
    [knowledgeItems, meetings, roleplayResults, searchHistory],
  );

  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-0 pt-4 md:px-7 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <section className="flex flex-col gap-3 rounded-[24px] border border-[#e7e9ef] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(17,24,39,0.05)] md:flex-row md:items-end md:justify-between md:px-7">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#9c7600]">Coaching Report</p>
            <h1 className="mt-2 text-[26px] font-bold text-[#171717] md:text-[32px]">レポート</h1>
            <p className="mt-2 max-w-[820px] text-[13px] leading-6 text-[#6f7480]">
              今月の活動、弱点、練習、商材別成果を一画面で確認します。
            </p>
          </div>
          <span className="w-fit rounded-full border border-[#f0d46b] bg-[#fffaf0] px-4 py-2 text-[12px] font-bold text-[#8a6500]">
            今月を表示中
          </span>
        </section>

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-4 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
          <SectionTitle number="1" title="月次サマリー" />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {report.monthlySummary.slice(0, 5).map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <DiagnosisCard report={report} />
          <ReportCard number="3" title="スキル別評価">
            <SkillScorePanel scores={report.skillScores} />
          </ReportCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <ReportCard number="4" title="評価スコア">
            <EvaluationScoreCard scores={report.skillScores} />
          </ReportCard>

          <ReportCard number="5" title="ロープレ分析">
            <div className="grid gap-3 sm:grid-cols-2">
              {report.roleplayMetrics.map((metric) => (
                <MiniMetric key={metric.label} metric={metric} />
              ))}
            </div>
            <div className="mt-3">
              <RankingPanel title="改善点パターン" items={report.roleplayPatterns} compact />
            </div>
          </ReportCard>

          <ReportCard number="6" title="ナレッジ検索分析">
            <VerticalBarRanking title="今月の検索ワード" items={report.knowledgeSearchRankings} />
            <div className="mt-3">
              <RankingPanel title="検索 × 失注" items={report.knowledgeSearchInsights} compact />
            </div>
          </ReportCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <ReportCard number="7" title="顧客・商材別成果">
            <div className="grid gap-3 md:grid-cols-3">
              <RankingPanel title="商材別" items={report.productPerformances} compact />
              <RankingPanel title="顧客種別" items={report.customerTypePerformances} compact />
              <RankingPanel title="商談目的別" items={report.purposePerformances} compact />
            </div>
          </ReportCard>

          <ReportCard number="8" title="今月の重点">
            <div className="rounded-[18px] border border-[#f0d46b] bg-[#fffaf0] p-4">
              <div className="text-[12px] font-bold text-[#9c7600]">最優先</div>
              <div className="mt-2 text-[18px] font-bold leading-7 text-[#171717]">{report.coachingPriority.title}</div>
              <p className="mt-3 text-[13px] leading-6 text-[#596273]">{report.coachingPriority.body}</p>
            </div>
          </ReportCard>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-bold text-[#171717]">
        {number}. {title}
      </h2>
    </div>
  );
}

function ReportCard({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-4 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
      <SectionTitle number={number} title={title} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DiagnosisCard({ report }: { report: ReportData }) {
  return (
    <ReportCard number="2" title="AIによる月次診断">
      <div className="rounded-[20px] border border-[#f0d46b] bg-[#fffaf0] p-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white text-[26px] font-black text-[#ffc400] ring-1 ring-[#f0d46b]">
            AI
          </div>
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-7 text-[#171717]">{report.aiDiagnosis.title}</div>
            <p className="mt-2 text-[13px] leading-6 text-[#596273]">{report.aiDiagnosis.body}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#f0d46b] pt-4 lg:grid-cols-2">
          <CompactSkillRanking title="強み" items={report.strongestSkills} tone="strong" />
          <CompactSkillRanking title="弱み" items={report.weakestSkills} tone="weak" />
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#f0d46b] pt-4 md:grid-cols-[1fr_1fr]">
          <div>
            <div className="text-[12px] font-bold text-[#9c7600]">未達項目 上位3つ</div>
            <ol className="mt-2 space-y-2">
              {report.unmetRankings.slice(0, 3).map((item, index) => (
                <li key={item.label} className="flex items-center gap-2 text-[12px] font-bold text-[#171717]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] text-[#9c7600] ring-1 ring-[#f0d46b]">
                    {index + 1}
                  </span>
                  {item.label}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="text-[12px] font-bold text-[#9c7600]">改善指摘</div>
            <p className="mt-2 text-[13px] font-bold leading-6 text-[#171717]">{report.coachingPriority.evidence}</p>
          </div>
        </div>
      </div>
    </ReportCard>
  );
}

function MetricCard({ metric }: { metric: MetricCardData }) {
  const percentage = metric.percentage ?? readPercentFromText(metric.value);

  return (
    <article className="rounded-[20px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
      <div className="text-[12px] font-bold text-[#6f7480]">{metric.label}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-[30px] font-bold leading-none text-[#171717]">{metric.value}</div>
        <div className="text-[12px] font-bold text-[#9c7600]">{metric.subValue}</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e8ebf0]">
        <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-3 text-[12px] leading-5 text-[#7a808c]">{metric.caption}</div>
    </article>
  );
}

function MiniMetric({ metric }: { metric: MetricCardData }) {
  const percentage = metric.percentage ?? readPercentFromText(metric.value);

  return (
    <div className="rounded-[16px] border border-[#edf0f4] bg-[#fcfcfd] p-3">
      <div className="text-[11px] font-bold text-[#6f7480]">{metric.label}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-[20px] font-black leading-none text-[#171717]">{metric.value}</div>
        <div className="text-[11px] font-bold text-[#9c7600]">{metric.subValue}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ebf0]">
        <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function SkillScorePanel({ scores }: { scores: SkillScore[] }) {
  const averageScore = Math.round(scores.reduce((sum, score) => sum + score.score, 0) / Math.max(1, scores.length));
  const topSkill = [...scores].sort((left, right) => right.score - left.score)[0];
  const focusSkill = [...scores].sort((left, right) => left.score - right.score)[0];

  return (
    <article className="rounded-[24px] border border-[#edf0f4] bg-[#fffdf6] p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SkillSummaryTile label="平均スコア" value={`${averageScore}点`} caption="今月の営業品質" tone="yellow" />
        <SkillSummaryTile label="一番強いスキル" value={topSkill.label} caption={`${topSkill.score}点 / ${topSkill.stars}`} tone="green" />
        <SkillSummaryTile label="優先改善" value={focusSkill.label} caption={`${focusSkill.score}点 / Focus`} tone="orange" />
      </div>

      <div className="mt-4 rounded-[22px] border border-[#edf0f4] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-bold text-[#171717]">スキル別評価レーダー</h3>
            <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">凸凹が大きいほど、指導テーマが明確です。</p>
          </div>
          <span className="rounded-full border border-[#f0d46b] bg-[#fffaf0] px-3 py-1 text-[11px] font-bold text-[#9c7600]">
            今月
          </span>
        </div>
        <SkillRadar scores={scores} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[14px] bg-[#fffaf0] px-2 py-2">
            <div className="text-[11px] font-bold text-[#9c7600]">80点以上</div>
            <div className="mt-1 text-[13px] font-black text-[#171717]">強み</div>
          </div>
          <div className="rounded-[14px] bg-[#f7f8fa] px-2 py-2">
            <div className="text-[11px] font-bold text-[#7a808c]">60-79点</div>
            <div className="mt-1 text-[13px] font-black text-[#171717]">維持</div>
          </div>
          <div className="rounded-[14px] bg-[#fff4ec] px-2 py-2">
            <div className="text-[11px] font-bold text-[#b95c15]">59点以下</div>
            <div className="mt-1 text-[13px] font-black text-[#171717]">改善</div>
          </div>
        </div>
      </div>
    </article>
  );
}

function EvaluationScoreCard({ scores }: { scores: SkillScore[] }) {
  return (
    <div className="rounded-[22px] border border-[#edf0f4] bg-[#fffdf6] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-bold text-[#171717]">今月の評価スコア</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">点数と変化をカードで確認します。</p>
        </div>
        <span className="rounded-full border border-[#e7e9ef] bg-white px-3 py-1 text-[11px] font-bold text-[#596273]">
          {scores.length}項目
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {scores.map((score) => (
          <SkillScoreRow key={score.label} score={score} />
        ))}
      </div>
    </div>
  );
}

function SkillSummaryTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "yellow" | "green" | "orange";
}) {
  const toneClass = {
    yellow: "border-[#f0d46b] bg-white text-[#9c7600]",
    green: "border-[#cae8d2] bg-[#f8fff9] text-[#2f8b4f]",
    orange: "border-[#f3d980] bg-[#fffaf0] text-[#b95c15]",
  }[tone];

  return (
    <div className={`rounded-[18px] border p-4 ${toneClass}`}>
      <div className="text-[11px] font-bold">{label}</div>
      <div className="mt-2 truncate text-[20px] font-black leading-none text-[#171717]">{value}</div>
      <div className="mt-2 text-[12px] font-bold text-[#7a808c]">{caption}</div>
    </div>
  );
}

function SkillScoreRow({ score }: { score: SkillScore }) {
  const status =
    score.score >= 80
      ? { label: "強み", className: "border-[#cae8d2] bg-[#f3fbf5] text-[#2f8b4f]" }
      : score.score >= 60
        ? { label: "維持", className: "border-[#f0d46b] bg-[#fffaf0] text-[#9c7600]" }
        : { label: "改善", className: "border-[#ffd7bd] bg-[#fff4ec] text-[#b95c15]" };

  return (
    <div className="rounded-[18px] border border-[#edf0f4] bg-[#fcfcfd] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-[#171717]">{score.label}</div>
          <div className="mt-1 text-[11px] font-bold text-[#8d94a1]">{compareScore(score.score, score.previousScore)}</div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-black leading-none text-[#171717]">{score.score}</div>
          <div className="mt-1 text-[10px] font-bold text-[#8d94a1]">点</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8ebf0]">
        <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${score.score}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${status.className}`}>
          {status.label}
        </span>
        <span className="text-[11px] font-bold text-[#9c7600]">{score.stars}</span>
      </div>
    </div>
  );
}

function SkillRadar({ scores }: { scores: SkillScore[] }) {
  const center = 95;
  const maxRadius = 74;
  const points = scores.map((score, index) => {
    const angle = (Math.PI * 2 * index) / scores.length - Math.PI / 2;
    const radius = (Math.max(0, Math.min(100, score.score)) / 100) * maxRadius;
    return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
  });
  const axisPoints = scores.map((score, index) => {
    const angle = (Math.PI * 2 * index) / scores.length - Math.PI / 2;
    return {
      label: score.label,
      x: center + Math.cos(angle) * (maxRadius + 14),
      y: center + Math.sin(angle) * (maxRadius + 14),
      endX: center + Math.cos(angle) * maxRadius,
      endY: center + Math.sin(angle) * maxRadius,
    };
  });

  return (
    <div className="mt-4 rounded-[20px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
      <svg viewBox="0 0 190 190" className="mx-auto h-[236px] w-full max-w-[360px]" role="img" aria-label="スキル別評価レーダーチャート">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle key={scale} cx={center} cy={center} r={maxRadius * scale} fill="none" stroke="#edf0f4" strokeWidth="1" />
        ))}
        {axisPoints.map((axis) => (
          <g key={axis.label}>
            <line x1={center} y1={center} x2={axis.endX} y2={axis.endY} stroke="#e1e5ec" strokeWidth="1" />
            <text x={axis.x} y={axis.y} textAnchor="middle" dominantBaseline="middle" className="fill-[#596273] text-[7px] font-bold">
              {axis.label}
            </text>
          </g>
        ))}
        <polygon points={points.join(" ")} fill="rgba(255,196,0,0.32)" stroke="#ffc400" strokeWidth="3" />
      </svg>
    </div>
  );
}

function RankingPanel({ title, items, compact = false }: { title: string; items: RankingItem[]; compact?: boolean }) {
  return (
    <article className={`rounded-[22px] border border-[#edf0f4] bg-[#fcfcfd] ${compact ? "p-3" : "p-4"}`}>
      <h3 className="text-[15px] font-bold text-[#171717]">{title}</h3>
      <div className={`${compact ? "mt-3 space-y-2" : "mt-4 space-y-3"}`}>
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className={`rounded-[16px] border border-[#edf0f4] bg-white px-3 ${compact ? "py-2.5" : "py-3"}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fffaf0] text-[11px] font-black text-[#9c7600] ring-1 ring-[#f0d46b]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[13px] font-bold text-[#171717]">{item.label}</div>
                  <div className="shrink-0 rounded-full bg-[#fffaf0] px-2.5 py-1 text-[12px] font-black text-[#9c7600]">
                    {item.value}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
                  <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${item.percentage ?? readPercentFromText(item.value)}%` }} />
                </div>
                {compact ? null : <div className="mt-1.5 text-[11px] leading-5 text-[#7a808c]">{item.caption}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function VerticalBarRanking({ title, items }: { title: string; items: RankingItem[] }) {
  return (
    <article className="rounded-[22px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
      <h3 className="text-[15px] font-bold text-[#171717]">{title}</h3>
      <div className="mt-4 flex h-[220px] items-end gap-3 rounded-[18px] border border-[#edf0f4] bg-white px-4 pb-4 pt-5">
        {items.map((item, index) => {
          const percentage = item.percentage ?? readPercentFromText(item.value);

          return (
            <div key={`${item.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="text-[11px] font-black text-[#9c7600]">{item.value}</div>
              <div className="flex h-[128px] w-full max-w-[54px] items-end rounded-t-[14px] bg-[#f1f2f5]">
                <div
                  className="w-full rounded-t-[14px] bg-[#ffc400] transition-all"
                  style={{ height: `${Math.max(10, percentage)}%` }}
                />
              </div>
              <div className="line-clamp-2 min-h-[34px] text-center text-[11px] font-bold leading-4 text-[#596273]">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#7a808c]">
        検索回数が多いほど棒が高くなります。
      </p>
    </article>
  );
}

function CompactSkillRanking({
  title,
  items,
  tone,
}: {
  title: string;
  items: RankingItem[];
  tone: "strong" | "weak";
}) {
  const accentClass =
    tone === "strong"
      ? "border-[#cae8d2] bg-[#f3fbf5] text-[#2f8b4f]"
      : "border-[#f3d980] bg-[#fffaf0] text-[#9c7600]";

  return (
    <div className="rounded-[18px] border border-[#edf0f4] bg-[#fcfcfd] p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[14px] font-bold text-[#171717]">{title}</h4>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${accentClass}`}>
          {tone === "strong" ? "Keep" : "Focus"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => {
          const [stars = "", diff = "比較待ち"] = item.caption.split(" / ");

          return (
            <div key={`${item.label}-${index}`} className="rounded-[15px] border border-[#edf0f4] bg-white px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${accentClass}`}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-[#171717]">{item.label}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[#9c7600]">
                          {stars}
                        </span>
                        <span className="text-[11px] font-bold text-[#8d94a1]">{diff}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[18px] font-black leading-none text-[#171717]">{item.value}</div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#eef0f4]">
                    <div className="h-full rounded-full bg-[#ffc400]" style={{ width: item.value }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildInstructionReport(
  meetings: MeetingRecord[],
  roleplayResults: RoleplayResult[],
  knowledgeItems: KnowledgeItem[],
  searchHistory: KnowledgeSearchHistory[],
): ReportData {
  const monthlyMeetings = meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt));
  const previousMeetings = meetings.filter((meeting) => isPreviousMonth(meeting.recordedAt));
  const monthlyRoleplays = roleplayResults.filter((result) => isCurrentMonth(result.createdAt));
  const previousRoleplays = roleplayResults.filter((result) => isPreviousMonth(result.createdAt));
  const analyzedMeetings = monthlyMeetings.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed");
  const previousAnalyzedMeetings = previousMeetings.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed");
  const meetingCount = monthlyMeetings.filter((meeting) => meeting.salesDomain === "meeting").length;
  const teleapoCount = monthlyMeetings.filter((meeting) => meeting.salesDomain === "teleapo").length;
  const wonCount = monthlyMeetings.filter((meeting) => meeting.status === "won").length;
  const lostCount = monthlyMeetings.filter((meeting) => meeting.status === "lost").length;
  const consideringCount = monthlyMeetings.filter((meeting) => meeting.status === "considering").length;
  const previousWonCount = previousMeetings.filter((meeting) => meeting.status === "won").length;
  const conversionRate = rate(wonCount, monthlyMeetings.length);
  const previousConversionRate = rate(previousWonCount, previousMeetings.length);
  const lostRate = rate(lostCount, monthlyMeetings.length);
  const analysisRate = rate(analyzedMeetings.length, monthlyMeetings.length);
  const averageScore = readAverageMeetingScore(analyzedMeetings);
  const previousAverageScore = readAverageMeetingScore(previousAnalyzedMeetings);
  const averageRoleplayScore = readAverageRoleplayScore(monthlyRoleplays);
  const previousRoleplayScore = readAverageRoleplayScore(previousRoleplays);
  const appointmentRate = rate(wonCount, teleapoCount);
  const skillScores = buildSkillScores(analyzedMeetings, previousAnalyzedMeetings);
  const unmetRankings = buildUnmetRankings(analyzedMeetings);
  const unmetByProduct = buildUnmetCrossRanking(analyzedMeetings, "product");
  const unmetByCustomerType = buildUnmetCrossRanking(analyzedMeetings, "customerType");
  const objectionRankings = buildObjectionRankings(analyzedMeetings);
  const improvementRankings = buildImprovementRankings(analyzedMeetings, monthlyRoleplays);
  const lowestSkill = [...skillScores].sort((left, right) => left.score - right.score)[0];
  const strongestSkills = [...skillScores]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((skill) => ({
      label: skill.label,
      value: `${skill.score}点`,
      caption: `${skill.stars} / ${compareScore(skill.score, skill.previousScore)}`,
      percentage: skill.score,
    }));
  const weakestSkills = [...skillScores]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((skill) => ({
      label: skill.label,
      value: `${skill.score}点`,
      caption: `${skill.stars} / ${skill.caption}`,
      percentage: skill.score,
    }));
  const topUnmet = unmetRankings[0];
  const topImprovement = improvementRankings[0];
  const roleplayPatterns = buildRoleplayPatternRankings(monthlyRoleplays);
  const productPerformances = buildProductPerformances(monthlyMeetings);
  const knowledgeSearchRankings = buildKnowledgeSearchRankings(searchHistory);
  const knowledgeSearchInsights = buildKnowledgeSearchInsights(searchHistory, monthlyMeetings);
  const aiDiagnosis = buildAiDiagnosis({
    lowestSkill,
    topUnmet,
    topImprovement,
    productPerformances,
    averageRoleplayScore,
    averageScore,
  });

  return {
    monthlySummary: [
      {
        label: "商談/テレアポ件数",
        value: `${monthlyMeetings.length}件`,
        subValue: compareCount(monthlyMeetings.length, previousMeetings.length),
        caption: `商談 ${meetingCount}件 / テレアポ ${teleapoCount}件`,
        percentage: Math.min(100, monthlyMeetings.length * 10),
      },
      {
        label: "成約率",
        value: `${conversionRate}%`,
        subValue: `${previousConversionRate}% → ${conversionRate}%`,
        caption: `成約 ${wonCount}件 / 検討中 ${consideringCount}件 / 失注 ${lostCount}件`,
        percentage: conversionRate,
      },
      {
        label: "AIスコア平均",
        value: formatScore(averageScore),
        subValue: compareScore(averageScore, previousAverageScore),
        caption: `AIスコア分布: ${buildScoreDistribution(analyzedMeetings)}`,
        percentage: averageScore ?? 0,
      },
      {
        label: "ロープレ実施回数",
        value: `${monthlyRoleplays.length}回`,
        subValue: compareCount(monthlyRoleplays.length, previousRoleplays.length),
        caption: "弱点克服の練習量",
        percentage: Math.min(100, monthlyRoleplays.length * 12),
      },
      {
        label: "分析済み商談数",
        value: `${analyzedMeetings.length}件`,
        subValue: `${analysisRate}%`,
        caption: `記録した中でAI分析まで進んだ割合 / 失注率 ${lostRate}%`,
        percentage: analysisRate,
      },
      {
        label: "アポ獲得率",
        value: teleapoCount > 0 ? `${appointmentRate}%` : "--",
        subValue: "テレアポ",
        caption: "テレアポが登録されている場合に表示",
        percentage: appointmentRate,
      },
    ],
    aiDiagnosis,
    skillScores,
    strongestSkills,
    weakestSkills,
    unmetRankings,
    unmetByProduct,
    unmetByCustomerType,
    objectionRankings,
    improvementRankings,
    roleplayMetrics: [
      {
        label: "今月のロープレ回数",
        value: `${monthlyRoleplays.length}回`,
        subValue: compareCount(monthlyRoleplays.length, previousRoleplays.length),
        caption: "実施量",
        percentage: Math.min(100, monthlyRoleplays.length * 12),
      },
      {
        label: "平均スコア",
        value: formatScore(averageRoleplayScore),
        subValue: compareScore(averageRoleplayScore, previousRoleplayScore),
        caption: "練習の質",
        percentage: averageRoleplayScore ?? 0,
      },
      {
        label: "最低/最高スコア",
        value: readRoleplayScoreRange(monthlyRoleplays),
        subValue: "ばらつき",
        caption: "商材・シナリオごとの差を見る指標",
        percentage: readRoleplayRangePercentage(monthlyRoleplays),
      },
      {
        label: "改善点の種類",
        value: `${roleplayPatterns.length}種`,
        subValue: "頻出",
        caption: "繰り返し出る改善テーマ",
        percentage: Math.min(100, roleplayPatterns.length * 24),
      },
    ],
    roleplayVariance: buildRoleplayVariance(monthlyRoleplays),
    roleplayPatterns,
    knowledgeSearchRankings,
    knowledgeSearchInsights,
    productPerformances,
    customerTypePerformances: buildCustomerTypePerformances(monthlyMeetings),
    purposePerformances: buildPurposePerformances(monthlyMeetings),
    coachingPriority: {
      title: `${lowestSkill.label}を最優先で指導する状態です。`,
      body: topUnmet
        ? `未達項目では「${topUnmet.label}」が目立っています。まずは商談中にこの確認が抜けていないかを見て、ロープレで再現練習するのが良さそうです。`
        : `現時点では${lowestSkill.label}のスコアが低めです。分析データが増えるほど、指導ポイントはより具体化されます。`,
      evidence: topImprovement
        ? `改善指摘: ${topImprovement.label} / ${topImprovement.value}`
        : `${lowestSkill.caption} / ${lowestSkill.score}点`,
    },
  };
}

function buildSkillScores(meetings: MeetingRecord[], previousMeetings: MeetingRecord[]): SkillScore[] {
  const evaluations = meetings.flatMap((meeting) => meeting.aiSummary?.diagnosis?.salesEvaluation ?? []);
  const previousEvaluations = previousMeetings.flatMap((meeting) => meeting.aiSummary?.diagnosis?.salesEvaluation ?? []);
  const baseSkills = [
    { label: "ヒアリング", fallback: 62, keyword: "ヒアリング" },
    { label: "課題提示", fallback: 56, keyword: "課題" },
    { label: "提案接続", fallback: 60, keyword: "提案" },
    { label: "切り返し", fallback: 54, keyword: "反論" },
    { label: "クロージング", fallback: 50, keyword: "クロージング" },
    { label: "マニュアル準拠", fallback: readManualComplianceScore(meetings) ?? 58, keyword: "マニュアル" },
  ];

  return baseSkills.map((skill) => {
    const matched = evaluations.filter((evaluation) => evaluation.label.includes(skill.keyword));
    const score =
      matched.length > 0
        ? Math.round(matched.reduce((sum, evaluation) => sum + evaluation.score, 0) / matched.length)
        : skill.fallback;
    const previousMatched = previousEvaluations.filter((evaluation) => evaluation.label.includes(skill.keyword));
    const previousScore =
      previousMatched.length > 0
        ? Math.round(previousMatched.reduce((sum, evaluation) => sum + evaluation.score, 0) / previousMatched.length)
        : null;

    return {
      label: skill.label,
      score,
      previousScore,
      stars: score >= 80 ? "★★★" : score >= 60 ? "★★☆" : "★☆☆",
      caption: matched[0]?.description ?? "分析データが少ないため、共通基準で仮評価しています。",
    };
  });
}

function buildAiDiagnosis(input: {
  lowestSkill: SkillScore;
  topUnmet?: RankingItem;
  topImprovement?: RankingItem;
  productPerformances: RankingItem[];
  averageRoleplayScore: number | null;
  averageScore: number | null;
}) {
  const weakProduct = input.productPerformances.find((item) => item.caption.includes("失注") || item.caption.includes("低め"));
  const transferText =
    input.averageRoleplayScore !== null && input.averageScore !== null && input.averageRoleplayScore - input.averageScore >= 15
      ? "ロープレでは点が出ていますが、商談スコアに転換しきれていません。"
      : "ロープレと商談の差分は大きくありません。";

  return {
    title: `${input.lowestSkill.label}が今月の主要課題です。`,
    body: `${input.topUnmet ? `未達項目では「${input.topUnmet.label}」が目立ちます。` : "未達項目はまだ蓄積中です。"} ${
      input.topImprovement ? `改善指摘では「${input.topImprovement.label}」が繰り返し出ています。` : ""
    } ${weakProduct ? `${weakProduct.label}の成果も確認が必要です。` : ""} ${transferText}`,
    evidence: `${input.lowestSkill.label}: ${input.lowestSkill.score}点 / ${
      input.topUnmet ? `未達 ${input.topUnmet.value}` : "未達データ蓄積待ち"
    }`,
  };
}

function buildUnmetRankings(meetings: MeetingRecord[]) {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    for (const item of meeting.aiSummary?.manualCompliance?.missingCriteria ?? []) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }

  return mapCountsToRanking(counts, "マニュアル未達として検出されています。", ["決裁者確認", "予算確認", "導入時期確認"]);
}

function buildUnmetCrossRanking(meetings: MeetingRecord[], mode: "product" | "customerType") {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    const axis =
      mode === "product"
        ? meeting.productType || "商材未設定"
        : meeting.customerType === "existing"
          ? "既存"
          : "新規";

    for (const item of meeting.aiSummary?.manualCompliance?.missingCriteria ?? []) {
      counts.set(`${item} × ${axis}`, (counts.get(`${item} × ${axis}`) ?? 0) + 1);
    }
  }

  return mapCountsToRanking(
    counts,
    mode === "product" ? "商材ごとの未達傾向です。" : "顧客種別ごとの未達傾向です。",
    mode === "product" ? ["予算確認 × 商材未設定", "決裁者確認 × 商材未設定", "導入時期確認 × 商材未設定"] : ["予算確認 × 新規", "決裁者確認 × 新規", "次回アクション × 既存"],
  );
}

function buildObjectionRankings(meetings: MeetingRecord[]) {
  const text = meetings
    .flatMap((meeting) => [
      meeting.aiSummary?.overview ?? "",
      ...(meeting.aiSummary?.bullets ?? []),
      ...(meeting.aiSummary?.diagnosis?.temperature.evidence ?? []),
      ...(meeting.aiSummary?.diagnosis?.status.evidence ?? []),
      ...(meeting.conversationLogs ?? []).map((log) => log.text),
    ])
    .join("\n");
  const patterns = [
    { label: "費用が不安", regex: /高い|費用|料金|予算|コスト/g },
    { label: "効果が不安", regex: /効果|成果|実感|結果/g },
    { label: "社内確認が必要", regex: /社内|上司|決裁|確認/g },
    { label: "時期が未定", regex: /時期|タイミング|今すぐ|来月|検討/g },
  ];
  const counts = new Map<string, number>();

  for (const pattern of patterns) {
    const count = text.match(pattern.regex)?.length ?? 0;
    if (count > 0) {
      counts.set(pattern.label, count);
    }
  }

  return mapCountsToRanking(counts, "顧客の不安・反論として出ています。", ["費用が不安", "社内確認が必要", "効果が不安"]);
}

function buildImprovementRankings(meetings: MeetingRecord[], roleplays: RoleplayResult[]) {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    for (const phrase of meeting.aiSummary?.manualCompliance?.improvementPhrases ?? []) {
      const label = normalizeLabel(phrase);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  for (const result of roleplays) {
    for (const improvement of result.improvements) {
      const label = normalizeImprovementLabel(improvement);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return mapCountsToRanking(counts, "AIが繰り返し改善指摘しています。", ["次回アクション", "課題深掘り", "予算確認"]);
}

function buildRoleplayPatternRankings(roleplays: RoleplayResult[]) {
  const counts = new Map<string, number>();

  for (const result of roleplays) {
    for (const improvement of result.improvements) {
      const label = normalizeImprovementLabel(improvement);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return mapCountsToRanking(counts, "ロープレで繰り返し出ている改善点です。", ["予算確認", "課題深掘り", "次回アクション"]);
}

function buildRoleplayVariance(roleplays: RoleplayResult[]) {
  if (roleplays.length === 0) {
    return [
      { label: "蓄積待ち", value: "--", caption: "ロープレ結果が増えると、スコア差の大きい商材/シナリオが表示されます。" },
    ];
  }

  return [...roleplays]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((result) => ({
      label: result.scenarioTitle || "シナリオ未設定",
      value: `${result.score}点`,
      caption: `${result.productName || "商材未設定"} / ${result.roleplayType === "teleapo" ? "テレアポ" : "商談"}`,
    }));
}

function buildKnowledgeSearchRankings(searchHistory: KnowledgeSearchHistory[]) {
  const counts = new Map<string, number>();

  for (const item of searchHistory.filter((history) => isCurrentMonth(history.searchedAt))) {
    counts.set(item.term, (counts.get(item.term) ?? 0) + 1);
  }

  return mapCountsToRanking(counts, "今月よく調べた検索ワードです。", ["料金", "競合", "反論"]);
}

function buildKnowledgeSearchInsights(searchHistory: KnowledgeSearchHistory[], meetings: MeetingRecord[]) {
  const lostText = meetings
    .filter((meeting) => meeting.status === "lost")
    .map((meeting) => `${meeting.productType} ${meeting.aiSummary?.overview ?? ""} ${(meeting.aiSummary?.bullets ?? []).join(" ")}`)
    .join("\n");
  const counts = new Map<string, number>();

  for (const item of searchHistory.filter((history) => isCurrentMonth(history.searchedAt))) {
    if (item.term && lostText.includes(item.term)) {
      counts.set(item.term, (counts.get(item.term) ?? 0) + 1);
    }
  }

  return mapCountsToRanking(counts, "調べているのに失注している可能性がある領域です。", ["料金 × 失注", "競合 × 失注", "反論 × 失注"]);
}

function buildProductPerformances(meetings: MeetingRecord[]) {
  const groups = groupBy(meetings, (meeting) => meeting.productType || "商材未設定");

  return [...groups.entries()]
    .map(([productName, items]) => {
      const conversionRate = rate(items.filter((meeting) => meeting.status === "won").length, items.length);
      const averageScore = readAverageMeetingScore(items.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed"));
      return {
        label: productName,
        value: `${conversionRate}% / ${formatScore(averageScore)}`,
        caption: `${items.length}件 / ${conversionRate < 40 || (averageScore ?? 100) < 60 ? "低め" : "安定"}`,
        percentage: averageScore ?? conversionRate,
      };
    })
    .sort((left, right) => Number.parseInt(left.value, 10) - Number.parseInt(right.value, 10))
    .slice(0, 5);
}

function buildCustomerTypePerformances(meetings: MeetingRecord[]) {
  const groups = groupBy(meetings, (meeting) => (meeting.customerType === "existing" ? "既存" : "新規"));

  return [...groups.entries()].map(([customerType, items]) => ({
    label: customerType,
    value: `${rate(items.filter((meeting) => meeting.status === "won").length, items.length)}%`,
    caption: `${items.length}件 / 成約率`,
    percentage: rate(items.filter((meeting) => meeting.status === "won").length, items.length),
  }));
}

function buildPurposePerformances(meetings: MeetingRecord[]) {
  const groups = groupBy(meetings, (meeting) => formatMeetingPurpose(String(meeting.meetingPurpose ?? "未設定")));

  return [...groups.entries()]
    .map(([purpose, items]) => ({
      label: purpose,
      value: `成${items.filter((meeting) => meeting.status === "won").length}/検${items.filter((meeting) => meeting.status === "considering").length}/失${items.filter((meeting) => meeting.status === "lost").length}`,
      caption: `${items.length}件`,
      percentage: rate(items.filter((meeting) => meeting.status === "won").length, items.length),
    }))
    .slice(0, 5);
}

function mapCountsToRanking(counts: Map<string, number>, caption: string, fallback: string[]): RankingItem[] {
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const maxCount = sorted[0]?.[1] ?? 0;
  const items = sorted
    .slice(0, 3)
    .map(([label, count]) => ({ label, value: `${count}回`, caption, percentage: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0 }));

  if (items.length > 0) {
    return items;
  }

  return fallback.map((label) => ({
    label,
    value: "蓄積待ち",
    caption: "分析データが増えると頻度が表示されます。",
    percentage: 10,
  }));
}

function readAverageMeetingScore(meetings: MeetingRecord[]) {
  const scores = meetings
    .map(readMeetingScore)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function readMeetingScore(meeting: MeetingRecord) {
  const record = meeting as MeetingRecord & {
    aiScore?: unknown;
    score?: unknown;
    analysisScore?: unknown;
  };
  const directScore = [record.aiScore, record.analysisScore, record.score].find((value) => typeof value === "number");

  if (typeof directScore === "number") {
    return Math.round(directScore);
  }

  const evaluationScores = meeting.aiSummary?.diagnosis?.salesEvaluation?.map((evaluation) => evaluation.score) ?? [];
  if (evaluationScores.length > 0) {
    return Math.round(evaluationScores.reduce((sum, score) => sum + score, 0) / evaluationScores.length);
  }

  if (typeof meeting.aiSummary?.manualCompliance?.score === "number") {
    return meeting.aiSummary.manualCompliance.score;
  }

  return null;
}

function readManualComplianceScore(meetings: MeetingRecord[]) {
  const scores = meetings
    .map((meeting) => meeting.aiSummary?.manualCompliance?.score)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function readAverageRoleplayScore(results: RoleplayResult[]) {
  if (results.length === 0) {
    return null;
  }

  return Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
}

function buildScoreDistribution(meetings: MeetingRecord[]) {
  const scores = meetings
    .map(readMeetingScore)
    .filter((score): score is number => typeof score === "number");
  const high = scores.filter((score) => score >= 80).length;
  const middle = scores.filter((score) => score >= 60 && score < 80).length;
  const low = scores.filter((score) => score < 60).length;

  if (scores.length === 0) {
    return "--";
  }

  return `高${high}/中${middle}/低${low}`;
}

function readRoleplayScoreRange(roleplays: RoleplayResult[]) {
  if (roleplays.length === 0) {
    return "--";
  }

  const scores = roleplays.map((result) => result.score);
  return `${Math.min(...scores)}-${Math.max(...scores)}点`;
}

function readRoleplayRangePercentage(roleplays: RoleplayResult[]) {
  if (roleplays.length === 0) {
    return 0;
  }

  const scores = roleplays.map((result) => result.score);
  return Math.min(100, Math.max(...scores) - Math.min(...scores));
}

function normalizeImprovementLabel(value: string) {
  if (/予算|費用|金額/.test(value)) {
    return "予算確認";
  }

  if (/決裁|社内|上司/.test(value)) {
    return "決裁/社内確認";
  }

  if (/時期|導入|開始/.test(value)) {
    return "導入時期確認";
  }

  if (/次回|日程|アクション/.test(value)) {
    return "次回アクション";
  }

  if (/課題|深掘り|ヒアリング/.test(value)) {
    return "課題深掘り";
  }

  return normalizeLabel(value);
}

function normalizeLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}

function formatMeetingPurpose(value: string) {
  const labels: Record<string, string> = {
    new_proposal: "新規提案",
    relationship_building: "関係構築",
    follow_up: "フォロー",
    renewal: "継続/更新",
    upsell: "追加提案",
  };

  return labels[value] ?? value;
}

function compareCount(current: number, previous: number) {
  const diff = current - previous;
  if (diff > 0) {
    return `先月比 +${diff}`;
  }

  if (diff < 0) {
    return `先月比 ${diff}`;
  }

  return "先月比 ±0";
}

function compareScore(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return "比較待ち";
  }

  const diff = current - previous;
  if (diff > 0) {
    return `+${diff}pt`;
  }

  if (diff < 0) {
    return `${diff}pt`;
  }

  return "±0pt";
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function formatScore(score: number | null) {
  return typeof score === "number" ? `${score}点` : "--";
}

function readPercentFromText(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) {
    return 12;
  }

  return Math.max(8, Math.min(100, Number(match[1])));
}

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isPreviousMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.getFullYear() === previous.getFullYear() && date.getMonth() === previous.getMonth();
}
