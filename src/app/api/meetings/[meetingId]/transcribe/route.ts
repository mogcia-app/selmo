import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maxTranscriptionFileSizeBytes = 25 * 1024 * 1024;
const targetChunkSizeBytes = 12 * 1024 * 1024;
const maxOpenAiRetries = 2;
const remoteFetchTimeoutMs = 10 * 60 * 1000;
const transcriptionModels = new Set([
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "gpt-4o-transcribe-diarize",
  "whisper-1",
]);
const execFileAsync = promisify(execFile);

type TranscriptionSegment = {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string | null;
};

type RequestBody = {
  audioDownloadUrl?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioSizeBytes?: number | null;
  audioDurationSec?: number | null;
  language?: string;
  model?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> },
) {
  try {
    const { meetingId } = await context.params;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY が未設定です。.env.local または Vercel の環境変数に追加してください。",
        },
        { status: 500 },
      );
    }

    let body: RequestBody;

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
    }

    if (!body.audioDownloadUrl) {
      return NextResponse.json(
        { error: "音声ファイルのダウンロードURLが見つかりません。" },
        { status: 400 },
      );
    }

    const model = transcriptionModels.has(body.model ?? "")
      ? (body.model as
          | "gpt-4o-mini-transcribe"
          | "gpt-4o-transcribe"
          | "gpt-4o-transcribe-diarize"
          | "whisper-1")
      : "gpt-4o-mini-transcribe";

    const audioResponse = await fetchWithTimeout(body.audioDownloadUrl, {
      timeoutMs: remoteFetchTimeoutMs,
    });

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Storage から音声ファイルを取得できませんでした。" },
        { status: 502 },
      );
    }

    const fileBuffer = await audioResponse.arrayBuffer();
    const contentType =
      body.audioMimeType || audioResponse.headers.get("content-type") || "audio/mpeg";
    const fileName = body.audioFileName || `${meetingId}.mp3`;
    const inputBuffer = Buffer.from(fileBuffer);
    const tempDir = await mkdtemp(join(tmpdir(), "selmo-transcribe-"));

    try {
      const audioFiles =
        inputBuffer.byteLength > maxTranscriptionFileSizeBytes
          ? await splitOversizedAudio({
              tempDir,
              fileBuffer: inputBuffer,
              fileName,
              audioDurationSec: body.audioDurationSec ?? null,
            })
          : [
              {
                fileName,
                mimeType: contentType,
                buffer: inputBuffer,
              },
            ];

      const chunkResults = [];
      for (const audioFile of audioFiles) {
        chunkResults.push(
          await transcribeChunk({
            fileName: audioFile.fileName,
            mimeType: audioFile.mimeType,
            fileBuffer: audioFile.buffer,
            language: body.language?.trim() || null,
            model,
          }),
        );
      }

      const text = chunkResults
        .map((chunk) => chunk.text?.trim())
        .filter(Boolean)
        .join("\n\n");
      const language =
        chunkResults.find((chunk) => chunk.language)?.language ?? body.language ?? null;
      const durationSec = chunkResults.reduce(
        (sum, chunk) => sum + (typeof chunk.duration === "number" ? chunk.duration : 0),
        0,
      );
      const segmentCount = chunkResults.reduce(
        (sum, chunk) => sum + (Array.isArray(chunk.segments) ? chunk.segments.length : 0),
        0,
      );
      const segments = flattenSegmentsWithOffsets(chunkResults);

      return NextResponse.json({
        meetingId,
        model,
        text,
        language,
        durationSec: durationSec || null,
        segmentCount: segmentCount || null,
        segments,
        chunkCount: chunkResults.length,
        wasChunked: chunkResults.length > 1,
        chunks: chunkResults.map((chunk, index) => ({
          index: index + 1,
          text: chunk.text ?? "",
          durationSec: typeof chunk.duration === "number" ? chunk.duration : null,
          segmentCount: Array.isArray(chunk.segments) ? chunk.segments.length : null,
        })),
        raw: chunkResults,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "文字起こし処理に失敗しました。";

    return NextResponse.json(
      {
        error: "文字起こし処理に失敗しました。",
        detail: message,
      },
      { status: 500 },
    );
  }
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
  language: string | null;
  model:
    | "gpt-4o-mini-transcribe"
    | "gpt-4o-transcribe"
    | "gpt-4o-transcribe-diarize"
    | "whisper-1";
}) {
  const bytes = new Uint8Array(fileBuffer);
  const file = new File([bytes], fileName, { type: mimeType });
  let lastErrorMessage = "文字起こしに失敗しました。";

  for (let attempt = 0; attempt <= maxOpenAiRetries; attempt += 1) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", model);

    if (language) {
      formData.append("language", language);
    }

    if (model === "whisper-1") {
      formData.append("response_format", "verbose_json");
      formData.append("timestamp_granularities[]", "segment");
    } else if (model === "gpt-4o-transcribe-diarize") {
      formData.append("response_format", "diarized_json");
      formData.append("chunking_strategy", "auto");
    } else {
      formData.append("response_format", "json");
    }

    const openAiResponse = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
      timeoutMs: remoteFetchTimeoutMs,
    });

    const responseText = await openAiResponse.text();

    if (openAiResponse.ok) {
      if (!responseText.trim()) {
        throw new Error("OpenAI から空のレスポンスが返りました。");
      }

      try {
        return JSON.parse(responseText) as {
          text?: string;
          language?: string;
          duration?: number;
          segments?: Array<{
            start?: number;
            end?: number;
            text?: string;
            speaker?: string;
          }>;
        };
      } catch {
        throw new Error("OpenAI のレスポンス解析に失敗しました。");
      }
    }

    lastErrorMessage = mapOpenAiErrorMessage(
      responseText || openAiResponse.statusText || "OpenAI がエラーを返しました。",
    );

    if (!shouldRetryOpenAiRequest(openAiResponse.status) || attempt === maxOpenAiRetries) {
      break;
    }

    await wait(1000 * (attempt + 1));
  }

  throw new Error(lastErrorMessage);
}

