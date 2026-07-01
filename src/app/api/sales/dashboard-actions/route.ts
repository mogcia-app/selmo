import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  assertSalesDomainAccess,
  assertSalesUser,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";
import {
  assertMonthlyAiUsageAvailable,
  estimateChatCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";

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
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const salesDomain = body?.salesDomain === "teleapo" ? "teleapo" : "meeting";
  const fallbackCards = normalizeCards(body?.fallbackCards);

  const db = getFirebaseAdminDb();

  if (!db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  let apiUser: ApiUserContext | null = null;

  try {
    apiUser = await requireApiUser(request);
    assertSalesUser(apiUser);
    assertSalesDomainAccess(apiUser, salesDomain);
    const usageAvailability = await assertMonthlyAiUsageAvailable({
      userId: apiUser.uid,
      feature: "total",
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

    const dateKey = getJapanDateKey();
    const insightRef = db.collection("salesDashboardActionInsights").doc(`${apiUser.uid}_${salesDomain}_${dateKey}`);
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
        companyId: apiUser.companyId,
        userId: apiUser.uid,
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
      companyId: apiUser.companyId,
      userId: apiUser.uid,
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
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "営業アクションの生成に失敗しました。";
    await saveAiUsageLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      feature: "dashboard_action",
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
