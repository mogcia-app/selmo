import { NextResponse } from "next/server";

import {
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import {
  assertSalesDomainAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 60 * 1000;

type KnowledgeSearchSource = {
  id: string;
  title: string;
  kind: string;
  scope: string;
  snippets: string[];
};

type RequestBody = {
  query?: string;
  sources?: KnowledgeSearchSource[];
};

type KnowledgeSearchAnswer = {
  overview: string;
  bullets: string[];
  followUps: string[];
};

export async function POST(request: Request) {
  let body: RequestBody | null = null;
  let apiUser: ApiUserContext | null = null;
  const model = "gpt-4o-mini";

  try {
    apiUser = await requireApiUser(request);
    assertSalesDomainAccess(apiUser, "meeting");

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 503 },
      );
    }

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
    }

    const query = body.query?.trim();
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 8) : [];

    if (!query) {
      return NextResponse.json({ error: "検索キーワードがありません。" }, { status: 400 });
    }

    if (sources.length === 0) {
      return NextResponse.json({ error: "回答に使えるナレッジがありません。" }, { status: 400 });
    }

    const result = await generateKnowledgeSearchAnswer(query, sources);
    await saveAiUsageLog({
      companyId: apiUser.companyId,
      userId: apiUser.uid,
      feature: "knowledge_search",
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
      answer: result.answer,
    });
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "AI回答の生成に失敗しました。";
    await saveAiUsageLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      feature: "knowledge_search",
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
      source: "api/knowledge/search-answer",
    });

    return NextResponse.json(
      {
        error: "AI回答の生成に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
}

async function generateKnowledgeSearchAnswer(query: string, sources: KnowledgeSearchSource[]) {
  const model = "gpt-4o-mini";
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
          name: "knowledge_search_answer",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              overview: { type: "string" },
              bullets: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 5,
              },
              followUps: {
                type: "array",
                items: { type: "string" },
                minItems: 0,
                maxItems: 3,
              },
            },
            required: ["overview", "bullets", "followUps"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "あなたは営業ナレッジ検索の回答アシスタントです。与えられたナレッジ抜粋だけを根拠に、日本語で簡潔に回答してください。根拠にない情報は推測せず、必要なら「登録済みナレッジでは確認できません」と明記してください。",
        },
        {
          role: "user",
          content: [
            `検索キーワード: ${query}`,
            "ナレッジ抜粋:",
            ...sources.map((source, index) =>
              [
                `【${index + 1}】${source.title} / ${source.kind} / ${source.scope}`,
                ...source.snippets.map((snippet) => `- ${snippet}`),
              ].join("\n"),
            ),
          ].join("\n\n"),
        },
      ],
      temperature: 0.2,
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
    throw new Error("OpenAI のAI回答レスポンス解析に失敗しました。");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI からAI回答本文が返りませんでした。");
  }

  let answer: KnowledgeSearchAnswer;
  try {
    answer = JSON.parse(content) as KnowledgeSearchAnswer;
  } catch {
    throw new Error("AI回答JSONの解析に失敗しました。");
  }

  return {
    answer: {
      overview: answer.overview?.trim() || "回答を生成できませんでした。",
      bullets: Array.isArray(answer.bullets)
        ? answer.bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 5)
        : [],
      followUps: Array.isArray(answer.followUps)
        ? answer.followUps.map((question) => question.trim()).filter(Boolean).slice(0, 3)
        : [],
    },
    usage: {
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
    },
  };
}

function mapOpenAiErrorMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { message?: string; code?: string | null; type?: string | null };
    };
    const code = parsed.error?.code ?? parsed.error?.type ?? null;

    if (code === "insufficient_quota") {
      return "OpenAI API の利用枠が不足しているためAI回答を生成できません。Billing / quota を確認してください。";
    }

    if (code === "invalid_api_key") {
      return "OpenAI API キーが無効です。.env.local の OPENAI_API_KEY を確認してください。";
    }

    if (code === "rate_limit_exceeded") {
      return "OpenAI API のレート制限に達しました。少し待ってから再度お試しください。";
    }

    if (parsed.error?.message) {
      return `OpenAI API でAI回答生成に失敗しました。${parsed.error.message}`;
    }
  } catch {
    // noop
  }

  return `OpenAI API でAI回答生成に失敗しました。${rawMessage}`;
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
      throw new Error("OpenAI のAI回答生成がタイムアウトしました。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
