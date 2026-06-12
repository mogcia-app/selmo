import { NextRequest, NextResponse } from "next/server";

import {
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";

type RoleplayMessage = {
  role: "customer" | "sales";
  content: string;
};

type RoleplayScenarioPayload = {
  title: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  difficulty: "easy" | "normal" | "hard";
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    companyId?: string | null;
    userId?: string | null;
    scenario?: RoleplayScenarioPayload;
    messages?: RoleplayMessage[];
  };
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  if (!body.scenario || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "シナリオと会話ログが必要です。" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message: buildFallbackCustomerReply(body.scenario, body.messages),
      source: "fallback",
    });
  }

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(body.scenario),
          },
          ...body.messages.map((message) => ({
            role: message.role === "sales" ? "user" : "assistant",
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      const message = `OpenAI がエラーを返しました。${response.statusText}`;
      await saveAiUsageLog({
        companyId: body.companyId,
        userId: body.userId,
        feature: "roleplay",
        model,
        status: "failed",
        errorMessage: message,
      });
      await saveSystemErrorLog({
        companyId: body.companyId,
        userId: body.userId,
        kind: "OpenAI",
        message,
        severity: "warning",
        source: "api/roleplay/respond",
      });
      return NextResponse.json({
        message: buildFallbackCustomerReply(body.scenario, body.messages),
        source: "fallback",
      });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };
    const message = data.choices?.[0]?.message?.content?.trim();
    await saveAiUsageLog({
      companyId: body.companyId,
      userId: body.userId,
      feature: "roleplay",
      model,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      estimatedCostUsd: estimateChatCostUsd({
        model,
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
      }),
      status: "success",
    });

    return NextResponse.json({
      message: message || buildFallbackCustomerReply(body.scenario, body.messages),
      source: message ? "openai" : "fallback",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AIロープレ応答の生成に失敗しました。";
    await saveAiUsageLog({
      companyId: body.companyId,
      userId: body.userId,
      feature: "roleplay",
      model,
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId: body.companyId,
      userId: body.userId,
      kind: "OpenAI",
      message,
      severity: "warning",
      source: "api/roleplay/respond",
    });
    return NextResponse.json({
      message: buildFallbackCustomerReply(body.scenario, body.messages),
      source: "fallback",
    });
  }
}

function buildSystemPrompt(scenario: RoleplayScenarioPayload) {
  const strictness =
    scenario.difficulty === "hard"
      ? "かなり慎重で、曖昧な回答には厳しく追加質問してください。"
      : scenario.difficulty === "easy"
        ? "協力的ですが、最低限の確認質問はしてください。"
        : "現実的な温度感で、納得できない点は質問してください。";

  return [
    "あなたは営業ロープレのAI顧客役です。",
    "あなたは必ず顧客としてだけ話してください。営業担当者の台詞、営業側の提案文、模範解答、解説を生成してはいけません。",
    "返答の主語は顧客側です。「私は営業として」「弊社では提案します」のような営業側の発言は禁止です。",
    "営業担当者の練習になるように、顧客として自然に返答してください。",
    "一度に長く話しすぎず、1〜3文で返してください。",
    "営業への採点や解説はせず、顧客役に徹してください。",
    "営業担当者から挨拶や切り出しが来たら、それに対する顧客の反応だけを返してください。",
    `シナリオ: ${scenario.title}`,
    `顧客役職: ${scenario.customerRole}`,
    `顧客プロフィール: ${scenario.customerProfile}`,
    `顧客の目的: ${scenario.goal}`,
    `想定反論: ${scenario.objections.join(" / ")}`,
    `難易度: ${strictness}`,
  ].join("\n");
}

function buildFallbackCustomerReply(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[]) {
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const objections = scenario.objections.length > 0 ? scenario.objections : ["費用対効果がまだ見えません。"];

  if (salesTurns <= 1) {
    return `ありがとうございます。まず、${scenario.goal || "導入する価値"}が本当にあるのかを確認したいです。具体的にはどんな効果が見込めますか？`;
  }

  if (salesTurns === 2) {
    return `${objections[0]} その点について、もう少し具体的な根拠や事例はありますか？`;
  }

  if (salesTurns === 3) {
    return "なるほど。社内で検討する場合、導入までの流れと初期対応にどれくらい負担があるかも気になります。";
  }

  return "だいぶイメージできました。最後に、他社と比べて一番違う点を短く教えてください。";
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
