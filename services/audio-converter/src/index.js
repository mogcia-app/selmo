import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

import express from "express";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.PORT ?? 8080);
const token = process.env.AUDIO_CONVERTER_TOKEN;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

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

app.post("/process-pending", requireToken, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.body?.limit ?? 3), 1), 10);
  const snapshot = await db
    .collection("audioProcessingJobs")
    .where("status", "==", "convert_required")
    .limit(limit)
    .get();
  const results = [];

  for (const doc of snapshot.docs) {
    try {
      results.push(await convertMeeting(doc.id));
    } catch (error) {
      results.push({ meetingId: doc.id, converted: false, error: readErrorMessage(error) });
    }
  }

  response.json({ processed: results.length, results });
});

app.listen(port, () => {
  console.log(`selmo audio converter listening on ${port}`);
});

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

function readErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}
