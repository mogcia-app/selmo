import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";
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
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。" }, { status: 401 });
  }

  const auth = getFirebaseAdminAuth();
  const db = getFirebaseAdminDb();

  if (!auth || !db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  const { meetingId } = await context.params;
  let userId: string | null = null;
  let companyId: string | null = null;

  try {
    const decodedToken = await auth.verifyIdToken(token);
    userId = decodedToken.uid;

    const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません。" }, { status: 404 });
    }

    const user = userSnapshot.data() as { companyId?: string | null; role?: string; status?: string };
    companyId = typeof user.companyId === "string" ? user.companyId : null;
    if (user.status === "inactive") {
      return NextResponse.json({ error: "無効なユーザーです。" }, { status: 403 });
    }

    const meetingRef = db.collection("meetings").doc(meetingId);
    const meetingSnapshot = await meetingRef.get();
    if (!meetingSnapshot.exists) {
      return NextResponse.json({ error: "打ち合わせが見つかりません。" }, { status: 404 });
    }

    const meeting = meetingSnapshot.data() as MeetingAudioDocument;
    if (!companyId || meeting.companyId !== companyId) {
      return NextResponse.json({ error: "会社情報が一致しません。" }, { status: 403 });
    }

    const isAdmin = user.role === "admin" || user.role === "owner";
    if (!isAdmin && meeting.userId !== decodedToken.uid) {
      return NextResponse.json({ error: "この音声を変換する権限がありません。" }, { status: 403 });
    }

    if (!meeting.audioFilePath) {
      return NextResponse.json({ error: "音声ファイルが見つかりません。" }, { status: 400 });
    }

    if (!isWavAudio(meeting)) {
      return NextResponse.json({ queued: false, reason: "not_wav" });
    }

    await db.collection("audioProcessingJobs").doc(meetingId).set(
      {
        companyId,
        userId: meeting.userId ?? decodedToken.uid,
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
      requestedBy: decodedToken.uid,
    });

    return NextResponse.json({
      queued: true,
      dispatched: true,
    });
  } catch (error) {
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
