"use client";

import {
  FirestoreError,
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

import { assertFirebaseClient } from "@/lib/firebase/client";
import { resolveCompanyId } from "@/lib/firebase/company";
import {
  createAudioProcessingJob,
  saveSystemError,
  updateAudioProcessingJob,
} from "@/lib/firebase/operations";
import type { MeetingOutcome, ProcessingStatus } from "@/types/domain";

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
  speaker: "speaker_1" | "speaker_2" | "unknown";
  label: string;
  text: string;
  sourceSegmentIndexes: number[];
  confidence: "estimated" | "aligned";
  kind?: "speech" | "backchannel" | "unknown";
};

export type MeetingAiSummary = {
  overview: string;
  bullets: string[];
};

export type MeetingRecord = {
  id: string;
  companyId: string;
  userId: string;
  uploadedBy: string;
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
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
};

export type CreateMeetingInput = {
  userId: string;
  companyId?: string | null;
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
  recordedAt: Date;
  location?: string;
  memo?: string;
  status: MeetingOutcome;
  audioFile?: File | null;
  audioDurationSec?: number | null;
  onUploadProgress?: (progress: number) => void;
};

export type UpdateMeetingMetadataInput = {
  customerName: string;
  productType: string;
  customerType: "new" | "existing";
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

  await setDoc(meetingRef, {
    companyId,
    userId: input.userId,
    uploadedBy: input.userId,
    customerName: input.customerName,
    productType: input.productType,
    customerType: input.customerType,
    recordedAt: Timestamp.fromDate(input.recordedAt),
    location: input.location ?? "",
    memo: input.memo ?? "",
    status: input.status,
    audioFilePath: null,
    audioDownloadUrl: null,
    audioFileName: input.audioFile?.name ?? null,
    audioSizeBytes: input.audioFile?.size ?? null,
    audioDurationSec: input.audioDurationSec ?? null,
    audioDeletedAt: null,
    audioMimeType: input.audioFile?.type || "audio/mpeg",
    processingStatus: input.audioFile ? "uploading" : "uploaded",
    reanalysisCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (!input.audioFile) {
    return meetingRef.id;
  }

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
  },
  callback: (meetings: MeetingRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const meetingsRef = collection(firestore, "meetings");
  const meetingsQuery =
    input.role === "admin"
      ? query(meetingsRef)
      : query(meetingsRef, where("userId", "==", input.userId));

  return onSnapshot(
    meetingsQuery,
    (snapshot) => {
      const meetings = snapshot.docs
        .map((docSnapshot) =>
          mapMeetingRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>),
        )
        .sort((left, right) => {
          const leftTime = left.recordedAt?.getTime() ?? 0;
          const rightTime = right.recordedAt?.getTime() ?? 0;
          return rightTime - leftTime;
        });

      callback(meetings);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeToMeeting(
  meetingId: string,
  callback: (meeting: MeetingRecord | null) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  return onSnapshot(
    doc(firestore, "meetings", meetingId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(mapMeetingRecord(snapshot.id, snapshot.data() as Record<string, unknown>));
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
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
    recordedAt: input.recordedAt ? Timestamp.fromDate(input.recordedAt) : null,
    location: input.location ?? "",
    memo: input.memo ?? "",
    status: input.status,
    updatedAt: serverTimestamp(),
  });
}

function buildMeetingAudioPath(userId: string, meetingId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `meetings/${userId}/${meetingId}/${Date.now()}-${safeName}`;
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
    customerName: String(data.customerName ?? ""),
    productType: String(data.productType ?? ""),
    customerType: (data.customerType as "new" | "existing") ?? "new",
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
        (speaker !== "speaker_1" && speaker !== "speaker_2" && speaker !== "unknown") ||
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
  };
}
