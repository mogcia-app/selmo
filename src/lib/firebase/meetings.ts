"use client";

import {
  FirestoreError,
  Timestamp,
  collection,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

import { assertFirebaseClient } from "@/lib/firebase/client";
import { resolveCompanyId } from "@/lib/firebase/company";
import { saveSalesActivityEvent } from "@/lib/firebase/activity";
import { getMeetingSalesDomain, type SalesDomain } from "@/lib/sales-domains";
import {
  createAudioProcessingJob,
  saveSystemError,
  updateAudioProcessingJob,
} from "@/lib/firebase/operations";
import type { MeetingOutcome, MeetingPurpose, ProcessingStatus } from "@/types/domain";

export type MeetingTranscriptionSegment = {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string | null;
};

export type MeetingTranscriptBlock = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  rawText?: string | null;
  summary?: string | null;
  alignmentSource: "chunk" | "whisper" | "manual";
  confidence: "estimated" | "aligned";
};

export type MeetingConversationLog = {
  id: string;
  speaker: "sales" | "customer" | "participant" | "speaker_1" | "speaker_2" | "unknown";
  label: string;
  text: string;
  sourceSegmentIndexes: number[];
  confidence: "estimated" | "aligned";
  kind?: "speech" | "backchannel" | "unknown";
};

export type MeetingAiSummary = {
  overview: string;
  bullets: string[];
  diagnosis?: {
    status: {
      label: string;
      stage:
        | "relationship_building"
        | "discovery"
        | "proposal_preparation"
        | "proposal_done"
        | "comparison"
        | "decision_pending"
        | "stalled";
      description: string;
      tone: "positive" | "warning" | "neutral";
      evidence: string[];
    };
    temperature: {
      level: "high" | "middle" | "low";
      stars: number;
      label: string;
      description: string;
      evidence: string[];
    };
    consideration: {
      score: number;
      label: string;
      description: string;
      evidence: string[];
    };
    salesEvaluation: Array<{
      label: string;
      score: number;
      description: string;
      evidence: string[];
    }>;
  };
  manualCompliance?: {
    mode: "manual" | "generic";
    score: number | null;
    matchedCriteria: string[];
    missingCriteria: string[];
    productNotes: string[];
    improvementPhrases: string[];
    checklistItems?: Array<{
      category: string;
      label: string;
      status: "done" | "missing";
      reason: string;
      scoreImpact: number | null;
    }>;
  };
};

export type MeetingRecord = {
  id: string;
  companyId: string;
  userId: string;
  uploadedBy: string;
  attendeeUserIds: string[];
  attendeeUserNames: string[];
  salesDomain: SalesDomain;
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
  meetingPurpose: MeetingPurpose;
  recordedAt: Date | null;
  location: string;
  memo: string;
  status: MeetingOutcome;
  audioFilePath: string | null;
  audioDownloadUrl: string | null;
  audioFileName: string | null;
  audioSizeBytes: number | null;
  audioDurationSec: number | null;
  audioDeletedAt: Date | null;
  deletedAt: Date | null;
  deletedBy?: string | null;
  audioMimeType: string | null;
  processingStatus: ProcessingStatus | string;
  reanalysisCount: number;
  transcriptionProbeStatus?: "idle" | "running" | "completed" | "failed";
  transcriptionProbeModel?: string | null;
  transcriptionProbeText?: string | null;
  transcriptionProbeLanguage?: string | null;
  transcriptionProbeError?: string | null;
  transcriptionProbeSegmentCount?: number | null;
  transcriptionProbeSegments?: MeetingTranscriptionSegment[];
  transcriptionProbeDurationSec?: number | null;
  transcriptionProbeTestedAt?: Date | null;
  transcriptBlocks?: MeetingTranscriptBlock[];
  transcriptBlockCount?: number | null;
  transcriptBlockModel?: string | null;
  transcriptBlockStatus?: "idle" | "running" | "completed" | "failed";
  transcriptBlockError?: string | null;
  transcriptBlockTestedAt?: Date | null;
  conversationLogs?: MeetingConversationLog[];
  conversationLogCount?: number | null;
  conversationLogModel?: string | null;
  conversationLogStatus?: "idle" | "running" | "completed" | "failed";
  conversationLogError?: string | null;
  conversationLogTestedAt?: Date | null;
  aiSummary?: MeetingAiSummary | null;
  aiSummaryModel?: string | null;
  aiSummaryStatus?: "idle" | "running" | "completed" | "failed";
  aiSummaryError?: string | null;
  aiSummaryTestedAt?: Date | null;
  adminComment?: string;
  adminCommentUpdatedAt?: Date | null;
  adminCommentUpdatedBy?: string | null;
  createdAt: Date | null;
};

export type CreateMeetingInput = {
  userId: string;
  companyId?: string | null;
  salesDomain?: SalesDomain;
  attendeeUserIds?: string[];
  attendeeUserNames?: string[];
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
  meetingPurpose?: MeetingPurpose;
  recordedAt: Date;
  location?: string;
  memo?: string;
  status: MeetingOutcome;
  audioFile?: File | null;
  audioDurationSec?: number | null;
  transcriptText?: string | null;
  audioRetentionLimit?: number | null;
  onUploadProgress?: (progress: number) => void;
};

