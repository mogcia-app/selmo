import { NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import type { AnalysisContext } from "@/lib/server/analysis-context";
import { buildAnalysisContextPrompt, loadAnalysisContext } from "@/lib/server/analysis-context";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 10 * 60 * 1000;

type RequestBody = {
  companyId?: string | null;
  userId?: string | null;
  productName?: string | null;
  meetingPurpose?: string | null;
  customerType?: "new" | "existing" | string | null;
  salesDomain?: "meeting" | "teleapo" | string | null;
  transcriptText?: string;
  conversationLogs?: ConversationLogInput[];
  countUsage?: boolean;
};

type ConversationSpeaker = "sales" | "customer" | "participant" | "unknown";

type ConversationLogInput = {
  speaker?: ConversationSpeaker | "speaker_1" | "speaker_2" | string | null;
  label?: string | null;
  text?: string | null;
};

type ConversationAnalysisInput = {
  transcriptText: string;
  structuredTranscript: string;
  speakerSummary: string;
  salesOnlyText: string;
  customerOnlyText: string;
  responsePairsText: string;
  hasStructuredLogs: boolean;
};

type SummaryResponse = {
  overview: string;
  bullets: string[];
  diagnosis?: {
    status?: {
      label?: string;
      stage?: string;
      description?: string;
      tone?: string;
      evidence?: string[];
    };
    temperature?: {
      level?: string;
      stars?: number;
      label?: string;
      description?: string;
      evidence?: string[];
    };
    consideration?: {
      score?: number;
      label?: string;
      description?: string;
      evidence?: string[];
    };
    salesEvaluation?: Array<{
      label?: string;
      score?: number;
      description?: string;
      evidence?: string[];
    }>;
  };
  manualCompliance?: {
    mode: "manual" | "generic";
    score: number | null;
    matchedCriteria: string[];
    missingCriteria: string[];
    productNotes: string[];
    improvementPhrases: string[];
    checklistItems?: Array<{
      category?: string;
      label?: string;
      status?: "done" | "missing";
      reason?: string;
      scoreImpact?: number | null;
    }>;
  };
};

type ManualChecklistEntry = {
  category: string;
  label: string;
  display: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> },
) {
  let body: RequestBody | null = null;
  const model = "gpt-4o-mini";

  try {
    await context.params;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 },
      );
    }

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
    }

    const conversationInput = buildConversationAnalysisInput(body.transcriptText, body.conversationLogs);
    if (!conversationInput.transcriptText.trim()) {
      return NextResponse.json(
        { error: "要約対象の文字起こし本文がありません。" },
        { status: 400 },
      );
    }

    const shouldCountUsage = body.countUsage !== false;
    if (shouldCountUsage) {
      const usageAvailability = await assertMonthlyAiUsageAvailable({ userId: body.userId });
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
    }

    const analysisContext = await loadAnalysisContext({
      companyId: body.companyId,
      productName: body.productName,
      manualCategory: resolveManualCategory(body.customerType, body.meetingPurpose),
      manualDomain: body.salesDomain === "teleapo" ? "teleapo" : "meeting",
    });
    const result = await summarizeTranscript(conversationInput, analysisContext, {
      meetingPurpose: body.meetingPurpose,
      customerType: body.customerType,
      salesDomain: body.salesDomain,
    });
    await saveAiUsageLog({
      companyId: body.companyId,
      userId: body.userId,
      feature: shouldCountUsage ? "summary" : "analysis",
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostUsd: estimateChatCostUsd({
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      }),
      status: "success",
    });

    return NextResponse.json({
      model,
      summary: result.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI要約の生成に失敗しました。";
    await saveAiUsageLog({
      companyId: body?.companyId,
      userId: body?.userId,
      feature: body?.countUsage === false ? "analysis" : "summary",
      model,
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId: body?.companyId,
      userId: body?.userId,
      kind: "OpenAI",
      message,
      severity: "warning",
      source: "api/meetings/summary",
    });

    return NextResponse.json(
      {
        error: "AI要約の生成に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
}

async function summarizeTranscript(
  conversationInput: ConversationAnalysisInput,
  analysisContext: Awaited<ReturnType<typeof loadAnalysisContext>>,
  input: {
    meetingPurpose?: string | null;
    customerType?: string | null;
    salesDomain?: string | null;
  },
) {
  const model = "gpt-4o-mini";
  const contextPrompt = buildAnalysisContextPrompt(analysisContext);
  const meetingPurposeLabel = getMeetingPurposeLabel(input.meetingPurpose);
  const customerTypeLabel = input.customerType === "existing" ? "既存" : input.customerType === "new" ? "新規" : "未設定";
  const isTeleapo = input.salesDomain === "teleapo";
  const domainLabel = isTeleapo ? "テレアポ" : "商談";
  const statusLabel = isTeleapo ? "テレアポステータス" : "商談ステータス";
  const evaluationLabel = isTeleapo ? "テレアポ評価サマリー" : "商談評価サマリー";
  const finalActionLabel = isTeleapo ? "アポ打診" : "クロージング";
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meeting_summary",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              overview: { type: "string" },
              bullets: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 4,
              },
              diagnosis: {
                type: "object",
                additionalProperties: false,
                properties: {
                  status: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      stage: {
                        type: "string",
                        enum: [
                          "relationship_building",
                          "discovery",
                          "proposal_preparation",
                          "proposal_done",
                          "comparison",
                          "decision_pending",
                          "stalled",
                        ],
                      },
                      description: { type: "string" },
                      tone: { type: "string", enum: ["positive", "warning", "neutral"] },
                      evidence: {
                        type: "array",
                        minItems: 1,
                        maxItems: 3,
                        items: { type: "string" },
                      },
                    },
                    required: ["label", "stage", "description", "tone", "evidence"],
                  },
                  temperature: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      level: { type: "string", enum: ["high", "middle", "low"] },
                      stars: { type: "number" },
                      label: { type: "string" },
                      description: { type: "string" },
                      evidence: {
                        type: "array",
                        minItems: 1,
                        maxItems: 3,
                        items: { type: "string" },
                      },
                    },
                    required: ["level", "stars", "label", "description", "evidence"],
                  },
                  consideration: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      score: { type: "number" },
                      label: { type: "string" },
                      description: { type: "string" },
                      evidence: {
                        type: "array",
                        minItems: 1,
                        maxItems: 4,
                        items: { type: "string" },
                      },
                    },
                    required: ["score", "label", "description", "evidence"],
                  },
                  salesEvaluation: {
                    type: "array",
                    minItems: 5,
                    maxItems: 5,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        label: {
                          type: "string",
                          enum: ["ヒアリング", "課題深掘り", "提案接続", "反論対応", "クロージング", "アポ打診"],
                        },
                        score: { type: "number" },
                        description: { type: "string" },
                        evidence: {
                          type: "array",
                          minItems: 1,
                          maxItems: 3,
                          items: { type: "string" },
                        },
                      },
                      required: ["label", "score", "description", "evidence"],
                    },
                  },
                },
                required: ["status", "temperature", "consideration", "salesEvaluation"],
              },
              manualCompliance: {
                type: "object",
                additionalProperties: false,
                properties: {
                  mode: { type: "string", enum: ["manual", "generic"] },
                  score: { type: ["number", "null"] },
                  matchedCriteria: { type: "array", items: { type: "string" } },
                  missingCriteria: { type: "array", items: { type: "string" } },
                  productNotes: { type: "array", items: { type: "string" } },
                  improvementPhrases: { type: "array", items: { type: "string" } },
                  checklistItems: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        category: { type: "string" },
                        label: { type: "string" },
                        status: { type: "string", enum: ["done", "missing"] },
                        reason: { type: "string" },
                        scoreImpact: { type: ["number", "null"] },
                      },
                      required: ["category", "label", "status", "reason", "scoreImpact"],
                    },
                  },
                },
                required: ["mode", "score", "matchedCriteria", "missingCriteria", "productNotes", "improvementPhrases", "checklistItems"],
              },
            },
            required: ["overview", "bullets", "diagnosis", "manualCompliance"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            [
              `あなたは営業${domainLabel}の文字起こしを分析するAIコーチです。`,
              "全体要約は2〜4文で簡潔にまとめ、ポイントは3〜4個の短い箇条書き向け文で返してください。",
              "会社の営業成功基準や商材情報がある場合は、それを最優先して評価してください。",
              conversationInput.hasStructuredLogs
                ? "入力には確定済みの話者別会話ログがあります。全文よりも話者別ログを優先し、営業発話・顧客発話・同席者発話を混同しないでください。"
                : "話者別ログがない場合は、全文から慎重に推定してください。",
              "顧客温度感・検討度・課題・反論・予算・決裁・導入時期は、顧客発話を主根拠にしてください。",
              "営業品質の評価は、営業発話だけでなく、直前の顧客発話に対する返答として適切だったかを主根拠にしてください。",
              "営業の一方的な説明が長く、顧客発話が少ない場合は、ヒアリング・課題深掘りを厳しめに評価してください。",
              "最初に文字起こしを時系列で読み、顧客発話ごとに直後の営業返答が質問・懸念・反論に正面から答えているかを判定してください。",
              "営業返答の評価では、発話単体のキーワード有無だけでなく、直前の顧客発話とのつながり、論点のズレ、質問への未回答、確認不足、次の会話へ進める具体性を重視してください。",
              "顧客が不安・反論・条件提示をした直後に、営業が一般論や商品説明だけで返している場合は、反論対応や提案接続を低く評価してください。",
              "良い返答は、顧客の発言を受け止め、背景を確認し、商材価値や事例に接続し、必要に応じて予算・決裁・時期・次回アクションへ進めているものです。",
              "営業成功基準の評価基準・必須ヒアリング・反論対応・クロージング基準は、各項目ごとに達成/未達を判定してください。",
              "営業成功基準が入力に含まれる場合、manualCompliance.mode は必ず manual にしてください。generic にしてはいけません。",
              "matchedCriteria と missingCriteria には、営業成功基準に登録されている評価基準・必須ヒアリング・クロージング基準の文言だけを使ってください。言い換えや新規項目の作成は禁止です。",
              "営業成功基準が入力に含まれる場合、matchedCriteria と missingCriteria の両方が空になることは禁止です。評価基準・必須ヒアリング・クロージング基準の全項目を達成/未達のどちらかに分類してください。",
              "checklistItems には、営業成功基準に登録されている評価基準・必須ヒアリング・クロージング基準の全項目を1件ずつ入れてください。category は 評価基準 / 必須ヒアリング / クロージング基準 のいずれか、label は登録項目の文言そのまま、status は done または missing にしてください。",
              "checklistItems.reason は短く、文字起こし上の根拠がある場合だけ書いてください。根拠が弱い場合は missing にしてください。",
              "AIの推測で基準を増やしたり、マニュアル外の項目を checklistItems に入れたりしないでください。",
              "達成/未達の判定はキーワード一致だけでなく、前後の会話で実質的に確認・説明・合意できているかで判定してください。",
              `${domainLabel}目的に応じて評価軸を変えてください。関係構築や状況確認では、即時の成約確度だけでなく、信頼形成、課題把握、次回接点の明確さを重視してください。`,
              `${statusLabel}は成約/失注ではなく、現在地として判断してください。`,
              "status.stage は relationship_building=関係構築中、discovery=課題探索中、proposal_preparation=提案準備中、proposal_done=提案済み、comparison=比較検討中、decision_pending=意思決定前、stalled=停滞/再接触必要 から選んでください。",
              "status.label は上記stageに対応する自然な日本語ラベルにしてください。",
              "温度感は顧客の前向きさです。顧客質問、課題の具体性、予算/時期/決裁者、次回アクション合意から high/middle/low と1〜5のstarsで評価してください。",
              "検討度は成約確度ではなく、検討の具体度です。課題明確さ、商材マッチ、予算、導入時期、決裁者/意思決定フロー、次回アクションの明確さから0〜100で採点してください。",
              `${evaluationLabel}は営業品質です。ヒアリング、課題深掘り、提案接続、反論対応、${finalActionLabel}を各0〜100で採点し、マニュアル/スコアルールがある場合はそれを優先してください。`,
              "manualCompliance.score は、営業成功基準のスコアルールがある場合、その加点/減点ルールを最優先して算出してください。単なる達成項目数の割合で採点してはいけません。",
              "採点はロープレ評価と同じ厳しさにしてください。普通に会話できているだけでは60点前後、明確な深掘り・反論対応・条件確認・次回合意が揃って初めて75点以上です。",
              "80点以上は、顧客の具体課題を深掘りし、顧客発話に正面から返答し、商材価値へ接続し、予算/決裁/時期/次回アクションのうち複数を明確に確認できている場合に限定してください。",
              "90点以上は例外です。マニュアル基準の大半を満たし、顧客の反論や条件提示にも具体的に対応し、次回行動が明確に合意されている場合だけ付けてください。",
              "description に『不足』『必要』『曖昧』『浅い』『弱い』『確認できていない』などの不足表現を書く場合、その項目を75点以上にしないでください。重要項目の不足がある場合は65点以下を基本にしてください。",
              "ヒアリング/課題深掘りでは、売上課題・予算・決裁者・導入時期など重要確認の不足がある場合、深く聞けていても上限は65点です。",
              "提案接続/反論対応では、『さらなる価値提案が必要』『具体性が不足』などが残る場合、上限は70点です。",
              "クロージングは、次回日程が確定していても、決裁者・宿題・判断条件・導入時期が曖昧なら上限は70点です。",
              "会話が短い、顧客発話が少ない、質問が浅い、顧客の質問に答えていない、マニュアル項目が未達、次回アクションが曖昧な場合は50点台以下もためらわないでください。",
              "各評価項目のdescriptionには、良かった点だけでなく不足点も必ず含めてください。",
              isTeleapo ? "テレアポでは、クロージングではなくアポ打診として、アポイント提案・日程打診・次回接点化の明確さを評価してください。" : "商談では、クロージングとして次回日程・宿題・決裁者確認まで進めているかを評価してください。",
              "diagnosis 内の evidence は、必ず文字起こし本文に実在する発話またはそれに非常に近い短い引用にしてください。捏造や一般論は禁止です。",
              "evidence には、可能な限り『顧客の発話 → 営業の返答』の流れが分かる短い根拠を含めてください。",
              "evidence は判定理由が分かるように、商談ステータス・温度感・検討度・各評価項目ごとに1〜3件返してください。",
              "マニュアルがある場合は mode=manual、ない場合は mode=generic にしてください。",
              "営業成功基準がある場合、score は必ず0〜100で返してください。score は基準に対する準拠度です。",
              "スコアルールに『+10点』『-20点』のような点数がある場合、達成した加点項目と該当した減点項目を反映した最終点を score にしてください。",
              "営業成功基準がない場合だけ、根拠が薄ければ score は null にしてください。",
              "改善フレーズは次回商談でそのまま使える自然な日本語にしてください。",
              "情報を捏造せず、日本語で返してください。",
            ].join("\n"),
        },
        {
          role: "user",
          content: [
            `商談目的: ${meetingPurposeLabel}`,
            `種別: ${domainLabel}`,
            `顧客種別: ${customerTypeLabel}`,
            contextPrompt ? `以下の基準を使って分析してください。\n\n${contextPrompt}` : "会社固有の基準は未登録です。汎用的な営業観点で分析してください。",
            conversationInput.hasStructuredLogs
              ? [
                  "以下の確定済み話者別ログを最優先で分析してください。",
                  "",
                  `話者別サマリー:\n${conversationInput.speakerSummary}`,
                  "",
                  `時系列会話ログ:\n${conversationInput.structuredTranscript}`,
                  "",
                  `営業発話のみ:\n${conversationInput.salesOnlyText || "営業発話は検出されませんでした。"}`,
                  "",
                  `顧客発話のみ:\n${conversationInput.customerOnlyText || "顧客発話は検出されませんでした。"}`,
                  "",
                  `顧客発話と直後の営業返答ペア:\n${conversationInput.responsePairsText || "応答ペアは検出されませんでした。"}`,
                ].join("\n")
              : `以下の${domainLabel}文字起こしを分析してください。\n\n${conversationInput.transcriptText}`,
          ].join("\n\n"),
        },
      ],
      temperature: 0.3,
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(mapOpenAiErrorMessage(rawText || response.statusText));
  }

  let parsed: {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };

  try {
    parsed = JSON.parse(rawText) as {
      choices?: Array<{
        message?: { content?: string | null };
      }>;
    };
  } catch {
    throw new Error("OpenAI のAI要約レスポンス解析に失敗しました。");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI からAI要約本文が返りませんでした。");
  }

  let summary: SummaryResponse;
  try {
    summary = JSON.parse(content) as SummaryResponse;
  } catch {
    throw new Error("AI要約JSONの解析に失敗しました。");
  }

  return {
    summary: {
      overview: summary.overview?.trim() || "要約を生成できませんでした。",
      bullets: Array.isArray(summary.bullets)
        ? summary.bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 4)
        : [],
      diagnosis: normalizeDiagnosis(summary.diagnosis, input.salesDomain),
      manualCompliance: normalizeManualCompliance(summary.manualCompliance, analysisContext.manual),
    },
    usage: {
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
    },
  };
}

