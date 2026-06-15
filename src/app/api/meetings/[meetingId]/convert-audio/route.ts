import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  assertMeetingAccess,
  handleApiAuthError,
  requireApiUser,
  type ApiUserContext,
} from "@/lib/server/auth/require-api-user";
import { saveSystemErrorLog } from "@/lib/server/operational-logs";

export const runtime = "nodejs";

const cloudRunUrl = process.env.AUDIO_CONVERTER_CLOUD_RUN_URL;
const cloudRunToken = process.env.AUDIO_CONVERTER_TOKEN;
const cloudRunTimeoutMs = 12_000;

type MeetingAudioDocument = {
  companyId?: string | null;
  userId?: string | null;
  audioFilePath?: string | null;
  audioFileName?: string | null;
  audioMimeType?: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ meetingId: string }> },
) {
  const db = getFirebaseAdminDb();

  if (!db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  const { meetingId } = await context.params;
  let userId: string | null = null;
  let companyId: string | null = null;
  let apiUser: ApiUserContext | null = null;

  try {
    apiUser = await requireApiUser(request);
    userId = apiUser.uid;
    companyId = apiUser.companyId;
    const authorizedMeeting = await assertMeetingAccess(apiUser, meetingId);
    const meeting = authorizedMeeting.data as MeetingAudioDocument;

    if (!meeting.audioFilePath) {
      return NextResponse.json({ error: "音声ファイルが見つかりません。" }, { status: 400 });
    }

    if (!isWavAudio(meeting)) {
      return NextResponse.json({ queued: false, reason: "not_wav" });
    }

    await db.collection("audioProcessingJobs").doc(meetingId).set(
      {
        companyId,
        userId: meeting.userId ?? apiUser.uid,
        meetingId,
        fileName: meeting.audioFileName ?? "",
        status: "convert_required",
        conversionRequestedAt: FieldValue.serverTimestamp(),
        errorMessage: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (!cloudRunUrl || !cloudRunToken) {
      await saveSystemErrorLog({
        companyId,
        userId,
        kind: "Cloud Run",
        message: "AUDIO_CONVERTER_CLOUD_RUN_URL または AUDIO_CONVERTER_TOKEN が未設定です。",
        severity: "warning",
        source: "convert-audio-dispatch",
      }).catch(() => undefined);

      return NextResponse.json({
        queued: true,
        dispatched: false,
        reason: "cloud_run_not_configured",
      });
    }

    await dispatchConversion({
      meetingId,
      companyId,
      requestedBy: apiUser.uid,
    });

    return NextResponse.json({
      queued: true,
      dispatched: true,
    });
  } catch (error) {
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "音声変換ジョブの作成に失敗しました。";
    await saveSystemErrorLog({
      companyId,
      userId,
      kind: "Cloud Run",
      message,
      severity: "warning",
      source: "convert-audio-dispatch",
    }).catch(() => undefined);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isWavAudio(meeting: MeetingAudioDocument) {
  const mimeType = meeting.audioMimeType?.toLowerCase() ?? "";
  const fileName = meeting.audioFileName?.toLowerCase() ?? "";

  return mimeType.includes("wav") || fileName.endsWith(".wav") || fileName.endsWith(".wave");
}

async function dispatchConversion(input: { meetingId: string; companyId: string; requestedBy: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cloudRunTimeoutMs);

  try {
    const response = await fetch(`${cloudRunUrl?.replace(/\/$/, "")}/kick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudRunToken}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Cloud Run audio converter returned ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