export type UpdateMeetingMetadataInput = {
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
  meetingPurpose: MeetingPurpose;
  recordedAt: Date | null;
  location?: string;
  memo?: string;
  status: MeetingOutcome;
};

export async function createMeeting(input: CreateMeetingInput) {
  const { firestore, firebaseStorage } = assertFirebaseClient();
  const meetingRef = doc(collection(firestore, "meetings"));
  const now = serverTimestamp();
  const companyId = resolveCompanyId(input.companyId);
  const salesDomain = input.salesDomain ?? "meeting";
  const normalizedAudioDurationSec = input.audioDurationSec ?? null;
  const normalizedTranscriptText = input.transcriptText?.trim() ?? "";
  const hasTranscriptText = Boolean(normalizedTranscriptText);
  const pastedConversationLogs = normalizedTranscriptText
    ? buildConversationLogsFromText(normalizedTranscriptText)
    : [];

  await setDoc(meetingRef, {
    companyId,
    userId: input.userId,
    uploadedBy: input.userId,
    attendeeUserIds: normalizeMeetingAttendeeIds(input.attendeeUserIds, input.userId),
    attendeeUserNames: normalizeMeetingAttendeeNames(input.attendeeUserNames),
    salesDomain,
    customerName: input.customerName,
    productType: input.productType,
    customerType: input.customerType,
    meetingPurpose: input.meetingPurpose ?? inferMeetingPurpose(input.customerType, input.status),
    recordedAt: Timestamp.fromDate(input.recordedAt),
    location: input.location ?? "",
    memo: input.memo ?? "",
    status: input.status,
    audioFilePath: null,
    audioDownloadUrl: null,
    audioFileName: input.audioFile?.name ?? null,
    audioSizeBytes: input.audioFile?.size ?? null,
    audioDurationSec: normalizedAudioDurationSec,
    audioDeletedAt: null,
    audioMimeType: input.audioFile?.type || "audio/mpeg",
    processingStatus: input.audioFile ? "uploading" : "uploaded",
    reanalysisCount: 0,
    ...(hasTranscriptText
      ? {
          transcriptionProbeStatus: "completed",
          transcriptionProbeModel: "manual-paste",
          transcriptionProbeText: normalizedTranscriptText,
          transcriptionProbeLanguage: "ja",
          transcriptionProbeError: null,
          transcriptionProbeSegmentCount: 1,
          transcriptionProbeSegments: [
            {
              startSec: 0,
              endSec: normalizedAudioDurationSec ?? 0,
              text: normalizedTranscriptText,
              speaker: null,
            },
          ],
          transcriptionProbeDurationSec: normalizedAudioDurationSec,
          transcriptionProbeTestedAt: now,
          conversationLogStatus: "completed",
          conversationLogModel: "manual-paste",
          conversationLogs: pastedConversationLogs,
          conversationLogCount: pastedConversationLogs.length,
          conversationLogError: null,
          conversationLogTestedAt: now,
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  });

  await saveSalesActivityEvent({
    companyId,
    userId: input.userId,
    type: hasTranscriptText ? "transcript_pasted" : "meeting_uploaded",
    title: hasTranscriptText ? "商談ログ貼り付け" : salesDomain === "teleapo" ? "テレアポ音声登録" : "商談音声登録",
    summary: `${input.customerName || (salesDomain === "teleapo" ? "未設定のテレアポ" : "未設定の商談")}を登録しました`,
    detail: [
      `顧客名: ${input.customerName || "未設定"}`,
      `商材: ${input.productType || "未設定"}`,
      `商談目的: ${getMeetingPurposeLabel(input.meetingPurpose ?? inferMeetingPurpose(input.customerType, input.status))}`,
      `入力方法: ${hasTranscriptText ? "商談ログ貼り付け" : "音声からログ作成"}`,
      `ステータス: ${input.status}`,
    ].join("\n"),
    href: `/admin/meetings/${meetingRef.id}`,
    metadata: {
      meetingId: meetingRef.id,
      customerName: input.customerName,
      productType: input.productType,
      meetingPurpose: input.meetingPurpose ?? inferMeetingPurpose(input.customerType, input.status),
      inputMode: hasTranscriptText ? "transcript" : "audio",
      salesDomain,
      status: input.status,
    },
  }).catch(() => undefined);

  if (!input.audioFile) {
    await createMeetingNotification({
      companyId,
      userId: input.userId,
      meetingId: meetingRef.id,
      title: hasTranscriptText ? "商談ログを登録しました" : "音声を登録しました",
      body: hasTranscriptText
        ? "登録した商談ログから、要約や分析を開始できます。"
        : "音声から分析用ログを作成できます。",
    }).catch(() => undefined);
    return meetingRef.id;
  }

  await enforceAudioRetentionLimit({
    companyId,
    userId: input.userId,
    limit: input.audioRetentionLimit ?? null,
  });

  await createAudioProcessingJob({
    companyId,
    userId: input.userId,
    meetingId: meetingRef.id,
    fileName: input.audioFile.name,
    audioDurationSec: input.audioDurationSec ?? null,
    status: "uploading",
  });

  const storagePath = buildMeetingAudioPath(
    input.userId,
    meetingRef.id,
    input.audioFile.name,
  );
  const storageRef = ref(firebaseStorage, storagePath);
  const metadata: UploadMetadata = {
    contentType: input.audioFile.type || "audio/mpeg",
    customMetadata: {
      meetingId: meetingRef.id,
      uploadedBy: input.userId,
      originalFileName: input.audioFile.name,
    },
  };

  try {
    await uploadWithProgress(storageRef, input.audioFile, metadata, input.onUploadProgress);
    const audioDownloadUrl = await getDownloadURL(storageRef);

    await updateDoc(meetingRef, {
      audioFilePath: storagePath,
      audioDownloadUrl,
      audioFileName: input.audioFile.name,
      audioSizeBytes: input.audioFile.size,
      audioMimeType: input.audioFile.type || "audio/mpeg",
      audioDurationSec: input.audioDurationSec ?? null,
      processingStatus: "uploaded",
      updatedAt: serverTimestamp(),
    });
    await updateAudioProcessingJob(meetingRef.id, {
      status: "waiting",
      errorMessage: null,
    });
    await createMeetingNotification({
      companyId,
      userId: input.userId,
      meetingId: meetingRef.id,
      title: "アップロードが完了しました",
      body: "音声ファイルの保存が完了しました。商談一覧から文字起こしを開始できます。",
    }).catch(() => undefined);

    return meetingRef.id;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "音声ファイルのアップロードに失敗しました。";

    await updateDoc(meetingRef, {
      processingStatus: "failed",
      updatedAt: serverTimestamp(),
    });
    await updateAudioProcessingJob(meetingRef.id, {
      status: "failed",
      errorMessage: message,
    }).catch(() => undefined);
    await saveSystemError({
      companyId,
      userId: input.userId,
      kind: "Storage",
      message,
      severity: "critical",
      source: "createMeeting",
    }).catch(() => undefined);

    throw error;
  }
}

async function enforceAudioRetentionLimit(input: {
  companyId: string;
  userId: string;
  limit: number | null;
}) {
  if (!input.limit || input.limit < 1) {
    return;
  }

  const { firestore, firebaseStorage } = assertFirebaseClient();
  const snapshot = await getDocs(
    query(
      collection(firestore, "meetings"),
      where("companyId", "==", input.companyId),
      where("userId", "==", input.userId),
    ),
  );
  const audioMeetings = snapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      record: mapMeetingRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>),
    }))
    .filter(({ record }) => record.audioFilePath && !record.audioDeletedAt)
    .sort((left, right) => {
      const leftTime = left.record.recordedAt?.getTime() ?? 0;
      const rightTime = right.record.recordedAt?.getTime() ?? 0;
      return leftTime - rightTime;
    });
  const deleteCount = Math.max(0, audioMeetings.length - input.limit + 1);

  for (const item of audioMeetings.slice(0, deleteCount)) {
    const audioFilePath = item.record.audioFilePath;

    if (!audioFilePath) {
      continue;
    }

    await deleteObject(ref(firebaseStorage, audioFilePath)).catch(() => undefined);
    await updateDoc(doc(firestore, "meetings", item.id), {
      audioFilePath: null,
      audioDownloadUrl: null,
      audioDeletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function createMeetingNotification(input: {
  companyId: string;
  userId: string;
  meetingId: string;
  title: string;
  body: string;
}) {
  const { firestore } = assertFirebaseClient();

  await setDoc(doc(collection(firestore, "appNotifications")), {
    companyId: input.companyId,
    userId: input.userId,
    meetingId: input.meetingId,
    title: input.title,
    body: input.body,
    href: `/meetings/${input.meetingId}`,
    read: false,
    createdAt: serverTimestamp(),
  });
}

function buildConversationLogsFromText(text: string): MeetingConversationLog[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalizedText.split("\n");
  const logs: Array<{ speaker: MeetingConversationLog["speaker"]; label: string; text: string }> = [];
  let currentSpeaker: MeetingConversationLog["speaker"] = "unknown";
  let currentLabel = "文字起こし";
  let currentLines: string[] = [];
  let currentHasExplicitSpeaker = false;
  let nextUnlabeledSpeakerIndex = 1;
  const explicitSpeakerSlots = new Map<string, MeetingConversationLog["speaker"]>();

  function flushCurrent() {
    const body = currentLines.join("\n").trim();
    if (!body) {
      currentLines = [];
      return;
    }

    for (const text of splitPastedTranscriptUtterances(body)) {
      const speakerSlot = currentHasExplicitSpeaker
        ? { speaker: currentSpeaker, label: currentLabel }
        : buildUnlabeledPastedTranscriptSpeakerSlot(nextUnlabeledSpeakerIndex++);
      logs.push({
        speaker: speakerSlot.speaker,
        label: speakerSlot.label,
        text,
      });
    }
    currentLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const inlineSpeakerLine = readPastedTranscriptInlineSpeakerLine(line);

    if (inlineSpeakerLine) {
      flushCurrent();
      currentSpeaker = inferPastedTranscriptSpeaker(inlineSpeakerLine.label, explicitSpeakerSlots);
      currentLabel = inlineSpeakerLine.label;
      currentHasExplicitSpeaker = true;
      if (inlineSpeakerLine.text) {
        currentLines.push(inlineSpeakerLine.text);
      }
      continue;
    }

    const speakerLabel = readPastedTranscriptSpeakerLabel(line);

    if (speakerLabel) {
      flushCurrent();
      currentSpeaker = inferPastedTranscriptSpeaker(speakerLabel, explicitSpeakerSlots);
      currentLabel = speakerLabel;
      currentHasExplicitSpeaker = true;
      continue;
    }

    currentLines.push(rawLine);
  }

  flushCurrent();

  if (logs.length === 0) {
    logs.push({
      speaker: "unknown",
      label: "文字起こし",
      text: normalizedText,
    });
  }

  return logs.map((log, index) => ({
    id: `log_${String(index + 1).padStart(3, "0")}`,
    speaker: log.speaker,
    label: log.label,
    text: log.text,
    sourceSegmentIndexes: [0],
    confidence: "estimated",
    kind: log.speaker === "unknown" ? "unknown" : "speech",
  }));
}

function splitPastedTranscriptUtterances(text: string) {
  const normalizedText = text.replace(/\s*\n+\s*/g, "\n").trim();
  const chunks: string[] = [];

  for (const block of normalizedText.split(/\n+/)) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) {
      continue;
    }

    const sentences = trimmedBlock.match(/[^。！？!?]+[。！？!?]?/g);
    if (!sentences || sentences.length <= 1) {
      chunks.push(trimmedBlock);
      continue;
    }

    chunks.push(...sentences.map((sentence) => sentence.trim()).filter(Boolean));
  }

  return chunks.length > 0 ? chunks : [normalizedText];
}

function buildUnlabeledPastedTranscriptSpeakerSlot(index: number): { speaker: MeetingConversationLog["speaker"]; label: string } {
  return index % 2 === 1
    ? { speaker: "speaker_1", label: "話者1" }
    : { speaker: "speaker_2", label: "話者2" };
}

function readPastedTranscriptInlineSpeakerLine(line: string) {
  if (!line) {
    return null;
  }

  const match = line.match(/^(.{1,24}?)[：:]\s*(.+)$/);
  const label = match?.[1]?.trim();
  const text = match?.[2]?.trim();

  if (!label || !text || !isKnownPastedTranscriptSpeakerLabel(label)) {
    return null;
  }

  return { label, text };
}

function readPastedTranscriptSpeakerLabel(line: string) {
  if (!line) {
    return null;
  }

  const colonMatch = line.match(/^(.{1,24}?)[：:]\s*$/);
  const label = (colonMatch?.[1] ?? line).trim();

  if (isKnownPastedTranscriptSpeakerLabel(label)) {
    return label;
  }

  return null;
}

function isKnownPastedTranscriptSpeakerLabel(label: string) {
  return /^(顧客|お客様|お客さま|クライアント|相手|先方|営業|担当|同席者|参加者|不明)$/.test(label) ||
    /^Speaker\s*[12]$/i.test(label) ||
    /^話者\s*[12]$/.test(label) ||
    /^[一-龠][一-龠ぁ-んァ-ヶA-Za-z\s　・.]{0,15}$/.test(label);
}

function inferPastedTranscriptSpeaker(label: string, speakerSlots: Map<string, MeetingConversationLog["speaker"]>): MeetingConversationLog["speaker"] {
  if (/^(顧客|お客様|お客さま|クライアント|相手|先方)$/.test(label)) {
    return "customer";
  }

  if (/^(営業|担当)$/.test(label)) {
    return "sales";
  }

  if (/^Speaker\s*1$/i.test(label) || /^話者\s*1$/.test(label)) {
    return "speaker_1";
  }

  if (/^Speaker\s*2$/i.test(label) || /^話者\s*2$/.test(label)) {
    return "speaker_2";
  }

  if (/^(同席者|参加者)$/.test(label)) {
    return "participant";
  }

  if (label === "不明") {
    return "unknown";
  }

  const normalizedLabel = label.trim();
  const existing = speakerSlots.get(normalizedLabel);
  if (existing) return existing;

  const nextSpeaker = speakerSlots.size % 2 === 0 ? "speaker_1" : "speaker_2";
  speakerSlots.set(normalizedLabel, nextSpeaker);
  return nextSpeaker;
}

export async function fetchMeeting(meetingId: string) {
  const { firestore } = assertFirebaseClient();
  const snapshot = await getDoc(doc(firestore, "meetings", meetingId));

  if (!snapshot.exists()) {
    return null;
  }

  return mapMeetingRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export function subscribeToMeetings(
  input: {
    role: "admin" | "sales";
    userId: string;
    companyId?: string | null;
    salesDomains?: SalesDomain[];
    includeDeleted?: boolean;
  },
  callback: (meetings: MeetingRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const meetingsRef = collection(firestore, "meetings");
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }
  const salesDomains = Array.from(new Set(input.salesDomains ?? [])).filter(
    (domain): domain is SalesDomain => domain === "meeting" || domain === "teleapo",
  );
  const meetingsQueries =
    input.role === "admin"
      ? [query(meetingsRef, where("companyId", "==", input.companyId))]
      : salesDomains.length > 0
        ? salesDomains.map((salesDomain) =>
            query(
              meetingsRef,
              where("companyId", "==", input.companyId),
              where("userId", "==", input.userId),
              where("salesDomain", "==", salesDomain),
            ),
          )
        : [query(meetingsRef, where("companyId", "==", input.companyId), where("userId", "==", input.userId))];

  let isActive = true;

  Promise.all(meetingsQueries.map((meetingsQuery) => getDocs(meetingsQuery)))
    .then((snapshots) => {
      if (!isActive) return;

      const recordsById = new Map<string, MeetingRecord>();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((docSnapshot) => {
          recordsById.set(
            docSnapshot.id,
            mapMeetingRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>),
          );
        });
      });

      const meetings = Array.from(recordsById.values())
        .filter((record) => input.includeDeleted || !record.deletedAt)
        .sort((left, right) => {
          const leftTime = left.recordedAt?.getTime() ?? 0;
          const rightTime = right.recordedAt?.getTime() ?? 0;
          return rightTime - leftTime;
        });

      callback(meetings);
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export function subscribeToMeeting(
  meetingId: string,
  callback: (meeting: MeetingRecord | null) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  let isActive = true;

  getDoc(doc(firestore, "meetings", meetingId))
    .then((snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(mapMeetingRecord(snapshot.id, snapshot.data() as Record<string, unknown>));
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export async function saveMeetingTranscriptionProbe(
  meetingId: string,
  input: {
    status: "running" | "completed" | "failed";
    model?: string | null;
    text?: string | null;
    language?: string | null;
    error?: string | null;
    segmentCount?: number | null;
    segments?: MeetingTranscriptionSegment[] | null;
    durationSec?: number | null;
    processingStatus?: ProcessingStatus;
  },
) {
  const { firestore } = assertFirebaseClient();
  const payload: Record<string, unknown> = {
    transcriptionProbeStatus: input.status,
    transcriptionProbeModel: input.model ?? null,
    transcriptionProbeTestedAt: serverTimestamp(),
    processingStatus: input.processingStatus ?? "uploaded",
    updatedAt: serverTimestamp(),
  };

  if (input.text !== undefined) {
    payload.transcriptionProbeText = input.text;
  }

  if (input.language !== undefined) {
    payload.transcriptionProbeLanguage = input.language;
  }

  if (input.error !== undefined) {
    payload.transcriptionProbeError = input.error;
  }

  if (input.segmentCount !== undefined) {
    payload.transcriptionProbeSegmentCount = input.segmentCount;
  }

  if (input.segments !== undefined) {
    payload.transcriptionProbeSegments = input.segments;
  }

  if (input.durationSec !== undefined) {
    payload.transcriptionProbeDurationSec = input.durationSec;
  }

  await updateDoc(doc(firestore, "meetings", meetingId), payload);
}

export async function saveMeetingTranscriptBlocks(
  meetingId: string,
  input: {
    status: "running" | "completed" | "failed";
    model?: string | null;
    blocks?: MeetingTranscriptBlock[] | null;
    error?: string | null;
    processingStatus?: ProcessingStatus;
  },
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "meetings", meetingId), {
    transcriptBlockStatus: input.status,
    transcriptBlockModel: input.model ?? null,
    transcriptBlocks: input.blocks ?? [],
    transcriptBlockCount: input.blocks?.length ?? null,
    transcriptBlockError: input.error ?? null,
    transcriptBlockTestedAt: serverTimestamp(),
    processingStatus: input.processingStatus ?? "uploaded",
    updatedAt: serverTimestamp(),
  });
}

export async function saveMeetingConversationLogs(
  meetingId: string,
  input: {
    status: "running" | "completed" | "failed";
    model?: string | null;
    logs?: MeetingConversationLog[] | null;
    error?: string | null;
    processingStatus?: ProcessingStatus;
  },
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "meetings", meetingId), {
    conversationLogStatus: input.status,
    conversationLogModel: input.model ?? null,
    conversationLogs: input.logs ?? [],
    conversationLogCount: input.logs?.length ?? null,
    conversationLogError: input.error ?? null,
    conversationLogTestedAt: serverTimestamp(),
    processingStatus: input.processingStatus ?? "uploaded",
    updatedAt: serverTimestamp(),
  });
}

export async function saveMeetingAiSummary(
  meetingId: string,
  input: {
    status: "running" | "completed" | "failed";
    model?: string | null;
    summary?: MeetingAiSummary | null;
    error?: string | null;
    processingStatus?: ProcessingStatus;
  },
) {
  const { firestore } = assertFirebaseClient();
  const payload: Record<string, unknown> = {
    aiSummaryStatus: input.status,
    aiSummaryModel: input.model ?? null,
    aiSummaryTestedAt: serverTimestamp(),
    processingStatus: input.processingStatus ?? "uploaded",
    updatedAt: serverTimestamp(),
  };

  if (input.summary !== undefined) {
    payload.aiSummary = input.summary;
  }

  if (input.error !== undefined) {
    payload.aiSummaryError = input.error;
  }

  await updateDoc(doc(firestore, "meetings", meetingId), payload);
}

export async function updateMeetingMetadata(
  meetingId: string,
  input: UpdateMeetingMetadataInput,
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "meetings", meetingId), {
    customerName: input.customerName,
    productType: input.productType,
    customerType: input.customerType,
    meetingPurpose: input.meetingPurpose,
    recordedAt: input.recordedAt ? Timestamp.fromDate(input.recordedAt) : null,
    location: input.location ?? "",
    memo: input.memo ?? "",
    status: input.status,
    updatedAt: serverTimestamp(),
  });
}

