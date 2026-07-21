import type { DocumentData } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";
import { readEnabledSalesDomains, type EnabledSalesDomains, type SalesDomain } from "@/lib/sales-domains";

export type ApiUserRole = "sales" | "admin" | "owner";

export type ApiUserContext = {
  uid: string;
  email: string | null;
  name: string | null;
  role: ApiUserRole;
  status: "active" | "inactive";
  companyId: string;
  companyName: string | null;
  enabledSalesDomains: EnabledSalesDomains;
};

export class ApiAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
    this.code = code;
  }
}

export async function requireApiUser(request: Request | NextRequest): Promise<ApiUserContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    throw new ApiAuthError(401, "missing_token", "ログイン情報を確認できませんでした。");
  }

  const auth = getFirebaseAdminAuth();
  const db = getFirebaseAdminDb();

  if (!auth || !db) {
    throw new ApiAuthError(500, "firebase_admin_unavailable", "Firebase Admin が設定されていません。");
  }

  const decodedToken = await auth.verifyIdToken(token).catch(() => {
    throw new ApiAuthError(401, "invalid_token", "ログイン情報を確認できませんでした。");
  });
  const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();

  if (!userSnapshot.exists) {
    throw new ApiAuthError(404, "user_not_found", "ユーザー情報が見つかりません。");
  }

  const data = userSnapshot.data() ?? {};
  const role = readRole(data.role);
  const status = data.status === "inactive" ? "inactive" : "active";
  const companyId = readString(data.companyId);

  if (!role) {
    throw new ApiAuthError(403, "invalid_role", "この操作を行う権限がありません。");
  }

  if (status !== "active") {
    throw new ApiAuthError(403, "inactive_user", "無効なユーザーです。");
  }

  if (!companyId) {
    throw new ApiAuthError(400, "missing_company", "会社情報が見つかりません。");
  }

  return {
    uid: decodedToken.uid,
    email: readString(data.email) || decodedToken.email || null,
    name: readString(data.name) || null,
    role,
    status,
    companyId,
    companyName: readString(data.companyName) || null,
    enabledSalesDomains: readEnabledSalesDomains(data.enabledSalesDomains),
  };
}

export function assertAdminUser(user: ApiUserContext) {
  if (user.role !== "owner" && user.role !== "admin") {
    throw new ApiAuthError(403, "admin_required", "管理者権限が必要です。");
  }
}

export function assertSalesUser(user: ApiUserContext) {
  if (user.role !== "sales") {
    throw new ApiAuthError(403, "sales_required", "営業担当者権限が必要です。");
  }
}

export function assertSalesDomainAccess(user: ApiUserContext, domain: SalesDomain) {
  if (user.role === "owner" || user.role === "admin") {
    return;
  }

  if (user.enabledSalesDomains[domain] !== true) {
    throw new ApiAuthError(403, "domain_forbidden", domain === "teleapo" ? "テレアポ機能を利用する権限がありません。" : "商談機能を利用する権限がありません。");
  }
}

export async function assertMeetingAccess(user: ApiUserContext, meetingId: string) {
  const db = getFirebaseAdminDb();
  if (!db) {
    throw new ApiAuthError(500, "firebase_admin_unavailable", "Firebase Admin が設定されていません。");
  }

  const snapshot = await db.collection("meetings").doc(meetingId).get();
  if (!snapshot.exists) {
    throw new ApiAuthError(404, "meeting_not_found", "商談が見つかりません。");
  }

  const data = snapshot.data() ?? {};
  const companyId = readString(data.companyId);
  const meetingUserId = readString(data.userId);
  const salesDomain = data.salesDomain === "teleapo" ? "teleapo" : "meeting";

  if (companyId !== user.companyId) {
    throw new ApiAuthError(403, "company_mismatch", "会社情報が一致しません。");
  }

  assertSalesDomainAccess(user, salesDomain);

  if (user.role === "sales" && meetingUserId !== user.uid) {
    throw new ApiAuthError(403, "meeting_forbidden", "この商談を操作する権限がありません。");
  }

  return {
    id: snapshot.id,
    ref: snapshot.ref,
    data,
    companyId,
    userId: meetingUserId,
    salesDomain,
  };
}

export function handleApiAuthError(error: unknown) {
  if (error instanceof ApiAuthError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status,
    };
  }

  return null;
}

function readRole(value: unknown): ApiUserRole | null {
  if (value === "sales" || value === "admin" || value === "owner") return value;
  return null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readCompanyId(data: DocumentData | undefined) {
  return readString(data?.companyId);
}
