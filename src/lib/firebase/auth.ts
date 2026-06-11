"use client";

import {
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  onAuthStateChanged,
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
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { UserRole } from "@/types/domain";

export type CompanyPlan = "standard" | "pro" | "enterprise";

const STANDARD_AI_QUOTA = 15;
const PRO_AI_QUOTA = 30;

export type AppUserProfile = {
  uid: string;
  email: string | null;
  name: string | null;
  companyId: string | null;
  companyName: string | null;
  companyPlan: CompanyPlan;
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
  role: UserRole;
  status: "active" | "inactive";
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
  await setPersistence(firebaseAuth, browserLocalPersistence);
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
    monthlyTranscriptionQuota: STANDARD_AI_QUOTA,
    monthlyRoleplayQuota: STANDARD_AI_QUOTA,
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
    companyId?: string;
    companyName?: string;
    role?: UserRole;
    status?: "active" | "inactive";
  };

  if (!data.role) {
    return null;
  }

  const company = data.companyId ? await fetchCompanyProfile(data.companyId) : null;

  return {
    uid,
    email: data.email ?? null,
    name: data.name ?? null,
    companyId: data.companyId ?? null,
    companyName: company?.companyName ?? data.companyName ?? null,
    companyPlan: company?.plan ?? "standard",
    monthlyTranscriptionQuota: company?.monthlyTranscriptionQuota ?? STANDARD_AI_QUOTA,
    monthlyRoleplayQuota: company?.monthlyRoleplayQuota ?? STANDARD_AI_QUOTA,
    role: data.role,
    status: data.status ?? "active",
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
              companyId?: string;
              companyName?: string;
              companyPlan?: CompanyPlan;
              monthlyTranscriptionQuota?: unknown;
              monthlyRoleplayQuota?: unknown;
              role?: UserRole;
              status?: "active" | "inactive";
            };

            if (!data.role) return null;

            return {
              uid: userSnapshot.id,
              email: data.email ?? null,
              name: data.name ?? null,
              companyId: data.companyId ?? null,
              companyName: data.companyName ?? null,
              companyPlan: readCompanyPlan(data.companyPlan),
              monthlyTranscriptionQuota: readMonthlyQuota(data.monthlyTranscriptionQuota, readCompanyPlan(data.companyPlan)),
              monthlyRoleplayQuota: readMonthlyQuota(data.monthlyRoleplayQuota, readCompanyPlan(data.companyPlan)),
              role: data.role,
              status: data.status ?? "active",
            };
          })
          .filter((profile): profile is AppUserProfile => Boolean(profile)),
      );
    },
    onError,
  );
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
  };
  const plan = readCompanyPlan(data.plan);

  return {
    companyName: data.companyName ?? data.name ?? null,
    plan,
    monthlyTranscriptionQuota: readMonthlyQuota(data.monthlyTranscriptionQuota, plan),
    monthlyRoleplayQuota: readMonthlyQuota(data.monthlyRoleplayQuota, plan),
  };
}

function readCompanyPlan(value: unknown): CompanyPlan {
  if (value === "pro" || value === "enterprise") {
    return value;
  }

  return "standard";
}

function readMonthlyQuota(value: unknown, plan: CompanyPlan) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (plan === "pro") {
    return PRO_AI_QUOTA;
  }

  if (plan === "enterprise") {
    return null;
  }

  return STANDARD_AI_QUOTA;
}
