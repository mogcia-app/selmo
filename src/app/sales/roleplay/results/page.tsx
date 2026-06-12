"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToRoleplayResultComments,
  subscribeToRoleplayResults,
  type RoleplayResult,
  type RoleplayResultComment,
} from "@/lib/firebase/roleplay";

export default function SalesRoleplayResultsPage() {
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const isAdmin = profile?.role === "admin";
  const [results, setResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const averageScore = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
  }, [results]);

  useEffect(() => {
    if (!userId || !companyId) return;

    return subscribeToRoleplayResults(
      { userId, companyId, isAdmin },
      setResults,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId, isAdmin, userId]);

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="results" />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <section className="mt-3 grid gap-4 lg:grid-cols-3">
          <SummaryCard label="練習回数" value={`${results.length}回`} />
          <SummaryCard label="平均スコア" value={results.length > 0 ? `${averageScore}点` : "-"} />
          <SummaryCard label="最新実施日" value={formatDate(results[0]?.createdAt ?? null)} />
        </section>

        <section className="mt-3 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-bold text-[#8a6500]">RESULTS</p>
              <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">ロープレ分析履歴</h1>
              <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                過去のロープレ分析、会話ログ、次に改善するポイントをいつでも確認できます。
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
            <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
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
  const analysis = buildTalkAnalysis(result.messages);
  const { profile } = useAuth();

  return (
    <article className="rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-black text-[#171717]">{result.scenarioTitle}</h2>
          <p className="mt-1 text-[13px] text-[#7a808c]">{result.productName || "商材未設定"} ・ {formatDate(result.createdAt)}</p>
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
      <div className="mt-3">
        <ListBlock title="次回使う改善フレーズ" items={result.improvementPhrases} />
      </div>
      <TalkAnalysisBlock analysis={analysis} />
      <AdminCommentBlock companyId={profile?.companyId ?? result.companyId} resultId={result.id} />
      <ConversationBlock messages={result.messages} />
    </article>
  );
}