function normalizeManualCompliance(
  value: SummaryResponse["manualCompliance"] | undefined,
  manual: AnalysisContext["manual"],
): NonNullable<SummaryResponse["manualCompliance"]> {
  const productNotes = readStringArray(value?.productNotes).slice(0, 10);
  const improvementPhrases = readStringArray(value?.improvementPhrases).slice(0, 5);
  const explicitScore = typeof value?.score === "number" ? clampNumber(value.score, 0, 100, value.score) : null;

  if (!manual) {
    const matchedCriteria = readStringArray(value?.matchedCriteria).slice(0, 16);
    const missingCriteria = readStringArray(value?.missingCriteria).slice(0, 16);

    return {
      mode: "generic",
      score: explicitScore,
      matchedCriteria,
      missingCriteria,
      productNotes,
      improvementPhrases,
      checklistItems: [],
    };
  }

  const manualChecklist = buildManualChecklist(manual);
  const checklistItems = applyManualScoreImpacts(manual, normalizeManualChecklistItems(value, manualChecklist));
  const matchedCriteria = checklistItems
    .filter((item) => item.status === "done")
    .map((item) => formatManualChecklistDisplay(item));
  const explicitMissingCriteria = normalizeManualChecklistMatches(value?.missingCriteria, manualChecklist)
    .filter((item) => !matchedCriteria.includes(item));
  const finalMissingCriteria = (explicitMissingCriteria.length > 0
    ? explicitMissingCriteria
    : checklistItems
        .filter((item) => item.status === "missing")
        .map((item) => formatManualChecklistDisplay(item)))
    .slice(0, 24);
  const fallbackScore = calculateManualComplianceScore(manual, checklistItems);

  return {
    mode: "manual",
    score: fallbackScore ?? explicitScore,
    matchedCriteria: matchedCriteria.slice(0, 24),
    missingCriteria: finalMissingCriteria,
    productNotes: productNotes.length > 0 ? productNotes : [`適用マニュアル: ${manual.title}`],
    improvementPhrases,
    checklistItems,
  };
}