export async function saveMeetingAdminComment(
  meetingId: string,
  input: { comment: string; updatedBy: string },
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "meetings", meetingId), {
    adminComment: input.comment.trim(),
    adminCommentUpdatedAt: serverTimestamp(),
    adminCommentUpdatedBy: input.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeetingRecord(meeting: MeetingRecord, deletedBy?: string | null) {
  const { firestore, firebaseStorage } = assertFirebaseClient();

  if (meeting.audioFilePath) {
    await deleteObject(ref(firebaseStorage, meeting.audioFilePath)).catch(() => undefined);
  }

  await updateDoc(doc(firestore, "meetings", meeting.id), {
    audioFilePath: null,
    audioDownloadUrl: null,
    audioDeletedAt: serverTimestamp(),
    deletedAt: serverTimestamp(),
    deletedBy: deletedBy ?? null,
    updatedAt: serverTimestamp(),
  });
}

function buildMeetingAudioPath(userId: string, meetingId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `meetings/${userId}/${meetingId}/${Date.now()}-${safeName}`;
}

function normalizeMeetingAttendeeIds(value: string[] | undefined, ownerUserId: string) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean))).filter((userId) => userId !== ownerUserId);
}

function normalizeMeetingAttendeeNames(value: string[] | undefined) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}

