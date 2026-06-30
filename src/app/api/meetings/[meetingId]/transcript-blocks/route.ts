import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateTranscriptionCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  assertMeetingAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const remoteFetchTimeoutMs = 10 * 60 * 1000;
const defaultChunkDurationSec = 75;
const defaultOverlapSec = 6;
const transcriptionModel = "gpt-4o-mini-transcribe";
const ffmpegCandidates = [
  process.env.FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/bin/ffmpeg",
  "ffmpeg",
].filter(Boolean) as string[];

type RequestBody = {
  audioDownloadUrl?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioDurationSec?: number | null;
  language?: string;
  model?: string;
};

type TranscriptBlock = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  rawText: string | null;
  summary: string | null;
  alignmentSource: "chunk";
  confidence: "estimated";
};

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "OpenAI" | "Storage" | "API" = "API",
  ) {
    super(message);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> },
) {
  let body: RequestBody | null = null;
  let apiUser: ApiUserContext | null = null;
  const selectedModel = transcriptionModel;

  try {
    apiUser = await requireApiUser(request);
    const { meetingId } = await context.params;
    const meeting = await assertMeetingAccess(apiUser, meetingId);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。" },
        { status: 500 },
      );
    }

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
    }

    const audioDownloadUrl = readString(meeting.data.audioDownloadUrl) || readString(body.audioDownloadUrl);
    if (!audioDownloadUrl) {
      return NextResponse.json(
        { error: "音声ファイルのダウンロードURLが見つかりません。" },
        { status: 400 },
      );
    }

    const usageAvailability = await assertMonthlyAiUsageAvailable({
      userId: apiUser.uid,
      feature: "meeting",
      allowCurrentUsage: true,
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

    const model = transcriptionModel;

    const audioResponse = await fetchWithTimeout(audioDownloadUrl, {
      timeoutMs: remoteFetchTimeoutMs,
    });

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Storage から音声ファイルを取得できませんでした。" },
        { status: 502 },
      );
    }

    const fileBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const fileName = readString(meeting.data.audioFileName) || body.audioFileName || `${meetingId}.mp3`;
    const mimeType =
      readString(meeting.data.audioMimeType) || body.audioMimeType || audioResponse.headers.get("content-type") || "audio/mpeg";
    const audioDurationSec = body.audioDurationSec ?? readNumber(meeting.data.audioDurationSec);
    const tempDir = await mkdtemp(join(tmpdir(), "selmo-transcript-blocks-"));

    try {
      const chunks =
        audioDurationSec && audioDurationSec > defaultChunkDurationSec
          ? await splitAudioIntoTimedChunks({
              tempDir,
              fileBuffer,
              fileName,
              audioDurationSec,
              chunkDurationSec: defaultChunkDurationSec,
              overlapSec: defaultOverlapSec,
            })
          : [
              {
                fileName,
                mimeType,
                buffer: fileBuffer,
                startSec: 0,
                endSec: audioDurationSec ?? 6 * 60 * 60,
              },
            ];

      const chunkResults = [];
      for (const chunk of chunks) {
        const transcription = await transcribeChunk({
          fileName: chunk.fileName,
          mimeType: chunk.mimeType,
          fileBuffer: chunk.buffer,
          language: body.language?.trim() || "ja",
          model,
        });

        chunkResults.push({
          ...chunk,
          text: transcription.text ?? "",
        });
      }

      const blocks = mergeChunkTexts(
        chunkResults.map((chunk, index) => ({
          id: `block_${String(index + 1).padStart(3, "0")}`,
          startSec: chunk.startSec,
          endSec: chunk.endSec,
          text: normalizeTranscriptText(chunk.text),
          rawText: chunk.text || null,
          summary: null,
          alignmentSource: "chunk" as const,
          confidence: "estimated" as const,
        })),
      ).filter((block) => block.text);
      await saveAiUsageLog({
        companyId: apiUser.companyId,
        userId: apiUser.uid,
        feature: "transcription",
        model,
        audioDurationSec,
        estimatedCostUsd: estimateTranscriptionCostUsd({
          model,
          audioDurationSec,
        }),
        status: "success",
      });

      return NextResponse.json({
        meetingId,
        model,
        durationSec: audioDurationSec,
        blockCount: blocks.length,
        blocks,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message =
      error instanceof Error ? error.message : "本文ブロック生成に失敗しました。";
    const status = error instanceof RouteError ? error.status : 500;
    const kind = error instanceof RouteError ? error.kind : message.includes("Storage") ? "Storage" : "OpenAI";
    await saveAiUsageLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      feature: "transcription",
      model: selectedModel,
      audioDurationSec: body?.audioDurationSec ?? null,
      estimatedCostUsd: estimateTranscriptionCostUsd({
        model: selectedModel,
        audioDurationSec: body?.audioDurationSec ?? null,
      }),
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId: apiUser?.companyId,
      userId: apiUser?.uid,
      kind,
      message,
      severity: status >= 500 ? "critical" : "warning",
      source: "api/meetings/transcript-blocks",
    });

    return NextResponse.json(
      {
        error: "本文ブロック生成に失敗しました。",
        detail: message,
      },
      { status },
    );
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function transcribeChunk({
  fileName,
  mimeType,
  fileBuffer,
  language,
  model,
}: {
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  language: string;
  model: typeof transcriptionModel;
}) {
  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);
  formData.append("language", language);
  formData.append("response_format", "json");

  const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
    timeoutMs: remoteFetchTimeoutMs,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenAI への本文ブロック生成に失敗しました。${responseText || response.statusText}`,
    );
  }

  try {
    return JSON.parse(responseText) as { text?: string };
  } catch {
    throw new Error("OpenAI の本文ブロックレスポンス解析に失敗しました。");
  }
}

async function splitAudioIntoTimedChunks({
  tempDir,
  fileBuffer,
  fileName,
  audioDurationSec,
  chunkDurationSec,
  overlapSec,
}: {
  tempDir: string;
  fileBuffer: Buffer;
  fileName: string;
  audioDurationSec: number;
  chunkDurationSec: number;
  overlapSec: number;
}) {
  const inputExtension = extname(fileName) || ".mp3";
  const inputPath = join(tempDir, `input${inputExtension}`);
  await writeFile(inputPath, fileBuffer);
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new RouteError(
      "長い音声をサーバー側で分割できませんでした。音声を短いファイルに分けるか、軽量なmp3/m4aにして再度アップロードしてください。",
      413,
      "API",
    );
  }

  const chunks = [];
  let startSec = 0;
  let index = 0;

  while (startSec < audioDurationSec) {
    const durationSec = Math.min(chunkDurationSec, audioDurationSec - startSec);
    const outputName = `chunk-${String(index + 1).padStart(3, "0")}.mp3`;
    const outputPath = join(tempDir, outputName);

    await execFileAsync(ffmpegPath, [
      "-y",
      "-ss",
      String(startSec),
      "-t",
      String(durationSec),
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

    chunks.push({
      fileName: outputName,
      mimeType: "audio/mpeg",
      buffer: await readFile(outputPath),
      startSec,
      endSec: Math.min(audioDurationSec, startSec + durationSec),
    });

    if (startSec + durationSec >= audioDurationSec) {
      break;
    }

    startSec += Math.max(1, chunkDurationSec - overlapSec);
    index += 1;
  }

  return chunks;
}

async function resolveFfmpegPath() {
  for (const candidate of ffmpegCandidates) {
    try {
      await execFileAsync(candidate, ["-version"]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function mergeChunkTexts(blocks: TranscriptBlock[]) {
  return blocks.map((block, index) => {
    if (index === 0) {
      return block;
    }

    const previous = blocks[index - 1];
    return {
      ...block,
      text: trimOverlappedPrefix(previous.text, block.text),
    };
  });
}

function trimOverlappedPrefix(previousText: string, nextText: string) {
  if (!previousText || !nextText) {
    return nextText;
  }

  const previousTail = previousText.slice(-36).trim();
  const nextHead = nextText.slice(0, 36).trim();
  if (previousTail && nextHead && previousTail === nextHead) {
    return nextText.slice(nextText.indexOf(nextHead) + nextHead.length).trim();
  }

  const previousSentences = previousText
    .split(/(?<=[。！？\n])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const nextSentences = nextText
    .split(/(?<=[。！？\n])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  while (
    previousSentences.length > 0 &&
    nextSentences.length > 0 &&
    previousSentences[previousSentences.length - 1] === nextSentences[0]
  ) {
    nextSentences.shift();
  }

  return nextSentences.join(" ").trim() || nextText.trim();
}

function normalizeTranscriptText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([。！？])\s*/g, "$1 ")
    .trim();
}

async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit & { timeoutMs?: number },
) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? remoteFetchTimeoutMs;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("外部サービスの応答がタイムアウトしました。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
