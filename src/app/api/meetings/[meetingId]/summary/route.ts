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
  transcriptText?: string;
};

type SummaryResponse = {
  overview: string;
  bullets: string[];
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
    const result = await summarizeTranscript(body.transcriptText, analysisContext);
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
) {
  const model = "gpt-4o-mini";
  const contextPrompt = buildAnalysisContextPrompt(analysisContext);
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
            required: ["overview", "bullets", "manualCompliance"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            [
              "あなたは営業商談の文字起こしを分析するAIコーチです。",
              "全体要約は2〜4文で簡潔にまとめ、ポイントは3〜4個の短い箇条書き向け文で返してください。",
              "会社の営業成功基準や商材情報がある場合は、それを最優先して評価してください。",
              "マニュアルがある場合は mode=manual、ない場合は mode=generic にしてください。",
              "score は0〜100で、基準に対する準拠度を表します。根拠が薄い場合はnullにしてください。",
              "改善フレーズは次回商談でそのまま使える自然な日本語にしてください。",
              "情報を捏造せず、日本語で返してください。",
            ].join("\n"),
        },
        {
          role: "user",
          content: [
            contextPrompt ? `以下の基準を使って分析してください。\n\n${contextPrompt}` : "会社固有の基準は未登録です。汎用的な営業観点で分析してください。",
            `以下の商談文字起こしを分析してください。\n\n${transcriptText}`,
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