function uploadWithProgress(
  storageRef: ReturnType<typeof ref>,
  file: File,
  metadata: UploadMetadata,
  onUploadProgress?: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      (snapshot) => {
        if (!onUploadProgress || snapshot.totalBytes === 0) {
          return;
        }

        onUploadProgress(
          Math.min(
            100,
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          ),
        );
      },
      reject,
      () => resolve(),
    );
  });
}

function mapMeetingRecord(id: string, data: Record<string, unknown>): MeetingRecord {
  return {
    id,
    companyId: String(data.companyId ?? "default"),
    userId: String(data.userId ?? ""),
    uploadedBy: String(data.uploadedBy ?? ""),
    attendeeUserIds: readStringArray(data.attendeeUserIds),
    attendeeUserNames: readStringArray(data.attendeeUserNames),
    salesDomain: getMeetingSalesDomain(data.salesDomain),
    customerName: String(data.customerName ?? ""),
    productType: String(data.productType ?? ""),
    customerType: (data.customerType as "new" | "existing") ?? "new",
    meetingPurpose: toMeetingPurpose(data.meetingPurpose, (data.customerType as "new" | "existing") ?? "new", (data.status as MeetingOutcome) ?? "considering"),
    recordedAt: toDateValue(data.recordedAt),
    location: String(data.location ?? ""),
    memo: String(data.memo ?? ""),
    status: (data.status as MeetingOutcome) ?? "considering",
    audioFilePath: toNullableString(data.audioFilePath),
    audioDownloadUrl: toNullableString(data.audioDownloadUrl),
    audioFileName: toNullableString(data.audioFileName),
    audioSizeBytes: toNullableNumber(data.audioSizeBytes),
    audioDurationSec: toNullableNumber(data.audioDurationSec),
    audioDeletedAt: toDateValue(data.audioDeletedAt),
    deletedAt: toDateValue(data.deletedAt),
    deletedBy: toNullableString(data.deletedBy),
    audioMimeType: toNullableString(data.audioMimeType),
    processingStatus: String(data.processingStatus ?? "uploaded"),
    reanalysisCount: Number(data.reanalysisCount ?? 0),
    transcriptionProbeStatus:
      (data.transcriptionProbeStatus as
        | "idle"
        | "running"
        | "completed"
        | "failed"
        | undefined) ?? "idle",
    transcriptionProbeModel: toNullableString(data.transcriptionProbeModel),
    transcriptionProbeText: toNullableString(data.transcriptionProbeText),
    transcriptionProbeLanguage: toNullableString(data.transcriptionProbeLanguage),
    transcriptionProbeError: toNullableString(data.transcriptionProbeError),
    transcriptionProbeSegmentCount: toNullableNumber(data.transcriptionProbeSegmentCount),
    transcriptionProbeSegments: toTranscriptionSegments(data.transcriptionProbeSegments),
    transcriptionProbeDurationSec: toNullableNumber(data.transcriptionProbeDurationSec),
    transcriptionProbeTestedAt: toDateValue(data.transcriptionProbeTestedAt),
    transcriptBlocks: toTranscriptBlocks(data.transcriptBlocks),
    transcriptBlockCount: toNullableNumber(data.transcriptBlockCount),
    transcriptBlockModel: toNullableString(data.transcriptBlockModel),
    transcriptBlockStatus:
      (data.transcriptBlockStatus as
        | "idle"
        | "running"
        | "completed"
        | "failed"
        | undefined) ?? "idle",
    transcriptBlockError: toNullableString(data.transcriptBlockError),
    transcriptBlockTestedAt: toDateValue(data.transcriptBlockTestedAt),
    conversationLogs: toConversationLogs(data.conversationLogs),
    conversationLogCount: toNullableNumber(data.conversationLogCount),
    conversationLogModel: toNullableString(data.conversationLogModel),
    conversationLogStatus:
      (data.conversationLogStatus as
        | "idle"
        | "running"
        | "completed"
        | "failed"
        | undefined) ?? "idle",
    conversationLogError: toNullableString(data.conversationLogError),
    conversationLogTestedAt: toDateValue(data.conversationLogTestedAt),
    aiSummary: toAiSummary(data.aiSummary),
    aiSummaryModel: toNullableString(data.aiSummaryModel),
    aiSummaryStatus:
      (data.aiSummaryStatus as
        | "idle"
        | "running"
        | "completed"
        | "failed"
        | undefined) ?? "idle",
    aiSummaryError: toNullableString(data.aiSummaryError),
    aiSummaryTestedAt: toDateValue(data.aiSummaryTestedAt),
    adminComment: String(data.adminComment ?? ""),
    adminCommentUpdatedAt: toDateValue(data.adminCommentUpdatedAt),
    adminCommentUpdatedBy: toNullableString(data.adminCommentUpdatedBy),
    createdAt: toDateValue(data.createdAt),
  };
}