function buildManualChecklist(manual: AnalysisContext["manual"]) {
  if (!manual) return [];
  return [
    ...manual.criteria.map((item) => ({ category: "評価基準", label: item.trim(), display: item.trim() })),
    ...manual.requiredQuestions.map((item) => ({ category: "必須ヒアリング", label: item.trim(), display: `必須ヒアリング: ${item.trim()}` })),
    ...manual.closingRules.map((item) => ({ category: "クロージング基準", label: item.trim(), display: `クロージング: ${item.trim()}` })),
  ].filter((item) => item.label);
}

function normalizeManualChecklistItems(
  value: SummaryResponse["manualCompliance"] | undefined,
  checklist: ManualChecklistEntry[],
) {
  const returnedItems = Array.isArray(value?.checklistItems) ? value.checklistItems : [];
  const returnedByDisplay = new Map<string, { status: "done" | "missing"; reason: string; scoreImpact: number | null }>();

  for (const item of returnedItems) {
    const matched = findManualChecklistEntry(item.label ?? "", checklist);
    if (!matched || (item.status !== "done" && item.status !== "missing")) continue;
    returnedByDisplay.set(matched.display, {
      status: item.status,
      reason: typeof item.reason === "string" ? item.reason.trim() : "",
      scoreImpact: typeof item.scoreImpact === "number" && Number.isFinite(item.scoreImpact) ? Math.round(item.scoreImpact) : null,
    });
  }

  const matchedCriteria = normalizeManualChecklistMatches(value?.matchedCriteria, checklist);
  const missingCriteria = normalizeManualChecklistMatches(value?.missingCriteria, checklist);

  return checklist.map((entry) => {
    const returned = returnedByDisplay.get(entry.display);
    const fallbackStatus = matchedCriteria.includes(entry.display) && !missingCriteria.includes(entry.display)
      ? "done"
      : "missing";

    return {
      category: entry.category,
      label: entry.label,
      status: returned?.status ?? fallbackStatus,
      reason: returned?.reason ?? "",
      scoreImpact: returned?.scoreImpact ?? null,
    };
  });
}

