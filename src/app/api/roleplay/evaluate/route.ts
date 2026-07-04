import { NextRequest, NextResponse } from "next/server";

import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { hashRoleplayPayload, normalizeRoleplaySessionId } from "@/lib/server/roleplay-cost-control";
import type { AnalysisContext } from "@/lib/server/analysis-context";
import { buildAnalysisContextPrompt, loadAnalysisContext } from "@/lib/server/analysis-context";
import {
  buildAnalysisConfigPrompt,
  loadAnalysisConfig,
  type ServerAnalysisConfig,
} from "@/lib/server/analysis-configs";
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
  productName?: string;
  scenarioCategory?: string;
  targetSegment?: string;
  customerRole?: string;
  customerProfile?: string;
  goal?: string;
  objections?: string[];
  evaluationCriteria?: string[];
  customFields?: Array<{ label?: string; value?: string }>;
  difficulty?: "easy" | "normal" | "hard";
};

type EvaluationResponse = {
  score?: number;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  improvementPhrases?: string[];
  manualChecklistItems?: Array<{
    category?: string;
    label?: string;
    status?: "done" | "missing";
    reason?: string;
    scoreImpact?: number | null;
  }>;
};

type RoleplayEvaluation = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  improvementPhrases: string[];
  manualChecklistItems: Array<{
    category: string;
    label: string;
    status: "done" | "missing";
    reason: string;
    scoreImpact: number | null;
  }>;
};

type ManualChecklistEntry = {
  category: string;
  label: string;
  display: string;
};

type EvaluateRequestBody = {
  companyId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  scenario?: RoleplayScenarioPayload;
  messages?: RoleplayMessage[];
};