function toDateValue(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

export function getMeetingPurposeLabel(value: MeetingPurpose | string) {
  const labels: Record<MeetingPurpose, string> = {
    new_proposal: "新規提案",
    closing: "クロージング",
    existing_followup: "既存フォロー",
    relationship_building: "関係構築",
    check_in: "状況確認",
    upsell_cross_sell: "アップセル/クロスセル",
    onboarding: "オンボーディング",
    retention: "解約防止",
  };
  return labels[value as MeetingPurpose] ?? "目的未設定";
}

export function inferMeetingPurpose(customerType: "new" | "existing", status: MeetingOutcome): MeetingPurpose {
  if (status === "won") return customerType === "existing" ? "upsell_cross_sell" : "closing";
  if (status === "lost") return customerType === "existing" ? "retention" : "new_proposal";
  return customerType === "existing" ? "check_in" : "new_proposal";
}

function toMeetingPurpose(value: unknown, customerType: "new" | "existing", status: MeetingOutcome): MeetingPurpose {
  const candidates: MeetingPurpose[] = [
    "new_proposal",
    "closing",
    "existing_followup",
    "relationship_building",
    "check_in",
    "upsell_cross_sell",
    "onboarding",
    "retention",
  ];
  return candidates.includes(value as MeetingPurpose) ? (value as MeetingPurpose) : inferMeetingPurpose(customerType, status);
}

function toNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function toTranscriptionSegments(value: unknown): MeetingTranscriptionSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<MeetingTranscriptionSegment | null>((segment) => {
      if (!segment || typeof segment !== "object") {
        return null;
      }

      const startSec = (segment as { startSec?: unknown }).startSec;
      const endSec = (segment as { endSec?: unknown }).endSec;
      const text = (segment as { text?: unknown }).text;
      const speaker = (segment as { speaker?: unknown }).speaker;

      if (
        typeof startSec !== "number" ||
        typeof endSec !== "number" ||
        typeof text !== "string"
      ) {
        return null;
      }

      return {
        startSec,
        endSec,
        text,
        speaker: typeof speaker === "string" ? speaker : null,
      };
    })
    .filter((segment): segment is MeetingTranscriptionSegment => Boolean(segment));
}

