"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  saveRoleplayResult,
  subscribeToRoleplayScenarios,
  type RoleplayMessage,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

const monthlyLimitMessage =
  "月間利用上限に達しました。管理者にプラン変更または上限変更を依頼してください。";

export default function SalesRoleplayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const [scenarios, setScenarios] = useState<RoleplayScenario[]>([]);
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scenarioId = searchParams.get("scenarioId") ?? "";
  const scenario = useMemo(
    () => scenarios.find((item) => item.id === scenarioId) ?? null,
    [scenarioId, scenarios],
  );

  useEffect(() => {
    if (!companyId) return;
    return subscribeToRoleplayScenarios(
      companyId,
      setScenarios,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [companyId]);

  useEffect(() => {
    if (!scenario) return;
    setMessages([
      {
        role: "customer",
        content: `本日はよろしくお願いします。${scenario.customerRole}として、${scenario.goal || "導入判断に必要なこと"}を確認したいです。まず御社の提案概要を教えてください。`,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [scenario]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || !scenario) return;

    const nextMessages: RoleplayMessage[] = [
      ...messages,
      { role: "sales", content, createdAt: new Date().toISOString() },
    ];
    setMessages(nextMessages);
    setInput("");
    setIsThinking(true);
    setError(null);

    try {
      const response = await fetch("/api/roleplay/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: profile?.companyId ?? null,
          userId,
          scenario,
          messages: nextMessages,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(monthlyLimitMessage);
        }

        throw new Error(data.error ?? "AI顧客の応答に失敗しました。");
      }
      setMessages([
        ...nextMessages,
        {
          role: "customer",
          content: data.message ?? "もう少し詳しく教えてください。",
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI顧客の応答に失敗しました。");
    } finally {
      setIsThinking(false);
    }
  };

  const handleFinish = async () => {
    if (!scenario || !userId || !companyId || messages.length < 2) return;

    setIsSaving(true);
    setError(null);
    try {
      const evaluation = evaluateRoleplay(scenario, messages);
      await saveRoleplayResult({
        companyId,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        productName: scenario.productName,
        userId,
        score: evaluation.score,
        summary: evaluation.summary,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        improvementPhrases: evaluation.improvementPhrases,
        messages,
      });
      router.push("/sales/roleplay/results");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "結果の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="practice" />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {scenario ? (
          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article className="flex min-h-[650px] flex-col rounded-[24px] border border-[#e2e6ee] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <div className="border-b border-[#eef1f5] px-5 py-4">
                <p className="text-[12px] font-bold text-[#8a6500]">{scenario.productName || "商品未設定"}</p>
                <h1 className="mt-1 text-[24px] font-black tracking-[-0.03em] text-[#171717]">{scenario.title}</h1>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {messages.map((message, index) => (
                  <MessageBubble key={`${message.createdAt}-${index}`} message={message} />
                ))}
                {isThinking ? (
                  <div className="max-w-[76%] rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 text-[13px] font-semibold text-[#7a808c]">
                    AI顧客が考えています...
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleSend} className="border-t border-[#eef1f5] p-4">
                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="営業として返答を入力"
                    className="min-h-[64px] flex-1 resize-none rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-6 text-[#171717] outline-none focus:border-[#e0bd4b]"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isThinking}
                    className="inline-flex w-[104px] items-center justify-center rounded-[16px] bg-[#171717] text-[14px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    送信
                  </button>
                </div>
              </form>
            </article>

            <aside className="space-y-4">
              <section className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
                <h2 className="text-[18px] font-black text-[#171717]">AI顧客情報</h2>
                <div className="mt-4 space-y-3">
                  <InfoBlock label="役職" value={scenario.customerRole} />
                  <InfoBlock label="プロフィール" value={scenario.customerProfile} />
                  <InfoBlock label="ゴール" value={scenario.goal} />
                  <InfoBlock label="想定反論" value={scenario.objections.join(" / ") || "未設定"} />
                </div>
              </section>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={messages.filter((message) => message.role === "sales").length < 2 || isSaving}
                className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[14px] font-black text-[#171717] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "保存中" : "終了して採点"}
              </button>
              <Link href="/sales/roleplay/scenarios" className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white text-[14px] font-bold text-[#3d4350]">
                シナリオを変更
              </Link>
            </aside>
          </section>
        ) : (
          <section className="mt-4 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-12 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-10 md:py-16">
            <Image src="/mojiokoshi.png" alt="AIロープレ" width={180} height={180} priority className="mx-auto h-[140px] w-[140px] object-contain" />
            <h1 className="mt-5 text-[28px] font-black tracking-[-0.04em] text-[#171717]">シナリオを選択してください</h1>
            <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
              商品別の練習テーマを選択すると、AI顧客とのロープレを開始できます。
            </p>
            <Link href="/sales/roleplay/scenarios" className="mt-7 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]">
              シナリオを選択
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: RoleplayMessage }) {
  const isSales = message.role === "sales";
  return (
    <div className={`flex ${isSales ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[18px] px-4 py-3 text-[14px] leading-7 ${
          isSales ? "bg-[#171717] text-white" : "border border-[#e6eaf0] bg-[#fcfcfd] text-[#343b48]"
        }`}
      >
        <div className={`mb-1 text-[11px] font-bold ${isSales ? "text-white/70" : "text-[#8a909b]"}`}>
          {isSales ? "営業" : "AI顧客"}
        </div>
        {message.content}
      </div>
    </div>
  );
}

function evaluateRoleplay(scenario: RoleplayScenario, messages: RoleplayMessage[]) {
  const salesText = messages.filter((message) => message.role === "sales").map((message) => message.content).join(" ");
  const criteriaHits = scenario.evaluationCriteria.filter((criterion) => salesText.includes(criterion.slice(0, 4))).length;
  const questionCount = (salesText.match(/？|\?/g) ?? []).length;
  const score = Math.min(95, Math.max(55, 62 + criteriaHits * 8 + questionCount * 4 + messages.length * 2));

  return {
    score,
    summary: "ロープレを完了しました。顧客の懸念に対して説明を進められています。",
    strengths: [
      questionCount > 0 ? "顧客に確認質問を投げられています。" : "提案内容を最後まで伝えられています。",
      "会話を継続し、顧客の反応に合わせて回答できています。",
    ],
    improvements: [
      "導入後の具体的な成果や事例をもう少し入れると説得力が上がります。",
      "次回は顧客の予算感や決裁プロセスも確認してみましょう。",
    ],
    improvementPhrases: buildImprovementPhrases(scenario, salesText),
  };
}

function buildImprovementPhrases(scenario: RoleplayScenario, salesText: string) {
  const phrases = [
    `「${scenario.productName || "このご提案"}で、今いちばん解決したい課題はどこですか？」`,
    "「費用だけでなく、止まった時の損失や対応時間も含めて一緒に比較させてください。」",
    "「次回までに、判断に必要な条件を3つに絞って整理してお持ちします。」",
  ];

  if (!salesText.includes("予算") && !salesText.includes("費用") && !salesText.includes("金額")) {
    phrases.unshift("「ご予算感として、月額でどの範囲なら検討しやすいでしょうか？」");
  }

  return phrases.slice(0, 3);
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

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] leading-6 text-[#343b48]">{value || "未設定"}</div>
    </div>
  );
}