async function splitOversizedAudio({
  tempDir,
  fileBuffer,
  fileName,
  audioDurationSec,
}: {
  tempDir: string;
  fileBuffer: Buffer;
  fileName: string;
  audioDurationSec: number | null;
}) {
  const inputExtension = extname(fileName) || ".mp3";
  const inputPath = join(tempDir, `input${inputExtension}`);
  const outputPattern = join(tempDir, "chunk-%03d.mp3");
  await writeFile(inputPath, fileBuffer);

  const segmentDurationSec = estimateSegmentDurationSec({
    fileSizeBytes: fileBuffer.byteLength,
    audioDurationSec,
  });

  await execFileAsync("/opt/homebrew/bin/ffmpeg", [
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
    throw new Error("音声分割に失敗しました。");
  }

  const chunks = [];
  for (const entry of entries) {
    const chunkPath = join(tempDir, entry);
    const buffer = await readFile(chunkPath);

    if (buffer.byteLength > maxTranscriptionFileSizeBytes) {
      throw new Error(
        "分割後も 25MB を超えるチャンクが残りました。さらに細かい分割設定が必要です。",
      );
    }

    chunks.push({
      fileName: entry,
      mimeType: "audio/mpeg",
      buffer,
    });
  }

  return chunks;
}

function estimateSegmentDurationSec({
  fileSizeBytes,
  audioDurationSec,
}: {
  fileSizeBytes: number;
  audioDurationSec: number | null;
}) {
  if (!audioDurationSec || audioDurationSec <= 0) {
    return 10 * 60;
  }

  const estimated = Math.floor((audioDurationSec * targetChunkSizeBytes) / fileSizeBytes);
  return Math.max(4 * 60, Math.min(12 * 60, estimated));
}

function flattenSegmentsWithOffsets(
  chunkResults: Array<{
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string; speaker?: string }>;
  }>,
) {
  let offsetSec = 0;
  const flattened: TranscriptionSegment[] = [];

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

function shouldRetryOpenAiRequest(status: number) {
  return status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapOpenAiErrorMessage(rawMessage: string) {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { message?: string; code?: string | null; type?: string | null };
    };
    const code = parsed.error?.code ?? parsed.error?.type ?? null;

    if (code === "insufficient_quota") {
      return "OpenAI API の利用枠が不足しているため文字起こしを実行できません。Billing / quota を確認してください。";
    }

    if (code === "invalid_api_key") {
      return "OpenAI API キーが無効です。.env.local の OPENAI_API_KEY を確認してください。";
    }

    if (code === "rate_limit_exceeded") {
      return "OpenAI API のレート制限に達しました。少し待ってから再度お試しください。";
    }

    if (parsed.error?.message) {
      return `OpenAI API で文字起こしに失敗しました。${parsed.error.message}`;
    }
  } catch {
    // noop
  }

  return `OpenAI API で文字起こしに失敗しました。${rawMessage}`;
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
