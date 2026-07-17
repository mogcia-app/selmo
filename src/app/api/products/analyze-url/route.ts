import { NextResponse } from "next/server";

import {
  assertAdminUser,
  handleApiAuthError,
  requireApiUser,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const apiUser = await requireApiUser(request);
    assertAdminUser(apiUser);
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) return NextResponse.json(authError.body, { status: authError.status });
    throw error;
  }

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "URLが不正です。" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "selmo-product-analyzer/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "URLの読み込みに失敗しました。" }, { status: 400 });
    }

    const html = await response.text();
    const title = decodeHtml(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "");
    const description = decodeHtml(
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        "",
    );
    const plainText = decodeHtml(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    return NextResponse.json({
      summary: buildUrlAnalysisSummary({ title, description, plainText }),
    });
  } catch {
    return NextResponse.json({ error: "URLの解析に失敗しました。" }, { status: 500 });
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .trim();
}

function buildUrlAnalysisSummary(input: { title: string; description: string; plainText: string }) {
  const title = normalizeUrlText(input.title);
  const description = normalizeUrlText(input.description);
  const sentences = extractSummarySentences(input.plainText)
    .filter((sentence) => sentence !== title && sentence !== description)
    .slice(0, 4);
  const lines = [
    title,
    description,
    sentences.length > 0 ? `要点: ${sentences.join(" / ")}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function extractSummarySentences(text: string) {
  const normalized = normalizeUrlText(text);
  if (!normalized) return [];

  const rawSentences = normalized.match(/[^。！？!?]+[。！？!?]?/g) ?? [normalized];
  const seen = new Set<string>();
  const sentences: string[] = [];

  for (const rawSentence of rawSentences) {
    const sentence = normalizeUrlText(rawSentence);
    const comparable = sentence.replace(/\s/g, "");
    if (
      !sentence ||
      seen.has(comparable) ||
      sentence.length < 18 ||
      isNavigationLikeText(sentence)
    ) {
      continue;
    }

    seen.add(comparable);
    sentences.push(sentence);
  }

  return sentences;
}

function normalizeUrlText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([。！？!?、,.])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .trim();
}

function isNavigationLikeText(value: string) {
  const navigationWords = [
    "FAQ",
    "お問い合わせ",
    "料金",
    "コンテンツ",
    "仕組み",
    "STEP",
  ];
  const hitCount = navigationWords.filter((word) => value.includes(word)).length;
  const numberedMenuCount = (value.match(/\b0[1-9]\b/g) ?? []).length;

  return hitCount >= 3 || numberedMenuCount >= 4;
}
