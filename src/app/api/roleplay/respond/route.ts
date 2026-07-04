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

type TeleapoCustomerType = "即決型" | "慎重型" | "懐疑型" | "多忙型";

type TeleapoConcernState = {
  label: string;
  count: number;
};

type TeleapoConversationState = {
  customerType: TeleapoCustomerType;
  salesTurns: number;
  latestSales: string;
  answeredPhoneOnlyLimit: boolean;
  positiveSignalCount: number;
  repeatedConcerns: TeleapoConcernState[];
  maxConcernDepth: number;
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
      message: buildFallbackCustomerReply(body.scenario, body.messages, body.sessionId ?? null),
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
        messages: buildOpenAiMessages(body.scenario, body.messages, contextPrompt, sessionId),
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
        message: buildFallbackCustomerReply(body.scenario, body.messages, sessionId),
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
      message: message || buildFallbackCustomerReply(body.scenario, body.messages, sessionId),
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
      message: buildFallbackCustomerReply(body.scenario, body.messages, body?.sessionId ?? null),
      source: "fallback",
    });
  }
}

function buildOpenAiMessages(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[], contextPrompt: string, sessionId: string | null) {
  const recentMessages = messages.slice(-8);
  const earlierMessages = messages.slice(0, -8);

  return [
    {
      role: "system",
      content: buildSystemPrompt(scenario, messages, sessionId),
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
      ? "テレアポでは、商材ナレッジに合う短い興味喚起・よくある反論・FAQを踏まえつつ、現実の顧客として資料送付・後日連絡・打ち合わせ・見送りに自然に分岐してください。論破や同じ質問の反復は禁止です。"
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

function buildSystemPrompt(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[], sessionId: string | null) {
  const isTeleapo = scenario.roleplayType === "teleapo";
  const teleapoState = isTeleapo ? buildTeleapoConversationState(scenario, messages, sessionId) : null;
  const strictness = isTeleapo
    ? scenario.difficulty === "hard"
      ? "慎重ですが論破目的ではありません。曖昧な点は最大2回まで確認し、判断材料が揃ったら打ち合わせ・資料送付・後日連絡・見送りのいずれかへ進んでください。"
      : scenario.difficulty === "easy"
        ? "やや協力的です。用件とメリットが分かれば早めに資料送付や打ち合わせへ進んでください。"
        : "慎重な顧客として、曖昧な点は短く確認してください。ただし同じ質問を繰り返さず、合理的な回答後は次の判断へ進んでください。"
    : scenario.difficulty === "hard"
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
          "シナリオの顧客役職やプロフィールに担当者・責任者・キーマン・決裁者と書かれている場合、受付役ではなくキーマン本人として応答してください。",
          "キーマン本人として応答する場合、『営業のお電話ですか？』『担当者に確認します』『担当ではありません』『取り次ぎます』など受付・代表電話の発話は禁止です。",
          "キーマン接触後の練習では、相手は基本的に話を聞く姿勢があります。すぐ切ろうとせず、短く相づちを打ち、現状課題・効果・費用対効果・導入負荷・日程の判断材料を質問してください。",
          "キーマン役の場合、最初の返答は『はい、どういった件ですか？』『概要だけ聞きます』『それはうちの何に関係する話ですか？』のように、本人として会話を受けてください。",
          "最初の営業発話が長い、用件が曖昧、相手メリットがない、話す許可がない場合でも、キーマン役なら受付のように切らず『要点だけ教えてください』『うちに関係ある部分から聞かせてください』と返してください。",
          "受付役の場合、担当者名・部署・用件が明確でないと取り次がないでください。",
          "担当者役の場合、興味喚起が弱ければ『現状でも回っています』『費用対効果が見えないです』『導入の手間はどのくらいですか』のように、本人の判断材料を求めてください。",
          "営業が断りに対して粘りすぎた場合は、さらに強く断ってください。自然な1回の切り返しには、少しだけ会話を続けてください。",
          "難しい相手でも完全な無関心だけで終わらせず、営業がうまく許可取り・課題仮説・短い確認を出した場合は、資料送付、後日連絡、打ち合わせ、見送りのいずれかへ会話を進めてください。",
          "営業が業界課題を短く示し、自社に関係する理由や日程候補を出した場合は、キーマン本人として前向きに反応してください。",
          "テレアポでは売り込みの詳細説明より、話す許可、担当者接続、短い課題仮説、アポ打診を重視してください。",
          "電話営業の目的は、この場で契約を取ることではありません。打ち合わせ、資料送付、後日連絡、見送りのいずれかに自然に進めてください。",
          "同じ反論や同じ質問を3回以上繰り返してはいけません。1つの懸念を深掘りするのは最大2回までです。",
          "営業が合理的に回答したら、同じ質問を蒸し返さず、次の懸念、資料請求、打ち合わせ承諾、後日連絡、見送りのいずれかへ進んでください。",
          "営業が『御社の状況によって変わる』『打ち合わせで試算する』『予約状況を伺った上でシミュレーションする』『適当な数字は伝えられない』のように答えた場合、それ以上電話口で具体数値をしつこく要求してはいけません。",
          "その場合は『では一度話を聞いてみます』『資料だけ先に送ってください』『上司に確認したいです』『今回は見送ります』のいずれかに近い自然な返答へ進めてください。",
          "AI顧客は営業担当を論破しないでください。興味があるなら前向きに進め、興味がないなら明確に断り、迷っているなら資料請求や後日連絡に進めてください。",
        ]
      : []),
    "営業への採点や解説はせず、顧客役に徹してください。",
    "営業担当者から挨拶や切り出しが来たら、それに対する顧客の反応だけを返してください。",
    "営業担当者があなたの質問に答えていない場合は、別の話題に進まず「その点への回答がまだ聞けていません」と自然に指摘してください。",
    isTeleapo
      ? "商品説明だけが長く、キーマン本人への関係性・判断材料・アポ打診がない場合は、電話を切るのではなく『判断材料が足りない』『うちの場合の効果は何ですか』と返してください。"
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
    ...(teleapoState ? [buildTeleapoConversationControlPrompt(teleapoState)] : []),
  ].join("\n");
}

