import { NextResponse } from "next/server";

import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import {
  assertMeetingAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 10 * 60 * 1000;

type RequestBody = {
  transcriptText?: string | null;
};

type SplitLog = {
  speaker?: "sales" | "customer" | "participant" | "unknown";
  text?: string;
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
      return NextResponse.json({ error: "OPENAI_API_KEY が未設定です。" }, { status: 500 });
    }

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
    }

    const transcriptText = body.transcriptText?.trim() ?? "";
    if (!transcriptText) {
      return NextResponse.json({ error: "分割対象の文字起こし本文がありません。" }, { status: 400 });
    }

    const usageAvailability = await assertMonthlyAiUsageAvailable({
      userId: apiUser.uid,
      feature: "meeting",
      allowCurrentUsage: true,
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
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "あなたは日本語の営業商談文字起こしを、編集しやすい会話ブロックに分割する専門家です。",
              "大きな文字起こしブロックを、質問・回答・反論・説明など自然な会話単位に分けてください。",
              "意味を足さず、言い換えすぎず、明らかなノイズや重複だけを除去してください。",
              "speaker は推定でよいので sales, customer, participant, unknown のいずれかにしてください。自信がない場合は unknown にしてください。",
              "出力は JSON のみ。logs 配列だけを返してください。",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              meetingId,
              transcriptText,
              outputShape: [{ speaker: "unknown", text: "..." }],
            }),
          },
        ],
      }),
      timeoutMs: remoteFetchTimeoutMs,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(mapOpenAiErrorMessage(responseText || response.statusText));
    }

    const parsed = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const payload = JSON.parse(parsed.choices?.[0]?.message?.content || "{}") as { logs?: SplitLog[] };
    const logs = Array.isArray(payload.logs)
      ? payload.logs
          .map((log) => ({
            speaker: normalizeSpeaker(log.speaker),
            text: typeof log.text === "string" ? log.text.trim() : "",
          }))
          .filter((log) => log.text)
          .slice(0, 400)
      : [];

    await saveAiUsageLog({
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      feature: "analysis",
      model,
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
      estimatedCostUsd: estimateChatCostUsd({
        model,
        inputTokens: parsed.usage?.prompt_tokens ?? null,
        outputTokens: parsed.usage?.completion_tokens ?? null,
      }),
      status: "success",
    });

    return NextResponse.json({ meetingId, model, logs });
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "AI会話分割に失敗しました。";
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
      source: "api/meetings/conversation-split",
    });

    return NextResponse.json({ error: "AI会話分割に失敗しました。", detail: message }, { status: 500 });
  }
}

function normalizeSpeaker(value: unknown): "sales" | "customer" | "participant" | "unknown" {
  return value === "sales" || value === "customer" || value === "participant" ? value : "unknown";
}

function mapOpenAiErrorMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return `OpenAI API でAI会話分割に失敗しました。${parsed.error.message}`;
    }
  } catch {
    // noop
  }

  return `OpenAI API でAI会話分割に失敗しました。${rawMessage}`;
}

async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit & { timeoutMs?: number },
) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? remoteFetchTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI のAI会話分割がタイムアウトしました。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