function normalizeManualChecklistMatches(value: unknown, checklist: ManualChecklistEntry[]) {
  const selected = new Set<string>();
  for (const item of readStringArray(value)) {
    const matched = findManualChecklistEntry(item, checklist);
    if (matched) {
      selected.add(matched.display);
    }
  }
  return Array.from(selected);
}

function applyManualScoreImpacts(
  manual: AnalysisContext["manual"],
  items: Array<{ category: string; label: string; status: "done" | "missing"; reason: string; scoreImpact: number | null }>,
) {
  if (!manual || manual.scoringRules.length === 0) return items;

  const parsedRules = manual.scoringRules
    .map(parseScoringRule)
    .filter((rule): rule is { label: string; points: number } => Boolean(rule));
  if (parsedRules.length === 0) return items;

  return items.map((item) => {
    const matchedRulePoints = parsedRules
      .filter((rule) => {
        const normalizedRule = normalizeCriteriaText(rule.label);
        const normalizedItem = normalizeCriteriaText(item.label);
        if (!isScoringRuleMatched(normalizedRule, normalizedItem)) return false;
        return (item.status === "done" && rule.points > 0) || (item.status === "missing" && rule.points < 0);
      })
      .reduce((sum, rule) => sum + rule.points, 0);

    return {
      ...item,
      scoreImpact: matchedRulePoints !== 0 ? matchedRulePoints : item.scoreImpact,
    };
  });
}

