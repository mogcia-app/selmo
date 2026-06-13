import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";

export const runtime = "nodejs";

const remoteFetchTimeoutMs = 60 * 1000;
const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

type DashboardActionItem = {
  label: string;
  value: string;
};

type DashboardActionCard = {
  label: "Observe" | "Orient" | "Decide" | "Act";
  badge: string;
  title: string;
  description: string;
  items: DashboardActionItem[];
  actions?: Array<{ label: string; href: string; primary?: boolean }>;
};

type RequestBody = {
  salesDomain?: "meeting" | "teleapo";
  unitLabel?: string;
  context?: unknown;
  fallbackCards?: DashboardActionCard[];
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const salesDomain = body?.salesDomain === "teleapo" ? "teleapo" : "meeting";
  const fallbackCards = normalizeCards(body?.fallbackCards);

  if (!token) {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。" }, { status: 401 });
  }

  const auth = getFirebaseAdminAuth();
  const db = getFirebaseAdminDb();

  if (!auth || !db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  let userId: string | null = null;
  let companyId: string | null = null;

  try {
    const decodedToken = await auth.verifyIdToken(token);
    userId = decodedToken.uid;
    const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();

    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません。" }, { status: 404 });
    }

    const user = userSnapshot.data() as { companyId?: string; status?: string; role?: string };
    companyId = typeof user.companyId === "string" ? user.companyId : null;

    if (user.status === "inactive") {
      return NextResponse.json({ error: "無効なユーザーです。" }, { status: 403 });
    }

    if (!companyId) {
      return NextResponse.json({ error: "会社情報が見つかりません。" }, { status: 400 });
    }

    const dateKey = getJapanDateKey();
    const insightRef = db.collection("salesDashboardActionInsights").doc(`${decodedToken.uid}_${salesDomain}_${dateKey}`);
    const cachedSnapshot = await insightRef.get();

    if (cachedSnapshot.exists) {
      const cached = cachedSnapshot.data() as { cards?: unknown; model?: string; generatedAt?: unknown };
      const cards = normalizeCards(cached.cards);

      if (cards.length === 4) {
        return NextResponse.json({
          source: "cache",
          model: cached.model ?? model,
          dateKey,
          cards,
        });
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY が未設定です。" }, { status: 503 });
    }

    const generated = await generateDashboardActions({
      unitLabel: body?.unitLabel ?? (salesDomain === "teleapo" ? "テレアポ" : "商談"),
      context: body?.context ?? {},
      fallbackCards,
    });

    await insightRef.set(
      {
        companyId,
        userId: decodedToken.uid,
        salesDomain,
        dateKey,
        model,
        cards: generated.cards,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
        generatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await saveAiUsageLog({
      companyId,
      userId: decodedToken.uid,
      feature: "dashboard_action",
      model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      estimatedCostUsd: estimateChatCostUsd({
        model,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
      }),
      status: "success",
    });

    return NextResponse.json({
      source: "openai",
      model,
      dateKey,
      cards: generated.cards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "営業アクションの生成に失敗しました。";
    await saveAiUsageLog({
      companyId,
      userId,
      feature: "dashboard_action",
      model,
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId,
      userId,
      kind: "OpenAI",
      message,
      severity: "warning",
      source: "api/sales/dashboard-actions",
    });

    return NextResponse.json(
      {
        error: "営業アクションの生成に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
}

async function generateDashboardActions(input: {
  unitLabel: string;
  context: unknown;
  fallbackCards: DashboardActionCard[];
}) {
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
          name: "sales_dashboard_actions",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              cards: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string", enum: ["Observe", "Orient", "Decide", "Act"] },
                    badge: { type: "string", enum: ["01", "02", "03", "04"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    items: {
                      type: "array",
                      minItems: 3,
                      maxItems: 6,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          label: { type: "string" },
                          value: { type: "string" },
                        },
                        required: ["label", "value"],
                      },
                    },
                    actions: {
                      type: "array",
                      minItems: 0,
                      maxItems: 3,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          label: { type: "string" },
                          href: { type: "string" },
                          primary: { type: "boolean" },
                        },
                        required: ["label", "href", "primary"],
                      },
                    },
                  },
                  required: ["label", "badge", "title", "description", "items", "actions"],
                },
              },
            },
            required: ["cards"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "営業担当者向けダッシュボードに表示する集計カードを日本語で短く作ります。新しい事実を捏造せず、入力データに基づくラベルと値だけを返してください。誇張した表現、励まし、断定的な助言は避けてください。カードタイトルは必ず 活動状況 / 商談の傾向 / 改善テーマ / やること を使ってください。やることカードには必ずactionsを3件入れてください。",
        },
        {
          role: "user",
          content: JSON.stringify({
            unitLabel: input.unitLabel,
            context: input.context,
            fallbackCards: input.fallbackCards,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "OpenAI API request failed");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI response is empty");
  }

  const parsed = JSON.parse(content) as { cards?: unknown };
  const cards = normalizeCards(parsed.cards);

  if (cards.length !== 4) {
    throw new Error("AI生成結果の形式が不正です。");
  }

  return {
    cards,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
    },
  };
}

function normalizeCards(value: unknown): DashboardActionCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cards: DashboardActionCard[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const label = normalizeLabel(record.label);
    const badge = typeof record.badge === "string" ? record.badge : labelToBadge(label);
    const title = typeof record.title === "string" ? record.title : labelToTitle(label);
    const description = typeof record.description === "string" ? record.description : "";
    const items = Array.isArray(record.items)
      ? record.items
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const itemRecord = entry as Record<string, unknown>;
            return {
              label: String(itemRecord.label ?? "").slice(0, 24),
              value: String(itemRecord.value ?? "").slice(0, 80),
            };
          })
          .filter((entry): entry is DashboardActionItem => Boolean(entry?.label && entry.value))
          .slice(0, 6)
      : [];
    const actions = Array.isArray(record.actions)
      ? record.actions
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const actionRecord = entry as Record<string, unknown>;
            return {
              label: String(actionRecord.label ?? "").slice(0, 24),
              href: String(actionRecord.href ?? ""),
              primary: Boolean(actionRecord.primary),
            };
          })
          .filter((entry): entry is { label: string; href: string; primary: boolean } => Boolean(entry?.label && entry.href.startsWith("/")))
          .slice(0, 3)
      : [];

    if (!label || items.length === 0) {
      continue;
    }

    cards.push({
      label,
      badge,
      title,
      description,
      items,
      actions,
    });
  }

  return cards;
}

function normalizeLabel(value: unknown): DashboardActionCard["label"] | null {
  if (value === "Observe" || value === "Orient" || value === "Decide" || value === "Act") {
    return value;
  }

  return null;
}

function labelToBadge(label: DashboardActionCard["label"] | null) {
  if (label === "Observe") return "01";
  if (label === "Orient") return "02";
  if (label === "Decide") return "03";
  return "04";
}

function labelToTitle(label: DashboardActionCard["label"] | null) {
  if (label === "Observe") return "活動状況";
  if (label === "Orient") return "商談の傾向";
  if (label === "Decide") return "改善テーマ";
  return "やること";
}

function getJapanDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteFetchTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
