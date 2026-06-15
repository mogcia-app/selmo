import { NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  assertMeetingAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 10 * 60 * 1000;
const maxSegmentsPerBatch = 36;

type RequestBody = {
  transcriptText?: string | null;
  segments?: Array<{ startSec: number; endSec: number; text: string }>;
};

type ConversationLog = {
  id: string;
  speaker: "speaker_1" | "speaker_2";
  label: string;
  text: string;
  sourceSegmentIndexes: number[];
  confidence: "estimated" | "aligned";
};

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> },
) {
  let body: RequestBody | null = null;
  let apiUser: ApiUserContext | null = null;
  const model = "gpt-4o-mini";

  try {
    apiUser = await requireApiUser(request);
    const { meetingId } = await context.params;
    await assertMeetingAccess(apiUser, meetingId);

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

    const segments = Array.isArray(body.segments)
      ? body.segments.filter(
          (segment) =>
            segment &&
            typeof segment.startSec === "number" &&
            typeof segment.endSec === "number" &&
            typeof segment.text === "string",
        )
      : [];

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "会話ログ化に使えるセグメントがありません。" },
        { status: 400 },
      );
    }

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

    const result = await buildConversationLogs({
      transcriptText: body.transcriptText ?? null,
      segments,
    });
    await saveAiUsageLog({
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      feature: "analysis",
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
      meetingId,
      model,
      logCount: result.logs.length,
      logs: result.logs,
    });
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message =
      error instanceof Error ? error.message : "会話ログ生成に失敗しました。";
    await saveAiUsageLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      feature: "analysis",
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
      source: "api/meetings/conversation-logs",
    });

    return NextResponse.json(
      {
        error: "会話ログ生成に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
}

async function buildConversationLogs({
  transcriptText,
  segments,
}: {
  transcriptText: string | null;
  segments: Array<{ startSec: number; endSec: number; text: string }>;
}) {
  const batches = chunkSegments(segments, maxSegmentsPerBatch);
  const logs: ConversationLog[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let logCounter = 0;

  for (const batch of batches) {
    const batchLogs = await buildConversationLogBatch({
      transcriptText,
      segments: batch.segments,
      baseIndex: batch.baseIndex,
    });

    inputTokens += batchLogs.usage.inputTokens ?? 0;
    outputTokens += batchLogs.usage.outputTokens ?? 0;

    for (const log of batchLogs.logs) {
      logCounter += 1;
      logs.push({
        ...log,
        id: `log_${String(logCounter).padStart(3, "0")}`,
      });
    }
  }

  if (logs.length === 0) {
    throw new Error("会話ログを生成できませんでした。");
  }

  return {
    logs: mergeAdjacentConversationLogs(logs),
    usage: {
      inputTokens: inputTokens || null,
      outputTokens: outputTokens || null,
    },
  };
}

async function buildConversationLogBatch({
  transcriptText,
  segments,
  baseIndex,
}: {
  transcriptText: string | null;
  segments: Array<{ startSec: number; endSec: number; text: string }>;
  baseIndex: number;
}) {
  const prompt = [
    "あなたは日本語の営業商談文字起こしを、読みやすい会話ログに整形する編集者です。",
    "入力は Whisper 由来の短いセグメント列です。",
    "目的は、話者1 / 話者2 の交互ができるだけ自然に読める会話ログを作ることです。",
    "厳密な話者識別よりも、読みやすい会話の流れを優先してください。",
    "次のルールを守ってください。",
    "1. 出力は JSON のみ。",
    "2. logs 配列を返す。",
    "3. speaker は speaker_1 または speaker_2。",
    "4. label は 話者1 または 話者2。",
    "5. text は読みやすい日本語に軽く整える。ただし意味を足しすぎない。",
    "6. 明らかな重複やノイズだけ除去してよい。",
    "7. 連続する同一話者の短い発話はまとめてよい。",
    "8. sourceSegmentIndexes には元セグメントの index を配列で入れる。",
    "9. confidence は estimated を入れる。",
    "10. sourceSegmentIndexes には、入力の index をそのまま使う。",
  ].join("\n");

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            transcriptText,
            segments: segments.map((segment, index) => ({
              index: baseIndex + index,
              startSec: segment.startSec,
              endSec: segment.endSec,
              text: segment.text,
            })),
          }),
        },
      ],
    }),
    timeoutMs: remoteFetchTimeoutMs,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      mapOpenAiErrorMessage(
        responseText || response.statusText || "OpenAI がエラーを返しました。",
      ),
    );
  }

  let payload: unknown;
  let usage: { inputTokens: number | null; outputTokens: number | null } = {
    inputTokens: null,
    outputTokens: null,
  };
  try {
    const parsed = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };
    usage = {
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
    };
    payload = JSON.parse(parsed.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("会話ログ生成レスポンスの解析に失敗しました。");
  }

  const logs = Array.isArray((payload as { logs?: unknown }).logs)
    ? ((payload as { logs: unknown[] }).logs
        .map<ConversationLog | null>((log, index) => {
          if (!log || typeof log !== "object") {
            return null;
          }

          const speaker = (log as { speaker?: unknown }).speaker;
          const label = (log as { label?: unknown }).label;
          const text = (log as { text?: unknown }).text;
          const sourceSegmentIndexes = (log as { sourceSegmentIndexes?: unknown }).sourceSegmentIndexes;

          if (
            (speaker !== "speaker_1" && speaker !== "speaker_2") ||
            typeof label !== "string" ||
            typeof text !== "string" ||
            !Array.isArray(sourceSegmentIndexes)
          ) {
            return null;
          }

          const indexes = sourceSegmentIndexes.filter(
            (value): value is number => typeof value === "number",
          );

          return {
            id: `log_${String(index + 1).padStart(3, "0")}`,
            speaker,
            label,
            text: text.trim(),
            sourceSegmentIndexes: indexes,
            confidence: "estimated",
          };
        })
        .filter((log): log is ConversationLog => Boolean(log)))
    : [];

  return {
    logs,
    usage,
  };
}

