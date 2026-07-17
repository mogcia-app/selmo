import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

import express from "express";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { GoogleAuth } from "google-auth-library";

const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.PORT ?? 8080);
const token = process.env.AUDIO_CONVERTER_TOKEN;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
const transcriptionModel = "gpt-4o-mini-transcribe";
const maxTranscriptionFileSizeBytes = 25 * 1024 * 1024;
const targetChunkSizeBytes = 12 * 1024 * 1024;
const maxOpenAiRetries = 2;
const cloudTasksLocation = process.env.CLOUD_TASKS_LOCATION ?? process.env.CLOUD_RUN_REGION ?? "asia-northeast1";
const cloudTasksQueue = process.env.CLOUD_TASKS_QUEUE ?? "";
const cloudTasksProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
const cloudRunJobName = process.env.CLOUD_RUN_TRANSCRIPTION_JOB_NAME ?? process.env.CLOUD_RUN_JOB_NAME ?? "";
const cloudRunJobRegion = process.env.CLOUD_RUN_TRANSCRIPTION_JOB_REGION ?? process.env.CLOUD_RUN_REGION ?? cloudTasksLocation;
const publicServiceUrl = process.env.AUDIO_CONVERTER_PUBLIC_URL ?? process.env.AUDIO_CONVERTER_CLOUD_RUN_URL ?? "";
const cloudTaskDispatchDeadlineSec = Math.min(
  Math.max(Number(process.env.CLOUD_TASKS_DISPATCH_DEADLINE_SEC ?? 1800), 60),
  1800,
);
const tasksClient = cloudTasksQueue ? new CloudTasksClient() : null;
const runAuth = cloudRunJobName ? new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }) : null;

initializeApp({
  credential: applicationDefault(),
  ...(storageBucket ? { storageBucket } : {}),
});

const db = getFirestore();
const storage = getStorage();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/kick", requireToken, (request, response) => {
  const meetingId = readString(request.body?.meetingId);
  if (!meetingId) {
    response.status(400).json({ error: "meetingId is required" });
    return;
  }

  void convertMeeting(meetingId).catch((error) => {
    console.error("audio conversion failed", { meetingId, error });
  });

  response.status(202).json({ queued: true, meetingId });
});

app.post("/kick-transcription", requireToken, async (request, response) => {
  const meetingId = readString(request.body?.meetingId);
  if (!meetingId) {
    response.status(400).json({ error: "meetingId is required" });
    return;
  }

  try {
    const queuedJob = await runCloudRunTranscriptionJob(meetingId);

    if (queuedJob) {
      response.status(202).json({ queued: true, jobQueued: true, meetingId, operationName: queuedJob.name });
      return;
    }
  } catch (error) {
    console.error("audio transcription job enqueue failed", { meetingId, error });
  }

  try {
    const queuedTask = await enqueueTranscriptionTask({
      meetingId,
      fallbackBaseUrl: `${request.protocol}://${request.get("host")}`,
    });

    if (queuedTask) {
      response.status(202).json({ queued: true, taskQueued: true, meetingId, taskName: queuedTask.name });
      return;
    }
  } catch (error) {
    console.error("audio transcription task enqueue failed", { meetingId, error });
  }

  void transcribeMeeting(meetingId).catch((error) => {
    console.error("audio transcription failed", { meetingId, error });
  });

  response.status(202).json({ queued: true, taskQueued: false, meetingId });
});

app.post("/convert", requireToken, async (request, response) => {
  const meetingId = readString(request.body?.meetingId);
  if (!meetingId) {
    response.status(400).json({ error: "meetingId is required" });
    return;
  }

  try {
    const result = await convertMeeting(meetingId);
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: readErrorMessage(error) });
  }
});

app.post("/transcribe", requireToken, async (request, response) => {
  const meetingId = readString(request.body?.meetingId);
  if (!meetingId) {
    response.status(400).json({ error: "meetingId is required" });
    return;
  }

  try {
    const result = await transcribeMeeting(meetingId);
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: readErrorMessage(error) });
  }
});