function buildTeleapoConversationState(
  scenario: RoleplayScenarioPayload,
  messages: RoleplayMessage[],
  sessionId: string | null,
): TeleapoConversationState {
  const salesMessages = messages.filter((message) => message.role === "sales");
  const customerMessages = messages.filter((message) => message.role === "customer");
  const salesText = salesMessages.map((message) => message.content).join(" ");
  const latestSales = [...salesMessages].reverse()[0]?.content ?? "";
  const concernStates = teleapoConcernDefinitions
    .map((definition) => ({
      label: definition.label,
      count: customerMessages.filter((message) => includesAny(message.content, definition.keywords)).length,
    }))
    .filter((state) => state.count > 0)
    .sort((left, right) => right.count - left.count);

  return {
    customerType: selectTeleapoCustomerType(`${sessionId ?? ""}:${scenario.id ?? ""}:${scenario.title}`),
    salesTurns: salesMessages.length,
    latestSales,
    answeredPhoneOnlyLimit: hasPhoneOnlyLimitAnswer(latestSales),
    positiveSignalCount: countTeleapoPositiveSignals(salesText),
    repeatedConcerns: concernStates.filter((state) => state.count >= 2),
    maxConcernDepth: concernStates[0]?.count ?? 0,
  };
}

function buildTeleapoConversationControlPrompt(state: TeleapoConversationState) {
  const typeInstruction = teleapoCustomerTypeInstructions[state.customerType];
  const repeatedConcern = state.repeatedConcerns[0];
  const shouldMoveToOutcome =
    state.salesTurns >= 5 ||
    state.answeredPhoneOnlyLimit ||
    state.positiveSignalCount >= 2 ||
    state.maxConcernDepth >= 2;

  return [
    "【テレアポ会話制御】",
    `顧客タイプ: ${state.customerType}`,
    `タイプ別の粘り方: ${typeInstruction}`,
    `営業発話回数: ${state.salesTurns}回`,
    `打ち合わせ前提の誠実回答あり: ${state.answeredPhoneOnlyLimit ? "あり" : "なし"}`,
    `前向き判断シグナル数: ${state.positiveSignalCount}`,
    repeatedConcern ? `同じ懸念の深掘り状況: ${repeatedConcern.label}が${repeatedConcern.count}回。これ以上同じ懸念を質問しないでください。` : "同じ懸念の深掘り状況: 上限未満",
    shouldMoveToOutcome
      ? "次の返答では新しい詰問を増やさず、打ち合わせ日程調整・資料送付・後日連絡・見送り・来月以降の検討のいずれかに進めてください。"
      : "次の返答では、必要なら別の懸念を1つだけ短く確認してください。同じ懸念の繰り返しは禁止です。",
    state.answeredPhoneOnlyLimit
      ? "営業が電話口で無理に数字を出さず、個別試算や打ち合わせで判断材料を出すと説明しています。具体数値の再要求はせず、話を聞く・資料請求・上司確認・見送りのいずれかに進んでください。"
      : "",
    state.positiveSignalCount >= 2
      ? "営業は、課題理解、押し売り感のなさ、誠実回答、個別試算、正直な実績説明、打ち合わせで判断材料を出す説明のうち2つ以上を満たしています。顧客タイプに応じて前向きに進めてください。"
      : "",
    "終話パターン候補: 『では一度30分ほど話を聞いてみます』『資料を送ってください』『上司に確認してからにします』『今回は見送ります』『来月以降なら検討できます』",
  ].filter(Boolean).join("\n");
}