function toTranscriptBlocks(value: unknown): MeetingTranscriptBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<MeetingTranscriptBlock | null>((block) => {
      if (!block || typeof block !== "object") {
        return null;
      }

      const id = (block as { id?: unknown }).id;
      const startSec = (block as { startSec?: unknown }).startSec;
      const endSec = (block as { endSec?: unknown }).endSec;
      const text = (block as { text?: unknown }).text;
      const rawText = (block as { rawText?: unknown }).rawText;
      const summary = (block as { summary?: unknown }).summary;
      const alignmentSource = (block as { alignmentSource?: unknown }).alignmentSource;
      const confidence = (block as { confidence?: unknown }).confidence;

      if (
        typeof id !== "string" ||
        typeof startSec !== "number" ||
        typeof endSec !== "number" ||
        typeof text !== "string" ||
        (alignmentSource !== "chunk" &&
          alignmentSource !== "whisper" &&
          alignmentSource !== "manual") ||
        (confidence !== "estimated" && confidence !== "aligned")
      ) {
        return null;
      }

      return {
        id,
        startSec,
        endSec,
        text,
        rawText: typeof rawText === "string" ? rawText : null,
        summary: typeof summary === "string" ? summary : null,
        alignmentSource: alignmentSource as MeetingTranscriptBlock["alignmentSource"],
        confidence: confidence as MeetingTranscriptBlock["confidence"],
      };
    })
    .filter((block): block is MeetingTranscriptBlock => Boolean(block));
}