function chunkSegments(
  segments: Array<{ startSec: number; endSec: number; text: string }>,
  maxPerBatch: number,
) {
  const chunks: Array<{
    baseIndex: number;
    segments: Array<{ startSec: number; endSec: number; text: string }>;
  }> = [];

  for (let index = 0; index < segments.length; index += maxPerBatch) {
    chunks.push({
      baseIndex: index,
      segments: segments.slice(index, index + maxPerBatch),
    });
  }

  return chunks;
}

function mergeAdjacentConversationLogs(logs: ConversationLog[]) {
  if (logs.length === 0) {
    return logs;
  }

  const merged: ConversationLog[] = [];

  for (const log of logs) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      previous.speaker === log.speaker &&
      previous.sourceSegmentIndexes[previous.sourceSegmentIndexes.length - 1] + 1 >=
        log.sourceSegmentIndexes[0]
    ) {
      previous.text = `${previous.text}\n${log.text}`.trim();
      previous.sourceSegmentIndexes = [
        ...previous.sourceSegmentIndexes,
        ...log.sourceSegmentIndexes,
      ];
      continue;
    }

    merged.push({ ...log, sourceSegmentIndexes: [...log.sourceSegmentIndexes] });
  }

  return merged;
}

function mapOpenAiErrorMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { message?: string; code?: string | null; type?: string | null };
    };
    const code = parsed.error?.code ?? parsed.error?.type ?? null;

    if (code === "insufficient_quota") {
      return "OpenAI API の利用枠が不足しているため会話ログを生成できません。Billing / quota を確認してください。";
    }

    if (code === "invalid_api_key") {
      return "OpenAI API キーが無効です。.env.local の OPENAI_API_KEY を確認してください。";
    }

    if (code === "rate_limit_exceeded") {
      return "OpenAI API のレート制限に達しました。少し待ってから再度お試しください。";
    }

    if (parsed.error?.message) {
      return `OpenAI API で会話ログ生成に失敗しました。${parsed.error.message}`;
    }
  } catch {
    // noop
  }

  return `OpenAI API で会話ログ生成に失敗しました。${rawMessage}`;
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
      throw new Error("OpenAI の会話ログ生成がタイムアウトしました。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
