"use client";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { resolveCompanyId } from "@/lib/firebase/company";
import { assertFirebaseClient } from "@/lib/firebase/client";
import { saveSalesActivityEvent } from "@/lib/firebase/activity";

export type KnowledgeSearchEventInput = {
  companyId?: string | null;
  userId: string;
  query: string;
  resultCount: number;
  usedAi: boolean;
};

export type SystemErrorInput = {
  companyId?: string | null;
  userId?: string | null;
  kind: "OpenAI" | "Firebase" | "Storage" | "Cloud Run" | "Auth" | "API";
  message: string;
  severity: "info" | "warning" | "critical";
  source?: string;
};

export type AudioProcessingJobStatus =
  | "waiting"
  | "uploading"
  | "convert_required"
  | "converting"
  | "converted"
  | "transcription_queued"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

export type AudioProcessingJobRecord = {
  meetingId: string;
  status: AudioProcessingJobStatus | string;
  transcriptionJobName: string | null;
  transcriptionJobOperationName: string | null;
  transcriptionJobQueuedAt: Date | null;
  transcriptionTaskName: string | null;
  transcriptionTaskQueuedAt: Date | null;
  updatedAt: Date | null;
};

export async function saveKnowledgeSearchEvent(input: KnowledgeSearchEventInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "knowledgeSearchEvents"), {
    companyId: resolveCompanyId(input.companyId),
    userId: input.userId,
    query: input.query,
    resultCount: input.resultCount,
    usedAi: input.usedAi,
    createdAt: serverTimestamp(),
  });

  await saveSalesActivityEvent({
    companyId: input.companyId,
    userId: input.userId,
    type: "knowledge_searched",
    title: "ナレッジ検索",
    summary: `「${input.query}」で検索しました`,
    detail: `検索キーワード: ${input.query}\n検索結果: ${input.resultCount}件\nAI回答: ${input.usedAi ? "利用" : "未利用"}`,
    href: null,
    metadata: {
      query: input.query,
      resultCount: input.resultCount,
      usedAi: input.usedAi,
    },
  }).catch(() => undefined);
}

export async function saveSystemError(input: SystemErrorInput) {
  const { firestore } = assertFirebaseClient();
  const payload: Record<string, unknown> = {
    kind: input.kind,
    message: input.message,
    severity: input.severity,
    status: "open",
    occurredAt: serverTimestamp(),
  };

  if (input.companyId !== undefined) {
    payload.companyId = resolveCompanyId(input.companyId);
  }

  if (input.userId !== undefined) {
    payload.userId = input.userId;
  }

  if (input.source) {
    payload.source = input.source;
  }

  await addDoc(collection(firestore, "systemErrors"), payload);
}

export async function createAudioProcessingJob(input: {
  companyId?: string | null;
  userId: string;
  meetingId: string;
  fileName: string;
  audioDurationSec?: number | null;
  status: AudioProcessingJobStatus;
}) {
  const { firestore } = assertFirebaseClient();

  await setDoc(doc(firestore, "audioProcessingJobs", input.meetingId), {
    companyId: resolveCompanyId(input.companyId),
    userId: input.userId,
    meetingId: input.meetingId,
    fileName: input.fileName,
    audioDurationSec: input.audioDurationSec ?? 0,
    status: input.status,
    startedAt: serverTimestamp(),
    completedAt: null,
    errorMessage: null,
    retryCount: 0,
    updatedAt: serverTimestamp(),
  });
}

export async function updateAudioProcessingJob(
  meetingId: string,
  input: {
    status: AudioProcessingJobStatus;
    errorMessage?: string | null;
  },
) {
  const { firestore } = assertFirebaseClient();
  const payload: Record<string, unknown> = {
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    updatedAt: serverTimestamp(),
  };

  if (input.status === "completed" || input.status === "failed") {
    payload.completedAt = serverTimestamp();
  }

  await updateDoc(doc(firestore, "audioProcessingJobs", meetingId), payload);
}

export function subscribeToAudioProcessingJob(
  meetingId: string,
  onNext: (job: AudioProcessingJobRecord | null) => void,
  onError?: (error: Error) => void,
) {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    doc(firestore, "audioProcessingJobs", meetingId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onNext(null);
        return;
      }

      const data = snapshot.data() as Record<string, unknown>;
      onNext({
        meetingId,
        status: String(data.status ?? "waiting"),
        transcriptionJobName: toNullableString(data.transcriptionJobName),
        transcriptionJobOperationName: toNullableString(data.transcriptionJobOperationName),
        transcriptionJobQueuedAt: toDateValue(data.transcriptionJobQueuedAt),
        transcriptionTaskName: toNullableString(data.transcriptionTaskName),
        transcriptionTaskQueuedAt: toDateValue(data.transcriptionTaskQueuedAt),
        updatedAt: toDateValue(data.updatedAt),
      });
    },
    (error) => {
      onError?.(error);
    },
  );
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toDateValue(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
}
