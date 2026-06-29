"use client";

import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { assertFirebaseClient } from "@/lib/firebase/client";
import {
  DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
  DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
} from "@/lib/ai-usage-limit";
import { readEnabledSalesDomains, type EnabledSalesDomains } from "@/lib/sales-domains";
import {
  defaultUploadDurationLimitMinutes,
  readUploadDurationLimitMinutes,
  type UploadDurationLimitMinutes,
} from "@/lib/upload-duration-limit";
import type { UserRole } from "@/types/domain";

export type CompanyPlan = "standard" | "pro" | "enterprise";
export type AdminCoachingPriority = "high" | "medium" | "low";
export type AdminCoachingStatus = "none" | "watch" | "needs_coaching";
export type AdminReviewStatus = "unchecked" | "checked" | "in_progress" | "follow_up" | "done";

const STANDARD_TRANSCRIPTION_QUOTA = DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA;
const STANDARD_ROLEPLAY_QUOTA = DEFAULT_MONTHLY_ROLEPLAY_QUOTA;
const PRO_AI_QUOTA = 30;

export type AppUserProfile = {
  uid: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  avatarStoragePath: string | null;
  companyId: string | null;
  companyName: string | null;
  companyPlan: CompanyPlan;
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
  uploadDurationLimitMinutes: UploadDurationLimitMinutes;
  role: UserRole;
  status: "active" | "inactive";
  workExperienceYears: number | null;
  workExperienceMonths: number | null;
  workExperienceLocked: boolean;
  enabledSalesDomains: EnabledSalesDomains;
  nextCoachingMemo: string;
  nextCoachingMemoUpdatedAt: Date | null;
  nextCoachingMemoUpdatedBy: string | null;
  adminCoachingStatus: AdminCoachingStatus;
  adminCoachingPriority: AdminCoachingPriority;
  adminCoachingReason: string;
  adminNextActionTitle: string;
  adminNextActionNote: string;
  adminNextActionDueDate: Date | null;
  adminNextActionUpdatedAt: Date | null;
  adminNextActionUpdatedBy: string | null;
  adminReviewStatus: AdminReviewStatus;
  adminLastReviewedAt: Date | null;
  adminNextReviewDate: Date | null;
  adminReviewMemo: string;
  adminReviewUpdatedAt: Date | null;
  adminReviewUpdatedBy: string | null;
};

type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyName?: string;
};

export async function enableAuthPersistence() {
  const { firebaseAuth } = assertFirebaseClient();
  await setPersistence(firebaseAuth, inMemoryPersistence);
}

export async function signInWithEmail(email: string, password: string) {
  const { firebaseAuth } = assertFirebaseClient();
  await enableAuthPersistence();

  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const profile = await fetchUserProfile(credential.user.uid);

  return {
    credential,
    profile,
  };
}

export async function sendPasswordReset(email: string) {
  const { firebaseAuth } = assertFirebaseClient();
  await sendPasswordResetEmail(firebaseAuth, email);
}

export async function registerUser({
  email,
  name,
  password,
  role,
  companyName,
}: RegisterUserInput) {
  const { firebaseAuth, firestore } = assertFirebaseClient();
  await enableAuthPersistence();

  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );

  const normalizedCompanyName = companyName?.trim() || "未設定の会社";
  const companyId = credential.user.uid;

  await setDoc(doc(firestore, "companies", companyId), {
    companyName: normalizedCompanyName,
    plan: "standard",
    monthlyTranscriptionQuota: STANDARD_TRANSCRIPTION_QUOTA,
    monthlyRoleplayQuota: STANDARD_ROLEPLAY_QUOTA,
    uploadDurationLimitMinutes: defaultUploadDurationLimitMinutes,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(firestore, "users", credential.user.uid), {
    name,
    email,
    companyId,
    companyName: normalizedCompanyName,
    role,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const profile = await fetchUserProfile(credential.user.uid);

  return {
    credential,
    profile,
  };
}

export async function signOutUser() {
  const { firebaseAuth } = assertFirebaseClient();
  await signOut(firebaseAuth);
}

export function subscribeToAuthState(
  callback: (payload: { user: User | null; profile: AppUserProfile | null }) => void,
) {
  const { firebaseAuth } = assertFirebaseClient();

  return onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null });
      return;
    }

    const profile = await fetchUserProfile(user.uid);
    callback({ user, profile });
  });
}