const teleapoCustomerTypeInstructions: Record<TeleapoCustomerType, string> = {
  即決型: "興味があれば早めにアポを承諾します。反論は少なめで、合理的な説明があれば会話を前に進めます。",
  慎重型: "2〜3個だけ質問してから判断します。誠実な回答があれば、打ち合わせか資料請求に進みます。",
  懐疑型: "実績・料金・効果を確認します。ただし合理的な回答後は同じ質問を繰り返さず、次の判断に進みます。",
  多忙型: "長い説明を嫌います。短時間面談、資料送付、後日連絡、見送りに早めに進みます。",
};

const teleapoConcernDefinitions = [
  { label: "料金・費用対効果", keywords: ["料金", "費用", "価格", "費用対効果", "コスト", "いくら"] },
  { label: "効果・実績", keywords: ["効果", "成果", "実績", "数字", "どれくらい", "改善"] },
  { label: "導入負荷", keywords: ["導入", "手間", "負担", "運用", "工数"] },
  { label: "現状維持", keywords: ["困って", "間に合", "必要", "現状", "今のまま"] },
  { label: "資料確認", keywords: ["資料", "メール", "送って"] },
  { label: "社内確認", keywords: ["上司", "社内", "確認", "稟議", "決裁"] },
];

function selectTeleapoCustomerType(seed: string): TeleapoCustomerType {
  const types: TeleapoCustomerType[] = ["即決型", "慎重型", "懐疑型", "多忙型"];
  let hash = 0;
  for (const char of seed || "teleapo") {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return types[hash % types.length];
}

function hasPhoneOnlyLimitAnswer(text: string) {
  return /状況.*変わ|変わ.*状況|打ち合わせ.*試算|試算.*打ち合わせ|予約状況|シミュレーション|適当な数字|個別.*試算|詳しく.*伺|ヒアリング|確認した上|お聞きした上/.test(text);
}

function countTeleapoPositiveSignals(text: string) {
  const signals = [
    /課題|お困り|現状|予約|集客|売上|運用|工数/,
    /押し売り|売り込みではなく|必要なければ|合わなければ|無理に/,
    /状況.*変わ|適当な数字|正確|個別|試算|シミュレーション/,
    /実績|事例|盛ら|正直|過度|誇張/,
    /判断材料|比較材料|打ち合わせ|面談|15分|30分|日程|候補/,
    /資料|送付|メール|上司|社内確認/,
  ];
  return signals.filter((pattern) => pattern.test(text)).length;
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

function buildFallbackCustomerReply(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[], sessionId: string | null = null) {
  if (scenario.roleplayType === "teleapo") {
    return buildTeleapoFallbackCustomerReply(scenario, messages, sessionId);
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

function buildTeleapoFallbackCustomerReply(scenario: RoleplayScenarioPayload, messages: RoleplayMessage[], sessionId: string | null) {
  const salesTurns = messages.filter((message) => message.role === "sales").length;
  const latestSales = [...messages].reverse().find((message) => message.role === "sales")?.content ?? "";
  const objections = scenario.objections.length > 0 ? scenario.objections : ["今忙しいです。"];
  const state = buildTeleapoConversationState(scenario, messages, sessionId);
  const isKeyPersonScenario = includesAny(
    `${scenario.customerRole} ${scenario.customerProfile} ${scenario.goal} ${scenario.title}`,
    ["担当者", "責任者", "キーマン", "決裁者", "部長", "代表", "オーナー", "院長", "店長"],
  );

  if (salesTurns <= 1) {
    if (isKeyPersonScenario) {
      return "はい、どういった件ですか？うちに関係ある話なら概要だけ聞きます。";
    }
    return "すみません、営業のお電話ですか？今ちょっと立て込んでいて、要件だけ30秒で聞いてもいいですか。";
  }

  if (state.answeredPhoneOnlyLimit || state.positiveSignalCount >= 2 || state.maxConcernDepth >= 2 || salesTurns >= 5) {
    return buildTeleapoOutcomeReply(state.customerType, latestSales);
  }

  if (isKeyPersonScenario && /効果|改善|削減|課題|事例|実績|費用|導入|確認/.test(latestSales)) {
    return "なるほど。うちの場合だと、具体的にどの業務や数字に効く話ですか？";
  }

  if (isKeyPersonScenario && /日程|候補|打ち合わせ|お時間|アポ|15分|30分/.test(latestSales)) {
    return "内容は少し分かりました。確認する価値があるなら15分くらいは取れますが、何を判断する時間になりますか？";
  }

  if (/資料|メール|送/.test(latestSales)) {
    return "資料だけなら送ってください。ただ、正直そのままだと見ないかもしれないので、見るポイントだけ先に教えてもらえますか。";
  }

  if (/日程|候補|打ち合わせ|お時間|アポ|15分|30分/.test(latestSales)) {
    return "内容は少し分かりました。長い打ち合わせは難しいですが、15分くらいなら確認してもいいです。何を確認する時間ですか？";
  }

  if (isKeyPersonScenario) {
    return "話は聞きますが、まだ判断材料が少ないです。うちにとってのメリットをもう少し具体的に教えてください。";
  }

  if (salesTurns === 2) {
    return `${objections[0]} ただ、何の件かまだ少し曖昧なので、うちに関係ある話かだけ先に教えてください。`;
  }

  return "必要性がまだ分からないです。今すぐ聞く理由があるなら、一言だけ聞きます。";
}

function buildTeleapoOutcomeReply(customerType: TeleapoCustomerType, latestSales: string) {
  if (/日程|候補|打ち合わせ|面談|15分|30分/.test(latestSales)) {
    return customerType === "多忙型"
      ? "長い時間は難しいですが、15分くらいなら聞いてみます。候補日を送ってもらえますか？"
      : "では一度30分ほど話を聞いてみます。いくつか候補日をいただけますか？";
  }

  if (/資料|メール|送付/.test(latestSales)) {
    return "では資料を送ってください。見た上で必要そうなら改めて話を聞きます。";
  }

  if (/上司|社内|確認|稟議|決裁/.test(latestSales)) {
    return "一度上司に確認してからにします。判断材料になる資料を先に送ってください。";
  }

  if (customerType === "即決型") {
    return "話は分かりました。では一度30分ほど詳しく聞いてみます。日程候補をください。";
  }

  if (customerType === "多忙型") {
    return "今すぐ長くは難しいので、まず資料を送ってください。必要なら短時間で話を聞きます。";
  }

  if (customerType === "懐疑型") {
    return "電話だけだと判断しきれないので、資料と試算の前提を送ってください。必要なら後日話を聞きます。";
  }

  return "では一度話を聞いてみます。30分ほどで判断材料を整理してもらえますか？";
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