function findManualChecklistEntry(value: string, checklist: ManualChecklistEntry[]) {
  const normalizedValue = normalizeCriteriaText(value);
  if (!normalizedValue) return null;

  return checklist.find((item) => {
    const normalizedItem = normalizeCriteriaText(item.display);
    const normalizedLabel = normalizeCriteriaText(item.label);
    return normalizedItem === normalizedValue ||
      normalizedLabel === normalizedValue ||
      normalizedItem.includes(normalizedValue) ||
      normalizedValue.includes(normalizedItem) ||
      normalizedLabel.includes(normalizedValue) ||
      normalizedValue.includes(normalizedLabel);
  }) ?? null;
}

function formatManualChecklistDisplay(item: { category: string; label: string }) {
  if (item.category === "必須ヒアリング") return `必須ヒアリング: ${item.label}`;
  if (item.category === "クロージング基準") return `クロージング: ${item.label}`;
  return item.label;
}

function normalizeCriteriaText(value: string) {
  return value
    .replace(/^(評価基準|必須ヒアリング|クロージング|クロージング基準|未達|達成|不足)\s*[:：]\s*/u, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function calculateManualComplianceScore(
  manual: AnalysisContext["manual"],
  items: Array<{ category: string; label: string; status: "done" | "missing"; scoreImpact: number | null }>,
) {
  const ruleScore = calculateManualScoringRuleScore(manual, items);
  if (ruleScore !== null) {
    return ruleScore;
  }

  const matchedCount = items.filter((item) => item.status === "done").length;
  const missingCount = items.filter((item) => item.status === "missing").length;
  const total = matchedCount + missingCount;
  if (total <= 0) return null;
  return clampNumber((matchedCount / total) * 100, 0, 100, 0);
}

function calculateManualScoringRuleScore(
  manual: AnalysisContext["manual"],
  items: Array<{ category: string; label: string; status: "done" | "missing"; scoreImpact: number | null }>,
) {
  if (!manual || manual.scoringRules.length === 0) return null;

  const parsedRules = manual.scoringRules
    .map(parseScoringRule)
    .filter((rule): rule is { label: string; points: number } => Boolean(rule));
  if (parsedRules.length === 0) return null;

  const positiveRules = parsedRules.filter((rule) => rule.points > 0);
  const positiveTotal = positiveRules.reduce((sum, rule) => sum + rule.points, 0);
  const rawScore = items.reduce((sum, item) => sum + (item.scoreImpact ?? 0), 0);

  if (positiveTotal <= 0) {
    return clampNumber(rawScore, 0, 100, 0);
  }

  return clampNumber((rawScore / positiveTotal) * 100, 0, 100, 0);
}

function parseScoringRule(rule: string) {
  const match = rule.match(/(.+?)[：:]\s*([+-]?\d+)\s*点?/u);
  if (!match) return null;
  return {
    label: match[1]?.trim() ?? "",
    points: Number(match[2]),
  };
}

function isScoringRuleMatched(normalizedRule: string, normalizedCriteriaText: string) {
  const keywords = buildScoringRuleKeywords(normalizedRule);
  return keywords.some((keyword) => normalizedCriteriaText.includes(keyword));
}

function buildScoringRuleKeywords(normalizedRule: string) {
  const withoutResultWords = normalizedRule
    .replace(/あり|なし|確認|未確認|設定|説明|イメージ|価格のみ|一方的な|商品説明/g, "")
    .trim();
  const keywords = [normalizedRule, withoutResultWords].filter((keyword) => keyword.length >= 2);

  if (/課題/.test(normalizedRule)) keywords.push("課題");
  if (/採用/.test(normalizedRule)) keywords.push("採用課題");
  if (/売上/.test(normalizedRule)) keywords.push("売上課題");
  if (/決裁/.test(normalizedRule)) keywords.push("決裁者");
  if (/予算/.test(normalizedRule)) keywords.push("予算感");
  if (/導入時期/.test(normalizedRule)) keywords.push("導入時期");
  if (/導入後/.test(normalizedRule)) keywords.push("導入後の未来像");
  if (/次回アクション/.test(normalizedRule)) keywords.push("次回アクション");

  return Array.from(new Set(keywords.map(normalizeCriteriaText).filter((keyword) => keyword.length >= 2)));
}

function buildConversationAnalysisInput(
  transcriptText: string | null | undefined,
  conversationLogs: ConversationLogInput[] | null | undefined,
): ConversationAnalysisInput {
  const normalizedLogs = Array.isArray(conversationLogs)
    ? conversationLogs
        .map((log, index) => {
          const speaker = normalizeConversationSpeaker(log.speaker);
          const text = typeof log.text === "string" ? log.text.trim() : "";
          return {
            index,
            speaker,
            label: normalizeSpeakerLabel(log.label, speaker),
            text,
          };
        })
        .filter((log) => log.text)
    : [];

  if (normalizedLogs.length === 0) {
    return {
      transcriptText: transcriptText?.trim() ?? "",
      structuredTranscript: transcriptText?.trim() ?? "",
      speakerSummary: "話者別ログなし",
      salesOnlyText: "",
      customerOnlyText: "",
      responsePairsText: "",
      hasStructuredLogs: false,
    };
  }

  const structuredTranscript = normalizedLogs
    .map((log, index) => `[${String(index + 1).padStart(3, "0")}] ${speakerRoleLabel(log.speaker)}（${log.label}）: ${log.text}`)
    .join("\n");
  const salesLogs = normalizedLogs.filter((log) => log.speaker === "sales");
  const customerLogs = normalizedLogs.filter((log) => log.speaker === "customer");
  const participantLogs = normalizedLogs.filter((log) => log.speaker === "participant");
  const unknownLogs = normalizedLogs.filter((log) => log.speaker === "unknown");
  const totalChars = normalizedLogs.reduce((sum, log) => sum + log.text.length, 0);
  const speakerSummary = [
    buildSpeakerSummaryLine("営業", salesLogs, totalChars),
    buildSpeakerSummaryLine("顧客", customerLogs, totalChars),
    buildSpeakerSummaryLine("同席者", participantLogs, totalChars),
    buildSpeakerSummaryLine("不明", unknownLogs, totalChars),
  ].join("\n");

  return {
    transcriptText: structuredTranscript,
    structuredTranscript,
    speakerSummary,
    salesOnlyText: salesLogs.map((log) => `- ${log.text}`).join("\n"),
    customerOnlyText: customerLogs.map((log) => `- ${log.text}`).join("\n"),
    responsePairsText: buildResponsePairsText(normalizedLogs),
    hasStructuredLogs: true,
  };
}

function normalizeConversationSpeaker(value: unknown): ConversationSpeaker {
  if (value === "sales" || value === "speaker_1") return "sales";
  if (value === "customer" || value === "speaker_2") return "customer";
  if (value === "participant") return "participant";
  return "unknown";
}

function normalizeSpeakerLabel(label: string | null | undefined, speaker: ConversationSpeaker) {
  const normalizedLabel = label?.trim();
  if (normalizedLabel) return normalizedLabel;
  return speakerRoleLabel(speaker);
}

function speakerRoleLabel(speaker: ConversationSpeaker) {
  if (speaker === "sales") return "営業";
  if (speaker === "customer") return "顧客";
  if (speaker === "participant") return "同席者";
  return "不明";
}

function buildSpeakerSummaryLine(label: string, logs: Array<{ text: string }>, totalChars: number) {
  const charCount = logs.reduce((sum, log) => sum + log.text.length, 0);
  const rate = totalChars > 0 ? Math.round((charCount / totalChars) * 100) : 0;
  return `${label}: ${logs.length}発話 / ${rate}%`;
}

function buildResponsePairsText(
  logs: Array<{ speaker: ConversationSpeaker; label: string; text: string }>,
) {
  const pairs: string[] = [];

  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index];
    if (log.speaker !== "customer") {
      continue;
    }

    const nextSalesLog = findNextSalesReply(logs, index);
    if (!nextSalesLog) {
      continue;
    }

    pairs.push(`顧客: ${log.text}\n営業: ${nextSalesLog.text}`);
  }

  return pairs.slice(0, 24).join("\n\n");
}