function toConversationLogs(value: unknown): MeetingConversationLog[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<MeetingConversationLog | null>((log) => {
      if (!log || typeof log !== "object") {
        return null;
      }

      const id = (log as { id?: unknown }).id;
      const speaker = (log as { speaker?: unknown }).speaker;
      const label = (log as { label?: unknown }).label;
      const text = (log as { text?: unknown }).text;
      const sourceSegmentIndexes = (log as { sourceSegmentIndexes?: unknown }).sourceSegmentIndexes;
      const confidence = (log as { confidence?: unknown }).confidence;
      const kind = (log as { kind?: unknown }).kind;

      if (
        typeof id !== "string" ||
        (speaker !== "sales" &&
          speaker !== "customer" &&
          speaker !== "participant" &&
          speaker !== "speaker_1" &&
          speaker !== "speaker_2" &&
          speaker !== "unknown") ||
        typeof label !== "string" ||
        typeof text !== "string" ||
        !Array.isArray(sourceSegmentIndexes) ||
        sourceSegmentIndexes.some((index) => typeof index !== "number") ||
        (confidence !== "estimated" && confidence !== "aligned") ||
        (kind !== undefined && kind !== "speech" && kind !== "backchannel" && kind !== "unknown")
      ) {
        return null;
      }

      return {
        id,
        speaker,
        label,
        text,
        sourceSegmentIndexes: sourceSegmentIndexes as number[],
        confidence: confidence as MeetingConversationLog["confidence"],
        kind: kind as MeetingConversationLog["kind"] | undefined,
      };
    })
    .filter((log): log is MeetingConversationLog => Boolean(log));
}

