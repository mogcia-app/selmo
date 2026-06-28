import { FieldValue } from "firebase-admin/firestore";

import {
  DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
  DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
  SALES_MONTHLY_AI_USAGE_LIMIT,
} from "@/lib/ai-usage-limit";
import { resolveCompanyId } from "@/lib/firebase/company";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { buildRoleplaySessionDocId } from "@/lib/server/roleplay-cost-control";

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
  const usage = await readMonthlyAiUsageBreakdown(input);
  return usage.meetingUploadCount + usage.roleplayCount;
}

export async function readMonthlyAiUsageBreakdown(input: { userId?: string | null }) {
  if (!input.userId) {
    return { meetingUploadCount: 0, roleplayCount: 0 };
  }

  const db = getFirebaseAdminDb();
  if (!db) {
    return { meetingUploadCount: 0, roleplayCount: 0 };
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const meetingsSnapshot = await db
    .collection("meetings")
    .where("userId", "==", input.userId)
    .get();
  const roleplaySnapshot = await db
    .collection("roleplaySessions")
    .where("userId", "==", input.userId)
    .get();

  const meetingUploadCount = meetingsSnapshot.docs.filter((doc) => {
    const data = doc.data();
    const date = readFirestoreDate(data.createdAt) ?? readFirestoreDate(data.recordedAt);
    return Boolean(date && date >= monthStart);
  }).length;
  const roleplayCount = roleplaySnapshot.docs.filter((doc) => {
    const data = doc.data();
    const date = readFirestoreDate(data.createdAt);
    return Boolean(date && date >= monthStart);
  }).length;

  return { meetingUploadCount, roleplayCount };
}

export async function assertMonthlyAiUsageAvailable(input: {
  userId?: string | null;
  feature?: "meeting" | "roleplay" | "total";
  allowCurrentUsage?: boolean;
  currentRoleplaySessionId?: string | null;
}) {
  const db = getFirebaseAdminDb();
  const usage = await readMonthlyAiUsageBreakdown(input);
  const quota = db && input.userId
    ? await readMonthlyAiUsageQuota({ db, userId: input.userId })
    : { meetingLimit: DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA, roleplayLimit: DEFAULT_MONTHLY_ROLEPLAY_QUOTA, limit: SALES_MONTHLY_AI_USAGE_LIMIT };
  const used = usage.meetingUploadCount + usage.roleplayCount;
  const feature = input.feature ?? "total";
  const currentRoleplaySessionIsCounted = feature === "roleplay" && db && input.userId && input.currentRoleplaySessionId
    ? await isCurrentMonthRoleplaySession({
        db,
        userId: input.userId,
        sessionId: input.currentRoleplaySessionId,
      })
    : false;
  const roleplayUsedForLimit = currentRoleplaySessionIsCounted
    ? Math.max(0, usage.roleplayCount - 1)
    : usage.roleplayCount;
  const featureUsed = feature === "meeting" ? usage.meetingUploadCount : feature === "roleplay" ? roleplayUsedForLimit : used;
  const featureLimit = feature === "meeting" ? quota.meetingLimit : feature === "roleplay" ? quota.roleplayLimit : quota.limit;

  const isOverLimit = featureLimit !== null
    && (input.allowCurrentUsage ? featureUsed > featureLimit : featureUsed >= featureLimit);

  if (isOverLimit) {
    return {
      allowed: false as const,
      used,
      limit: featureLimit,
    };
  }

  return {
    allowed: true as const,
    used,
    limit: featureLimit,
  };
}

async function readMonthlyAiUsageQuota(input: { db: NonNullable<ReturnType<typeof getFirebaseAdminDb>>; userId: string }) {
  const userSnapshot = await input.db.collection("users").doc(input.userId).get();
  const user = userSnapshot.data() ?? {};
  const companyId = typeof user.companyId === "string" ? user.companyId : "";
  if (!companyId) {
    return {
      meetingLimit: DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
      roleplayLimit: DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
      limit: SALES_MONTHLY_AI_USAGE_LIMIT,
    };
  }

  const companySnapshot = await input.db.collection("companies").doc(companyId).get();
  const company = companySnapshot.data() ?? {};
  const transcriptionQuota = readMonthlyQuota(company.monthlyTranscriptionQuota, DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA);
  const roleplayQuota = readMonthlyQuota(company.monthlyRoleplayQuota, DEFAULT_MONTHLY_ROLEPLAY_QUOTA);

  return {
    meetingLimit: transcriptionQuota,
    roleplayLimit: roleplayQuota,
    limit: transcriptionQuota === null || roleplayQuota === null ? null : transcriptionQuota + roleplayQuota,
  };
}

async function isCurrentMonthRoleplaySession(input: {
  db: NonNullable<ReturnType<typeof getFirebaseAdminDb>>;
  userId: string;
  sessionId: string;
}) {
  const sessionSnapshot = await input.db
    .collection("roleplaySessions")
    .doc(buildRoleplaySessionDocId(input.userId, input.sessionId))
    .get();
  const createdAt = readFirestoreDate(sessionSnapshot.data()?.createdAt);

  if (!createdAt) {
    return false;
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return createdAt >= monthStart;
}

function readMonthlyQuota(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (value === null) {
    return null;
  }
  return fallback;
}

function readFirestoreDate(value: unknown) {
  return typeof (value as { toDate?: unknown } | null)?.toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : null;
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
