import { NextRequest, NextResponse } from "next/server";

import {
  assertMonthlyAiUsageAvailable,
  estimateTranscriptionCostUsd,
  saveAiUsageLog,
  saveSystemErrorLog,
} from "@/lib/server/operational-logs";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  const companyId = readNullableFormValue(formData?.get("companyId"));
  const userId = readNullableFormValue(formData?.get("userId"));
  const durationSec = readNumberFormValue(formData?.get("durationSec"));
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";

  if (!(audio instanceof File) || audio.size <= 0) {
    return NextResponse.json({ error: "音声データが必要です。" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "音声文字起こしのAPIキーが設定されていません。" }, { status: 500 });
  }

  try {
    const usageAvailability = await assertMonthlyAiUsageAvailable({ userId });
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

    const openAiFormData = new FormData();
    openAiFormData.append("file", audio, audio.name || "roleplay.webm");
    openAiFormData.append("model", model);
    openAiFormData.append("language", "ja");

    const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: openAiFormData,
    });

    if (!response.ok) {
      const message = `OpenAI が文字起こしエラーを返しました。${response.statusText}`;
      await saveAiUsageLog({
        companyId,
        userId,
        feature: "transcription",
        model,
        audioDurationSec: durationSec,
        status: "failed",
        errorMessage: message,
      });
      await saveSystemErrorLog({
        companyId,
        userId,
        kind: "OpenAI",
        message,
        severity: "warning",
        source: "api/roleplay/transcribe",
      });
      return NextResponse.json({ error: "音声の文字起こしに失敗しました。" }, { status: 502 });
    }

    const payload = (await response.json()) as { text?: string };
    const text = payload.text?.trim() ?? "";
    await saveAiUsageLog({
      companyId,
      userId,
      feature: "transcription",
      model,
      audioDurationSec: durationSec,
      estimatedCostUsd: estimateTranscriptionCostUsd({ model, audioDurationSec: durationSec }),
      status: "success",
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ロープレ音声の文字起こしに失敗しました。";
    await saveAiUsageLog({
      companyId,
      userId,
      feature: "transcription",
      model,
      audioDurationSec: durationSec,
      status: "failed",
      errorMessage: message,
    });
    await saveSystemErrorLog({
      companyId,
      userId,
      kind: "OpenAI",
      message,
      severity: "warning",
      source: "api/roleplay/transcribe",
    });
    return NextResponse.json({ error: "音声の文字起こしに失敗しました。" }, { status: 500 });
  }
}

function readNullableFormValue(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberFormValue(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}