function findNextSalesReply(
  logs: Array<{ speaker: ConversationSpeaker; label: string; text: string }>,
  customerLogIndex: number,
) {
  for (let index = customerLogIndex + 1; index < logs.length; index += 1) {
    const log = logs[index];
    if (log.speaker === "sales") {
      return log;
    }

    if (log.speaker === "customer") {
      return null;
    }
  }

  return null;
}

function resolveManualCategory(customerType?: string | null, meetingPurpose?: string | null) {
  if (customerType === "new" || meetingPurpose === "new_proposal") return "新規";
  if (customerType === "existing" || meetingPurpose === "existing_followup" || meetingPurpose === "retention" || meetingPurpose === "upsell_cross_sell") return "既存";
  return null;
}

function getMeetingPurposeLabel(value?: string | null) {
  const labels: Record<string, string> = {
    new_proposal: "新規提案",
    closing: "クロージング",
    existing_followup: "既存フォロー",
    relationship_building: "関係構築",
    check_in: "状況確認",
    upsell_cross_sell: "アップセル/クロスセル",
    onboarding: "オンボーディング",
    retention: "解約防止",
  };
  return value ? labels[value] ?? value : "目的未設定";
}

function normalizeDiagnosis(value: SummaryResponse["diagnosis"], salesDomain?: string | null) {
  const fallbackStage = "discovery";
  const stage = value?.status?.stage;
  const tone = value?.status?.tone;
  const level = value?.temperature?.level;

  return {
    status: {
      label: value?.status?.label?.trim() || stageToLabel(fallbackStage),
      stage: isStage(stage) ? stage : fallbackStage,
      description: value?.status?.description?.trim() || "文字起こし内容から商談の現在地を判定しました。",
      tone: tone === "positive" || tone === "warning" || tone === "neutral" ? tone : "neutral",
      evidence: readStringArray(value?.status?.evidence).slice(0, 3),
    },
    temperature: {
      level: level === "high" || level === "middle" || level === "low" ? level : "middle",
      stars: clampNumber(value?.temperature?.stars, 1, 5, 3),
      label: value?.temperature?.label?.trim() || "温度感は中程度",
      description: value?.temperature?.description?.trim() || "顧客の反応と次回アクションの具体性から評価しました。",
      evidence: readStringArray(value?.temperature?.evidence).slice(0, 3),
    },
    consideration: {
      score: clampNumber(value?.consideration?.score, 0, 100, 50),
      label: value?.consideration?.label?.trim() || "検討の具体度",
      description: value?.consideration?.description?.trim() || "課題、予算、時期、決裁者、次回アクションの明確さから評価しました。",
      evidence: readStringArray(value?.consideration?.evidence).slice(0, 4),
    },
    salesEvaluation: normalizeSalesEvaluation(value?.salesEvaluation, salesDomain),
  };
}

