"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";

export default function SalesRoleplayResultsPage() {
  const { profile } = useAuth();
  const userId = profile?.uid;
  const isAdmin = profile?.role === "admin";
  const [results, setResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const averageScore = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
  }, [results]);

  useEffect(() => {
    if (!userId) return;

    return subscribeToRoleplayResults(
      { userId, isAdmin },
      setResults,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [isAdmin, userId]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="results" />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <SummaryCard label="練習回数" value={`${results.length}回`} />
          <SummaryCard label="平均スコア" value={results.length > 0 ? `${averageScore}点` : "-"} />
          <SummaryCard label="最新実施日" value={formatDate(results[0]?.createdAt ?? null)} />
        </section>

        <section className="mt-4 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-7 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-bold text-[#8a6500]">RESULTS</p>
              <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">ロープレ結果</h1>
              <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                スコア、会話ログ、次に改善するポイントを確認できます。
              </p>
            </div>
            <Link href="/sales/roleplay/scenarios" className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#ffd12f] px-5 text-[13px] font-black text-[#171717]">
              新しく練習
            </Link>
          </div>

          {results.length > 0 ? (
            <div className="mt-6 space-y-4">
              {results.map((result) => (
                <ResultCard key={result.id} result={result} />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-12 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#fffdf7] text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                <ScoreIcon />
              </span>
              <h2 className="mt-5 text-[24px] font-black tracking-[-0.04em] text-[#171717]">分析結果はまだありません</h2>
              <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
                AIロープレを完了すると、スコア・会話ログ・改善ポイントがここに表示されます。
              </p>
              <Link href="/sales/roleplay/scenarios" className="mt-7 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]">
                シナリオを選択
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ResultCard({ result }: { result: RoleplayResult }) {
  return (
    <article className="rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-black text-[#171717]">{result.scenarioTitle}</h2>
          <p className="mt-1 text-[13px] text-[#7a808c]">{result.productName || "商品未設定"} ・ {formatDate(result.createdAt)}</p>
        </div>
        <div className="rounded-[16px] bg-[#171717] px-4 py-3 text-center text-white">
          <div className="text-[24px] font-black leading-none">{result.score}</div>
          <div className="mt-1 text-[11px] font-bold text-white/70">score</div>
        </div>
      </div>
      <p className="mt-4 text-[14px] leading-7 text-[#343b48]">{result.summary}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ListBlock title="良かった点" items={result.strengths} />
        <ListBlock title="改善ポイント" items={result.improvements} />
      </div>
    </article>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-white px-4 py-3">
      <h3 className="text-[13px] font-black text-[#171717]">{title}</h3>
      <ul className="mt-2 space-y-1 text-[13px] leading-6 text-[#596273]">
        {(items.length > 0 ? items : ["未登録"]).map((item) => (
          <li key={item}>・{item}</li>
        ))}
      </ul>
    </div>
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

function RoleplayHeader({ activeStep }: { activeStep: "scenario" | "practice" | "results" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href="/sales/roleplay/scenarios" />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href="/sales/roleplay" />
        <Step number="3" label="分析結果" active={activeStep === "results"} href="/sales/roleplay/results" />
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
