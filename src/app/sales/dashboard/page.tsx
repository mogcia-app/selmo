"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { firebaseAuth } from "@/lib/firebase/client";
import {
  subscribeToVisibleKnowledgeItems,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  subscribeToRoleplayResults,
  subscribeToRoleplayScenarios,
  type RoleplayResult,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";

type SummaryMetric = {
  label: string;
  value: string;
  caption: string;
  tone: "yellow" | "green" | "blue" | "dark";
};

type PriorityAction = {
  title: string;
  reason: string;
};

type OodaCardData = {
  label: "Observe" | "Orient" | "Decide" | "Act";
  badge: string;
  title: string;
  description: string;
  spotlight?: {
    label: string;
    value: string;
    caption: string;
  };
  items: Array<{ label: string; value: string }>;
  actions?: Array<{ label: string; href: string; primary?: boolean }>;
};

type AarCardData = {
  title: string;
  body: string;
  point: string;
  tone: "good" | "improve" | "reason" | "next";
};

type SkillScore = {
  label: string;
  score: number;
  comment: string;
};

type GrowthMetric = {
  label: string;
  value: string;
  caption: string;
  percentage: number;
};

type CoachInsight = {
  label: string;
  finding: string;
  evidence: string;
  nextAction: string;
  training: string;
};

type DashboardInsight = {
  summaryMetrics: SummaryMetric[];
  coachInsight: CoachInsight;
  priorityActions: PriorityAction[];
  oodaCards: OodaCardData[];
  aarCards: AarCardData[];
  skillScores: SkillScore[];
  growthMetrics: GrowthMetric[];
};

export default function SalesDashboardPage() {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayScenarios, setRoleplayScenarios] = useState<RoleplayScenario[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMeetingsLoaded, setIsMeetingsLoaded] = useState(false);
  const [isKnowledgeLoaded, setIsKnowledgeLoaded] = useState(false);
  const [isRoleplayScenariosLoaded, setIsRoleplayScenariosLoaded] = useState(false);
  const [isRoleplayResultsLoaded, setIsRoleplayResultsLoaded] = useState(false);
  const [generatedActionCards, setGeneratedActionCards] = useState<OodaCardData[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInputValue(new Date()));
  const requestedActionKeyRef = useRef<string | null>(null);
  const canUseMeeting = !profile || canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = !profile || canUseSalesDomain(profile, "teleapo");
  const canUseRoleplay = canUseMeeting || canUseTeleapo;
  const activeDomain: SalesDomain = canUseMeeting ? "meeting" : "teleapo";
  const unitLabel = activeDomain === "teleapo" ? "テレアポ" : "商談";
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "営業担当";

  useEffect(() => {
    if (!profile?.uid || !profile.role || !profile.companyId || (!canUseMeeting && !canUseTeleapo)) {
      setMeetings([]);
      setKnowledgeItems([]);
      setRoleplayScenarios([]);
      setRoleplayResults([]);
      setIsMeetingsLoaded(true);
      setIsKnowledgeLoaded(true);
      setIsRoleplayScenariosLoaded(true);
      setIsRoleplayResultsLoaded(true);
      return;
    }

    setIsMeetingsLoaded(false);
    setIsKnowledgeLoaded(false);
    setIsRoleplayScenariosLoaded(false);
    setIsRoleplayResultsLoaded(false);
    setGeneratedActionCards(null);
    requestedActionKeyRef.current = null;

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId, salesDomains: [activeDomain] },
        (nextMeetings) => {
          setMeetings(nextMeetings.filter((meeting) => meeting.salesDomain === activeDomain));
          setIsMeetingsLoaded(true);
          setErrorMessage(null);
        },
        () => setErrorMessage(`${unitLabel}データの読み込みに失敗しました。`),
      ),
      subscribeToVisibleKnowledgeItems(
        { userId: profile.uid, companyId: profile.companyId },
        (nextItems) => {
          setKnowledgeItems(nextItems);
          setIsKnowledgeLoaded(true);
        },
        () => setErrorMessage("ナレッジデータを取得できませんでした。"),
      ),
      canUseRoleplay
        ? subscribeToRoleplayScenarios(
        profile.companyId,
        (nextScenarios) => {
          setRoleplayScenarios(nextScenarios);
          setIsRoleplayScenariosLoaded(true);
        },
        () => setErrorMessage("ロープレシナリオの読み込みに失敗しました。"),
      )
        : () => {
            setRoleplayScenarios([]);
            setIsRoleplayScenariosLoaded(true);
          },
      canUseRoleplay
        ? subscribeToRoleplayResults(
        { userId: profile.uid, companyId: profile.companyId, isAdmin: profile.role === "admin" },
        (nextResults) => {
          setRoleplayResults(nextResults);
          setIsRoleplayResultsLoaded(true);
        },
        () => setErrorMessage("ロープレ結果の読み込みに失敗しました。"),
      )
        : () => {
            setRoleplayResults([]);
            setIsRoleplayResultsLoaded(true);
          },
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeDomain, canUseMeeting, canUseRoleplay, canUseTeleapo, profile?.companyId, profile?.role, profile?.uid, unitLabel]);

  const monthlyMeetings = useMemo(
    () => filterRecordsByMonth(meetings, selectedMonth, (meeting) => meeting.recordedAt),
    [meetings, selectedMonth],
  );
  const weeklyMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.recordedAt && daysSince(meeting.recordedAt) <= 7),
    [meetings],
  );
  const monthlyRoleplayResults = useMemo(
    () => filterRecordsByMonth(roleplayResults, selectedMonth, (result) => result.createdAt),
    [roleplayResults, selectedMonth],
  );
  const recentMeetings = useMemo(() => meetings.slice(0, 5), [meetings]);
  const actionMeetings = useMemo(() => buildActionMeetings(meetings), [meetings]);
  const latestMeeting = recentMeetings[0] ?? null;
  const recommendedScenario = useMemo(
    () => selectRecommendedScenario(
      roleplayScenarios.filter((scenario) => scenario.visibility === "all" || scenario.createdBy === profile?.uid),
      roleplayResults,
    ),
    [profile?.uid, roleplayResults, roleplayScenarios],
  );
  const insight = useMemo(
    () =>
      buildDashboardInsight({
        meetings,
        monthlyMeetings,
        weeklyMeetings,
        actionMeetings,
        knowledgeItems,
        monthlyRoleplayCount: monthlyRoleplayResults.length,
        recommendedScenario,
        activeDomain,
        unitLabel,
      }),
    [
      actionMeetings,
      activeDomain,
      knowledgeItems,
      meetings,
      monthlyMeetings,
      monthlyRoleplayResults.length,
      recommendedScenario,
      unitLabel,
      weeklyMeetings,
    ],
  );
  const displayedActionCards = normalizeActionCardDescriptions(generatedActionCards ?? insight.oodaCards);

  useEffect(() => {
    const isDashboardReady =
      isMeetingsLoaded &&
      isKnowledgeLoaded &&
      isRoleplayScenariosLoaded &&
      isRoleplayResultsLoaded;

    if (!profile?.uid || !profile.companyId || !isDashboardReady) {
      return;
    }

    const requestKey = `${profile.uid}:${activeDomain}:${getTodayActionDateKey()}`;
    if (requestedActionKeyRef.current === requestKey) {
      return;
    }

    requestedActionKeyRef.current = requestKey;

    const generateActions = async () => {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) {
        return;
      }

      const response = await fetch("/api/sales/dashboard-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          salesDomain: activeDomain,
          unitLabel,
          fallbackCards: insight.oodaCards,
          context: buildDashboardActionContext({
            meetings,
            monthlyMeetings,
            weeklyMeetings,
            actionMeetings,
            knowledgeItems,
            roleplayResults,
            roleplayScenarios,
            recommendedScenario,
            skillScores: insight.skillScores,
            unitLabel,
          }),
        }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { cards?: OodaCardData[] };
      if (Array.isArray(payload.cards) && payload.cards.length === 4) {
        setGeneratedActionCards(payload.cards);
      }
    };

    void generateActions().catch(() => {
      requestedActionKeyRef.current = null;
    });
  }, [
    actionMeetings,
    activeDomain,
    insight.oodaCards,
    insight.skillScores,
    isKnowledgeLoaded,
    isMeetingsLoaded,
    isRoleplayResultsLoaded,
    isRoleplayScenariosLoaded,
    knowledgeItems,
    meetings,
    monthlyMeetings,
    profile?.companyId,
    profile?.uid,
    recommendedScenario,
    roleplayResults,
    roleplayScenarios,
    unitLabel,
    weeklyMeetings,
  ]);

  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-0 pt-4 md:px-7 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <section className="rounded-[24px] border border-[#e7e9ef] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(17,24,39,0.05)] md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#9c7600]">OODA × AAR Dashboard</p>
              <h1 className="mt-2 text-[24px] font-bold text-[#171717] md:text-[30px]">
                こんにちは、{displayName}さん
              </h1>
              <p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[#6f7480]">
                対象月の商談・ロープレ・分析状況
              </p>
            </div>
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {insight.summaryMetrics.map((metric) => (
            <SummaryCard key={metric.label} metric={metric} />
          ))}
        </section>

        <RecentMeetingList
          meetings={recentMeetings}
          activeDomain={activeDomain}
          latestMeeting={latestMeeting}
          unitLabel={unitLabel}
        />

        <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
          <SectionHeading
            eyebrow="OODA"
            title="営業アクション"
            body="活動状況、傾向、改善テーマ、次の対応を表示します。"
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {displayedActionCards.map((card) => (
                <OodaCard key={card.label} card={card} />
              ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <SkillScoreCard scores={insight.skillScores} />
          <GrowthChartCard metrics={insight.growthMetrics} />
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ metric }: { metric: SummaryMetric }) {
  return (
    <article className="rounded-[22px] border border-[#e7e9ef] bg-white p-5 shadow-[0_10px_24px_rgba(17,24,39,0.04)]">
      <p className="text-[13px] font-bold text-[#6f7480]">{metric.label}</p>
      <div className="mt-3 text-[34px] font-bold leading-none text-[#171717]">{metric.value}</div>
      <p className="mt-3 text-[12px] leading-5 text-[#7a808c]">{metric.caption}</p>
    </article>
  );
}

function MonthSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = parseMonthValue(value) ?? new Date();
  return (
    <div className="flex w-fit flex-wrap items-center gap-2 rounded-[12px] border border-[#e0e4eb] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
      <span className="text-[12px] font-black text-[#596273]">{formatMonthRange(selectedDate)}</span>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-[9px] border border-[#e4e8ef] bg-[#fcfcfd] px-2 text-[12px] font-black text-[#343b48] outline-none focus:border-[#e0bd4b]"
        aria-label="対象月"
      />
    </div>
  );
}

function OodaCard({ card }: { card: OodaCardData }) {
  return (
    <article className="flex min-h-[260px] flex-col rounded-[22px] border border-[#e7e9ef] bg-[#fcfcfd] p-5 shadow-[0_8px_20px_rgba(17,24,39,0.035)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[18px] font-bold text-[#171717]">{card.title}</h3>
          <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">{card.description}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f0d46b] bg-[#fffaf0] text-[12px] font-black text-[#8a6500]">
          {card.badge}
        </span>
      </div>
      {card.spotlight ? (
        <div className="mt-5 rounded-[18px] border border-[#f0d46b] bg-[#fffaf0] px-4 py-4">
          <div className="text-[12px] font-bold text-[#9c7600]">{card.spotlight.label}</div>
          <div className="mt-2 text-[20px] font-black leading-7 text-[#171717]">{card.spotlight.value}</div>
          <p className="mt-2 text-[12px] leading-5 text-[#7a808c]">{card.spotlight.caption}</p>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {card.items.map((item) => (
          <div key={item.label} className="rounded-[16px] bg-white px-4 py-3 ring-1 ring-[#edf0f4]">
            <div className="text-[12px] font-bold text-[#8d94a1]">{item.label}</div>
            <div className="mt-1.5 text-[14px] font-bold leading-6 text-[#20242c]">{item.value}</div>
          </div>
        ))}
      </div>
      {card.actions ? (
        <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-1">
          {card.actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={
                action.primary
                  ? "flex h-10 items-center justify-center rounded-[14px] bg-[#171717] px-3 text-[13px] font-bold text-white"
                  : "flex h-10 items-center justify-center rounded-[14px] border border-[#e5e8ef] bg-white px-3 text-[13px] font-bold text-[#171717]"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function normalizeActionCardDescriptions(cards: OodaCardData[]) {
  return cards.map((card) => ({
    ...card,
    description: readActionCardDescription(card),
  }));
}

function readActionCardDescription(card: OodaCardData) {
  if (card.title === "活動状況" || card.label === "Observe") {
    return "今週の記録数 / 分析済み / 未分析";
  }

  if (card.title === "商談の傾向" || card.label === "Orient") {
    return "ステータス / 課題 / 頻出ワード";
  }

  if (card.title === "改善テーマ" || card.label === "Decide") {
    return "未達項目 / 優先確認項目";
  }

  return "確認 / ロープレ / ナレッジ";
}

function SkillScoreCard({ scores }: { scores: SkillScore[] }) {
  return (
    <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
      <SectionHeading
        eyebrow="Skill"
        title="スキル別評価"
        body="商談分析の評価項目をスキル別に表示します。"
      />
      {scores.length === 0 ? (
        <EmptyMetricState
          title="分析後に表示されます"
          body="このアカウントの商談・テレアポ分析が完了すると、スキル別評価が表示されます。"
        />
      ) : null}
      <div className="mt-5 space-y-4">
        {scores.map((score) => (
          <div key={score.label}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-bold text-[#171717]">{score.label}</div>
                <div className="mt-1 text-[12px] text-[#7a808c]">{score.comment}</div>
              </div>
              <span className="text-[20px] font-bold text-[#171717]">{score.score}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef0f4]">
              <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${score.score}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GrowthChartCard({ metrics }: { metrics: GrowthMetric[] }) {
  return (
    <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
      <SectionHeading
        eyebrow="Growth"
        title="成長推移"
        body="スコア、分析件数、ロープレ回数の推移を表示します。"
      />
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-[18px] border border-[#edf0f4] bg-[#fcfcfd] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[13px] font-bold text-[#6f7480]">{metric.label}</div>
                <div className="mt-2 text-[26px] font-bold leading-none text-[#171717]">{metric.value}</div>
              </div>
              <div className="text-[12px] font-bold text-[#9c7600]">{metric.caption}</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef0f4]">
              <div className="h-full rounded-full bg-[#ffc400]" style={{ width: `${metric.percentage}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentMeetingList({
  meetings,
  activeDomain,
  latestMeeting,
  unitLabel,
}: {
  meetings: MeetingRecord[];
  activeDomain: SalesDomain;
  latestMeeting: MeetingRecord | null;
  unitLabel: string;
}) {
  return (
    <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow="Recent"
          title={`直近${unitLabel}一覧`}
          body={`直近5件の${unitLabel}を表示します。`}
        />
        <Link href={`/meetings?category=${activeDomain}`} className="text-[13px] font-bold text-[#9c7600]">
          すべて見る
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
          <div className="text-[15px] font-bold text-[#20242c]">{unitLabel}はまだありません</div>
          <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
            {unitLabel}を追加すると、ここに表示されます。
          </p>
          <Link
            href={`/meetings/upload?category=${activeDomain}`}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[14px] bg-[#ffc400] px-4 text-[13px] font-bold text-[#171717]"
          >
            {unitLabel}を追加
          </Link>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[18px] border border-[#edf0f4]">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_100px_minmax(180px,0.7fr)_84px] gap-3 bg-[#fffaf0] px-4 py-3 text-[12px] font-bold text-[#8a6500] lg:grid">
            <span>{unitLabel}名</span>
            <span>日付</span>
            <span>結果</span>
            <span>AIスコア</span>
            <span>主な改善ポイント</span>
            <span>詳細</span>
          </div>
          <div className="divide-y divide-[#edf0f4]">
            {meetings.map((meeting) => (
              <RecentMeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </div>
      )}

      {latestMeeting ? (
        <p className="mt-3 text-[12px] leading-5 text-[#8d94a1]">
          最新: {latestMeeting.customerName || "未設定"}
        </p>
      ) : null}
    </section>
  );
}

function RecentMeetingRow({ meeting }: { meeting: MeetingRecord }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="grid gap-3 px-4 py-4 transition hover:bg-[#fffdf7] lg:grid-cols-[minmax(0,1fr)_120px_110px_100px_minmax(180px,0.7fr)_84px] lg:items-center"
    >
      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold text-[#171717]">{meeting.customerName || "未設定"}</div>
        <div className="mt-1 text-[12px] text-[#8d94a1] lg:hidden">{meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}</div>
      </div>
      <div className="hidden text-[13px] font-semibold text-[#596273] lg:block">
        {meeting.recordedAt ? formatDate(meeting.recordedAt) : "未設定"}
      </div>
      <StatusBadge value={meeting.status} />
      <div className="text-[13px] font-bold text-[#596273]">{formatScore(readMeetingAiScoreNumber(meeting))}</div>
      <div className="text-[13px] font-semibold leading-6 text-[#4d5563]">{buildImprovementPoint(meeting)}</div>
      <span className="text-[13px] font-bold text-[#9c7600]">詳細</span>
    </Link>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#b48600]">{eyebrow}</p>
      <h2 className="mt-1 text-[22px] font-bold text-[#171717]">{title}</h2>
      <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: MeetingRecord["status"] }) {
  const current =
    value === "won"
      ? { label: "成約", className: "bg-[#e9f9ee] text-[#30a65b]" }
      : value === "lost"
        ? { label: "失注", className: "bg-[#ffe8e8] text-[#ff5d47]" }
        : { label: "検討中", className: "bg-[#fff4df] text-[#b07c00]" };

  return (
    <span className={`inline-flex h-8 w-fit items-center rounded-full px-3 text-[12px] font-semibold ${current.className}`}>
      {current.label}
    </span>
  );
}

function buildDashboardActionContext(input: {
  meetings: MeetingRecord[];
  monthlyMeetings: MeetingRecord[];
  weeklyMeetings: MeetingRecord[];
  actionMeetings: MeetingRecord[];
  knowledgeItems: KnowledgeItem[];
  roleplayResults: RoleplayResult[];
  roleplayScenarios: RoleplayScenario[];
  recommendedScenario: RoleplayScenario | null;
  skillScores: SkillScore[];
  unitLabel: string;
}) {
  return {
    unitLabel: input.unitLabel,
    counts: {
      totalMeetings: input.meetings.length,
      monthlyMeetings: input.monthlyMeetings.length,
      weeklyMeetings: input.weeklyMeetings.length,
      analyzedMeetings: input.monthlyMeetings.filter((meeting) => meeting.aiSummary || meeting.aiSummaryStatus === "completed").length,
      pendingAnalysis: input.monthlyMeetings.filter((meeting) => !meeting.aiSummary && meeting.aiSummaryStatus !== "completed").length,
      actionMeetings: input.actionMeetings.length,
      knowledgeItems: input.knowledgeItems.length,
      roleplayResults: input.roleplayResults.length,
      roleplayScenarios: input.roleplayScenarios.length,
    },
    recentMeetings: input.meetings.slice(0, 8).map((meeting) => ({
      id: meeting.id,
      customerName: meeting.customerName,
      productType: meeting.productType,
      customerType: meeting.customerType,
      meetingPurpose: meeting.meetingPurpose,
      status: meeting.status,
      recordedAt: meeting.recordedAt?.toISOString() ?? null,
      aiScore: readMeetingAiScoreNumber(meeting),
      overview: truncateText(meeting.aiSummary?.overview ?? "", 180),
      statusLabel: meeting.aiSummary?.diagnosis?.status.label ?? null,
      temperature: meeting.aiSummary?.diagnosis?.temperature.label ?? null,
      consideration: meeting.aiSummary?.diagnosis?.consideration.label ?? null,
      missingCriteria: meeting.aiSummary?.manualCompliance?.missingCriteria?.slice(0, 5) ?? [],
      improvementPhrases: meeting.aiSummary?.manualCompliance?.improvementPhrases?.slice(0, 5) ?? [],
    })),
    skillScores: input.skillScores,
    roleplay: {
      recommendedScenario: input.recommendedScenario
        ? {
            id: input.recommendedScenario.id,
            title: input.recommendedScenario.title,
            productName: input.recommendedScenario.productName,
            category: input.recommendedScenario.scenarioCategory,
            targetSegment: input.recommendedScenario.targetSegment,
          }
        : null,
      recentResults: input.roleplayResults.slice(0, 5).map((result) => ({
        scenarioTitle: result.scenarioTitle,
        productName: result.productName,
        score: result.score,
        improvements: result.improvements.slice(0, 4),
        improvementPhrases: result.improvementPhrases.slice(0, 4),
      })),
    },
    knowledge: input.knowledgeItems.slice(0, 8).map((item) => ({
      title: item.title,
      tabTitle: item.tabTitle,
      categoryId: item.categoryId,
      productId: item.productId,
      tags: item.tags?.slice(0, 5) ?? [],
    })),
  };
}

function buildDashboardInsight(input: {
  meetings: MeetingRecord[];
  monthlyMeetings: MeetingRecord[];
  weeklyMeetings: MeetingRecord[];
  actionMeetings: MeetingRecord[];
  knowledgeItems: KnowledgeItem[];
  monthlyRoleplayCount: number;
  recommendedScenario: RoleplayScenario | null;
  activeDomain: SalesDomain;
  unitLabel: string;
}): DashboardInsight {
  const wonCount = input.monthlyMeetings.filter((meeting) => meeting.status === "won").length;
  const lostCount = input.weeklyMeetings.filter((meeting) => meeting.status === "lost").length;
  const completedMeetings = input.monthlyMeetings.filter((meeting) => meeting.aiSummary || meeting.processingStatus === "completed");
  const pendingAnalysisCount = input.monthlyMeetings.filter((meeting) => !meeting.aiSummary && meeting.aiSummaryStatus !== "completed").length;
  const conversionRate = input.monthlyMeetings.length > 0 ? Math.round((wonCount / input.monthlyMeetings.length) * 100) : 0;
  const averageScore = readAverageScore(completedMeetings);
  const averageDuration = readAverageDuration(input.weeklyMeetings);
  const frequentWords = readFrequentWords(input.weeklyMeetings);
  const skillScores = buildSkillScores(completedMeetings);
  const improveTargets = buildImproveTargets(input.actionMeetings, skillScores);
  const stalledCount = input.actionMeetings.filter((meeting) => meeting.status === "considering" || meeting.status === "lost").length;
  const coachInsight = buildCoachInsight({
    completedMeetings,
    actionMeetings: input.actionMeetings,
    improveTargets,
    skillScores,
    recommendedScenario: input.recommendedScenario,
    unitLabel: input.unitLabel,
  });
  const roleplayHref = input.recommendedScenario
    ? `/sales/roleplay?category=${input.activeDomain}&scenarioId=${input.recommendedScenario.id}`
    : `/sales/roleplay/scenarios?category=${input.activeDomain}`;
  const topMissingCriteria = readTopManualCriteria(completedMeetings);
  const topStatus = readTopMeetingStatus(input.monthlyMeetings);
  const topCustomerIssue = readTopCustomerIssue(completedMeetings);
  const reviewHref = input.meetings[0] ? `/meetings/${input.meetings[0].id}` : `/meetings?category=${input.activeDomain}`;

  return {
    summaryMetrics: [
      {
        label: `対象月の${input.unitLabel}数`,
        value: `${input.monthlyMeetings.length}件`,
        caption: "対象月にアップロードされた記録",
        tone: "yellow",
      },
      {
        label: "成約率",
        value: `${conversionRate}%`,
        caption: wonCount > 0 ? `成約 ${wonCount}件` : "成約データなし",
        tone: "green",
      },
      {
        label: "分析済み件数",
        value: `${completedMeetings.length}件`,
        caption: "AIサマリー確認済みの件数",
        tone: "blue",
      },
      {
        label: "AIスコア",
        value: formatScore(averageScore),
        caption: "直近分析の平均値",
        tone: "dark",
      },
    ],
    coachInsight,
    priorityActions:
      completedMeetings.length > 0
        ? improveTargets.map((target) => ({
            title: target,
            reason: coachInsight.evidence,
          }))
        : [
            {
              title: `まず${input.unitLabel}分析を追加する`,
              reason: `このアカウントの${input.unitLabel}分析が完了すると、優先アクションが表示されます。`,
            },
          ],
    oodaCards: [
      {
        label: "Observe",
        badge: "01",
        title: "活動状況",
        description: "今週の記録数と分析状況を表示します。",
        items: [
          { label: `今週の${input.unitLabel}`, value: `${input.weeklyMeetings.length}件` },
          { label: "未分析", value: `${pendingAnalysisCount}件` },
          { label: "分析済み", value: `${completedMeetings.length}件` },
          { label: `平均${input.unitLabel}時間`, value: averageDuration },
          { label: "対象月のロープレ", value: `${input.monthlyRoleplayCount}回` },
          { label: "停滞/要確認", value: `${stalledCount}件` },
        ],
      },
      {
        label: "Orient",
        badge: "02",
        title: "商談の傾向",
        description: "商談ステータスと会話内の傾向を表示します。",
        items: [
          { label: "顧客課題", value: topCustomerIssue },
          { label: "多いステータス", value: topStatus },
          { label: "失注/停滞", value: `${lostCount + stalledCount}件` },
          { label: "頻出ワード", value: frequentWords.join(" / ") || "蓄積待ち" },
          { label: "弱いスキル", value: coachInsight.label },
        ],
      },
      {
        label: "Decide",
        badge: "03",
        title: "改善テーマ",
        description: "未達項目と優先確認項目を表示します。",
        items: [
          { label: "優先項目", value: improveTargets[0] ?? "分析データ蓄積待ち" },
          { label: "必ず聞くこと", value: topMissingCriteria },
          { label: "避けたい流れ", value: completedMeetings.length > 0 ? "課題確認前に料金説明へ入る" : "分析データ蓄積待ち" },
          { label: "関連ロープレ", value: input.recommendedScenario?.title ?? coachInsight.training },
          { label: "確認タイミング", value: "提案前とクロージング前" },
        ],
      },
      {
        label: "Act",
        badge: "04",
        title: "やること",
        description: "確認、ロープレ、ナレッジへの導線を表示します。",
        items: [
          { label: "次の確認", value: pendingAnalysisCount > 0 ? `未分析の${input.unitLabel}` : "ロープレシナリオ" },
          { label: "商談確認", value: input.meetings[0]?.customerName || "直近商談を確認" },
          { label: "ロープレ", value: input.recommendedScenario?.title ?? "シナリオを選択" },
          { label: "ナレッジ", value: `${input.knowledgeItems.length}件から検索可能` },
          { label: "次回準備", value: topMissingCriteria },
        ],
        actions: [
          {
            label: pendingAnalysisCount > 0 ? "直近商談を確認" : "AIロープレ開始",
            href: pendingAnalysisCount > 0 ? reviewHref : roleplayHref,
            primary: true,
          },
          { label: "関連ナレッジ確認", href: "/sales/knowledge/search" },
          { label: "一覧を見る", href: `/meetings?category=${input.activeDomain}` },
        ],
      },
    ],
    aarCards: [
      {
        title: "良かったこと",
        point: "Keep",
        tone: "good",
        body: buildAarKeep(completedMeetings, input.unitLabel),
      },
      {
        title: "改善すべきこと",
        point: "Problem",
        tone: "improve",
        body: coachInsight.finding,
      },
      {
        title: "なぜそうなったか",
        point: "Why",
        tone: "reason",
        body: coachInsight.evidence,
      },
      {
        title: "次回どうするか",
        point: "Next",
        tone: "next",
        body: coachInsight.nextAction,
      },
    ],
    skillScores,
    growthMetrics: [
      {
        label: "AIスコア推移",
        value: formatScore(averageScore),
        caption: averageScore === null ? "蓄積待ち" : "対象月平均",
        percentage: averageScore ?? 0,
      },
      {
        label: "成約率推移",
        value: `${conversionRate}%`,
        caption: "対象月",
        percentage: conversionRate,
      },
      {
        label: "分析件数",
        value: `${completedMeetings.length}件`,
        caption: `対象月${input.monthlyMeetings.length}件中`,
        percentage: input.monthlyMeetings.length > 0 ? Math.round((completedMeetings.length / input.monthlyMeetings.length) * 100) : 0,
      },
      {
        label: "ロープレ回数",
        value: `${input.monthlyRoleplayCount}回`,
        caption: "対象月",
        percentage: Math.min(100, input.monthlyRoleplayCount * 12),
      },
    ],
  };
}

function buildActionMeetings(meetings: MeetingRecord[]) {
  return [...meetings]
    .filter((meeting) => meeting.status !== "won" || meeting.processingStatus === "failed")
    .sort((left, right) => getMeetingPriority(right) - getMeetingPriority(left));
}

function getMeetingPriority(meeting: MeetingRecord) {
  let score = 0;

  if (meeting.processingStatus === "failed") {
    score += 60;
  }

  if (meeting.status === "considering") {
    score += 48;
  }

  if (meeting.status === "lost") {
    score += 36;
  }

  if (meeting.aiSummary) {
    score += 24;
  }

  if (meeting.recordedAt) {
    score += Math.max(0, 10 - daysSince(meeting.recordedAt));
  }

  return score;
}

function selectRecommendedScenario(scenarios: RoleplayScenario[], results: RoleplayResult[]) {
  if (scenarios.length === 0) {
    return null;
  }

  const completedScenarioIds = new Set(results.map((result) => result.scenarioId));
  return scenarios.find((scenario) => !completedScenarioIds.has(scenario.id)) ?? scenarios[0];
}

function buildImproveTargets(actionMeetings: MeetingRecord[], skills: SkillScore[]) {
  const weakestSkills = [...skills].sort((left, right) => left.score - right.score).map((skill) => skill.label);
  const targets: string[] = [];

  if (weakestSkills.includes("ヒアリング")) {
    targets.push("提案前に顧客課題を一度要約する");
  }

  if (weakestSkills.includes("クロージング")) {
    targets.push("最後に次回日程と宿題を必ず合意する");
  }

  if (weakestSkills.includes("切り返し")) {
    targets.push("競合比較や不安を先に聞いてから価値を接続する");
  }

  if (actionMeetings.some((meeting) => meeting.status === "lost")) {
    targets.push("失注商談の反論パターンをロープレで復習する");
  }

  return unique(targets).slice(0, 3);
}

function buildSkillScores(meetings: MeetingRecord[]): SkillScore[] {
  const evaluations = meetings.flatMap((meeting) => meeting.aiSummary?.diagnosis?.salesEvaluation ?? []);
  if (meetings.length === 0 || evaluations.length === 0) {
    return [];
  }

  const readScore = (label: string) => {
    const matched = evaluations.filter((evaluation) => evaluation.label.includes(label));
    if (matched.length === 0) {
      return null;
    }

    return Math.round(matched.reduce((sum, evaluation) => sum + evaluation.score, 0) / matched.length);
  };

  return [
    { label: "ヒアリング", keyword: "ヒアリング", comment: "現状・背景・課題を聞けているか" },
    { label: "課題整理", keyword: "課題", comment: "顧客の言葉で課題を整理できているか" },
    { label: "提案力", keyword: "提案", comment: "商材価値を課題に接続できているか" },
    { label: "切り返し", keyword: "反論", comment: "不安や比較に対して確認できているか" },
    { label: "クロージング", keyword: "クロージング", comment: "次回日程・宿題・決裁確認まで進めたか" },
  ].flatMap((skill) => {
    const score = readScore(skill.keyword);
    return score === null ? [] : [{ label: skill.label, score, comment: skill.comment }];
  });
}

function EmptyMetricState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
      <div className="text-[15px] font-bold text-[#20242c]">{title}</div>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function buildCoachInsight(input: {
  completedMeetings: MeetingRecord[];
  actionMeetings: MeetingRecord[];
  improveTargets: string[];
  skillScores: SkillScore[];
  recommendedScenario: RoleplayScenario | null;
  unitLabel: string;
}): CoachInsight {
  const weakestSkill = [...input.skillScores].sort((left, right) => left.score - right.score)[0];
  const missingCriteria = unique(
    input.completedMeetings.flatMap((meeting) => meeting.aiSummary?.manualCompliance?.missingCriteria ?? []),
  );
  const improvementPhrases = unique(
    input.completedMeetings.flatMap((meeting) => meeting.aiSummary?.manualCompliance?.improvementPhrases ?? []),
  );
  const evidence = pickStrongestEvidence(input.completedMeetings, weakestSkill?.label);
  const stalledCount = input.actionMeetings.filter((meeting) => meeting.status === "considering" || meeting.status === "lost").length;
  const primaryTarget = input.improveTargets[0] ?? `${input.unitLabel}分析を追加して改善点を確認する`;

  if (input.completedMeetings.length === 0) {
    return {
      label: "分析データ不足",
      finding: `まだ${input.unitLabel}分析が少ないため、改善点は仮説ベースです。`,
      evidence: `まずは直近の${input.unitLabel}でAIサマリーを開き、課題・不安・次回アクションを抽出してください。`,
      nextAction: primaryTarget,
      training: input.recommendedScenario?.title ?? "新規提案の基本ロープレ",
    };
  }

  if (missingCriteria.length > 0) {
    return {
      label: weakestSkill ? `${weakestSkill.label} ${weakestSkill.score}点` : "マニュアル未達",
      finding: `直近分析では「${missingCriteria[0]}」が弱点として残っています。`,
      evidence: evidence || `マニュアルの未達項目に「${missingCriteria.slice(0, 2).join(" / ")}」が出ています。`,
      nextAction: improvementPhrases[0] ?? primaryTarget,
      training: input.recommendedScenario?.title ?? `${missingCriteria[0]}を重点練習`,
    };
  }

  if (weakestSkill && weakestSkill.score < 65) {
    return {
      label: `${weakestSkill.label} ${weakestSkill.score}点`,
      finding: `${weakestSkill.label}が相対的に弱く、商談の前進を止めている可能性があります。`,
      evidence: evidence || `${weakestSkill.comment} の評価が他スキルより低めです。`,
      nextAction: primaryTarget,
      training: input.recommendedScenario?.title ?? `${weakestSkill.label}を鍛えるロープレ`,
    };
  }

  if (stalledCount > 0) {
    return {
      label: `要対応 ${stalledCount}件`,
      finding: "検討中・失注の商談が残っているため、次回アクションの明確化が優先です。",
      evidence: `${stalledCount}件の${input.unitLabel}で、追加確認や再接触が必要な状態です。`,
      nextAction: "次回日程・決裁者・導入時期を一つずつ確認する",
      training: input.recommendedScenario?.title ?? "次回アクション確定ロープレ",
    };
  }

  return {
    label: weakestSkill ? `${weakestSkill.label} ${weakestSkill.score}点` : "安定",
    finding: "大きな弱点は目立ちません。次は再現性を高める段階です。",
    evidence: evidence || "分析済み商談の評価に大きな偏りはありません。",
    nextAction: "うまくいった商談の質問順と切り返しをテンプレ化する",
    training: input.recommendedScenario?.title ?? "成功パターン再現ロープレ",
  };
}

function pickStrongestEvidence(meetings: MeetingRecord[], skillLabel?: string) {
  const evaluations = meetings.flatMap((meeting) => meeting.aiSummary?.diagnosis?.salesEvaluation ?? []);
  const matchedEvaluation = skillLabel
    ? evaluations.find((evaluation) => evaluation.label.includes(skillLabel) && evaluation.evidence.length > 0)
    : null;
  const evidence =
    matchedEvaluation?.evidence[0] ??
    meetings.find((meeting) => (meeting.aiSummary?.diagnosis?.consideration.evidence.length ?? 0) > 0)?.aiSummary?.diagnosis?.consideration.evidence[0] ??
    meetings.find((meeting) => (meeting.aiSummary?.diagnosis?.status.evidence.length ?? 0) > 0)?.aiSummary?.diagnosis?.status.evidence[0] ??
    null;

  return evidence ? `根拠: ${truncateText(evidence, 86)}` : "";
}

function buildAarKeep(meetings: MeetingRecord[], unitLabel: string) {
  const positiveEvidence =
    meetings.find((meeting) => meeting.aiSummary?.diagnosis?.temperature.level === "high")?.aiSummary?.diagnosis?.temperature.evidence[0] ??
    meetings.find((meeting) => (meeting.aiSummary?.diagnosis?.salesEvaluation?.some((evaluation) => evaluation.score >= 70) ?? false))?.aiSummary?.diagnosis?.salesEvaluation?.find((evaluation) => evaluation.score >= 70)?.evidence[0] ??
    null;

  if (positiveEvidence) {
    return `良かった根拠: ${truncateText(positiveEvidence, 92)}`;
  }

  return meetings.length > 0
    ? `${unitLabel}ログとAI分析が登録されています。`
    : `${unitLabel}の記録はまだありません。`;
}

function readAverageScore(meetings: MeetingRecord[]) {
  const scores = meetings
    .map(readMeetingAiScoreNumber)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function readMeetingAiScoreNumber(meeting: MeetingRecord) {
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

function readAverageDuration(meetings: MeetingRecord[]) {
  const durations = meetings
    .map((meeting) => meeting.audioDurationSec ?? meeting.transcriptionProbeDurationSec ?? null)
    .filter((duration): duration is number => typeof duration === "number" && duration > 0);

  if (durations.length === 0) {
    return "--";
  }

  const averageSeconds = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  return `${Math.round(averageSeconds / 60)}分`;
}

function readFrequentWords(meetings: MeetingRecord[]) {
  const text = meetings
    .flatMap((meeting) => [
      meeting.transcriptionProbeText ?? "",
      ...(meeting.transcriptBlocks ?? []).map((block) => block.text),
      ...(meeting.conversationLogs ?? []).map((log) => log.text),
    ])
    .join("\n");

  const stopWords = new Set([
    "です",
    "ます",
    "ました",
    "こと",
    "これ",
    "それ",
    "ため",
    "ので",
    "よう",
    "こちら",
    "ありがとう",
    "ございます",
  ]);
  const counts = new Map<string, number>();

  for (const match of text.matchAll(/[一-龥ぁ-んァ-ンA-Za-z0-9ー]{2,}/g)) {
    const word = match[0].trim();
    if (word.length < 2 || stopWords.has(word)) {
      continue;
    }

    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([word]) => word);
}

function readTopManualCriteria(meetings: MeetingRecord[]) {
  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    for (const criterion of meeting.aiSummary?.manualCompliance?.missingCriteria ?? []) {
      counts.set(criterion, (counts.get(criterion) ?? 0) + 1);
    }
  }

  const topCriterion = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return topCriterion ?? "蓄積待ち";
}

function readTopMeetingStatus(meetings: MeetingRecord[]) {
  if (meetings.length === 0) {
    return "蓄積待ち";
  }

  const counts = new Map<MeetingRecord["status"], number>();
  for (const meeting of meetings) {
    counts.set(meeting.status, (counts.get(meeting.status) ?? 0) + 1);
  }

  const [status, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  const label =
    status === "won"
      ? "成約"
      : status === "lost"
        ? "失注"
        : "検討中";

  return `${label} ${count}件`;
}

function readTopCustomerIssue(meetings: MeetingRecord[]) {
  const texts = meetings.flatMap((meeting) => [
    meeting.aiSummary?.overview ?? "",
    ...(meeting.aiSummary?.bullets ?? []),
    ...(meeting.aiSummary?.diagnosis?.status.evidence ?? []),
    ...(meeting.aiSummary?.diagnosis?.temperature.evidence ?? []),
    ...(meeting.aiSummary?.diagnosis?.consideration.evidence ?? []),
  ]);
  const patterns = [
    { label: "料金・費用対効果", regex: /料金|費用|予算|高い|コスト|費用対効果/g },
    { label: "導入時期・進め方", regex: /導入時期|時期|スケジュール|いつ|開始|進め方/g },
    { label: "決裁者・社内確認", regex: /決裁|上司|社内|確認|稟議|判断/g },
    { label: "課題整理", regex: /課題|困って|悩み|改善|現状|問題/g },
    { label: "競合比較・不安", regex: /競合|他社|比較|不安|懸念|迷/g },
  ];
  const joinedText = texts.join("\n");
  const ranked = patterns
    .map((pattern) => ({
      label: pattern.label,
      count: joinedText.match(pattern.regex)?.length ?? 0,
    }))
    .sort((left, right) => right.count - left.count);

  return ranked[0]?.count ? ranked[0].label : "分析データなし";
}

function buildImprovementPoint(meeting: MeetingRecord) {
  const missingCriteria = meeting.aiSummary?.manualCompliance?.missingCriteria?.[0];
  const improvementPhrase = meeting.aiSummary?.manualCompliance?.improvementPhrases?.[0];

  if (missingCriteria) {
    return missingCriteria;
  }

  if (improvementPhrase) {
    return improvementPhrase;
  }

  if (meeting.status === "lost") {
    return "失注理由と反論対応を確認";
  }

  if (meeting.status === "considering") {
    return "次回アクションと決裁者確認";
  }

  return meeting.aiSummary ? "良かった流れを再現する" : "AI分析を実行する";
}

function formatScore(score: number | null) {
  return typeof score === "number" ? `${score}点` : "--";
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function daysSince(date: Date) {
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const formatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${formatter.format(start)} 〜 ${formatter.format(end)}`;
}

function formatMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function filterRecordsByMonth<T>(records: T[], monthValue: string, getDate: (record: T) => Date | null) {
  const monthDate = parseMonthValue(monthValue);
  if (!monthDate) return records;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return records.filter((record) => {
    const date = getDate(record);
    return date ? date.getFullYear() === year && date.getMonth() === month : false;
  });
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTodayActionDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function unique(values: string[]) {
  return [...new Set(values)];
}