function normalizeSalesEvaluation(value: SummaryResponse["diagnosis"] extends { salesEvaluation?: infer S } ? S : unknown, salesDomain?: string | null) {
  const expected = ["ヒアリング", "課題深掘り", "提案接続", "反論対応", salesDomain === "teleapo" ? "アポ打診" : "クロージング"];
  const items = Array.isArray(value) ? value : [];

  return expected.map((label) => {
    const matched = items.find((item) => item?.label === label || (label === "アポ打診" && item?.label === "クロージング"));
    const description = matched?.description?.trim() || `${label}の観点で商談品質を評価しました。`;
    return {
      label,
      score: calibrateSalesEvaluationScore(label, clampNumber(matched?.score, 0, 100, 50), description),
      description,
      evidence: readStringArray(matched?.evidence).slice(0, 3),
    };
  });
}

function calibrateSalesEvaluationScore(label: string, score: number, description: string) {
  const text = description.toLowerCase();
  const hasWeakness = /不足|必要|曖昧|あいまい|浅い|弱い|課題|余地|できていない|確認がない|未確認|不十分/.test(text);
  const hasImportantMissing = /売上課題|予算|決裁|導入時期|判断条件|次回アクション|日程|宿題/.test(text) && /不足|曖昧|未確認|確認がない|必要|弱い|不十分/.test(text);

  let adjusted = score;

  if (hasImportantMissing && (label === "ヒアリング" || label === "課題深掘り")) {
    adjusted = Math.min(adjusted, 65);
  } else if (hasImportantMissing && (label === "クロージング" || label === "アポ打診")) {
    adjusted = Math.min(adjusted, 70);
  } else if (hasImportantMissing) {
    adjusted = Math.min(adjusted, 68);
  }

  if (hasWeakness) {
    adjusted = Math.min(adjusted, label === "クロージング" || label === "アポ打診" ? 72 : 70);
    adjusted -= score >= 75 ? 5 : 0;
  }

  return clampNumber(adjusted, 0, 100, 50);
}

