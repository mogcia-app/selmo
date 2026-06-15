import { NextRequest, NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  assertSalesDomainAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";

type RoleplayMessage = {
  role: "customer" | "sales";
  content: string;
};

type RoleplayScenarioPayload = {
  title: string;
  roleplayType?: "meeting" | "teleapo";
  customerRole: string;
  customerProfile: string;
  productName?: string;
  scenarioCategory?: string;
  targetSegment?: string;
  goal: string;
  objections: string[];
  evaluationCriteria?: string[];
  customFields?: Array<{ label?: string; value?: string }>;
  difficulty: "easy" | "normal" | "hard";
};

type RespondRequestBody = {
  companyId?: string | null;
  userId?: string | null;
  scenario?: RoleplayScenarioPayload;
  messages?: RoleplayMessage[];
};

export async function POST(request: NextRequest) {
  let apiUser: ApiUserContext | null = null;
  let body: RespondRequestBody | null = null;
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  try {
    apiUser = await requireApiUser(request);
    body = (await request.json()) as RespondRequestBody;
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) return NextResponse.json(authError.body, { status: authError.status });
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (!body?.scenario || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "シナリオと会話ログが必要です。" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message: buildFallbackCustomerReply(body.scenario, body.messages),
      source: "fallback",
    });
  }

  try {
    assertSalesDomainAccess(apiUser, body.scenario.roleplayType === "teleapo" ? "teleapo" : "meeting");
    const usageAvailability = await assertMonthlyAiUsageAvailable({ userId: apiUser.uid });
    if (!usageAvailability.allowed) {
      return NextResponse.json(
        {
          error: MONTHLY_AI_LIMIT_MESSAGE,
          used: usageAvailability.used,
          limit: usageAvailability.limit,
        },
        { status: 429 },
      );
    }

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
        companyId: apiUser.companyId,
        userId: apiUser.uid,
        feature: "roleplay",
        model,
        status: "failed",
        errorMessage: message,
      });
      await saveSystemErrorLog({
        companyId: apiUser.companyId,
        userId: apiUser.uid,
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
      companyId: apiUser.companyId,
      userId: apiUser.uid,
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
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message =
      error instanceof Error ? error.message : "AIロープレ応答の生成に失敗しました。";
    await saveAiUsageLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      feature: "roleplay",
      model,
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
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
      ? "かなり慎重で、曖昧な回答や質問への未回答には鋭く追加質問してください。納得できる根拠、具体例、条件確認が出るまで前向きにならないでください。"
      : scenario.difficulty === "easy"
        ? "やや協力的ですが、質問への未回答や根拠不足は確認してください。"
        : "慎重な顧客として、質問への未回答・曖昧な説明・根拠不足はそのまま流さず、具体的に突っ込んでください。簡単には納得したり前向きになったりしないでください。";

  return [
    "あなたは営業ロープレのAI顧客役です。",
    "あなたは必ず顧客としてだけ話してください。営業担当者の台詞、営業側の提案文、模範解答、解説を生成してはいけません。",
    "返答の主語は顧客側です。「私は営業として」「弊社では提案します」のような営業側の発言は禁止です。",
    "営業担当者の練習になるように、顧客として自然に返答してください。",
    "一度に長く話しすぎず、1〜3文で返してください。",
    "営業への採点や解説はせず、顧客役に徹してください。",
    "営業担当者から挨拶や切り出しが来たら、それに対する顧客の反応だけを返してください。",
    "営業担当者があなたの質問に答えていない場合は、別の話題に進まず「その点への回答がまだ聞けていません」と自然に指摘してください。",
    "商材説明だけが長く、課題・予算・決裁・時期・次回アクションの確認が弱い場合は、前向きな相づちだけで終えず懸念を返してください。",
    "根拠や事例がない効果説明には慎重に反応し、具体例・費用対効果・導入後の流れを確認してください。",
    "相手の説明が曖昧な時は、優しく受け止めすぎず、実際の顧客のように不安や違和感を短く返してください。",
    "営業の発話に「たぶん」「だと思います」「いけると思います」「いい感じ」「大丈夫です」など曖昧な表現がある場合は、根拠や条件を確認してください。",
    "質問に対して一般論や商品説明だけで返された場合は、「私のケースではどうなのか」を確認してください。",
    "営業が話しすぎて顧客確認を挟まない場合は、理解できたふりをせず、判断材料が足りない点を短く返してください。",
    "シナリオの練習ゴール・採点基準・過去分析からの改善テーマに関係する項目が営業発話に出ていない場合は、その弱点が露呈するように質問や懸念を返してください。",
    "営業が課題深掘り、予算、決裁者、導入時期、次回アクションを確認しないまま提案を進めた場合は、顧客として不安を示し、判断材料が足りないと伝えてください。",
    "ただし営業に答えを教えたり、模範トークを提示したりせず、あくまで顧客として反応してください。",
    `シナリオ: ${scenario.title}`,
    `商材: ${scenario.productName ?? ""}`,
    `カテゴリー: ${scenario.scenarioCategory ?? ""}`,
    `ターゲット層: ${scenario.targetSegment ?? ""}`,
    `顧客役職: ${scenario.customerRole}`,
    `顧客プロフィール: ${scenario.customerProfile}`,
    `顧客の目的: ${scenario.goal}`,
    `想定反論: ${scenario.objections.join(" / ")}`,
    `採点基準・改善テーマ: ${(scenario.evaluationCriteria ?? []).join(" / ")}`,
    `追加条件: ${readScenarioCustomFields(scenario.customFields).join(" / ") || "なし"}`,
    `難易度: ${strictness}`,
  ].join("\n");
}

function readScenarioCustomFields(fields: RoleplayScenarioPayload["customFields"]) {
  return (fields ?? [])
    .map((field) => {
      const label = typeof field.label === "string" ? field.label.trim() : "";
      const value = typeof field.value === "string" ? field.value.trim() : "";
      return label && value ? `${label}: ${value}` : "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

function buildFallbackCustomerReply(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[]) {
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const objections = scenario.objections.length > 0 ? scenario.objections : ["費用対効果がまだ見えません。"];

  if (salesTurns <= 1) {
    return `ありがとうございます。ただ、まだ${scenario.goal || "導入する価値"}が本当にあるのか判断できません。具体的にどんな効果が見込めて、根拠はありますか？`;
  }

  if (salesTurns === 2) {
    return `${objections[0]} 先ほどの説明だけだと判断材料が足りません。具体的な根拠や近い事例はありますか？`;
  }

  if (salesTurns === 3) {
    return "なるほど。ただ、社内で検討するには導入までの流れと初期対応の負担がまだ見えません。そこを具体的に教えてください。";
  }

  return "少しイメージはできましたが、まだ決め手には欠けます。他社と比べて一番違う点と、費用対効果を短く教えてください。";
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
