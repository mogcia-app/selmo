"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToRoleplayResultComments,
  type RoleplayResult,
  type RoleplayResultComment,
} from "@/lib/firebase/roleplay";

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

export function RoleplayResultDetailPanel({ result }: { result: RoleplayResult }) {
  const analysis = buildTalkAnalysis(result.messages);
  const { profile } = useAuth();

  return (
    <article className="rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-black text-[#171717]">{result.scenarioTitle}</h2>
          <p className="mt-1 text-[13px] text-[#7a808c]">{result.productName || "商材未設定"} ・ {formatFullDate(result.createdAt)}</p>
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
            <div className="mt-2 text-[11px] font-bold text-[#8a909b]">{formatFullDate(comment.createdAt)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

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
        <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">
          営業側の実施トークから、繰り返し出ている言葉を抽出しています。
        </p>
        {analysis.fillers.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {analysis.fillers.map((item) => (
              <div key={item.label} className="rounded-[14px] border border-[#ffd8cc] bg-[#fff8f5] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-black text-[#171717]">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-[#ffe2dc] px-2 py-0.5 text-[12px] font-black text-[#c53628]">
                    {item.count}回
                  </span>
                </div>
                {item.evidence ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#596273]">
                    <span className="font-black text-[#8a6500]">{item.turnLabel}</span> {item.evidence}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[14px] border border-[#e6eaf0] bg-white px-4 py-3 text-[12px] font-bold text-[#7a808c]">
            繰り返し使われている口癖は検出されませんでした。
          </div>
        )}
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
      <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
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

export function buildTalkAnalysis(messages: RoleplayResult["messages"]): TalkAnalysis {
  const salesTurns = messages
    .map((message, index) => ({ message, index }))
    .filter((item) => item.message.role === "sales");
  const checklist = analysisDefinitions.map((definition) => {
    const evidenceTurn = findEvidenceTurn(definition, salesTurns, messages);
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      passed: Boolean(evidenceTurn),
      evidence: evidenceTurn ? trimEvidence(evidenceTurn.message.content) : null,
      turnLabel: evidenceTurn ? `営業${countSalesTurn(messages, evidenceTurn.index)}回目` : null,
    };
  });
  const fillers = extractRepeatedWords(salesTurns, messages);

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
  },
  {
    id: "value-connection",
    label: "価値接続",
    description: "商材の価値を相手の課題や成果に結びつけて話せているか",
  },
  {
    id: "budget",
    label: "予算確認",
    description: "予算感・費用対効果・金額の判断基準を確認できているか",
  },
  {
    id: "decision",
    label: "決裁/社内確認",
    description: "決裁者・上司・社内確認・意思決定フローを確認できているか",
  },
  {
    id: "timing",
    label: "導入時期確認",
    description: "導入時期・開始時期・検討スケジュールを確認できているか",
  },
  {
    id: "next-action",
    label: "次回アクション確定",
    description: "次回日程・資料送付・見積提出など次の動きを合意できているか",
  },
] as const;

function findEvidenceTurn(
  definition: (typeof analysisDefinitions)[number],
  turns: Array<{ message: RoleplayResult["messages"][number]; index: number }>,
  messages: RoleplayResult["messages"],
) {
  return turns.find((turn) => isEvidenceTurn(definition.id, turn, messages)) ?? null;
}

function isEvidenceTurn(
  definitionId: (typeof analysisDefinitions)[number]["id"],
  turn: { message: RoleplayResult["messages"][number]; index: number },
  messages: RoleplayResult["messages"],
) {
  const text = turn.message.content;

  if (hasMetaTalk(text)) return false;

  switch (definitionId) {
    case "issue-depth":
      return hasPriorCustomerIssue(messages, turn.index) && isQuestionLike(text) && includesAny(text, issueDepthKeywords);
    case "value-connection":
      return text.length <= 650 && includesAny(text, customerIssueReferenceKeywords) && includesAny(text, valueConnectionKeywords);
    case "budget":
      return isQuestionLike(text) && includesAny(text, budgetKeywords);
    case "decision":
      return isQuestionLike(text) && includesAny(text, decisionKeywords);
    case "timing":
      return isQuestionLike(text) && includesAny(text, timingKeywords);
    case "next-action":
      return includesAny(text, nextActionKeywords) && includesAny(text, nextActionCommitmentKeywords);
    default:
      return false;
  }
}

const issueDepthKeywords = ["なぜ", "原因", "背景", "影響", "具体", "どのくらい", "どれくらい", "理想", "困って", "課題", "要因", "ボトルネック"];
const customerIssueReferenceKeywords = ["課題", "困", "悩", "集客", "更新", "反映", "雰囲気", "コミュニケーション", "効果", "希望", "ニーズ"];
const valueConnectionKeywords = ["解決", "改善", "成果", "価値", "メリット", "できるよう", "つなが", "増や", "減ら", "防げ", "実現"];
const budgetKeywords = ["予算", "費用", "金額", "価格", "月額", "費用対効果", "コスト"];
const decisionKeywords = ["決裁", "上司", "社内", "判断", "稟議", "意思決定", "担当者", "確認される方"];
const timingKeywords = ["時期", "いつ", "導入", "開始", "スケジュール", "タイミング", "何月"];
const nextActionKeywords = ["次回", "日程", "資料", "見積", "送付", "打ち合わせ", "お送りします", "確認します"];
const nextActionCommitmentKeywords = ["次回", "日程", "送付", "提出", "お送りします", "いつ", "何日", "何時", "打ち合わせ"];

function hasPriorCustomerIssue(messages: RoleplayResult["messages"], turnIndex: number) {
  return messages
    .slice(0, turnIndex)
    .some((message) => message.role === "customer" && includesAny(message.content, customerIssueReferenceKeywords));
}

function isQuestionLike(text: string) {
  return /[？?]|伺|聞かせ|教えて|確認|どう|どの|なぜ|いつ|ありますか|でしょうか|ですか/.test(text);
}

function hasMetaTalk(text: string) {
  return /もう一回|できない|難しいわ|やめたい|録音|ロープレ/.test(text);
}

function includesAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractRepeatedWords(
  turns: Array<{ message: RoleplayResult["messages"][number]; index: number }>,
  messages: RoleplayResult["messages"],
): FillerAnalysisItem[] {
  const counts = new Map<string, { count: number; firstTurn: typeof turns[number] }>();

  for (const turn of turns) {
    for (const word of extractCandidateWords(turn.message.content)) {
      const current = counts.get(word);
      if (current) {
        counts.set(word, { ...current, count: current.count + 1 });
      } else {
        counts.set(word, { count: 1, firstTurn: turn });
      }
    }
  }

  return [...counts.entries()]
    .filter(([word, item]) => item.count >= getRepeatedWordThreshold(word))
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0], "ja"))
    .slice(0, 8)
    .map(([word, item]) => ({
      label: word,
      count: item.count,
      evidence: trimEvidence(item.firstTurn.message.content),
      turnLabel: `営業${countSalesTurn(messages, item.firstTurn.index)}回目`,
    }));
}

function extractCandidateWords(text: string) {
  const normalized = text
    .replace(/[。、！？!?「」『』（）()\[\]【】,.\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words: string[] = [];

  for (const pattern of repeatedWordPatterns) {
    const matches = normalized.match(pattern);
    if (matches) words.push(...matches);
  }

  words.push(
    ...normalized
      .split(" ")
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && word.length <= 12 && !ignoredRepeatedWords.has(word)),
  );

  return words.map(normalizeRepeatedWord).filter((word) => word.length >= 2 && !ignoredRepeatedWords.has(word));
}

const repeatedWordPatterns = [
  /えー+/g,
  /あの+/g,
  /そのー+/g,
  /まー+/g,
  /まあ/g,
  /なんか/g,
  /ちょっと/g,
  /えっと/g,
  /ええと/g,
  /あー+/g,
  /はい/g,
  /ですね/g,
  /っていう/g,
  /という/g,
  /そういった/g,
  /こちら/g,
  /効果/g,
  /集客/g,
  /改善/g,
  /分析/g,
] as const;

const ignoredRepeatedWords = new Set(["ます", "です", "ました", "ください", "ありがとうございます"]);

function normalizeRepeatedWord(word: string) {
  return word.replace(/^まー+$/, "まあ").replace(/^えー+$/, "えー").replace(/^あー+$/, "あー");
}

function getRepeatedWordThreshold(word: string) {
  return word.length <= 3 ? 2 : 3;
}

function countSalesTurn(messages: RoleplayResult["messages"], targetIndex: number) {
  return messages.slice(0, targetIndex + 1).filter((message) => message.role === "sales").length;
}

function trimEvidence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 90 ? `${normalized.slice(0, 90)}...` : normalized;
}

function formatFullDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
