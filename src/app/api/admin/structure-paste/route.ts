import { NextResponse } from "next/server";

import {
  assertAdminUser,
  handleApiAuthError,
  requireApiUser,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

type StructureKind = "manual" | "product";

type StructuredPaste = {
  title?: string;
  content?: string;
  criteria?: string[];
  requiredQuestions?: string[];
  scoringRules?: string[];
  objectionHandling?: string[];
  closingRules?: string[];
  name?: string;
  description?: string;
  targetCustomer?: string;
  painPoints?: string[];
  valueProposition?: string;
  pricing?: string;
  competitors?: string[];
  commonObjections?: string[];
  faq?: string[];
  successTalk?: string[];
  ngTalk?: string[];
  sourceSummary?: string;
};

export async function POST(request: Request) {
  try {
    const apiUser = await requireApiUser(request);
    assertAdminUser(apiUser);
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) return NextResponse.json(authError.body, { status: authError.status });
    throw error;
  }

  const body = (await request.json().catch(() => null)) as { kind?: unknown; text?: unknown } | null;
  const kind = body?.kind === "manual" || body?.kind === "product" ? body.kind : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!kind) {
    return NextResponse.json({ error: "分類対象が不正です。" }, { status: 400 });
  }

  if (text.length < 20) {
    return NextResponse.json({ error: "貼り付け内容をもう少し入力してください。" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です。" }, { status: 500 });
  }

  try {
    const structured = await structureText(kind, text);
    return NextResponse.json({ structured });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "貼り付け内容の整理に失敗しました。" },
      { status: 500 },
    );
  }
}

async function structureText(kind: StructureKind, text: string): Promise<StructuredPaste> {
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
          name: "structured_admin_paste",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              criteria: { type: "array", items: { type: "string" } },
              requiredQuestions: { type: "array", items: { type: "string" } },
              scoringRules: { type: "array", items: { type: "string" } },
              objectionHandling: { type: "array", items: { type: "string" } },
              closingRules: { type: "array", items: { type: "string" } },
              name: { type: "string" },
              description: { type: "string" },
              targetCustomer: { type: "string" },
              painPoints: { type: "array", items: { type: "string" } },
              valueProposition: { type: "string" },
              pricing: { type: "string" },
              competitors: { type: "array", items: { type: "string" } },
              commonObjections: { type: "array", items: { type: "string" } },
              faq: { type: "array", items: { type: "string" } },
              successTalk: { type: "array", items: { type: "string" } },
              ngTalk: { type: "array", items: { type: "string" } },
              sourceSummary: { type: "string" },
            },
            required: [
              "title",
              "content",
              "criteria",
              "requiredQuestions",
              "scoringRules",
              "objectionHandling",
              "closingRules",
              "name",
              "description",
              "targetCustomer",
              "painPoints",
              "valueProposition",
              "pricing",
              "competitors",
              "commonObjections",
              "faq",
              "successTalk",
              "ngTalk",
              "sourceSummary",
            ],
          },
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "あなたは営業組織向けSaaSの管理画面で使う情報整理アシスタントです。",
            "貼り付けられた長文を、指定されたフォーム項目へ自然に分類してください。",
            "本文にない内容は推測しすぎず、空文字または空配列にしてください。",
            "各配列は短く実務で使える粒度に分割してください。",
            "日本語で返してください。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `分類対象: ${kind === "manual" ? "営業マニュアル" : "商材情報"}`,
            kind === "manual"
              ? "営業マニュアルの場合は title/content/criteria/requiredQuestions/scoringRules/objectionHandling/closingRules を重点的に埋めてください。商材用フィールドは空で構いません。"
              : "商材情報の場合は name/description/targetCustomer/painPoints/valueProposition/pricing/competitors/commonObjections/faq/successTalk/ngTalk/sourceSummary を重点的に埋めてください。FAQは質問と回答が分かる短い1行に整理してください。マニュアル用フィールドは空で構いません。",
            "貼り付け本文:",
            text.slice(0, 16000),
          ].join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("AIによる整理に失敗しました。時間を置いて再度お試しください。");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AIの整理結果を取得できませんでした。");
  }

  return normalizeStructuredPaste(JSON.parse(content) as StructuredPaste);
}

function normalizeStructuredPaste(value: StructuredPaste): StructuredPaste {
  return {
    title: readString(value.title),
    content: readString(value.content),
    criteria: readStringArray(value.criteria),
    requiredQuestions: readStringArray(value.requiredQuestions),
    scoringRules: readStringArray(value.scoringRules),
    objectionHandling: readStringArray(value.objectionHandling),
    closingRules: readStringArray(value.closingRules),
    name: readString(value.name),
    description: readString(value.description),
    targetCustomer: readString(value.targetCustomer),
    painPoints: readStringArray(value.painPoints),
    valueProposition: readString(value.valueProposition),
    pricing: readString(value.pricing),
    competitors: readStringArray(value.competitors),
    commonObjections: readStringArray(value.commonObjections),
    faq: readStringArray(value.faq),
    successTalk: readStringArray(value.successTalk),
    ngTalk: readStringArray(value.ngTalk),
    sourceSummary: readString(value.sourceSummary),
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, 24)
    : [];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