app.post("/process-pending", requireToken, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.body?.limit ?? 3), 1), 10);
  const snapshot = await db
    .collection("audioProcessingJobs")
    .where("status", "==", "convert_required")
    .limit(limit)
    .get();
  const meetingIds = snapshot.docs.map((doc) => doc.id);

  for (const meetingId of meetingIds) {
    void convertMeeting(meetingId).catch((error) => {
      console.error("pending audio conversion failed", { meetingId, error });
    });
  }

  response.status(202).json({ queued: meetingIds.length, meetingIds });
});

app.post("/process-transcription-pending", requireToken, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.body?.limit ?? 2), 1), 5);
  const snapshot = await db
    .collection("audioProcessingJobs")
    .where("status", "==", "transcription_queued")
    .limit(limit)
    .get();
  const meetingIds = snapshot.docs.map((doc) => doc.id);

  const taskResults = [];
  for (const meetingId of meetingIds) {
    try {
      const queuedJob = await runCloudRunTranscriptionJob(meetingId);

      if (queuedJob) {
        taskResults.push({ meetingId, jobQueued: true, operationName: queuedJob.name });
        continue;
      }
    } catch (error) {
      console.error("pending audio transcription job enqueue failed", { meetingId, error });
    }

    try {
      const queuedTask = await enqueueTranscriptionTask({
        meetingId,
        fallbackBaseUrl: `${request.protocol}://${request.get("host")}`,
      });

      if (queuedTask) {
        taskResults.push({ meetingId, taskQueued: true, taskName: queuedTask.name });
        continue;
      }
    } catch (error) {
      console.error("pending audio transcription task enqueue failed", { meetingId, error });
    }

    void transcribeMeeting(meetingId).catch((error) => {
      console.error("pending audio transcription failed", { meetingId, error });
    });
    taskResults.push({ meetingId, taskQueued: false });
  }

  response.status(202).json({ queued: meetingIds.length, meetingIds, tasks: taskResults });
});

if (process.env.RUN_MODE === "transcription-job") {
  runTranscriptionJobFromEnv().catch((error) => {
    console.error("transcription job failed", { error });
    process.exitCode = 1;
  });
} else {
  app.listen(port, () => {
    console.log(`selmo audio converter listening on ${port}`);
  });
}

async function runTranscriptionJobFromEnv() {
  const meetingId = readString(process.env.TRANSCRIPTION_MEETING_ID);
  if (!meetingId) {
    throw new Error("TRANSCRIPTION_MEETING_ID is required");
  }

  await transcribeMeeting(meetingId);
}

