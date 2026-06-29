import { NextRequest, NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import {
  RoleplayLimitError,
  normalizeRoleplaySessionId,
  reserveRoleplayAiResponse,
} from "@/lib/server/roleplay-cost-control";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import { buildAnalysisContextPrompt, loadAnalysisContext } from "@/lib/server/analysis-context";
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
  id?: string;
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
  sessionId?: string | null;
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
    const roleplayType = body.scenario.roleplayType === "teleapo" ? "teleapo" : "meeting";
    assertSalesDomainAccess(apiUser, roleplayType);
    const sessionId = normalizeRoleplaySessionId(body.sessionId);
    if (!sessionId) {
      return NextResponse.json({ error: "ロープレセッション情報が必要です。" }, { status: 400 });
    }

    const usageAvailability = await assertMonthlyAiUsageAvailable({
      userId: apiUser.uid,
      feature: "roleplay",
      currentRoleplaySessionId: sessionId,
    });
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

    await reserveRoleplayAiResponse({
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      sessionId,
      scenarioId: body.scenario.id ?? null,
      roleplayType: body.scenario.roleplayType ?? null,
    });

    const analysisContext = await loadAnalysisContext({
      companyId: apiUser.companyId,
      productName: body.scenario.productName,
      manualCategory: body.scenario.scenarioCategory,
      targetSegment: body.scenario.targetSegment,
      manualDomain: roleplayType,
    });
    const contextPrompt = buildAnalysisContextPrompt(analysisContext);

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        messages: buildOpenAiMessages(body.scenario, body.messages, contextPrompt),
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
    if (error instanceof RoleplayLimitError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

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

function buildOpenAiMessages(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[], contextPrompt: string) {
  const recentMessages = messages.slice(-8);
  const earlierMessages = messages.slice(0, -8);

  return [
    {
      role: "system",
      content: buildSystemPrompt(scenario),
    },
    ...(contextPrompt
      ? [
          {
            role: "system",
            content: buildCustomerContextPrompt(scenario, contextPrompt),
          },
        ]
      : []),
    ...(earlierMessages.length > 0
      ? [
          {
            role: "system",
            content: `これまでの会話要約: ${summarizeEarlierMessages(earlierMessages)}`,
          },
        ]
      : []),
    ...recentMessages.map((message) => ({
      role: message.role === "sales" ? "user" : "assistant",
      content: truncateMessageContent(message.content, 900),
    })),
  ];
}

function buildCustomerContextPrompt(scenario: RoleplayScenarioPayload, contextPrompt: string) {
  const isTeleapo = scenario.roleplayType === "teleapo";
  return [
    "以下はAI顧客役が裏側で知っている商材ナレッジ・該当マニュアル・過去分析です。",
    "営業担当者にはこの文脈をそのまま開示せず、顧客として自然な反応に変換してください。",
    "商材情報やFAQは、顧客が質問したり営業説明を受けた時の判断材料として使ってください。",
    "営業成功基準やマニュアルは、営業ができているかを顧客の反応で試すために使ってください。模範解答や採点コメントとして返してはいけません。",
    isTeleapo
      ? "テレアポでは、商材ナレッジに合う短い興味喚起・よくある反論・FAQを踏まえつつ、許可取りや次接点打診が弱ければ電話口らしく警戒してください。"
      : "商談では、商材ナレッジに合う課題・価値・料金・FAQを踏まえつつ、確認不足や説明不足があれば顧客として懸念を返してください。",
    `【参照文脈】\n${contextPrompt}`,
  ].join("\n");
}

function summarizeEarlierMessages(messages: RoleplayMessage[]) {
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const customerTurns = messages.filter((message) => message.role === "customer").length;
  const latestCustomerConcern = [...messages].reverse().find((message) => message.role === "customer")?.content ?? "";
  const latestSalesPoint = [...messages].reverse().find((message) => message.role === "sales")?.content ?? "";

  return [
    `営業発話${salesTurns}回、顧客発話${customerTurns}回。`,
    latestCustomerConcern ? `直近の顧客懸念: ${truncateMessageContent(latestCustomerConcern, 220)}` : "",
    latestSalesPoint ? `直近の営業説明: ${truncateMessageContent(latestSalesPoint, 220)}` : "",
  ].filter(Boolean).join(" ");
}

function truncateMessageContent(value: string, maxLength: number) {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function buildSystemPrompt(scenario: RoleplayScenarioPayload) {
  const isTeleapo = scenario.roleplayType === "teleapo";
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
    "人間味のある顧客として、短い相づち、迷い、面倒くささ、社内事情、少しの本音を混ぜてください。",
    "毎回きれいな反論文にせず、『うーん』『正直』『今の話だと』『そこは少し気になります』のような自然な温度感を使ってください。",
    "ただし感情表現を大げさにしすぎず、実際の商談・電話でありそうな口調にしてください。",
    "一度に長く話しすぎず、1〜3文で返してください。",
    ...(isTeleapo
      ? [
          "今回はテレアポ/テレマの顧客役です。通常商談ではなく、電話口の短いやり取りとして振る舞ってください。",
          "返答は原則1文、長くても2文にしてください。電話中なので、冗長な説明や長い背景説明はしないでください。",
          "最初の営業発話が長い、用件が曖昧、相手メリットがない、話す許可がない場合は『すみません、今忙しいので』『営業のお電話ですか？』のように切ろうとしてください。",
          "受付役の場合、担当者名・部署・用件が明確でないと取り次がないでください。",
          "担当者役の場合、興味喚起が弱いと『資料送ってください』『今は間に合っています』『結構です』で終わらせようとしてください。",
          "営業が断りに対して粘りすぎた場合は、さらに強く断ってください。自然な1回の切り返しには、少しだけ会話を続けてください。",
          "難しい相手でも完全な無関心だけで終わらせず、営業がうまく許可取り・課題仮説・短い確認を出した場合は、少しだけ本音や条件を漏らしてください。",
          "営業が30秒だけよいか等の許可を取り、業界課題を短く刺し、日程候補を出した場合のみ、前向きに反応してください。",
          "テレアポでは売り込みの詳細説明より、話す許可、担当者接続、短い課題仮説、アポ打診を重視してください。",
        ]
      : []),
    "営業への採点や解説はせず、顧客役に徹してください。",
    "営業担当者から挨拶や切り出しが来たら、それに対する顧客の反応だけを返してください。",
    "営業担当者があなたの質問に答えていない場合は、別の話題に進まず「その点への回答がまだ聞けていません」と自然に指摘してください。",
    isTeleapo
      ? "商品説明だけが長く、話す許可・担当者確認・アポ打診がない場合は、電話を終えようとしてください。"
      : "商材説明だけが長く、課題・予算・決裁・時期・次回アクションの確認が弱い場合は、前向きな相づちだけで終えず懸念を返してください。",
    "根拠や事例がない効果説明には慎重に反応し、具体例・費用対効果・導入後の流れを確認してください。",
    "相手の説明が曖昧な時は、優しく受け止めすぎず、実際の顧客のように不安や違和感を短く返してください。ただし会話が完全に途切れないよう、1つだけ答えやすい確認余地を残してください。",
    "営業の発話に「たぶん」「だと思います」「いけると思います」「いい感じ」「大丈夫です」など曖昧な表現がある場合は、根拠や条件を確認してください。",
    "質問に対して一般論や商品説明だけで返された場合は、「私のケースではどうなのか」を確認してください。",
    "営業が話しすぎて顧客確認を挟まない場合は、理解できたふりをせず、判断材料が足りない点を短く返してください。",
    "シナリオの練習ゴール・採点基準・過去分析からの改善テーマに関係する項目が営業発話に出ていない場合は、その弱点が露呈するように質問や懸念を返してください。",
    isTeleapo
      ? "営業がアポ打診や次接点を出さず説明だけで終わる場合は、『で、どうすればいいですか？』『資料だけで大丈夫です』など、次に進まない反応をしてください。"
      : "営業が課題深掘り、予算、決裁者、導入時期、次回アクションを確認しないまま提案を進めた場合は、顧客として不安を示し、判断材料が足りないと伝えてください。",
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
  if (scenario.roleplayType === "teleapo") {
    return buildTeleapoFallbackCustomerReply(scenario, messages);
  }
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const objections = scenario.objections.length > 0 ? scenario.objections : ["費用対効果がまだ見えません。"];

  if (salesTurns <= 1) {
    return `うーん、話は分かるんですが、まだ${scenario.goal || "導入する価値"}が本当にあるのかピンと来ていません。近い会社でどんな効果が出たのか、短く聞けますか？`;
  }

  if (salesTurns === 2) {
    return `正直、${objections[0]} 先ほどの説明だけだと社内に持ち帰る材料が弱いです。近い事例か数字で言えるものはありますか？`;
  }

  if (salesTurns === 3) {
    return "なるほど、少しイメージは湧きました。ただ、導入時にこちらの手間が増えるなら厳しいです。最初に必要な対応はどのくらいですか？";
  }

  return "少し分かってきました。ただ、決め手まではまだ弱いです。他社と比べて一番違う点を一言で言うと何ですか？";
}

function buildTeleapoFallbackCustomerReply(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[]) {
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const latestSales = [...messages].reverse().find((message) => message.role === "sales")?.content ?? "";
  const objections = scenario.objections.length > 0 ? scenario.objections : ["今忙しいです。"];

  if (salesTurns <= 1) {
    return "すみません、営業のお電話ですか？今ちょっと立て込んでいて、要件だけ30秒で聞いてもいいですか。";
  }

  if (/資料|メール|送/.test(latestSales)) {
    return "資料だけなら送ってください。ただ、正直そのままだと見ないかもしれないので、見るポイントだけ先に教えてもらえますか。";
  }

  if (/日程|候補|打ち合わせ|お時間|アポ|15分|30分/.test(latestSales)) {
    return "内容は少し分かりました。長い打ち合わせは難しいですが、15分くらいなら確認してもいいです。何を確認する時間ですか？";
  }

  if (salesTurns === 2) {
    return `${objections[0]} ただ、何の件かまだ少し曖昧なので、うちに関係ある話かだけ先に教えてください。`;
  }

  return "必要性がまだ分からないです。今すぐ聞く理由があるなら、一言だけ聞きます。";
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
