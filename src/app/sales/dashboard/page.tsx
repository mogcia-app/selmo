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

export default function SalesDashboardPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayScenarios, setRoleplayScenarios] = useState<RoleplayScenario[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid || !profile.role) {
      return;
    }

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid },
        (nextMeetings) => {
          setMeetings(nextMeetings);
          setIsLoading(false);
        },
        () => {
          setErrorMessage("商談データの読み込みに失敗しました。");
          setIsLoading(false);
        },
      ),
      subscribeToVisibleKnowledgeItems(
        profile.uid,
        setKnowledgeItems,
        () => setErrorMessage("ナレッジデータの読み込みに失敗しました。"),
      ),
      subscribeToRoleplayScenarios(
        setRoleplayScenarios,
        () => setErrorMessage("ロープレシナリオの読み込みに失敗しました。"),
      ),
      subscribeToRoleplayResults(
        { userId: profile.uid, isAdmin: profile.role === "admin" },
        setRoleplayResults,
        () => setErrorMessage("ロープレ結果の読み込みに失敗しました。"),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [profile?.role, profile?.uid]);

  const monthlyMeetings = useMemo(
    () => meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt)),
    [meetings],
  );
  const monthlyRoleplayResults = useMemo(
    () => roleplayResults.filter((result) => isCurrentMonth(result.createdAt)),
    [roleplayResults],
  );
  const averageRoleplayScore = useMemo(() => {
    if (roleplayResults.length === 0) {
      return null;
    }

    const total = roleplayResults.reduce((sum, result) => sum + result.score, 0);
    return Math.round(total / roleplayResults.length);
  }, [roleplayResults]);
  const recentMeetings = meetings.slice(0, 4);
  const recentKnowledge = knowledgeItems.slice(0, 4);
  const recommendedScenario = useMemo(
    () => selectRecommendedScenario(roleplayScenarios, roleplayResults),
    [roleplayResults, roleplayScenarios],
  );
  const weeklyComment = useMemo(
    () => buildWeeklyComment({
      meetings: monthlyMeetings,
      roleplayCount: monthlyRoleplayResults.length,
      averageScore: averageRoleplayScore,
    }),
    [averageRoleplayScore, monthlyMeetings, monthlyRoleplayResults.length],
  );

  function handleKnowledgeSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    router.push(query ? `/sales/knowledge/search?q=${encodeURIComponent(query)}` : "/sales/knowledge/search");
  }

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
      <div className="mx-auto max-w-[1420px]">
        <section className="rounded-[24px] border border-[#eceef4] bg-white px-6 py-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)] md:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <Image
                src="/da.png"
                alt="selmo"
                width={72}
                height={72}
                className="mt-1 h-16 w-16 object-contain"
                priority
              />
              <div>
                <div className="text-[13px] font-semibold text-[#b48600]">Sales Home</div>
                <h1 className="mt-1 text-[28px] font-bold tracking-[-0.04em] text-[#171717]">
                  今日の営業状況
                </h1>
                <p className="mt-2 max-w-[720px] text-[15px] leading-7 text-[#7a808c]">
                  商談をアップロードして、ナレッジで調べて、必要なロープレへすぐ移動できます。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PrimaryLink href="/meetings/upload" label="音声をアップロード" icon={<UploadIcon />} />
              <PrimaryLink href="/sales/knowledge" label="ナレッジを探す" icon={<SearchIcon />} />
              <PrimaryLink href="/sales/roleplay" label="ロープレ開始" icon={<RoleplayIcon />} />
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="mt-5 rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="今月の商談件数"
            value={isLoading ? "読み込み中" : `${monthlyMeetings.length}件`}
            caption="自分がアップロードした商談"
          />
          <MetricCard
            label="今月のアップロード件数"
            value={isLoading ? "読み込み中" : `${monthlyMeetings.length}件`}
            caption="音声登録ベースで集計"
          />
          <MetricCard
            label="平均AIスコア"
            value={averageRoleplayScore === null ? "集計準備中" : `${averageRoleplayScore}点`}
            caption="ロープレ結果から集計中"
          />
          <MetricCard
            label="ロープレ実施回数"
            value={`${monthlyRoleplayResults.length}回`}
            caption="今月保存された結果"
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <div className="space-y-5">
            <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
              <SectionHeader title="最近の商談/通話" href="/meetings" />
              {recentMeetings.length === 0 ? (
                <EmptyState
                  title="商談はまだありません"
                  body="音声をアップロードすると、処理状況と分析結果がここに表示されます。"
                  href="/meetings/upload"
                  action="音声をアップロード"
                />
              ) : (
                <div className="mt-4 divide-y divide-[#f0f1f5]">
                  {recentMeetings.map((meeting) => (
                    <Link
                      key={meeting.id}
                      href={`/meetings/${meeting.id}`}
                      className="grid gap-3 py-4 transition hover:bg-[#fffdf7] md:grid-cols-[1fr_160px_120px]"
                    >
                      <div>
                        <div className="text-[15px] font-semibold text-[#20242c]">
                          {meeting.customerName || "未設定の商談"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#7a808c]">
                          {meeting.productType || "商材未設定"} ・ {meeting.recordedAt ? formatDate(meeting.recordedAt) : "日時未設定"}
                        </div>
                      </div>
                      <StatusBadge value={meeting.status} />
                      <ProcessingText value={meeting.processingStatus} />
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
              <SectionHeader title="最近使えるナレッジ" href="/sales/knowledge" />
              {recentKnowledge.length === 0 ? (
                <EmptyState
                  title="ナレッジはまだありません"
                  body="共有ナレッジや自分用メモが作成されると、ここからすぐ開けます。"
                  href="/sales/knowledge/new"
                  action="ナレッジを作成"
                />
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {recentKnowledge.map((item) => (
                    <Link
                      key={item.id}
                      href={buildKnowledgeHref(item)}
                      className="rounded-[18px] border border-[#eef0f4] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-[#b48600]">
                          {item.scope === "shared" ? "共有" : "マイナレッジ"}
                        </span>
                        <span className="text-[12px] text-[#9aa1ac]">{item.tabTitle || "概要"}</span>
                      </div>
                      <div className="mt-2 line-clamp-1 text-[15px] font-semibold text-[#20242c]">
                        {item.title || "無題のナレッジ"}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-[#7a808c]">
                        {item.description || "説明はまだありません。"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </div>

          <aside className="space-y-5">
            <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
              <h2 className="text-[18px] font-bold text-[#171717]">ナレッジ検索</h2>
              <form onSubmit={handleKnowledgeSearch} className="mt-4">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#96a0ad]">
                    <SearchIcon />
                  </span>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="料金、反論、導入手順など"
                    className="w-full rounded-[16px] border border-[#e6e8ee] bg-white py-3 pl-12 pr-4 text-[14px] text-[#171717] outline-none transition placeholder:text-[#96a0ad] focus:border-[#f0c655] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.14)]"
                  />
                </label>
                <button
                  type="submit"
                  className="mt-3 w-full rounded-[16px] bg-[#ffc400] px-4 py-3 text-[14px] font-bold text-[#171717] transition hover:bg-[#f0b400]"
                >
                  検索する
                </button>
              </form>
            </article>

            <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
              <h2 className="text-[18px] font-bold text-[#171717]">おすすめロープレ</h2>
              {recommendedScenario ? (
                <div className="mt-4 rounded-[18px] border border-[#f3e3a5] bg-[#fffaf0] px-4 py-4">
                  <div className="text-[15px] font-bold text-[#20242c]">{recommendedScenario.title}</div>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-[#7a808c]">
                    {recommendedScenario.description || recommendedScenario.goal || "シナリオ内容を確認して開始できます。"}
                  </p>
                  <Link
                    href={`/sales/roleplay?scenarioId=${recommendedScenario.id}`}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-[14px] bg-[#171717] px-4 py-3 text-[14px] font-semibold text-white"
                  >
                    このシナリオで練習
                  </Link>
                </div>
              ) : (
                <EmptyState
                  title="シナリオはまだありません"
                  body="管理者がシナリオを追加すると、ここから練習できます。"
                  href="/sales/roleplay/scenarios"
                  action="シナリオを見る"
                />
              )}
            </article>

            <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
              <h2 className="text-[18px] font-bold text-[#171717]">AIからの今週の改善コメント</h2>
              <div className="mt-4 rounded-[18px] bg-[#fff8e7] px-4 py-4 text-[14px] leading-7 text-[#5f6470]">
                {weeklyComment}
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

function PrimaryLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-[16px] border border-[#f0d46b] bg-[#fffaf0] px-4 text-[14px] font-bold text-[#171717] transition hover:bg-[#fff3c4]"
    >
      {icon}
      {label}
    </Link>
  );
}

function MetricCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="rounded-[22px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
      <div className="text-[13px] font-semibold text-[#7a808c]">{label}</div>
      <div className="mt-3 min-h-[38px] text-[28px] font-bold tracking-[-0.04em] text-[#171717]">{value}</div>
      <div className="mt-2 text-[12px] leading-5 text-[#9aa1ac]">{caption}</div>
    </article>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-bold text-[#171717]">{title}</h2>
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
    <span className={`inline-flex h-7 w-fit items-center rounded-full px-3 text-[12px] font-semibold ${current.className}`}>
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
          : value === "processing"
            ? "処理中"
            : "処理待ち";
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

function buildWeeklyComment(input: {
  meetings: MeetingRecord[];
  roleplayCount: number;
  averageScore: number | null;
}) {
  if (input.meetings.length === 0 && input.roleplayCount === 0) {
    return "今週はまず、商談音声を1件アップロードして分析の起点を作りましょう。あわせて商品別ナレッジを検索できる状態にしておくと、次の商談準備が早くなります。";
  }

  if (input.averageScore !== null && input.averageScore < 70) {
    return "ロープレ結果では改善余地が残っています。直近の商談で出た反論をナレッジで確認し、同じ商材のシナリオを1本練習してから次回商談に入るのがおすすめです。";
  }

  if (input.meetings.length > 0 && input.roleplayCount === 0) {
    return "商談データは蓄積できています。次は失注理由や顧客の不安をもとに、関連するロープレを1回実施して切り返しを整えましょう。";
  }

  return "商談とロープレの動きが出ています。次回アクションが残っている商談を見直し、よく使う説明はナレッジ化して再利用できる状態にしておきましょう。";
}

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
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
