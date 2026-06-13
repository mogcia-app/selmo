import { NextResponse } from "next/server";

import {
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
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
  };
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

    if (!body.transcriptText?.trim()) {
      return NextResponse.json(
        { error: "要約対象の文字起こし本文がありません。" },
        { status: 400 },
      );
    }

    const analysisContext = await loadAnalysisContext({
      companyId: body.companyId,
      productName: body.productName,
    });
    const result = await summarizeTranscript(body.transcriptText, analysisContext, {
      meetingPurpose: body.meetingPurpose,
      customerType: body.customerType,
      salesDomain: body.salesDomain,
    });
    await saveAiUsageLog({
      companyId: body.companyId,
      userId: body.userId,
      feature: "summary",
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
      feature: "summary",
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
  transcriptText: string,
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
                },
                required: ["mode", "score", "matchedCriteria", "missingCriteria", "productNotes", "improvementPhrases"],
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
              `${domainLabel}目的に応じて評価軸を変えてください。関係構築や状況確認では、即時の成約確度だけでなく、信頼形成、課題把握、次回接点の明確さを重視してください。`,
              `${statusLabel}は成約/失注ではなく、現在地として判断してください。`,
              "status.stage は relationship_building=関係構築中、discovery=課題探索中、proposal_preparation=提案準備中、proposal_done=提案済み、comparison=比較検討中、decision_pending=意思決定前、stalled=停滞/再接触必要 から選んでください。",
              "status.label は上記stageに対応する自然な日本語ラベルにしてください。",
              "温度感は顧客の前向きさです。顧客質問、課題の具体性、予算/時期/決裁者、次回アクション合意から high/middle/low と1〜5のstarsで評価してください。",
              "検討度は成約確度ではなく、検討の具体度です。課題明確さ、商材マッチ、予算、導入時期、決裁者/意思決定フロー、次回アクションの明確さから0〜100で採点してください。",
              `${evaluationLabel}は営業品質です。ヒアリング、課題深掘り、提案接続、反論対応、${finalActionLabel}を各0〜100で採点し、マニュアル/スコアルールがある場合はそれを優先してください。`,
              isTeleapo ? "テレアポでは、クロージングではなくアポ打診として、アポイント提案・日程打診・次回接点化の明確さを評価してください。" : "商談では、クロージングとして次回日程・宿題・決裁者確認まで進めているかを評価してください。",
              "diagnosis 内の evidence は、必ず文字起こし本文に実在する発話またはそれに非常に近い短い引用にしてください。捏造や一般論は禁止です。",
              "evidence は判定理由が分かるように、商談ステータス・温度感・検討度・各評価項目ごとに1〜3件返してください。",
              "マニュアルがある場合は mode=manual、ない場合は mode=generic にしてください。",
              "score は0〜100で、基準に対する準拠度を表します。根拠が薄い場合はnullにしてください。",
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
            `以下の${domainLabel}文字起こしを分析してください。\n\n${transcriptText}`,
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
      manualCompliance: {
        mode: summary.manualCompliance?.mode === "manual" ? "manual" : "generic",
        score: typeof summary.manualCompliance?.score === "number" ? summary.manualCompliance.score : null,
        matchedCriteria: readStringArray(summary.manualCompliance?.matchedCriteria).slice(0, 6),
        missingCriteria: readStringArray(summary.manualCompliance?.missingCriteria).slice(0, 6),
        productNotes: readStringArray(summary.manualCompliance?.productNotes).slice(0, 6),
        improvementPhrases: readStringArray(summary.manualCompliance?.improvementPhrases).slice(0, 5),
      },
    },
    usage: {
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
    },
  };
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
    return {
      label,
      score: clampNumber(matched?.score, 0, 100, 50),
      description: matched?.description?.trim() || `${label}の観点で商談品質を評価しました。`,
      evidence: readStringArray(matched?.evidence).slice(0, 3),
    };
  });
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
