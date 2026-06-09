import { NextResponse } from "next/server";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 10 * 60 * 1000;

type RequestBody = {
  transcriptText?: string;
};

type SummaryResponse = {
  overview: string;
  bullets: string[];
};

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> },
) {
  try {
    await context.params;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 },
      );
    }

    let body: RequestBody;

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

    const summary = await summarizeTranscript(body.transcriptText);

    return NextResponse.json({
      model: "gpt-4o-mini",
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI要約の生成に失敗しました。";

    return NextResponse.json(
      {
        error: "AI要約の生成に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
}

async function summarizeTranscript(transcriptText: string) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
            },
            required: ["overview", "bullets"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "あなたは営業商談の文字起こしを要約するアシスタントです。全体の要約は2〜4文で簡潔にまとめ、ポイントは3〜4個の短い箇条書き向け文で返してください。情報を捏造せず、日本語で返してください。",
        },
        {
          role: "user",
          content: `以下の商談文字起こしを要約してください。\n\n${transcriptText}`,
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
    overview: summary.overview?.trim() || "要約を生成できませんでした。",
    bullets: Array.isArray(summary.bullets)
      ? summary.bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 4)
      : [],
  };
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
