import { FieldValue } from "firebase-admin/firestore";

import { SALES_MONTHLY_AI_USAGE_LIMIT, isSalesMonthlyAiUsageFeature } from "@/lib/ai-usage-limit";
import { resolveCompanyId } from "@/lib/firebase/company";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type AiUsageFeature =
  | "transcription"
  | "summary"
  | "analysis"
  | "roleplay"
  | "knowledge_search"
  | "dashboard_action";

export async function saveAiUsageLog(input: {
  companyId?: string | null;
  userId?: string | null;
  feature: AiUsageFeature;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  audioDurationSec?: number | null;
  estimatedCostUsd?: number | null;
  status: "success" | "failed";
  errorMessage?: string | null;
}) {
  await writeOperationalLog("aiUsageLogs", {
    companyId: resolveCompanyId(input.companyId),
    userId: input.userId ?? "unknown",
    feature: input.feature,
    model: input.model,
    ...(input.inputTokens != null ? { inputTokens: input.inputTokens } : {}),
    ...(input.outputTokens != null ? { outputTokens: input.outputTokens } : {}),
    ...(input.audioDurationSec != null ? { audioDurationSec: input.audioDurationSec } : {}),
    ...(input.estimatedCostUsd != null ? { estimatedCostUsd: input.estimatedCostUsd } : {}),
    createdAt: FieldValue.serverTimestamp(),
    status: input.status,
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  });
}

export async function readMonthlyAiUsageCount(input: { userId?: string | null }) {
  if (!input.userId) {
    return 0;
  }

  const db = getFirebaseAdminDb();
  if (!db) {
    return 0;
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const usageSnapshot = await db
    .collection("aiUsageLogs")
    .where("userId", "==", input.userId)
    .where("status", "==", "success")
    .get();
  const roleplaySnapshot = await db
    .collection("roleplayResults")
    .where("userId", "==", input.userId)
    .get();

  const meetingAnalysisCount = usageSnapshot.docs.filter((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt;
    const date = typeof createdAt?.toDate === "function" ? createdAt.toDate() as Date : null;
    const feature = typeof data.feature === "string" ? data.feature : null;
    return Boolean(date && date >= monthStart && isSalesMonthlyAiUsageFeature(feature));
  }).length;
  const roleplayCount = roleplaySnapshot.docs.filter((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt;
    const date = typeof createdAt?.toDate === "function" ? createdAt.toDate() as Date : null;
    return Boolean(date && date >= monthStart);
  }).length;

  return meetingAnalysisCount + roleplayCount;
}

export async function assertMonthlyAiUsageAvailable(input: { userId?: string | null }) {
  const used = await readMonthlyAiUsageCount(input);
  if (used >= SALES_MONTHLY_AI_USAGE_LIMIT) {
    return {
      allowed: false as const,
      used,
      limit: SALES_MONTHLY_AI_USAGE_LIMIT,
    };
  }

  return {
    allowed: true as const,
    used,
    limit: SALES_MONTHLY_AI_USAGE_LIMIT,
  };
}

export async function saveSystemErrorLog(input: {
  companyId?: string | null;
  userId?: string | null;
  kind: "OpenAI" | "Firebase" | "Storage" | "Cloud Run" | "Auth" | "API";
  message: string;
  severity: "info" | "warning" | "critical";
  source?: string;
}) {
  await writeOperationalLog("systemErrors", {
    ...(input.companyId !== undefined ? { companyId: resolveCompanyId(input.companyId) } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    kind: input.kind,
    message: input.message,
    severity: input.severity,
    status: "open",
    occurredAt: FieldValue.serverTimestamp(),
    ...(input.source ? { source: input.source } : {}),
  });
}

export function estimateChatCostUsd(input: {
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}) {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const rate = getChatModelRate(input.model);

  if (!rate) {
    return null;
  }

  return (inputTokens / 1_000_000) * rate.inputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * rate.outputUsdPerMillionTokens;
}

export function estimateTranscriptionCostUsd(input: {
  model: string;
  audioDurationSec?: number | null;
}) {
  const minutes = (input.audioDurationSec ?? 0) / 60;

  if (minutes <= 0) {
    return null;
  }

  if (input.model === "gpt-4o-mini-transcribe") {
    return minutes * 0.003;
  }

  return null;
}

async function writeOperationalLog(collectionName: string, payload: Record<string, unknown>) {
  try {
    const db = getFirebaseAdminDb();
    if (!db) {
      return;
    }

    await db.collection(collectionName).add(payload);
  } catch {
    // Operational logging must never break the product workflow.
  }
}

function getChatModelRate(model: string) {
  if (model === "gpt-4o-mini") {
    return {
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.6,
    };
  }

  if (model === "gpt-4o") {
    return {
      inputUsdPerMillionTokens: 2.5,
      outputUsdPerMillionTokens: 10,
    };
  }

  return null;
}
