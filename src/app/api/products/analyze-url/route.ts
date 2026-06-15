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
      summary: [title, description, plainText.slice(0, 900)].filter(Boolean).join("\n"),
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