export async function fetchUserProfile(uid: string): Promise<AppUserProfile | null> {
  const { firestore } = assertFirebaseClient();
  const userRef = doc(firestore, "users", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as {
    email?: string;
    name?: string;
    avatarUrl?: string;
    avatarStoragePath?: string;
    companyId?: string;
    companyName?: string;
    role?: UserRole;
    status?: "active" | "inactive";
    workExperienceYears?: unknown;
    workExperienceMonths?: unknown;
    workExperienceLocked?: unknown;
    enabledSalesDomains?: unknown;
    nextCoachingMemo?: unknown;
    nextCoachingMemoUpdatedAt?: unknown;
    nextCoachingMemoUpdatedBy?: unknown;
    adminCoachingStatus?: unknown;
    adminCoachingPriority?: unknown;
    adminCoachingReason?: unknown;
    adminNextActionTitle?: unknown;
    adminNextActionNote?: unknown;
    adminNextActionDueDate?: unknown;
    adminNextActionUpdatedAt?: unknown;
    adminNextActionUpdatedBy?: unknown;
    adminReviewStatus?: unknown;
    adminLastReviewedAt?: unknown;
    adminNextReviewDate?: unknown;
    adminReviewMemo?: unknown;
    adminReviewUpdatedAt?: unknown;
    adminReviewUpdatedBy?: unknown;
  };

  if (!data.role) {
    return null;
  }

  const company = data.companyId ? await fetchCompanyProfile(data.companyId) : null;

  return {
    uid,
    email: data.email ?? null,
    name: data.name ?? null,
    avatarUrl: data.avatarUrl ?? null,
    avatarStoragePath: data.avatarStoragePath ?? null,
    companyId: data.companyId ?? null,
    companyName: company?.companyName ?? data.companyName ?? null,
    companyPlan: company?.plan ?? "standard",
    monthlyTranscriptionQuota: company ? company.monthlyTranscriptionQuota : STANDARD_TRANSCRIPTION_QUOTA,
    monthlyRoleplayQuota: company ? company.monthlyRoleplayQuota : STANDARD_ROLEPLAY_QUOTA,
    uploadDurationLimitMinutes: company?.uploadDurationLimitMinutes ?? defaultUploadDurationLimitMinutes,
    role: data.role,
    status: data.status ?? "active",
    workExperienceYears: readWorkExperienceValue(data.workExperienceYears),
    workExperienceMonths: readWorkExperienceValue(data.workExperienceMonths),
    workExperienceLocked: data.workExperienceLocked === true,
    enabledSalesDomains: readEnabledSalesDomains(data.enabledSalesDomains),
    nextCoachingMemo: readString(data.nextCoachingMemo),
    nextCoachingMemoUpdatedAt: readDate(data.nextCoachingMemoUpdatedAt),
    nextCoachingMemoUpdatedBy: readNullableString(data.nextCoachingMemoUpdatedBy),
    adminCoachingStatus: readAdminCoachingStatus(data.adminCoachingStatus),
    adminCoachingPriority: readAdminCoachingPriority(data.adminCoachingPriority),
    adminCoachingReason: readString(data.adminCoachingReason),
    adminNextActionTitle: readString(data.adminNextActionTitle),
    adminNextActionNote: readString(data.adminNextActionNote),
    adminNextActionDueDate: readDate(data.adminNextActionDueDate),
    adminNextActionUpdatedAt: readDate(data.adminNextActionUpdatedAt),
    adminNextActionUpdatedBy: readNullableString(data.adminNextActionUpdatedBy),
    adminReviewStatus: readAdminReviewStatus(data.adminReviewStatus),
    adminLastReviewedAt: readDate(data.adminLastReviewedAt),
    adminNextReviewDate: readDate(data.adminNextReviewDate),
    adminReviewMemo: readString(data.adminReviewMemo),
    adminReviewUpdatedAt: readDate(data.adminReviewUpdatedAt),
    adminReviewUpdatedBy: readNullableString(data.adminReviewUpdatedBy),
  };
}

export function subscribeToUserProfiles(
  callback: (profiles: AppUserProfile[]) => void,
  onError?: (error: FirestoreError) => void,
  companyId?: string | null,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const usersQuery = query(collection(firestore, "users"), where("companyId", "==", companyId));

  return onSnapshot(
    usersQuery,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((userSnapshot) => {
            const data = userSnapshot.data() as {
              email?: string;
              name?: string;
              avatarUrl?: string;
              avatarStoragePath?: string;
              companyId?: string;
              companyName?: string;
              companyPlan?: CompanyPlan;
              monthlyTranscriptionQuota?: unknown;
              monthlyRoleplayQuota?: unknown;
              uploadDurationLimitMinutes?: unknown;
              role?: UserRole;
              status?: "active" | "inactive";
              workExperienceYears?: unknown;
              workExperienceMonths?: unknown;
              workExperienceLocked?: unknown;
              enabledSalesDomains?: unknown;
              nextCoachingMemo?: unknown;
              nextCoachingMemoUpdatedAt?: unknown;
              nextCoachingMemoUpdatedBy?: unknown;
              adminCoachingStatus?: unknown;
              adminCoachingPriority?: unknown;
              adminCoachingReason?: unknown;
              adminNextActionTitle?: unknown;
              adminNextActionNote?: unknown;
              adminNextActionDueDate?: unknown;
              adminNextActionUpdatedAt?: unknown;
              adminNextActionUpdatedBy?: unknown;
              adminReviewStatus?: unknown;
              adminLastReviewedAt?: unknown;
              adminNextReviewDate?: unknown;
              adminReviewMemo?: unknown;
              adminReviewUpdatedAt?: unknown;
              adminReviewUpdatedBy?: unknown;
            };

            if (!data.role) return null;

            return {
              uid: userSnapshot.id,
              email: data.email ?? null,
              name: data.name ?? null,
              avatarUrl: data.avatarUrl ?? null,
              avatarStoragePath: data.avatarStoragePath ?? null,
              companyId: data.companyId ?? null,
              companyName: data.companyName ?? null,
              companyPlan: readCompanyPlan(data.companyPlan),
              monthlyTranscriptionQuota: readMonthlyQuota(data.monthlyTranscriptionQuota, readCompanyPlan(data.companyPlan), STANDARD_TRANSCRIPTION_QUOTA),
              monthlyRoleplayQuota: readMonthlyQuota(data.monthlyRoleplayQuota, readCompanyPlan(data.companyPlan), STANDARD_ROLEPLAY_QUOTA),
              uploadDurationLimitMinutes: readUploadDurationLimitMinutes(data.uploadDurationLimitMinutes),
              role: data.role,
              status: data.status ?? "active",
              workExperienceYears: readWorkExperienceValue(data.workExperienceYears),
              workExperienceMonths: readWorkExperienceValue(data.workExperienceMonths),
              workExperienceLocked: data.workExperienceLocked === true,
              enabledSalesDomains: readEnabledSalesDomains(data.enabledSalesDomains),
              nextCoachingMemo: readString(data.nextCoachingMemo),
              nextCoachingMemoUpdatedAt: readDate(data.nextCoachingMemoUpdatedAt),
              nextCoachingMemoUpdatedBy: readNullableString(data.nextCoachingMemoUpdatedBy),
              adminCoachingStatus: readAdminCoachingStatus(data.adminCoachingStatus),
              adminCoachingPriority: readAdminCoachingPriority(data.adminCoachingPriority),
              adminCoachingReason: readString(data.adminCoachingReason),
              adminNextActionTitle: readString(data.adminNextActionTitle),
              adminNextActionNote: readString(data.adminNextActionNote),
              adminNextActionDueDate: readDate(data.adminNextActionDueDate),
              adminNextActionUpdatedAt: readDate(data.adminNextActionUpdatedAt),
              adminNextActionUpdatedBy: readNullableString(data.adminNextActionUpdatedBy),
              adminReviewStatus: readAdminReviewStatus(data.adminReviewStatus),
              adminLastReviewedAt: readDate(data.adminLastReviewedAt),
              adminNextReviewDate: readDate(data.adminNextReviewDate),
              adminReviewMemo: readString(data.adminReviewMemo),
              adminReviewUpdatedAt: readDate(data.adminReviewUpdatedAt),
              adminReviewUpdatedBy: readNullableString(data.adminReviewUpdatedBy),
            };
          })
          .filter((profile): profile is AppUserProfile => Boolean(profile)),
      );
    },
    onError,
  );
}

