import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  assertSalesUser,
  handleApiAuthError,
  requireApiUser,
} from "@/lib/server/auth/require-api-user";

const STANDARD_AI_QUOTA = 15;
const PRO_AI_QUOTA = 30;
const supportedChargeAmounts = new Set([1, 10]);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = typeof body?.amount === "number" ? body.amount : 0;

  if (!supportedChargeAmounts.has(amount)) {
    return NextResponse.json({ error: "チャージ回数が不正です。" }, { status: 400 });
  }

  const db = getFirebaseAdminDb();

  if (!db) {
    return NextResponse.json({ error: "Firebase Admin が設定されていません。" }, { status: 500 });
  }

  try {
    const apiUser = await requireApiUser(request);
    assertSalesUser(apiUser);

    const companyRef = db.collection("companies").doc(apiUser.companyId);
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
        companyId: apiUser.companyId,
        companyName: readString(company.companyName ?? company.name, "未設定の会社"),
        userId: apiUser.uid,
        userName: readString(apiUser.name, "未設定"),
        userEmail: apiUser.email,
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
    const authError = handleApiAuthError(error);
    if (authError) {
      return NextResponse.json(authError.body, { status: authError.status });
    }

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