function AdminCommentBlock({ companyId, resultId }: { companyId?: string | null; resultId: string }) {
  const [comments, setComments] = useState<RoleplayResultComment[]>([]);

  useEffect(() => {
    if (!companyId || !resultId) return;
    return subscribeToRoleplayResultComments({ companyId, resultId }, setComments, () => setComments([]));
  }, [companyId, resultId]);

  if (comments.length === 0) return null;

  return (
    <section className="mt-3 rounded-[16px] border border-[#f0c655] bg-[#fffaf0] px-4 py-4">
      <h3 className="text-[14px] font-black text-[#171717]">adminコメント</h3>
      <div className="mt-3 space-y-2">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-[14px] border border-[#f4df94] bg-white px-4 py-3">
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#343b48]">{comment.comment}</p>
            <div className="mt-2 text-[11px] font-bold text-[#8a909b]">{formatDate(comment.createdAt)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

type TalkAnalysisItem = {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  evidence: string | null;
  turnLabel: string | null;
};

type FillerAnalysisItem = {
  label: string;
  count: number;
  evidence: string | null;
  turnLabel: string | null;
};

type TalkAnalysis = {
  checklist: TalkAnalysisItem[];
  fillers: FillerAnalysisItem[];
  passedCount: number;
};

function TalkAnalysisBlock({ analysis }: { analysis: TalkAnalysis }) {
  return (
    <section className="mt-3 rounded-[16px] border border-[#eef1f5] bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-black text-[#171717]">ロープレ評価チェック</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">
            実施トーク内の営業発話をもとに、できていた項目と根拠を表示します。
          </p>
        </div>
        <div className="rounded-full bg-[#f7f7fa] px-3 py-1.5 text-[12px] font-black text-[#343b48]">
          {analysis.passedCount} / {analysis.checklist.length}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {analysis.checklist.map((item) => (
          <div
            key={item.id}
            className={`rounded-[16px] border px-4 py-3 ${
              item.passed ? "border-[#cfe8d4] bg-[#f6fff8]" : "border-[#edf0f4] bg-[#fcfcfd]"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
                  item.passed ? "bg-[#17a34a] text-white" : "bg-[#eef1f5] text-[#8a909b]"
                }`}
              >
                {item.passed ? "✓" : "-"}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-black text-[#171717]">{item.label}</div>
                <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">{item.description}</p>
                {item.evidence ? (
                  <div className="mt-2 rounded-[12px] border border-white/70 bg-white px-3 py-2 text-[12px] leading-5 text-[#343b48]">
                    <span className="font-black text-[#8a6500]">{item.turnLabel}</span>
                    <span className="ml-2">{item.evidence}</span>
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] font-bold text-[#b05c00]">該当発話なし</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
        <div className="text-[13px] font-black text-[#171717]">口癖チェック</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {analysis.fillers.map((item) => (
            <div key={item.label} className={`rounded-[14px] border px-3 py-3 ${item.count > 0 ? "border-[#ffd8cc] bg-[#fff8f5]" : "border-[#e6eaf0] bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-black text-[#171717]">{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-black ${item.count > 0 ? "bg-[#ffe2dc] text-[#c53628]" : "bg-[#eef8f1] text-[#16833f]"}`}>
                  {item.count}回
                </span>
              </div>
              {item.evidence ? (
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#596273]">
                  <span className="font-black text-[#8a6500]">{item.turnLabel}</span> {item.evidence}
                </p>
              ) : (
                <p className="mt-2 text-[12px] font-bold text-[#7a808c]">検出なし</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConversationBlock({ messages }: { messages: RoleplayResult["messages"] }) {
  return (
    <details className="mt-3 rounded-[16px] border border-[#eef1f5] bg-white px-4 py-3" open={messages.length <= 8}>
      <summary className="cursor-pointer text-[13px] font-black text-[#171717]">
        実施トークを見る
      </summary>
      <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
        {messages.length > 0 ? (
          messages.map((message, index) => {
            const isSales = message.role === "sales";
            return (
              <div key={`${message.createdAt}-${index}`} className={`flex ${isSales ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] rounded-[16px] px-4 py-3 text-[13px] leading-6 ${
                    isSales ? "bg-[#171717] text-white" : "border border-[#e6eaf0] bg-[#fcfcfd] text-[#343b48]"
                  }`}
                >
                  <div className={`mb-1 text-[11px] font-black ${isSales ? "text-white/70" : "text-[#8a909b]"}`}>
                    {isSales ? "営業" : "AI顧客"}
                  </div>
                  {message.content}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-4 py-5 text-center text-[13px] font-bold text-[#8a909b]">
            会話ログはありません
          </div>
        )}
      </div>
    </details>
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

function buildTalkAnalysis(messages: RoleplayResult["messages"]): TalkAnalysis {
  const salesTurns = messages
    .map((message, index) => ({ message, index }))
    .filter((item) => item.message.role === "sales");
  const checklist = analysisDefinitions.map((definition) => {
    const evidenceTurn = findEvidenceTurn(salesTurns, definition.keywords);
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      passed: Boolean(evidenceTurn),
      evidence: evidenceTurn ? trimEvidence(evidenceTurn.message.content) : null,
      turnLabel: evidenceTurn ? `営業${countSalesTurn(messages, evidenceTurn.index)}回目` : null,
    };
  });
  const fillers = fillerDefinitions.map((definition) => {
    const matchedTurn = salesTurns.find((turn) => new RegExp(definition.pattern.source).test(turn.message.content));
    const count = salesTurns.reduce((sum, turn) => {
      const matches = turn.message.content.match(definition.pattern);
      return sum + (matches?.length ?? 0);
    }, 0);

    return {
      label: definition.label,
      count,
      evidence: matchedTurn ? trimEvidence(matchedTurn.message.content) : null,
      turnLabel: matchedTurn ? `営業${countSalesTurn(messages, matchedTurn.index)}回目` : null,
    };
  });

  return {
    checklist,
    fillers,
    passedCount: checklist.filter((item) => item.passed).length,
  };
}

const analysisDefinitions = [
  {
    id: "issue-depth",
    label: "課題深掘り",
    description: "課題・困りごと・背景・原因・現状を確認できているか",
    keywords: ["課題", "困", "悩", "背景", "原因", "現状", "なぜ", "どういう", "どのような"],
  },
  {
    id: "value-connection",
    label: "価値接続",
    description: "商材の価値を相手の課題や成果に結びつけて話せているか",
    keywords: ["効果", "改善", "成果", "価値", "事例", "解決", "メリット", "できるよう"],
  },
  {
    id: "budget",
    label: "予算確認",
    description: "予算感・費用対効果・金額の判断基準を確認できているか",
    keywords: ["予算", "費用", "金額", "価格", "月額", "費用対効果", "コスト"],
  },
  {
    id: "decision",
    label: "決裁/社内確認",
    description: "決裁者・上司・社内確認・意思決定フローを確認できているか",
    keywords: ["決裁", "上司", "社内", "判断", "稟議", "意思決定", "担当者", "確認される方"],
  },
  {
    id: "timing",
    label: "導入時期確認",
    description: "導入時期・開始時期・検討スケジュールを確認できているか",
    keywords: ["時期", "いつ", "導入", "開始", "スケジュール", "タイミング", "何月"],
  },
  {
    id: "next-action",
    label: "次回アクション確定",
    description: "次回日程・資料送付・見積提出など次の動きを合意できているか",
    keywords: ["次回", "日程", "資料", "見積", "送付", "打ち合わせ", "お送りします", "確認します"],
  },
] as const;

const fillerDefinitions = [
  { label: "えー", pattern: /えー/g },
  { label: "あの", pattern: /あの/g },
  { label: "まあ", pattern: /まあ/g },
  { label: "なんか", pattern: /なんか/g },
] as const;

function findEvidenceTurn(
  turns: Array<{ message: RoleplayResult["messages"][number]; index: number }>,
  keywords: readonly string[],
) {
  return turns.find((turn) => keywords.some((keyword) => turn.message.content.includes(keyword))) ?? null;
}

function countSalesTurn(messages: RoleplayResult["messages"], targetIndex: number) {
  return messages.slice(0, targetIndex + 1).filter((message) => message.role === "sales").length;
}

function trimEvidence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 90 ? `${normalized.slice(0, 90)}...` : normalized;
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
