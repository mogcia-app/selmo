"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { deleteRoleplayResult, subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";
import { buildTalkAnalysis } from "@/app/sales/roleplay/results/roleplay-result-analysis";

export default function SalesRoleplayResultsPage() {
  const searchParams = useSearchParams();
  const roleplayType = readRoleplayType(searchParams.get("category"));
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const isAdmin = profile?.role === "admin";
  const [results, setResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingResultId, setDeletingResultId] = useState<string | null>(null);
  const averageScore = useMemo(() => {
    const filteredResults = results.filter((result) => result.roleplayType === roleplayType);
    if (filteredResults.length === 0) return 0;
    return Math.round(filteredResults.reduce((sum, result) => sum + result.score, 0) / filteredResults.length);
  }, [results, roleplayType]);
  const visibleResults = useMemo(
    () => results.filter((result) => result.roleplayType === roleplayType),
    [results, roleplayType],
  );

  useEffect(() => {
    if (!userId || !companyId) return;

    return subscribeToRoleplayResults(
      { userId, companyId, isAdmin },
      setResults,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId, isAdmin, userId]);

  async function handleDeleteResult(result: RoleplayResult) {
    if (!window.confirm(`${result.scenarioTitle || "このロープレ結果"}を削除します。よろしいですか？`)) {
      return;
    }

    setDeletingResultId(result.id);
    setError(null);
    try {
      await deleteRoleplayResult(result.id);
      setResults((current) => current.filter((item) => item.id !== result.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ロープレ結果の削除に失敗しました。");
    } finally {
      setDeletingResultId(null);
    }
  }

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="results" roleplayType={roleplayType} />

        <div className="mt-3 flex flex-wrap gap-2">
          <ListSwitch href="/sales/roleplay/results?category=meeting" active={roleplayType === "meeting"}>
            商談ロープレ一覧
          </ListSwitch>
          <ListSwitch href="/sales/roleplay/results?category=teleapo" active={roleplayType === "teleapo"}>
            テレアポロープレ一覧
          </ListSwitch>
        </div>

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-3 grid gap-4 lg:grid-cols-3">
          <SummaryCard label="練習回数" value={`${visibleResults.length}回`} />
          <SummaryCard label="平均スコア" value={visibleResults.length > 0 ? `${averageScore}点` : "-"} />
          <SummaryCard label="最新実施日" value={formatDate(visibleResults[0]?.createdAt ?? null)} />
        </section>

        <section className="mt-3 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-bold text-[#8a6500]">RESULTS</p>
              <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{roleplayType === "teleapo" ? "テレアポロープレ分析履歴" : "商談ロープレ分析履歴"}</h1>
              <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                過去のロープレ分析、会話ログ、次に改善するポイントをいつでも確認できます。
              </p>
            </div>
            <Link href={`/sales/roleplay/scenarios?category=${roleplayType}`} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#ffd12f] px-5 text-[13px] font-black text-[#171717]">
              新しく練習
            </Link>
          </div>

          {visibleResults.length > 0 ? (
            <div className="mt-6 space-y-4">
              {visibleResults.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  roleplayType={roleplayType}
                  isDeleting={deletingResultId === result.id}
                  onDelete={() => void handleDeleteResult(result)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#fffdf7] text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                <ScoreIcon />
              </span>
              <h2 className="mt-5 text-[24px] font-black tracking-[-0.04em] text-[#171717]">分析結果はまだありません</h2>
              <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
                AIロープレを完了すると、スコア・会話ログ・改善ポイントがここに表示されます。
              </p>
              <Link href={`/sales/roleplay/scenarios?category=${roleplayType}`} className="mt-7 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]">
                シナリオを選択
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ResultCard({
  result,
  roleplayType,
  isDeleting,
  onDelete,
}: {
  result: RoleplayResult;
  roleplayType: RoleplayType;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const analysis = buildTalkAnalysis(result.messages);
  const salesTurnCount = result.messages.filter((message) => message.role === "sales").length;
  const primaryImprovement = result.improvements[0] ?? "詳細で改善ポイントを確認できます。";

  return (
    <article className="rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-5 py-5 transition hover:border-[#f0c655] hover:bg-[#fffdf7]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_110px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#8a6500] ring-1 ring-[#f1dfaa]">
              {result.productName || "商材未設定"}
            </span>
            <span className="text-[12px] font-bold text-[#8a909b]">{formatDate(result.createdAt)}</span>
          </div>
          <h2 className="mt-2 truncate text-[19px] font-black text-[#171717]">{result.scenarioTitle}</h2>
          <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-[#596273]">{result.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-black text-[#596273]">
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#e6eaf0]">評価 {analysis.passedCount} / {analysis.checklist.length}</span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#e6eaf0]">営業発話 {salesTurnCount}回</span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#e6eaf0]">口癖 {analysis.fillers.length}件</span>
          </div>
          <p className="mt-3 line-clamp-1 text-[12px] font-bold text-[#7a808c]">改善: {primaryImprovement}</p>
        </div>
        <div className="rounded-[16px] bg-[#171717] px-4 py-3 text-center text-white">
          <div className="text-[24px] font-black leading-none">{result.score}</div>
          <div className="mt-1 text-[11px] font-bold text-white/70">score</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/sales/roleplay/results/${result.id}?category=${roleplayType}`} className="inline-flex h-10 w-full items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white text-[13px] font-black text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fff8d8] sm:w-auto sm:px-5">
          詳細を見る
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex h-10 w-full items-center justify-center rounded-[14px] border border-[#f3d0cd] bg-white text-[13px] font-black text-[#b4232a] transition hover:bg-[#fff6f5] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
        >
          {isDeleting ? "削除中" : "削除"}
        </button>
      </div>
    </article>
  );
}

function ListSwitch({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center justify-center rounded-[13px] border px-4 text-[13px] font-black transition ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#e2e6ee] bg-white text-[#596273] hover:border-[#f0c655]"
      }`}
    >
      {children}
    </Link>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-2 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
    </div>
  );
}

function RoleplayHeader({ activeStep, roleplayType }: { activeStep: "scenario" | "practice" | "results"; roleplayType: RoleplayType }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <span className="sr-only">ロープレナビゲーション</span>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href={`/sales/roleplay/scenarios?category=${roleplayType}`} />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href={`/sales/roleplay?category=${roleplayType}`} />
        <Step number="3" label="分析結果" active={activeStep === "results"} href={`/sales/roleplay/results?category=${roleplayType}`} />
      </div>
    </header>
  );
}

function Step({ number, label, active = false, href }: { number: string; label: string; active?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 min-w-[170px] items-center justify-center gap-3 rounded-[12px] border px-4 text-[13px] font-bold ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}

function ScoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <path d="M4 18.5h16" />
      <path d="M7 15V9M12 15V5M17 15v-3" />
    </svg>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
}

type RoleplayType = "meeting" | "teleapo";

function readRoleplayType(value: string | null): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
}