export async function POST(request: NextRequest) {
  let apiUser: ApiUserContext | null = null;
  let body: EvaluateRequestBody | null = null;
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  try {
    apiUser = await requireApiUser(request);
    body = (await request.json()) as EvaluateRequestBody;
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) return NextResponse.json(authError.body, { status: authError.status });
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (!body?.scenario || !Array.isArray(body.messages) || body.messages.length < 2) {
    return NextResponse.json({ error: "シナリオと会話ログが必要です。" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI評価を実行できませんでした。" }, { status: 503 });
  }

  try {
    const roleplayType = body.scenario.roleplayType === "teleapo" ? "teleapo" : "meeting";
    assertSalesDomainAccess(apiUser, roleplayType);
    const sessionId = normalizeRoleplaySessionId(body.sessionId);
    const analysisContext = await loadAnalysisContext({
      companyId: apiUser.companyId,
      productName: body.scenario.productName,
      manualCategory: body.scenario.scenarioCategory,
      targetSegment: body.scenario.targetSegment,
      manualDomain: roleplayType,
    });
    const analysisConfig = await loadAnalysisConfig({
      companyId: apiUser.companyId,
      productName: body.scenario.productName,
      analysisType: roleplayType === "teleapo" ? "teleapo_roleplay" : "meeting_roleplay",
    });
    const contextPrompt = buildAnalysisContextPrompt(analysisContext);
    const analysisConfigPrompt = buildAnalysisConfigPrompt(analysisConfig);
    const cacheKey = buildEvaluationCacheKey({
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      scenario: body.scenario,
      messages: body.messages,
      analysisConfigPrompt,
    });
    const cachedEvaluation = await readCachedEvaluation(cacheKey);
    if (cachedEvaluation) {
      return NextResponse.json(cachedEvaluation);
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

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "roleplay_evaluation",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                score: { type: "number" },
                summary: { type: "string" },
                strengths: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                improvements: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
                improvementPhrases: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                manualChecklistItems: {
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
              required: ["score", "summary", "strengths", "improvements", "improvementPhrases", "manualChecklistItems"],
            },
          },
        },
        messages: [
          {
            role: "system",
            content: buildEvaluationSystemPrompt(roleplayType, Boolean(analysisContext.manual || analysisConfig)),
          },
          {
            role: "user",
            content: [
              buildScenarioPrompt(body.scenario),
              contextPrompt ? `会社基準・商材情報:\n${contextPrompt}` : "会社基準・商材情報: 未登録",
              analysisConfigPrompt ? `admin分析設定:\n${analysisConfigPrompt}` : "admin分析設定: 未登録",
              `会話ログ:\n${formatMessages(body.messages)}`,
            ].join("\n\n"),
          },
        ],
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI がエラーを返しました。${response.statusText}`);
    }

    const data = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI評価本文が返りませんでした。");
    }
    const evaluation = normalizeEvaluation(JSON.parse(content) as EvaluationResponse, analysisContext.manual, analysisConfig);
    await saveCachedEvaluation({
      cacheKey,
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      scenarioTitle: body.scenario.title,
      evaluation,
    });

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

    return NextResponse.json(evaluation);
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "AIロープレ評価に失敗しました。";
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
      source: "api/roleplay/evaluate",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildEvaluationSystemPrompt(roleplayType: "meeting" | "teleapo", hasManual: boolean) {
  if (roleplayType === "teleapo") {
    return buildTeleapoEvaluationSystemPrompt(hasManual);
  }
  const domainLabel = "商談";
  const finalAction = "クロージング・次回アクション";

  return [
    `あなたは営業${domainLabel}ロープレの評価者です。`,
    "このロープレは時間制限ではなく、苦手テーマを絞って反復する集中練習です。総合評価だけでなく、次回もう一度練習すべき弱点テーマを明確にしてください。",
    "会話ログを時系列で読み、顧客発話に対する営業返答の質を評価してください。",
    "キーワードの有無だけで採点せず、直前の顧客の質問・懸念・反論に正面から答えているか、論点をずらしていないか、会話を前に進めているかを重視してください。",
    "顧客の発話を受け止めずに一般的な商品説明へ移った場合、返答品質を低く評価してください。",
    "良い返答は、顧客の発言を受け止め、必要な追加質問をし、商材価値・事例・条件確認へ自然につなげています。",
    "会社基準、商材情報、マニュアル、シナリオ採点基準、自由項目を全て分類軸として使ってください。",
    hasManual
      ? "マニュアルまたはadmin分析設定があるため、manualChecklistItems には登録された評価項目・必須項目・クロージング基準を1件ずつ入れてください。AIの判断で項目を増やしたり言い換えたりしてはいけません。"
      : "マニュアルもadmin分析設定もない場合、manualChecklistItems は空配列にしてください。",
    "manualChecklistItems の category は登録文脈に合わせ、label は登録項目の文言そのまま、status は done または missing にしてください。",
    "ロープレ会話上で実質的に確認・説明・合意できている場合だけ done にしてください。根拠が弱い、触れていない、曖昧な場合は missing です。",
    `評価軸は、課題把握、返答の的確さ、価値接続、反論対応、予算/決裁/時期確認、${finalAction}です。`,
    "summary は、今回のロープレで最優先に直す弱点テーマと、次回の集中練習で意識する行動を含めてください。",
    "strengths と improvements は、できるだけ会話中の具体的な場面に触れてください。",
    "improvements の先頭には、次回集中的に練習するべき弱点テーマを1つ入れてください。",
    "improvementPhrases は次回そのまま使える自然な営業トークにしてください。特に弱点テーマの場面で使う言い換えを優先してください。",
    "根拠のない高得点は禁止です。会話が短い、質問に答えていない、マニュアル項目が未達なら厳しめに採点してください。",
    "日本語で返してください。",
  ].join("\n");
}

function buildTeleapoEvaluationSystemPrompt(hasManual: boolean) {
  return [
    "あなたはテレアポ/テレマの営業ロープレ評価者です。",
    "このロープレは通常商談の短縮版ではありません。電話口での冒頭突破、話す許可、受付/担当者接続、短い興味喚起、断り対応、アポ打診を評価してください。",
    "シナリオの顧客役職やプロフィールが担当者・責任者・キーマン・決裁者の場合は、受付突破ではなくキーマン接触後の練習として評価してください。",
    "キーマン接触後の練習では、相手が話を聞いてくれている前提で、用件、相手メリット、費用対効果、導入負荷、次に確認する価値を短く伝え、15分程度の確認日程を提示できたかを主軸に評価してください。担当者接続や受付突破の有無を過度に重視しないでください。",
    "会話ログを時系列で読み、営業が相手の時間を奪わず、短く自然に会話を前に進めたかを重視してください。",
    "summary、strengths、improvements では、課題深掘り、予算確認、決裁確認、導入時期確認など通常商談の評価軸を主軸にしないでください。テレアポの目的は次接点を作ることです。",
    "評価軸は、冒頭10秒、話す許可、用件の明確さ、相手メリット、受付突破/担当者確認、断り文句への1回切り返し、アポ打診・日程候補提示、声の印象・テンポです。",
    "長い商品説明、相手の断りを無視した粘りすぎ、資料送付だけで終わる、アポ打診がない、担当者確認がない場合は厳しく評価してください。",
    "受付突破シナリオでは『営業電話ですか』『忙しいです』『資料送ってください』『結構です』『担当ではありません』への返し方を必ず評価してください。キーマン接触後シナリオでは、本人の懸念に対する判断材料の返し方を必ず評価してください。",
    "良い返答は、相手の状況を受け止め、30秒だけよいか等の許可を取り、相手に関係ある課題を一言で示し、短い日程候補または次接点を出しています。",
    "会社基準、商材情報、マニュアル、シナリオ採点基準、自由項目を全て分類軸として使ってください。",
    hasManual
      ? "マニュアルまたはadmin分析設定があるため、manualChecklistItems には登録された評価項目・必須項目・クロージング基準を1件ずつ入れてください。AIの判断で項目を増やしたり言い換えたりしてはいけません。"
      : "マニュアルもadmin分析設定もない場合、manualChecklistItems は空配列にしてください。",
    "manualChecklistItems の category は登録文脈に合わせ、label は登録項目の文言そのまま、status は done または missing にしてください。",
    "ロープレ会話上で実質的に確認・説明・合意できている場合だけ done にしてください。根拠が弱い、触れていない、曖昧な場合は missing です。",
    "summary は、今回のテレアポで最優先に直す弱点テーマと、次回の集中練習で意識する行動を含めてください。",
    "strengths と improvements は、できるだけ会話中の具体的な場面に触れてください。",
    "improvements の先頭には、次回集中的に練習するべきテレアポ弱点を1つ入れてください。",
    "improvementPhrases は次回そのまま電話口で使える短い営業トークにしてください。冒頭突破、許可取り、断り切り返し、アポ打診のいずれかに寄せ、1フレーズは長くしすぎないでください。",
    "根拠のない高得点は禁止です。会話が短い、許可取りがない、断りに対応できていない、アポ打診がない場合は厳しめに採点してください。",
    "日本語で返してください。",
  ].join("\n");
}

function buildScenarioPrompt(scenario: RoleplayScenarioPayload) {
  return [
    `シナリオ: ${scenario.title}`,
    `種別: ${scenario.roleplayType === "teleapo" ? "テレアポ" : "商談"}`,
    `商材: ${scenario.productName ?? ""}`,
    `カテゴリー: ${scenario.scenarioCategory ?? ""}`,
    `ターゲット層: ${scenario.targetSegment ?? ""}`,
    `顧客役職: ${scenario.customerRole ?? ""}`,
    `顧客プロフィール: ${scenario.customerProfile ?? ""}`,
    `ゴール: ${scenario.goal ?? ""}`,
    `想定反論: ${(scenario.objections ?? []).join(" / ")}`,
    `独自採点項目: ${(scenario.evaluationCriteria ?? []).join(" / ")}`,
    `自由項目: ${readScenarioCustomFields(scenario.customFields).join(" / ") || "なし"}`,
  ].join("\n");
}

function formatMessages(messages: RoleplayMessage[]) {
  return messages
    .map((message, index) => `${index + 1}. ${message.role === "sales" ? "営業" : "顧客"}: ${message.content}`)
    .join("\n");
}

function buildEvaluationCacheKey(input: {
  companyId?: string | null;
  userId: string;
  scenario: RoleplayScenarioPayload;
  messages: RoleplayMessage[];
  analysisConfigPrompt: string;
}) {
  return hashRoleplayPayload({
    evaluationContextVersion: 6,
    companyId: input.companyId ?? null,
    userId: input.userId,
    scenario: {
      title: input.scenario.title,
      roleplayType: input.scenario.roleplayType ?? "meeting",
      productName: input.scenario.productName ?? "",
      scenarioCategory: input.scenario.scenarioCategory ?? "",
      targetSegment: input.scenario.targetSegment ?? "",
      evaluationCriteria: input.scenario.evaluationCriteria ?? [],
      customFields: input.scenario.customFields ?? [],
    },
    analysisConfigPrompt: input.analysisConfigPrompt,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
  });
}

async function readCachedEvaluation(cacheKey: string): Promise<RoleplayEvaluation | null> {
  const db = getFirebaseAdminDb();
  if (!db) return null;

  const snapshot = await db.collection("roleplayEvaluationCache").doc(cacheKey).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data) return null;

  return isRoleplayEvaluation(data.evaluation) ? data.evaluation : null;
}

async function saveCachedEvaluation(input: {
  cacheKey: string;
  companyId?: string | null;
  userId: string;
  scenarioTitle: string;
  evaluation: RoleplayEvaluation;
}) {
  const db = getFirebaseAdminDb();
  if (!db) return;

  await db.collection("roleplayEvaluationCache").doc(input.cacheKey).set({
    companyId: input.companyId ?? null,
    userId: input.userId,
    scenarioTitle: input.scenarioTitle,
    evaluation: input.evaluation,
    createdAt: new Date(),
  });
}

function isRoleplayEvaluation(value: unknown): value is RoleplayEvaluation {
  if (!value || typeof value !== "object") return false;
  const data = value as RoleplayEvaluation;
  return typeof data.score === "number" &&
    typeof data.summary === "string" &&
    Array.isArray(data.strengths) &&
    Array.isArray(data.improvements) &&
    Array.isArray(data.improvementPhrases) &&
    Array.isArray(data.manualChecklistItems);
}

function normalizeEvaluation(
  value: EvaluationResponse,
  manual: AnalysisContext["manual"],
  analysisConfig: ServerAnalysisConfig | null,
) {
  const manualChecklistItems = applyManualScoreImpacts(
    manual,
    normalizeManualChecklistItems(value.manualChecklistItems, manual, analysisConfig),
  );
  const score = manualChecklistItems.length > 0
    ? calculateManualChecklistScore(manual, manualChecklistItems)
    : clampNumber(value.score, 0, 100, 40);

  return {
    score,
    summary: readString(value.summary, "ロープレ評価を生成しました。"),
    strengths: readStringArray(value.strengths).slice(0, 5),
    improvements: readStringArray(value.improvements).slice(0, 6),
    improvementPhrases: readStringArray(value.improvementPhrases).slice(0, 5),
    manualChecklistItems,
  };
}

function normalizeManualChecklistItems(
  value: unknown,
  manual: AnalysisContext["manual"],
  analysisConfig: ServerAnalysisConfig | null,
) {
  if (!manual && !analysisConfig) return [];

  const checklist = buildManualChecklist(manual, analysisConfig);
  const returnedItems = Array.isArray(value) ? value : [];
  const returnedByDisplay = new Map<string, { status: "done" | "missing"; reason: string; scoreImpact: number | null }>();

  for (const item of returnedItems) {
    if (!item || typeof item !== "object") continue;
    const data = item as NonNullable<EvaluationResponse["manualChecklistItems"]>[number];
    const matched = findManualChecklistEntry(data.label ?? "", checklist);
    if (!matched || (data.status !== "done" && data.status !== "missing")) continue;
    returnedByDisplay.set(matched.display, {
      status: data.status,
      reason: typeof data.reason === "string" ? data.reason.trim() : "",
      scoreImpact: typeof data.scoreImpact === "number" && Number.isFinite(data.scoreImpact) ? Math.round(data.scoreImpact) : null,
    });
  }

  return checklist.map((entry) => {
    const returned = returnedByDisplay.get(entry.display);
    return {
      category: entry.category,
      label: entry.label,
      status: returned?.status ?? "missing",
      reason: returned?.reason ?? "",
      scoreImpact: returned?.scoreImpact ?? null,
    };
  });
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

function buildManualChecklist(manual: AnalysisContext["manual"], analysisConfig: ServerAnalysisConfig | null) {
  return [
    ...(analysisConfig?.checklistItems.map((item) => ({
      category: item.required ? "admin必須項目" : "admin評価項目",
      label: item.label.trim(),
      display: `${item.required ? "admin必須項目" : "admin評価項目"}: ${item.label.trim()}`,
    })) ?? []),
    ...(manual?.criteria.map((item) => ({ category: "評価基準", label: item.trim(), display: item.trim() })) ?? []),
    ...(manual?.requiredQuestions.map((item) => ({ category: "必須ヒアリング", label: item.trim(), display: `必須ヒアリング: ${item.trim()}` })) ?? []),
    ...(manual?.closingRules.map((item) => ({ category: "クロージング基準", label: item.trim(), display: `クロージング: ${item.trim()}` })) ?? []),
  ].filter((item) => item.label);
}

function findManualChecklistEntry(value: string, checklist: ManualChecklistEntry[]) {
  const normalizedValue = normalizeCriteriaText(value);
  if (!normalizedValue) return null;

  return checklist.find((item) => {
    const normalizedDisplay = normalizeCriteriaText(item.display);
    const normalizedLabel = normalizeCriteriaText(item.label);
    return normalizedDisplay === normalizedValue ||
      normalizedLabel === normalizedValue ||
      normalizedDisplay.includes(normalizedValue) ||
      normalizedValue.includes(normalizedDisplay) ||
      normalizedLabel.includes(normalizedValue) ||
      normalizedValue.includes(normalizedLabel);
  }) ?? null;
}

function calculateManualChecklistScore(
  manual: AnalysisContext["manual"],
  items: Array<{ category: string; label: string; status: "done" | "missing" }>,
) {
  const ruleScore = calculateManualScoringRuleScore(manual, items);
  if (ruleScore !== null) return ruleScore;

  const doneCount = items.filter((item) => item.status === "done").length;
  return clampNumber((doneCount / items.length) * 100, 0, 100, 40);
}

function calculateManualScoringRuleScore(
  manual: AnalysisContext["manual"],
  items: Array<{ category: string; label: string; status: "done" | "missing"; scoreImpact?: number | null }>,
) {
  if (!manual || manual.scoringRules.length === 0) return null;

  const parsedRules = manual.scoringRules
    .map(parseScoringRule)
    .filter((rule): rule is { label: string; points: number } => Boolean(rule));
  if (parsedRules.length === 0) return null;

  const positiveTotal = parsedRules.filter((rule) => rule.points > 0).reduce((sum, rule) => sum + rule.points, 0);
  const rawScore = items.reduce((sum, item) => sum + (item.scoreImpact ?? 0), 0);

  if (positiveTotal <= 0) return clampNumber(rawScore, 0, 100, 0);
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

function isScoringRuleMatched(normalizedRule: string, normalizedText: string) {
  return buildScoringRuleKeywords(normalizedRule).some((keyword) => normalizedText.includes(keyword));
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

function normalizeCriteriaText(value: string) {
  return value
    .replace(/^(評価基準|必須ヒアリング|クロージング|クロージング基準|未達|達成|不足)\s*[:：]\s*/u, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
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

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