function toAiSummary(value: unknown): MeetingAiSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const overview = (value as { overview?: unknown }).overview;
  const bullets = (value as { bullets?: unknown }).bullets;

  if (typeof overview !== "string" || !Array.isArray(bullets)) {
    return null;
  }

  return {
    overview,
    bullets: bullets.filter((item): item is string => typeof item === "string"),
    diagnosis: toAiDiagnosis((value as { diagnosis?: unknown }).diagnosis),
    manualCompliance: toManualCompliance((value as { manualCompliance?: unknown }).manualCompliance),
  };
}

function toAiDiagnosis(value: unknown): MeetingAiSummary["diagnosis"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const data = value as Record<string, unknown>;
  const status = readRecord(data.status);
  const temperature = readRecord(data.temperature);
  const consideration = readRecord(data.consideration);
  const salesEvaluation = Array.isArray(data.salesEvaluation)
    ? data.salesEvaluation
        .map((item) => {
          const record = readRecord(item);
          if (!record) return null;
          const label = readString(record.label).trim();
          const score = readClampedScore(record.score);
          const description = readString(record.description).trim();
          const evidence = readStringArray(record.evidence);
          return label ? { label, score, description, evidence } : null;
        })
        .filter((item): item is { label: string; score: number; description: string; evidence: string[] } => Boolean(item))
    : [];

  if (!status || !temperature || !consideration) {
    return undefined;
  }

  const stage = readString(status.stage);
  const tone = readString(status.tone);
  const level = readString(temperature.level);

  return {
    status: {
      label: readString(status.label) || "前向きに検討中",
      stage: isDiagnosisStage(stage) ? stage : "discovery",
      description: readString(status.description),
      tone: tone === "positive" || tone === "warning" || tone === "neutral" ? tone : "neutral",
      evidence: readStringArray(status.evidence),
    },
    temperature: {
      level: level === "high" || level === "middle" || level === "low" ? level : "middle",
      stars: Math.min(5, Math.max(1, Math.round(readNumber(temperature.stars) ?? 3))),
      label: readString(temperature.label) || "温度感は中程度",
      description: readString(temperature.description),
      evidence: readStringArray(temperature.evidence),
    },
    consideration: {
      score: readClampedScore(consideration.score),
      label: readString(consideration.label) || "検討の具体度",
      description: readString(consideration.description),
      evidence: readStringArray(consideration.evidence),
    },
    salesEvaluation,
  };
}

function toManualCompliance(value: unknown): MeetingAiSummary["manualCompliance"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const mode = (value as { mode?: unknown }).mode === "manual" ? "manual" : "generic";
  const score = (value as { score?: unknown }).score;

  return {
    mode,
    score: typeof score === "number" ? score : null,
    matchedCriteria: readStringArray((value as { matchedCriteria?: unknown }).matchedCriteria),
    missingCriteria: readStringArray((value as { missingCriteria?: unknown }).missingCriteria),
    productNotes: readStringArray((value as { productNotes?: unknown }).productNotes),
    improvementPhrases: readStringArray((value as { improvementPhrases?: unknown }).improvementPhrases),
    checklistItems: readManualChecklistItems((value as { checklistItems?: unknown }).checklistItems),
  };
}

function readManualChecklistItems(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => {
      const record = readRecord(item);
      if (!record) return null;
      const category = readString(record.category).trim();
      const label = readString(record.label).trim();
      const status = readString(record.status);
      const reason = readString(record.reason).trim();
      const scoreImpact = readNumber(record.scoreImpact);

      if (!category || !label || (status !== "done" && status !== "missing")) {
        return null;
      }

      return {
        category,
        label,
        status,
        reason,
        scoreImpact: scoreImpact === null ? null : Math.round(scoreImpact),
      };
    })
    .filter((item): item is { category: string; label: string; status: "done" | "missing"; reason: string; scoreImpact: number | null } => Boolean(item));

  return items.length > 0 ? items : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readClampedScore(value: unknown) {
  const score = readNumber(value);
  return score === null ? 0 : Math.min(100, Math.max(0, Math.round(score)));
}

function isDiagnosisStage(value: string): value is NonNullable<MeetingAiSummary["diagnosis"]>["status"]["stage"] {
  return [
    "relationship_building",
    "discovery",
    "proposal_preparation",
    "proposal_done",
    "comparison",
    "decision_pending",
    "stalled",
  ].includes(value);
}
