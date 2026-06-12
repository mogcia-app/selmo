"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
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
import type { CompanyPlan } from "@/lib/firebase/auth";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";

type OodaCycleCard = {
  label: "Observe" | "Orient" | "Decide" | "Act";
  title: string;
  count: number;
  unit: string;
  caption: string;
  href: string;
  tone: "observe" | "orient" | "decide" | "act";
};

type OodaProgress = {
  label: "Observe" | "Orient" | "Decide" | "Act";
  value: string;
  caption: string;
};

export default function SalesDashboardPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayScenarios, setRoleplayScenarios] = useState<RoleplayScenario[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [, setIsLoading] = useState(true);
  const canUseMeeting = !profile || canUseSalesDomain(profile, "meeting");
  const canUseTeleapo = !profile || canUseSalesDomain(profile, "teleapo");
  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "営業担当";
  const activeDomain: SalesDomain = canUseMeeting ? "meeting" : "teleapo";
  const domainCopy = activeDomain === "teleapo"
    ? {
        unit: "架電",
        addLabel: "架電を追加",
        actionTitle: "要対応架電",
        recentTitle: "最近の架電",
        emptyActionTitle: "要対応の架電はありません",
        emptyRecentTitle: "最近の架電はありません",
      }
    : {
        unit: "商談",
        addLabel: "商談を追加",
        actionTitle: "要対応商談",
        recentTitle: "最近の商談",
        emptyActionTitle: "要対応の商談はありません",
        emptyRecentTitle: "最近の商談はありません",
      };

  useEffect(() => {
    if (!profile?.uid || !profile.role || !profile.companyId) {
      return;
    }

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId },
        (nextMeetings) => {
          setMeetings(nextMeetings.filter((meeting) => meeting.salesDomain === activeDomain));
          setIsLoading(false);
        },
        () => {
          setErrorMessage("商談データの読み込みに失敗しました。");
          setIsLoading(false);
        },
      ),
      subscribeToVisibleKnowledgeItems(
        { userId: profile.uid, companyId: profile.companyId },
        (nextItems) => {
          setKnowledgeItems(nextItems);
          setKnowledgeError(null);
        },
        () => setKnowledgeError("ナレッジデータを取得できませんでした。"),
      ),
      subscribeToRoleplayScenarios(
        profile.companyId,
        setRoleplayScenarios,
        () => setErrorMessage("ロープレシナリオの読み込みに失敗しました。"),
      ),
      subscribeToRoleplayResults(
        { userId: profile.uid, companyId: profile.companyId, isAdmin: profile.role === "admin" },
        setRoleplayResults,
        () => setErrorMessage("ロープレ結果の読み込みに失敗しました。"),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeDomain, profile?.companyId, profile?.role, profile?.uid]);

  const monthlyMeetings = useMemo(
    () => meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt)),
    [meetings],
  );
  const monthlyRoleplayResults = useMemo(
    () => roleplayResults.filter((result) => isCurrentMonth(result.createdAt)),
    [roleplayResults],
  );
  const actionMeetings = useMemo(() => buildActionMeetings(meetings), [meetings]);
  const recentMeetings = useMemo(() => meetings.slice(0, 5), [meetings]);
  const recommendedScenario = useMemo(
    () => selectRecommendedScenario(
      roleplayScenarios.filter((scenario) => scenario.visibility === "all" || scenario.createdBy === profile?.uid),
      roleplayResults,
    ),
    [profile?.uid, roleplayResults, roleplayScenarios],
  );
  const recommendedKnowledge = useMemo(
    () => selectRecommendedKnowledge(knowledgeItems, actionMeetings),
    [actionMeetings, knowledgeItems],
  );
  const oodaCycleCards = useMemo(
    () =>
      buildOodaCycleCards({
        meetings,
        actionMeetings,
        recommendedScenario,
        salesDomain: activeDomain,
      }),
    [actionMeetings, activeDomain, meetings, recommendedScenario],
  );
  const oodaProgress = useMemo(
    () =>
      buildOodaProgress({
        meetings: monthlyMeetings,
        actionMeetings,
        roleplayCount: monthlyRoleplayResults.length,
        knowledgeCount: knowledgeItems.length,
      }),
    [actionMeetings, knowledgeItems.length, monthlyMeetings, monthlyRoleplayResults.length],
  );

  function handleKnowledgeSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    router.push(query ? `/sales/knowledge/search?q=${encodeURIComponent(query)}` : "/sales/knowledge/search");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f6] px-4 py-5 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <section className="rounded-[24px] border border-[#e7e9ef] bg-white px-5 py-6 shadow-[0_14px_34px_rgba(17,24,39,0.06)] md:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <Image
                src="/da.png"
                alt="selmo"
                width={72}
                height={72}
                className="mt-1 h-16 w-16 object-contain"
                priority
              />
              <div className="min-w-0">
                <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">
                  AI Sales Coach
                </div>
                <h1 className="mt-2 text-[24px] font-bold text-[#171717] md:text-[28px]">
                  こんにちは、{displayName}さん
                </h1>
                <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[#707783]">
                  {domainCopy.unit}・ナレッジ・ロープレから、今日見るべきことと改善アクションをまとめます。
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <PrimaryLink href={`/meetings/upload?category=${activeDomain}`} label={domainCopy.addLabel} icon={<UploadIcon />} />
              {canUseMeeting ? <PrimaryLink href="/sales/knowledge/search" label="ナレッジ検索" icon={<SearchIcon />} /> : null}
              {canUseTeleapo ? <PrimaryLink href={`/sales/roleplay/scenarios?category=${activeDomain}`} label="ロープレ開始" icon={<RoleplayIcon />} /> : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">OODA Cycle</p>
              <h2 className="mt-1 text-[24px] font-bold text-[#171717]">OODAサイクル</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {oodaCycleCards.map((card) => (
              <OodaCycleShortcut key={card.label} card={card} />
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <AiUsageCard
            plan={profile?.companyPlan ?? "standard"}
            transcriptionQuota={profile?.monthlyTranscriptionQuota ?? 15}
            roleplayQuota={profile?.monthlyRoleplayQuota ?? 15}
            transcriptionUsed={monthlyMeetings.length}
            roleplayUsed={monthlyRoleplayResults.length}
          />

          <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
            <h2 className="text-[20px] font-bold text-[#171717]">ナレッジ検索</h2>
            <div className="mt-1 flex h-[118px] justify-center overflow-hidden">
              <Image
                src="/kensaku1.png"
                alt="ナレッジ検索"
                width={220}
                height={180}
                className="h-[140px] w-auto object-contain"
              />
            </div>
            <form onSubmit={handleKnowledgeSearch} className="-mt-7">
              <label className="relative block">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#96a0ad]">
                  <SearchIcon />
                </span>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="料金、反論、競合比較など"
                  className="w-full rounded-[16px] border border-[#e6e8ee] bg-white py-3 pl-12 pr-4 text-[14px] text-[#171717] outline-none transition placeholder:text-[#96a0ad] focus:border-[#f0c655] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.14)]"
                />
              </label>
              <button
                type="submit"
                className="mt-3 h-11 w-full rounded-[16px] bg-[#ffc400] px-4 text-[14px] font-bold text-[#171717] transition hover:bg-[#f0b400]"
              >
                ナレッジ検索
              </button>
            </form>
            <div className="mt-4 rounded-[18px] bg-[#f7f8fb] px-4 py-4 text-[13px] leading-6 text-[#6f7480]">
              商談前に不安な論点を入れると、該当ナレッジやAI回答に移動できます。
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
          <div className="space-y-5">
            <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
              <SectionHeader title={domainCopy.actionTitle} href={`/meetings?category=${activeDomain}`} />
              {actionMeetings.length === 0 ? (
                <EmptyState
                  title={domainCopy.emptyActionTitle}
                  body="新しい商談を追加すると、AI分析状態や商談結果に応じて次回アクションを提示します。"
                  href={`/meetings/upload?category=${activeDomain}`}
                  action={domainCopy.addLabel}
                />
              ) : (
                <div className="mt-4 space-y-3">
                  {actionMeetings.slice(0, 5).map((meeting) => (
                    <ActionMeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
              <SectionHeader title={domainCopy.recentTitle} href={`/meetings?category=${activeDomain}`} />
              {recentMeetings.length === 0 ? (
                <EmptyState
                  title={domainCopy.emptyRecentTitle}
                  body="商談音声をアップロードすると、ここから履歴と次回アクションを確認できます。"
                  href={`/meetings/upload?category=${activeDomain}`}
                  action={domainCopy.addLabel}
                />
              ) : (
                <div className="mt-4 divide-y divide-[#eef0f4]">
                  {recentMeetings.map((meeting) => (
                    <RecentMeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              )}
            </article>

            <section className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b48600]">Growth Log</p>
                  <h2 className="mt-1 text-[22px] font-bold text-[#171717]">成長記録</h2>
                </div>
                <span className="text-[13px] font-semibold text-[#8d94a1]">スコアより、行動量を見る場所</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <GrowthCard label="商談件数" value={`${monthlyMeetings.length}件`} caption="今月アップロードされた商談" />
                <GrowthCard label="ロープレ回数" value={`${monthlyRoleplayResults.length}回`} caption="今月保存された練習結果" />
                <GrowthCard label="ナレッジ閲覧数" value={`${knowledgeItems.length}件`} caption="確認できるナレッジ数" />
                <GrowthCard
                  label="AI活用回数"
                  value={`${monthlyMeetings.length + monthlyRoleplayResults.length}回`}
                  caption="商談分析とロープレの合計"
                />
              </div>

              <div className="mt-5 border-t border-[#eef0f4] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[16px] font-bold text-[#171717]">今月のOODA進捗</h3>
                  <span className="text-[12px] font-semibold text-[#9aa1ac]">行動の裏側にある確認メモ</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {oodaProgress.map((item) => (
                    <OodaProgressCard key={item.label} item={item} />
                  ))}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <RecommendedRoleplayCard scenario={recommendedScenario} actionMeetings={actionMeetings} />
            <RecommendedKnowledgeCard item={recommendedKnowledge} knowledgeError={knowledgeError} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function OodaCycleShortcut({ card }: { card: OodaCycleCard }) {
  const toneClass = {
    observe: "border-[#f3d4a8] bg-[#fffaf0] text-[#9c7600]",
    orient: "border-[#cfdcf8] bg-[#f5f8ff] text-[#4669b2]",
    decide: "border-[#ffc9c0] bg-[#fff5f3] text-[#c4513f]",
    act: "border-[#cfe9d7] bg-[#f2fbf5] text-[#3b8655]",
  }[card.tone];

  return (
    <Link
      href={card.href}
      className="rounded-[20px] border border-[#e7e9ef] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#f0c655] hover:shadow-[0_14px_28px_rgba(17,24,39,0.08)]"
    >
      <div className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-bold ${toneClass}`}>
        {card.label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-bold text-[#171717]">{card.title}</h3>
          <p className="mt-2 text-[13px] leading-6 text-[#68707d]">{card.caption}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[34px] font-bold leading-none text-[#171717]">{card.count}</div>
          <div className="mt-1 text-[12px] font-bold text-[#8d94a1]">{card.unit}</div>
        </div>
      </div>
      <div className="mt-4 text-[13px] font-bold text-[#9c7600]">開く</div>
    </Link>
  );
}

function AiUsageCard({
  plan,
  transcriptionQuota,
  roleplayQuota,
  transcriptionUsed,
  roleplayUsed,
}: {
  plan: CompanyPlan;
  transcriptionQuota: number | null;
  roleplayQuota: number | null;
  transcriptionUsed: number;
  roleplayUsed: number;
}) {
  const planLabel = formatPlanLabel(plan);
  const totalUsed = transcriptionUsed + roleplayUsed;
  const sharedQuota = readSharedAiQuota(transcriptionQuota, roleplayQuota);

  return (
    <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 text-[#171717] shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#8a6500]">AI Usage</p>
          <h2 className="mt-1 text-[26px] font-bold">今月のAI回数</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#f0c655] bg-[#fffaf0] px-4 py-2 text-[13px] font-bold text-[#6f5500]">
          <span className="h-2 w-2 rounded-full bg-[#ffc400]" />
          <span>{planLabel}プラン</span>
        </div>
      </div>

      <div className="mt-6">
        <UsageGauge
          used={totalUsed}
          limit={sharedQuota}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <AiUsageRatio
          transcriptionUsed={transcriptionUsed}
          roleplayUsed={roleplayUsed}
        />
        <AiChargeButton />
      </div>
    </article>
  );
}

function UsageGauge({
  used,
  limit,
}: {
  used: number;
  limit: number | null;
}) {
  const percentage =
    limit === null
      ? 100
      : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-4 text-[13px] font-semibold text-[#6f5500]">
        <span>AI利用枠</span>
        <span>{limit === null ? "要相談" : `使用 ${used}回 / 月${limit}回`}</span>
      </div>
      <div className="relative mt-3 pt-8">
        <Image
          src="/gag.png"
          alt=""
          width={44}
          height={44}
          className="absolute left-0 top-0 h-11 w-11 object-contain"
        />
        <div className="h-4 overflow-hidden rounded-full bg-[#e8ebf0]">
          <div
            className="h-full rounded-full bg-[#ffc400] transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function readSharedAiQuota(transcriptionQuota: number | null, roleplayQuota: number | null) {
  if (transcriptionQuota === null || roleplayQuota === null) {
    return null;
  }

  return Math.min(transcriptionQuota, roleplayQuota);
}

function formatPlanLabel(plan: CompanyPlan) {
  if (plan === "pro") {
    return "Pro";
  }

  if (plan === "enterprise") {
    return "Enterprise";
  }

  return "Standard";
}

function AiUsageRatio({
  transcriptionUsed,
  roleplayUsed,
}: {
  transcriptionUsed: number;
  roleplayUsed: number;
}) {
  return (
    <div className="rounded-[16px] border border-[#f0c655] bg-white/50 px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a6500]">利用内訳</div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] font-bold text-[#6f5500]">
        <span>文字起こし {transcriptionUsed}回</span>
        <span>ロープレ {roleplayUsed}回</span>
      </div>
    </div>
  );
}

function AiChargeButton() {
  return (
    <Link
      href="/sales/account"
      className="group rounded-[16px] border border-[#f0c655] bg-[#fffdf7] px-4 py-3 text-left transition hover:border-[#d9a900] hover:bg-[#fff7d6]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-[#8a6500]">チャージ</div>
          <div className="mt-1 text-[16px] font-bold text-[#171717]">AI回数を追加</div>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffc400] text-[20px] font-bold leading-none text-[#171717] transition group-hover:bg-[#f0b400]">
          +
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#f2dfa0] pt-3 text-[12px] font-bold text-[#6f5500]">
        <span>1回 6,500円</span>
        <span>10回 65,000円</span>
      </div>
    </Link>
  );
}

function ActionMeetingRow({ meeting }: { meeting: MeetingRecord }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="grid gap-3 rounded-[18px] border border-[#eef0f4] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-[#fffdf7] lg:grid-cols-[minmax(0,1fr)_120px_120px_170px_92px]"
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-[#20242c]">{meeting.customerName || "未設定の商談"}</div>
        <div className="mt-1 text-[13px] text-[#7a808c]">
          {meeting.productType || "商材未設定"} ・ {meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}
        </div>
      </div>
      <StatusBadge value={meeting.status} />
      <ProcessingText value={meeting.processingStatus} />
      <div className="text-[13px] font-semibold leading-6 text-[#4d5563]">{buildNextAction(meeting)}</div>
      <span className="inline-flex h-9 items-center justify-center rounded-[13px] border border-[#e5e8ef] bg-white px-3 text-[12px] font-bold text-[#171717]">
        詳細
      </span>
    </Link>
  );
}

function RecentMeetingRow({ meeting }: { meeting: MeetingRecord }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="grid gap-3 py-4 transition hover:bg-[#fffdf7] md:grid-cols-[minmax(0,1fr)_118px_110px_170px_82px]"
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-[#20242c]">{meeting.customerName || "未設定の商談"}</div>
        <div className="mt-1 text-[13px] text-[#7a808c]">{meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}</div>
      </div>
      <StatusBadge value={meeting.status} />
      <div className="text-[13px] font-bold text-[#596273]">{readMeetingAiScore(meeting)}</div>
      <div className="text-[13px] font-semibold leading-6 text-[#4d5563]">{buildNextAction(meeting)}</div>
      <span className="text-[13px] font-bold text-[#9c7600]">詳細</span>
    </Link>
  );
}

function RecommendedRoleplayCard({
  scenario,
  actionMeetings,
}: {
  scenario: RoleplayScenario | null;
  actionMeetings: MeetingRecord[];
}) {
  if (!scenario) {
    return (
      <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
        <h2 className="text-[20px] font-bold text-[#171717]">推奨ロープレ</h2>
        <EmptyState
          title="シナリオはまだありません"
          body="シナリオが追加されると、改善テーマに合わせて練習できます。"
          href="/sales/roleplay/scenarios"
          action="シナリオを見る"
        />
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
      <h2 className="text-[20px] font-bold text-[#171717]">推奨ロープレ</h2>
      <div className="mt-4 rounded-[18px] border border-[#f3e3a5] bg-[#fffaf0] px-4 py-4">
        <div className="text-[16px] font-bold text-[#20242c]">{scenario.title}</div>
        <p className="mt-2 text-[13px] leading-6 text-[#6f7480]">
          {actionMeetings.some((meeting) => meeting.status === "lost")
            ? "失注要因を次回商談に持ち越さないため推奨しています。"
            : "次回商談前に説明と切り返しを整えるため推奨しています。"}
        </p>
        <div className="mt-3 rounded-[14px] bg-white px-3 py-2 text-[12px] font-bold text-[#8a6500]">
          想定時間: 10分
        </div>
        <Link
          href={`/sales/roleplay?scenarioId=${scenario.id}`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[#171717] px-4 text-[14px] font-semibold text-white"
        >
          開始する
        </Link>
      </div>
    </article>
  );
}

function RecommendedKnowledgeCard({
  item,
  knowledgeError,
}: {
  item: KnowledgeItem | null;
  knowledgeError: string | null;
}) {
  return (
    <article className="rounded-[24px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_30px_rgba(17,24,39,0.05)]">
      <h2 className="text-[20px] font-bold text-[#171717]">推奨ナレッジ</h2>
      {knowledgeError ? (
        <div className="mt-4 rounded-[18px] border border-[#f3d4a8] bg-[#fffaf0] px-4 py-4">
          <div className="text-[14px] font-bold text-[#8a6500]">{knowledgeError}</div>
          <Link
            href="/sales/knowledge/search"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[14px] border border-[#f0c655] bg-white px-4 text-[13px] font-bold text-[#171717]"
          >
            検索ページを開く
          </Link>
        </div>
      ) : item ? (
        <div className="mt-4 rounded-[18px] border border-[#d8e7ff] bg-[#f5f8ff] px-4 py-4">
          <div className="text-[16px] font-bold text-[#20242c]">{item.title || "無題のナレッジ"}</div>
          <p className="mt-2 text-[13px] leading-6 text-[#6f7480]">
            {item.productId ? "商材に紐づく確認事項があるため推奨しています。" : "商談前の説明や反論対応を整えるため推奨しています。"}
          </p>
          <Link
            href={buildKnowledgeHref(item)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[#171717] px-4 text-[14px] font-semibold text-white"
          >
            閲覧する
          </Link>
        </div>
      ) : (
        <EmptyState
          title="推奨ナレッジはまだありません"
          body="ナレッジを作成すると、商談準備に合わせて表示されます。"
          href="/sales/knowledge/new"
          action="ナレッジを作成"
        />
      )}
    </article>
  );
}

function GrowthCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-[18px] border border-[#e8ebf0] bg-[#fcfcfd] px-5 py-4">
      <div className="text-[13px] font-bold text-[#7a808c]">{label}</div>
      <div className="mt-2 text-[28px] font-bold text-[#171717]">{value}</div>
      <div className="mt-1 text-[12px] leading-5 text-[#9aa1ac]">{caption}</div>
    </div>
  );
}

function OodaProgressCard({ item }: { item: OodaProgress }) {
  return (
    <div className="rounded-[16px] border border-[#edf0f4] bg-[#fcfcfd] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-[#171717]">{item.label}</span>
        <span className="text-[13px] font-bold text-[#b48600]">{item.value}</span>
      </div>
      <div className="mt-1 text-[12px] leading-5 text-[#8d94a1]">{item.caption}</div>
    </div>
  );
}

function PrimaryLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[14px] border border-[#f0d46b] bg-[#fffaf0] px-3.5 text-[12px] font-bold text-[#171717] transition hover:bg-[#fff3c4]"
    >
      {icon}
      {label}
    </Link>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[20px] font-bold text-[#171717]">{title}</h2>
      <Link href={href} className="text-[13px] font-semibold text-[#9c7600]">
        すべて見る
      </Link>
    </div>
  );
}

function EmptyState({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="mt-4 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-6 text-center">
      <div className="text-[15px] font-bold text-[#20242c]">{title}</div>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center justify-center rounded-[14px] border border-[#f0c655] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#171717]"
      >
        {action}
      </Link>
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

function ProcessingText({ value }: { value: MeetingRecord["processingStatus"] }) {
  const label =
    value === "completed"
      ? "分析完了"
      : value === "failed"
        ? "処理失敗"
        : value === "uploading"
          ? "アップロード中"
          : value === "uploaded"
            ? "分析待ち"
            : value === "transcribing"
              ? "文字起こし中"
              : value === "analyzing"
                ? "分析中"
                : "処理中";
  return <span className="text-[13px] font-semibold text-[#7a808c]">{label}</span>;
}

function buildKnowledgeHref(item: KnowledgeItem) {
  if (item.categoryId) {
    return `/sales/knowledge/categories/${item.categoryId}/knowledge/${item.id}`;
  }

  return `/sales/knowledge/search?q=${encodeURIComponent(item.title)}`;
}

function selectRecommendedScenario(scenarios: RoleplayScenario[], results: RoleplayResult[]) {
  if (scenarios.length === 0) {
    return null;
  }

  const completedScenarioIds = new Set(results.map((result) => result.scenarioId));
  return scenarios.find((scenario) => !completedScenarioIds.has(scenario.id)) ?? scenarios[0];
}

function selectRecommendedKnowledge(items: KnowledgeItem[], actionMeetings: MeetingRecord[]) {
  if (items.length === 0) {
    return null;
  }

  const productTypes = new Set(actionMeetings.map((meeting) => meeting.productType).filter(Boolean));
  return (
    items.find((item) => item.productId && productTypes.size > 0) ??
    items.find((item) => item.kind === "qa") ??
    items[0]
  );
}

function buildOodaCycleCards(input: {
  meetings: MeetingRecord[];
  actionMeetings: MeetingRecord[];
  recommendedScenario: RoleplayScenario | null;
  salesDomain: SalesDomain;
}): OodaCycleCard[] {
  const unprocessedCount = input.meetings.filter((meeting) => meeting.processingStatus !== "completed").length;
  const completedCount = input.meetings.filter((meeting) => meeting.processingStatus === "completed").length;
  const actionCount = input.actionMeetings.length;
  const unitLabel = input.salesDomain === "teleapo" ? "架電" : "商談";
  const listHref = `/meetings?category=${input.salesDomain}`;

  return [
    {
      label: "Observe",
      title: `未分析の${unitLabel}`,
      count: unprocessedCount,
      unit: "件",
      caption: `AI分析待ち、処理中、処理失敗の${unitLabel}`,
      href: listHref,
      tone: "observe",
    },
    {
      label: "Orient",
      title: "分析完了",
      count: completedCount,
      unit: "件",
      caption: `要約や会話ログを確認できる${unitLabel}`,
      href: listHref,
      tone: "orient",
    },
    {
      label: "Decide",
      title: "要アクション",
      count: actionCount,
      unit: "件",
      caption: `次回接触や失注要因確認が必要な${unitLabel}`,
      href: input.actionMeetings[0] ? `/meetings/${input.actionMeetings[0].id}` : listHref,
      tone: "decide",
    },
    {
      label: "Act",
      title: "ロープレ推奨",
      count: input.recommendedScenario ? 1 : 0,
      unit: "件",
      caption: `次の${unitLabel}前に練習したいシナリオ`,
      href: input.recommendedScenario ? `/sales/roleplay?scenarioId=${input.recommendedScenario.id}` : `/sales/roleplay/scenarios?category=${input.salesDomain}`,
      tone: "act",
    },
  ];
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

  if (meeting.processingStatus === "completed") {
    score += 24;
  }

  if (meeting.aiSummary) {
    score += 12;
  }

  if (meeting.recordedAt) {
    score += Math.max(0, 10 - daysSince(meeting.recordedAt));
  }

  return score;
}

function buildNextAction(meeting: MeetingRecord) {
  if (meeting.processingStatus === "failed") {
    return "音声処理を再確認";
  }

  if (meeting.status === "lost") {
    return "失注要因を確認";
  }

  if (meeting.status === "considering" && meeting.processingStatus === "completed") {
    return "次回接触の論点整理";
  }

  if (meeting.processingStatus === "completed") {
    return "AI要約を確認";
  }

  if (meeting.processingStatus === "uploaded" || meeting.processingStatus === "transcribing" || meeting.processingStatus === "analyzing") {
    return "AI分析完了を待つ";
  }

  return "次回アクションを設定";
}

function buildOodaProgress(input: {
  meetings: MeetingRecord[];
  actionMeetings: MeetingRecord[];
  roleplayCount: number;
  knowledgeCount: number;
}): OodaProgress[] {
  const completedMeetings = input.meetings.filter((meeting) => meeting.processingStatus === "completed").length;

  return [
    { label: "Observe", value: `${input.meetings.length}件`, caption: "今月の商談ログ" },
    { label: "Orient", value: `${completedMeetings}件`, caption: "分析完了した商談" },
    { label: "Decide", value: `${input.actionMeetings.length}件`, caption: "要対応の商談" },
    { label: "Act", value: `${input.roleplayCount}回`, caption: `ナレッジ ${input.knowledgeCount}件` },
  ];
}

function readMeetingAiScore(meeting: MeetingRecord) {
  const record = meeting as MeetingRecord & {
    aiScore?: unknown;
    score?: unknown;
    analysisScore?: unknown;
  };
  const score = [record.aiScore, record.analysisScore, record.score].find((value) => typeof value === "number");

  if (typeof score === "number") {
    return `${Math.round(score)}点`;
  }

  return meeting.processingStatus === "completed" ? "算出待ち" : "-";
}

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function daysSince(date: Date) {
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function RoleplayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7 18.5v-2.2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2.2" />
      <circle cx="12" cy="8" r="3.2" />
      <path d="M4.5 9.5a3 3 0 0 1 3-3M19.5 9.5a3 3 0 0 0-3-3" />
    </svg>
  );
}
