"use client";

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
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
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

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
