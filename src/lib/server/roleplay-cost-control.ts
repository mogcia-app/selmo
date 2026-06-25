import { createHash } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const ROLEPLAY_MIN_UTTERANCE_SEC = 2;
export const ROLEPLAY_MAX_UTTERANCE_SEC = 60;
export const ROLEPLAY_MAX_SESSION_AUDIO_SEC = 10 * 60;
export const ROLEPLAY_MAX_AI_RESPONSES = 12;

type RoleplaySessionUsage = {
  sessionId: string;
  companyId?: string | null;
  userId: string;
  scenarioId?: string | null;
  roleplayType?: string | null;
  audioDurationSec?: number | null;
  aiResponseCount?: number | null;
};

export class RoleplayLimitError extends Error {
  status = 429;

  constructor(message: string) {
    super(message);
    this.name = "RoleplayLimitError";
  }
}

export function normalizeRoleplaySessionId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

export function hashRoleplayPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function reserveRoleplayAudioUsage(input: RoleplaySessionUsage & { durationSec: number }) {
  if (input.durationSec < ROLEPLAY_MIN_UTTERANCE_SEC) {
    throw new RoleplayLimitError(`録音が短すぎます。${ROLEPLAY_MIN_UTTERANCE_SEC}秒以上話してから送信してください。`);
  }

  if (input.durationSec > ROLEPLAY_MAX_UTTERANCE_SEC) {
    throw new RoleplayLimitError(`1回の録音は${ROLEPLAY_MAX_UTTERANCE_SEC}秒以内にしてください。`);
  }

  const db = getFirebaseAdminDb();
  if (!db) return;

  const ref = db.collection("roleplaySessions").doc(buildRoleplaySessionDocId(input.userId, input.sessionId));

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentDuration = readPositiveNumber(snapshot.data()?.audioDurationSec);
    const nextDuration = currentDuration + input.durationSec;

    if (nextDuration > ROLEPLAY_MAX_SESSION_AUDIO_SEC) {
      throw new RoleplayLimitError("このロープレの録音上限に達しました。終了して採点してください。");
    }

    transaction.set(
      ref,
      {
        companyId: input.companyId ?? null,
        userId: input.userId,
        sessionId: input.sessionId,
        scenarioId: input.scenarioId ?? null,
        roleplayType: input.roleplayType ?? null,
        audioDurationSec: nextDuration,
        transcriptionCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
  });
}

export async function reserveRoleplayAiResponse(input: RoleplaySessionUsage) {
  const db = getFirebaseAdminDb();
  if (!db) return;

  const ref = db.collection("roleplaySessions").doc(buildRoleplaySessionDocId(input.userId, input.sessionId));

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentCount = readPositiveNumber(snapshot.data()?.aiResponseCount);

    if (currentCount >= ROLEPLAY_MAX_AI_RESPONSES) {
      throw new RoleplayLimitError("このロープレのAI応答上限に達しました。終了して採点してください。");
    }

    transaction.set(
      ref,
      {
        companyId: input.companyId ?? null,
        userId: input.userId,
        sessionId: input.sessionId,
        scenarioId: input.scenarioId ?? null,
        roleplayType: input.roleplayType ?? null,
        aiResponseCount: currentCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
  });
}

export function buildRoleplaySessionDocId(userId: string, sessionId: string) {
  return `${userId}_${sessionId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

function readPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
