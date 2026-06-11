import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";

const STANDARD_AI_QUOTA = 15;
const PRO_AI_QUOTA = 30;
const supportedChargeAmounts = new Set([1, 10]);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = typeof body?.amount === "number" ? body.amount : 0;

  if (!supportedChargeAmounts.has(amount)) {
    return NextResponse.json({ error: "チャージ回数が不正です。" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。" }, { status: 401 });
  }

  const auth = getFirebaseAdminAuth();
  const db = getFirebaseAdminDb();

  if (!auth || !db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const userRef = db.collection("users").doc(decodedToken.uid);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません。" }, { status: 404 });
    }

    const user = userSnapshot.data() as {
      companyId?: string;
      email?: string | null;
      name?: string | null;
      status?: string;
    };

    if (user.status === "inactive") {
      return NextResponse.json({ error: "無効なユーザーです。" }, { status: 403 });
    }

    if (!user.companyId) {
      return NextResponse.json({ error: "会社情報が見つかりません。" }, { status: 400 });
    }

    const companyRef = db.collection("companies").doc(user.companyId);
    const chargeRef = db.collection("aiChargeEvents").doc();
    const result = await db.runTransaction(async (transaction) => {
      const companySnapshot = await transaction.get(companyRef);

      if (!companySnapshot.exists) {
        throw new Error("会社情報が見つかりません。");
      }

      const company = companySnapshot.data() as {
        companyName?: string;
        name?: string;
        plan?: string;
        monthlyTranscriptionQuota?: unknown;
        monthlyRoleplayQuota?: unknown;
      };
      const plan = readCompanyPlan(company.plan);
      const currentTranscriptionQuota = readMonthlyQuota(company.monthlyTranscriptionQuota, plan);
      const currentRoleplayQuota = readMonthlyQuota(company.monthlyRoleplayQuota, plan);
      const nextTranscriptionQuota = currentTranscriptionQuota + amount;
      const nextRoleplayQuota = currentRoleplayQuota + amount;

      transaction.update(companyRef, {
        monthlyTranscriptionQuota: nextTranscriptionQuota,
        monthlyRoleplayQuota: nextRoleplayQuota,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(chargeRef, {
        companyId: user.companyId,
        companyName: readString(company.companyName ?? company.name, "未設定の会社"),
        userId: decodedToken.uid,
        userName: readString(user.name, "未設定"),
        userEmail: user.email ?? decodedToken.email ?? null,
        amount,
        unitPriceJpy: 6500,
        priceJpy: amount * 6500,
        createdAt: FieldValue.serverTimestamp(),
        status: "completed",
        invoiceStatus: "unbilled",
      });

      return {
        monthlyTranscriptionQuota: nextTranscriptionQuota,
        monthlyRoleplayQuota: nextRoleplayQuota,
      };
    });

    return NextResponse.json({
      ok: true,
      amount,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "チャージに失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readCompanyPlan(value: unknown) {
  if (value === "pro" || value === "enterprise") {
    return value;
  }

  return "standard";
}

function readMonthlyQuota(value: unknown, plan: "standard" | "pro" | "enterprise") {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (plan === "pro") {
    return PRO_AI_QUOTA;
  }

  if (plan === "enterprise") {
    return 0;
  }

  return STANDARD_AI_QUOTA;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