async function runCloudRunTranscriptionJob(meetingId) {
  if (!cloudRunJobName || !runAuth) {
    return null;
  }

  const projectId = cloudTasksProjectId || await runAuth.getProjectId();
  const authClient = await runAuth.getClient();
  const accessTokenResponse = await authClient.getAccessToken();
  const accessToken =
    typeof accessTokenResponse === "string"
      ? accessTokenResponse
      : accessTokenResponse?.token;

  if (!accessToken) {
    throw new Error("failed to obtain Google Cloud access token");
  }

  const response = await fetch(
    `https://run.googleapis.com/v2/projects/${projectId}/locations/${cloudRunJobRegion}/jobs/${cloudRunJobName}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [
            {
              env: [
                {
                  name: "TRANSCRIPTION_MEETING_ID",
                  value: meetingId,
                },
              ],
            },
          ],
        },
      }),
    },
  );
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(responseText || `Cloud Run job returned ${response.status}`);
  }

  const payload = responseText.trim() ? JSON.parse(responseText) : {};
  await db.collection("audioProcessingJobs").doc(meetingId).set(
    {
      meetingId,
      status: "transcription_queued",
      transcriptionJobName: cloudRunJobName,
      transcriptionJobOperationName: payload.name ?? null,
      transcriptionJobQueuedAt: FieldValue.serverTimestamp(),
      errorMessage: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return payload;
}

async function enqueueTranscriptionTask({ meetingId, fallbackBaseUrl }) {
  if (!tasksClient || !cloudTasksQueue || !token) {
    return null;
  }

  const projectId = cloudTasksProjectId || await tasksClient.getProjectId();
  const parent = tasksClient.queuePath(projectId, cloudTasksLocation, cloudTasksQueue);
  const baseUrl = (publicServiceUrl || fallbackBaseUrl || "").replace(/\/$/, "");

  if (!baseUrl) {
    return null;
  }

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: `${baseUrl}/transcribe`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: Buffer.from(JSON.stringify({ meetingId })).toString("base64"),
    },
    dispatchDeadline: {
      seconds: cloudTaskDispatchDeadlineSec,
    },
  };
  const [createdTask] = await tasksClient.createTask({ parent, task });

  await db.collection("audioProcessingJobs").doc(meetingId).set(
    {
      meetingId,
      status: "transcription_queued",
      transcriptionTaskName: createdTask.name ?? null,
      transcriptionTaskQueuedAt: FieldValue.serverTimestamp(),
      errorMessage: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return createdTask;
}

function requireToken(request, response, next) {
  if (!token) {
    response.status(500).json({ error: "AUDIO_CONVERTER_TOKEN is not configured" });
    return;
  }

  const authHeader = request.get("authorization") ?? "";
  const requestToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (requestToken !== token) {
    response.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}

async function convertMeeting(meetingId) {
  const meetingRef = db.collection("meetings").doc(meetingId);
  const jobRef = db.collection("audioProcessingJobs").doc(meetingId);
  const meetingSnapshot = await meetingRef.get();

  if (!meetingSnapshot.exists) {
    throw new Error("meeting not found");
  }

  const meeting = meetingSnapshot.data();
  if (!meeting?.audioFilePath) {
    throw new Error("audio file path is missing");
  }

  if (!isWavAudio(meeting)) {
    await jobRef.set(
      {
        status: "waiting",
        errorMessage: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { meetingId, converted: false, reason: "not_wav" };
  }

  await jobRef.set(
    {
      status: "converting",
      errorMessage: null,
      conversionStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const bucket = storage.bucket();
  const sourceFile = bucket.file(meeting.audioFilePath);
  const tempDir = await mkdtemp(join(tmpdir(), "selmo-audio-convert-"));

  try {
    const [sourceBuffer] = await sourceFile.download();
    const inputPath = join(tempDir, `input${extname(meeting.audioFileName ?? meeting.audioFilePath) || ".wav"}`);
    const outputPath = join(tempDir, "output.mp3");

    await writeFile(inputPath, sourceBuffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      outputPath,
    ]);

    const mp3Buffer = await readFile(outputPath);
    const mp3Path = buildMp3Path(meeting.audioFilePath);
    const mp3FileName = buildMp3FileName(meeting.audioFileName ?? basename(meeting.audioFilePath));
    const downloadToken = randomUUID();

    await bucket.file(mp3Path).save(mp3Buffer, {
      contentType: "audio/mpeg",
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          convertedFrom: meeting.audioFileName ?? basename(meeting.audioFilePath),
          meetingId,
          uploadedBy: meeting.userId ?? "",
        },
      },
    });

    await sourceFile.delete({ ignoreNotFound: true }).catch(() => undefined);

    await meetingRef.update({
      audioFilePath: mp3Path,
      audioDownloadUrl: buildFirebaseDownloadUrl(bucket.name, mp3Path, downloadToken),
      audioFileName: mp3FileName,
      audioSizeBytes: mp3Buffer.byteLength,
      audioMimeType: "audio/mpeg",
      audioConvertedFrom: meeting.audioFileName ?? null,
      audioConvertedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await jobRef.set(
      {
        status: "converted",
        fileName: mp3FileName,
        errorMessage: null,
        conversionCompletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      meetingId,
      converted: true,
      audioFilePath: mp3Path,
      audioFileName: mp3FileName,
      audioMimeType: "audio/mpeg",
      audioSizeBytes: mp3Buffer.byteLength,
    };
  } catch (error) {
    await jobRef.set(
      {
        status: "failed",
        errorMessage: readErrorMessage(error),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function transcribeMeeting(meetingId) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const meetingRef = db.collection("meetings").doc(meetingId);
  const jobRef = db.collection("audioProcessingJobs").doc(meetingId);
  const meetingSnapshot = await meetingRef.get();

  if (!meetingSnapshot.exists) {
    throw new Error("meeting not found");
  }

  let meeting = meetingSnapshot.data();
  if (!meeting?.audioFilePath) {
    throw new Error("audio file path is missing");
  }

  if (isWavAudio(meeting)) {
    await convertMeeting(meetingId);
    const convertedSnapshot = await meetingRef.get();
    meeting = convertedSnapshot.data();
    if (!meeting?.audioFilePath) {
      throw new Error("converted audio file path is missing");
    }
  }

  await meetingRef.set(
    {
      transcriptionProbeStatus: "running",
      transcriptionProbeModel: transcriptionModel,
      transcriptionProbeError: null,
      transcriptionProbeTestedAt: FieldValue.serverTimestamp(),
      conversationLogStatus: "running",
      conversationLogModel: transcriptionModel,
      conversationLogError: null,
      processingStatus: "transcribing",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await jobRef.set(
    {
      companyId: meeting.companyId ?? null,
      userId: meeting.userId ?? null,
      meetingId,
      fileName: meeting.audioFileName ?? "",
      audioDurationSec: readNumber(meeting.audioDurationSec) ?? 0,
      status: "transcribing",
      transcriptionStartedAt: FieldValue.serverTimestamp(),
      errorMessage: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const bucket = storage.bucket();
  const sourceFile = bucket.file(meeting.audioFilePath);
  const tempDir = await mkdtemp(join(tmpdir(), "selmo-audio-transcribe-"));

  try {
    const [sourceBuffer] = await sourceFile.download();
    const fileName = meeting.audioFileName ?? basename(meeting.audioFilePath);
    const mimeType = meeting.audioMimeType || "audio/mpeg";
    const audioDurationSec = readNumber(meeting.audioDurationSec);
    const audioFiles =
      sourceBuffer.byteLength > maxTranscriptionFileSizeBytes
        ? await splitOversizedAudio({
            tempDir,
            fileBuffer: sourceBuffer,
            fileName,
            audioDurationSec,
          })
        : [
            {
              fileName,
              mimeType,
              buffer: sourceBuffer,
            },
          ];

    const chunkResults = [];
    for (const audioFile of audioFiles) {
      chunkResults.push(
        await transcribeChunk({
          fileName: audioFile.fileName,
          mimeType: audioFile.mimeType,
          fileBuffer: audioFile.buffer,
          language: "ja",
          model: transcriptionModel,
        }),
      );
    }

    const text = chunkResults
      .map((chunk) => String(chunk.text ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    const language = chunkResults.find((chunk) => chunk.language)?.language ?? "ja";
    const durationSec = chunkResults.reduce(
      (sum, chunk) => sum + (typeof chunk.duration === "number" ? chunk.duration : 0),
      0,
    );
    const segments = flattenSegmentsWithOffsets(chunkResults);
    const segmentCount = segments.length;
    const conversationLogs = buildConversationLogsFromSegments(segments);
    const loggedDurationSec = durationSec || audioDurationSec || null;

    await meetingRef.set(
      {
        transcriptionProbeStatus: "completed",
        transcriptionProbeModel: transcriptionModel,
        transcriptionProbeText: text,
        transcriptionProbeLanguage: language,
        transcriptionProbeError: null,
        transcriptionProbeSegmentCount: segmentCount || null,
        transcriptionProbeSegments: segments,
        transcriptionProbeDurationSec: loggedDurationSec,
        transcriptionProbeTestedAt: FieldValue.serverTimestamp(),
        conversationLogStatus: "completed",
        conversationLogModel: transcriptionModel,
        conversationLogs,
        conversationLogCount: conversationLogs.length,
        conversationLogError: null,
        conversationLogTestedAt: FieldValue.serverTimestamp(),
        processingStatus: "uploaded",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await jobRef.set(
      {
        status: "completed",
        errorMessage: null,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await saveAiUsageLog({
      companyId: meeting.companyId,
      userId: meeting.userId,
      feature: "transcription",
      model: transcriptionModel,
      audioDurationSec: loggedDurationSec,
      estimatedCostUsd: estimateTranscriptionCostUsd({
        model: transcriptionModel,
        audioDurationSec: loggedDurationSec,
      }),
      status: "success",
    });

    return {
      meetingId,
      transcribed: true,
      durationSec: loggedDurationSec,
      segmentCount,
      chunkCount: chunkResults.length,
      wasChunked: chunkResults.length > 1,
    };
  } catch (error) {
    const message = readErrorMessage(error);
    await meetingRef.set(
      {
        transcriptionProbeStatus: "failed",
        transcriptionProbeModel: transcriptionModel,
        transcriptionProbeError: message,
        conversationLogStatus: "failed",
        conversationLogModel: transcriptionModel,
        conversationLogError: message,
        processingStatus: "failed",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await jobRef.set(
      {
        status: "failed",
        errorMessage: message,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await saveAiUsageLog({
      companyId: meeting.companyId,
      userId: meeting.userId,
      feature: "transcription",
      model: transcriptionModel,
      audioDurationSec: readNumber(meeting.audioDurationSec),
      estimatedCostUsd: estimateTranscriptionCostUsd({
        model: transcriptionModel,
        audioDurationSec: readNumber(meeting.audioDurationSec),
      }),
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId: meeting.companyId,
      userId: meeting.userId,
      kind: "OpenAI",
      message,
      severity: "critical",
      source: "audio-converter/transcribe",
    });
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function splitOversizedAudio({ tempDir, fileBuffer, fileName, audioDurationSec }) {
  const inputExtension = extname(fileName) || ".mp3";
  const inputPath = join(tempDir, `input${inputExtension}`);
  const outputPattern = join(tempDir, "chunk-%03d.mp3");
  await writeFile(inputPath, fileBuffer);

  const segmentDurationSec = estimateSegmentDurationSec({
    fileSizeBytes: fileBuffer.byteLength,
    audioDurationSec,
  });

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    "-f",
    "segment",
    "-segment_time",
    String(segmentDurationSec),
    outputPattern,
  ]);

  const entries = (await readdir(tempDir))
    .filter((entry) => entry.startsWith("chunk-") && entry.endsWith(".mp3"))
    .sort();

  if (entries.length === 0) {
    throw new Error("audio split failed");
  }

  const chunks = [];
  for (const entry of entries) {
    const chunkPath = join(tempDir, entry);
    const buffer = await readFile(chunkPath);

    if (buffer.byteLength > maxTranscriptionFileSizeBytes) {
      throw new Error("split audio chunk still exceeds 25MB");
    }

    chunks.push({
      fileName: entry,
      mimeType: "audio/mpeg",
      buffer,
    });
  }

  return chunks;
}

async function transcribeChunk({ fileName, mimeType, fileBuffer, language, model }) {
  const bytes = new Uint8Array(fileBuffer);
  const file = new File([bytes], fileName, { type: mimeType });
  let lastErrorMessage = "transcription failed";

  for (let attempt = 0; attempt <= maxOpenAiRetries; attempt += 1) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", model);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    if (language) {
      formData.append("language", language);
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });
    const responseText = await response.text();

    if (response.ok) {
      if (!responseText.trim()) {
        throw new Error("OpenAI returned empty transcription response");
      }

      return JSON.parse(responseText);
    }

    lastErrorMessage = mapOpenAiErrorMessage(responseText || response.statusText || "OpenAI error");
    if (!shouldRetryOpenAiRequest(response.status) || attempt === maxOpenAiRetries) {
      break;
    }

    await wait(1000 * (attempt + 1));
  }

  throw new Error(lastErrorMessage);
}

function estimateSegmentDurationSec({ fileSizeBytes, audioDurationSec }) {
  if (!audioDurationSec || audioDurationSec <= 0) {
    return 10 * 60;
  }

  const estimated = Math.floor((audioDurationSec * targetChunkSizeBytes) / fileSizeBytes);
  return Math.max(4 * 60, Math.min(12 * 60, estimated));
}

function flattenSegmentsWithOffsets(chunkResults) {
  let offsetSec = 0;
  const flattened = [];

  for (const chunk of chunkResults) {
    if (Array.isArray(chunk.segments)) {
      for (const segment of chunk.segments) {
        if (
          typeof segment.start === "number" &&
          typeof segment.end === "number" &&
          typeof segment.text === "string"
        ) {
          flattened.push({
            startSec: offsetSec + segment.start,
            endSec: offsetSec + segment.end,
            text: segment.text,
            speaker: typeof segment.speaker === "string" ? segment.speaker : null,
          });
        }
      }
    }

    offsetSec += typeof chunk.duration === "number" ? chunk.duration : 0;
  }

  return flattened;
}

function buildConversationLogsFromSegments(segments) {
  const speakerMap = new Map();
  let speakerCount = 0;

  return segments.map((segment, index) => {
    const speaker = normalizeTranscriptSpeaker(segment.speaker ?? null, speakerMap, () => {
      speakerCount += 1;
      return speakerCount;
    });

    return {
      id: `log_${index + 1}`,
      speaker,
      label: buildSpeakerLabel(speaker),
      text: String(segment.text ?? "").trim(),
      sourceSegmentIndexes: [index],
      confidence: "aligned",
      kind: speaker === "unknown" ? "unknown" : "speech",
    };
  }).filter((log) => log.text);
}

function normalizeTranscriptSpeaker(rawSpeaker, speakerMap, nextSpeakerIndex) {
  if (rawSpeaker === "sales" || rawSpeaker === "customer" || rawSpeaker === "participant" || rawSpeaker === "unknown") {
    return rawSpeaker;
  }

  if (rawSpeaker === "speaker_1") return "sales";
  if (rawSpeaker === "speaker_2") return "customer";
  if (rawSpeaker === "speaker_3") return "participant";

  const normalizedKey = String(rawSpeaker ?? "").trim();
  if (!normalizedKey) {
    return "unknown";
  }

  const existing = speakerMap.get(normalizedKey);
  if (existing) {
    return existing;
  }

  const index = nextSpeakerIndex();
  const speaker = index === 1 ? "sales" : index === 2 ? "customer" : "unknown";
  speakerMap.set(normalizedKey, speaker);
  return speaker;
}

function buildSpeakerLabel(speaker) {
  if (speaker === "sales") return "営業";
  if (speaker === "customer") return "顧客";
  if (speaker === "participant") return "同席者";
  return "不明";
}

function shouldRetryOpenAiRequest(status) {
  return status === 429 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapOpenAiErrorMessage(rawMessage) {
  try {
    const parsed = JSON.parse(rawMessage);
    const code = parsed.error?.code ?? parsed.error?.type ?? null;

    if (code === "insufficient_quota") {
      return "OpenAI API quota is insufficient";
    }

    if (code === "invalid_api_key") {
      return "OpenAI API key is invalid";
    }

    if (code === "rate_limit_exceeded") {
      return "OpenAI API rate limit exceeded";
    }

    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // noop
  }

  return rawMessage;
}

async function saveAiUsageLog(input) {
  await db.collection("aiUsageLogs").add({
    companyId: input.companyId ?? "unknown",
    userId: input.userId ?? "unknown",
    feature: input.feature,
    model: input.model,
    ...(input.audioDurationSec != null ? { audioDurationSec: input.audioDurationSec } : {}),
    ...(input.estimatedCostUsd != null ? { estimatedCostUsd: input.estimatedCostUsd } : {}),
    createdAt: FieldValue.serverTimestamp(),
    status: input.status,
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  }).catch(() => undefined);
}

async function saveSystemErrorLog(input) {
  await db.collection("systemErrors").add({
    ...(input.companyId !== undefined ? { companyId: input.companyId ?? "unknown" } : {}),
    ...(input.userId !== undefined ? { userId: input.userId ?? "unknown" } : {}),
    kind: input.kind,
    message: input.message,
    severity: input.severity,
    status: "open",
    occurredAt: FieldValue.serverTimestamp(),
    ...(input.source ? { source: input.source } : {}),
  }).catch(() => undefined);
}

function estimateTranscriptionCostUsd({ model, audioDurationSec }) {
  const minutes = (audioDurationSec ?? 0) / 60;
  if (minutes <= 0) {
    return null;
  }

  if (model === "gpt-4o-mini-transcribe") {
    return minutes * 0.003;
  }

  return null;
}

function isWavAudio(meeting) {
  const mimeType = String(meeting.audioMimeType ?? "").toLowerCase();
  const fileName = String(meeting.audioFileName ?? "").toLowerCase();

  return mimeType.includes("wav") || fileName.endsWith(".wav") || fileName.endsWith(".wave");
}

function buildMp3Path(audioFilePath) {
  const extension = extname(audioFilePath);
  if (!extension) {
    return `${audioFilePath}.mp3`;
  }

  return `${audioFilePath.slice(0, -extension.length)}.mp3`;
}

function buildMp3FileName(fileName) {
  const extension = extname(fileName);
  if (!extension) {
    return `${fileName}.mp3`;
  }

  return `${fileName.slice(0, -extension.length)}.mp3`;
}

function buildFirebaseDownloadUrl(bucketName, path, downloadToken) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}