function isStage(value: unknown): value is NonNullable<NonNullable<SummaryResponse["diagnosis"]>["status"]>["stage"] {
  return [
    "relationship_building",
    "discovery",
    "proposal_preparation",
    "proposal_done",
    "comparison",
    "decision_pending",
    "stalled",
  ].includes(String(value));
}

function stageToLabel(stage: string) {
  const labels: Record<string, string> = {
    relationship_building: "関係構築中",
    discovery: "課題探索中",
    proposal_preparation: "提案準備中",
    proposal_done: "提案済み",
    comparison: "比較検討中",
    decision_pending: "意思決定前",
    stalled: "停滞/再接触必要",
  };
  return labels[stage] ?? "課題探索中";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function mapOpenAiErrorMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { message?: string; code?: string | null; type?: string | null };
    };
    const code = parsed.error?.code ?? parsed.error?.type ?? null;

    if (code === "insufficient_quota") {
      return "OpenAI API の利用枠が不足しているためAI要約を生成できません。Billing / quota を確認してください。";
    }

    if (code === "invalid_api_key") {
      return "OpenAI API キーが無効です。.env.local の OPENAI_API_KEY を確認してください。";
    }

    if (code === "rate_limit_exceeded") {
      return "OpenAI API のレート制限に達しました。少し待ってから再度お試しください。";
    }

    if (parsed.error?.message) {
      return `OpenAI API でAI要約生成に失敗しました。${parsed.error.message}`;
    }
  } catch {
    // noop
  }

  return `OpenAI API でAI要約生成に失敗しました。${rawMessage}`;
}

async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit & { timeoutMs?: number },
) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? remoteFetchTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI のAI要約生成がタイムアウトしました。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
