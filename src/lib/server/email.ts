import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
};

export async function sendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY または RESEND_FROM_EMAIL が未設定です。");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      reply_to: process.env.RESEND_REPLY_TO_EMAIL || undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || payload.name || "Resend のメール送信に失敗しました。");
  }

  return {
    provider: "resend",
    providerMessageId: payload.id ?? null,
  };
}

export async function hasSentEmailEvent(eventId: string) {
  const db = getFirebaseAdminDb();
  if (!db) {
    throw new Error("Firebase Admin が設定されていません。");
  }

  const snapshot = await db.collection("emailEvents").doc(eventId).get();
  return snapshot.exists && snapshot.data()?.status === "sent";
}

export async function saveEmailEvent(
  eventId: string,
  input: {
    companyId?: string | null;
    userId?: string | null;
    recipientEmail: string;
    kind: "weekly_admin_report" | "ai_usage_remaining_warning";
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const db = getFirebaseAdminDb();
  if (!db) {
    throw new Error("Firebase Admin が設定されていません。");
  }

  await db.collection("emailEvents").doc(eventId).set(
    {
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      recipientEmail: input.recipientEmail,
      kind: input.kind,
      status: input.status,
      provider: "resend",
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      sentAt: input.status === "sent" ? FieldValue.serverTimestamp() : null,
      failedAt: input.status === "failed" ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function assertCronRequest(request: Request) {
  const secret = process.env.EMAIL_CRON_SECRET || process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return false;
    }

    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function buildAppUrl(path: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