export async function uploadUserAvatar(input: { userId: string; file: File }) {
  const { firestore, firebaseStorage } = assertFirebaseClient();
  const storagePath = `profile-avatars/${input.userId}/${Date.now()}-${sanitizeFileName(input.file.name)}`;
  const storageRef = ref(firebaseStorage, storagePath);

  await uploadBytes(storageRef, input.file, {
    contentType: input.file.type,
    customMetadata: {
      userId: input.userId,
    },
  });

  const avatarUrl = await getDownloadURL(storageRef);
  await updateDoc(doc(firestore, "users", input.userId), {
    avatarUrl,
    avatarStoragePath: storagePath,
    updatedAt: serverTimestamp(),
  });

  return {
    avatarUrl,
    avatarStoragePath: storagePath,
  };
}

export async function saveNextCoachingMemo(input: { userId: string; memo: string; updatedBy: string }) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "users", input.userId), {
    nextCoachingMemo: input.memo.trim(),
    nextCoachingMemoUpdatedAt: serverTimestamp(),
    nextCoachingMemoUpdatedBy: input.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

export async function saveAdminCoachingPlan(input: {
  userId: string;
  status: AdminCoachingStatus;
  priority: AdminCoachingPriority;
  reason: string;
  nextActionTitle: string;
  nextActionNote: string;
  nextActionDueDate: Date | null;
  updatedBy: string;
}) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "users", input.userId), {
    adminCoachingStatus: input.status,
    adminCoachingPriority: input.priority,
    adminCoachingReason: input.reason.trim(),
    adminNextActionTitle: input.nextActionTitle.trim(),
    adminNextActionNote: input.nextActionNote.trim(),
    adminNextActionDueDate: input.nextActionDueDate,
    adminNextActionUpdatedAt: serverTimestamp(),
    adminNextActionUpdatedBy: input.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

export async function saveAdminReviewProgress(input: {
  userId: string;
  status: AdminReviewStatus;
  nextReviewDate: Date | null;
  memo: string;
  updatedBy: string;
  markReviewed?: boolean;
}) {
  const { firestore } = assertFirebaseClient();
  const payload: Record<string, unknown> = {
    adminReviewStatus: input.status,
    adminNextReviewDate: input.nextReviewDate,
    adminReviewMemo: input.memo.trim(),
    adminReviewUpdatedAt: serverTimestamp(),
    adminReviewUpdatedBy: input.updatedBy,
    updatedAt: serverTimestamp(),
  };
  if (input.markReviewed) {
    payload.adminLastReviewedAt = serverTimestamp();
  }

  await updateDoc(doc(firestore, "users", input.userId), payload);
}

async function fetchCompanyProfile(companyId: string) {
  const { firestore } = assertFirebaseClient();
  const snapshot = await getDoc(doc(firestore, "companies", companyId));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as {
    companyName?: string;
    name?: string;
    plan?: string;
    monthlyTranscriptionQuota?: unknown;
    monthlyRoleplayQuota?: unknown;
    uploadDurationLimitMinutes?: unknown;
  };
  const plan = readCompanyPlan(data.plan);

  return {
    companyName: data.companyName ?? data.name ?? null,
    plan,
    monthlyTranscriptionQuota: readMonthlyQuota(data.monthlyTranscriptionQuota, plan, STANDARD_TRANSCRIPTION_QUOTA),
    monthlyRoleplayQuota: readMonthlyQuota(data.monthlyRoleplayQuota, plan, STANDARD_ROLEPLAY_QUOTA),
    uploadDurationLimitMinutes: readUploadDurationLimitMinutes(data.uploadDurationLimitMinutes),
  };
}

function readCompanyPlan(value: unknown): CompanyPlan {
  if (value === "pro" || value === "enterprise") {
    return value;
  }

  return "standard";
}

function readMonthlyQuota(value: unknown, plan: CompanyPlan, standardFallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (plan === "pro") {
    return PRO_AI_QUOTA;
  }

  if (plan === "enterprise") {
    return null;
  }

  return standardFallback;
}

function readWorkExperienceValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function readAdminCoachingStatus(value: unknown): AdminCoachingStatus {
  if (value === "watch" || value === "needs_coaching") return value;
  return "none";
}

function readAdminCoachingPriority(value: unknown): AdminCoachingPriority {
  if (value === "high" || value === "medium") return value;
  return "low";
}

function readAdminReviewStatus(value: unknown): AdminReviewStatus {
  if (value === "checked" || value === "in_progress" || value === "follow_up" || value === "done") return value;
  return "unchecked";
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}
