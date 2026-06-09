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
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { UserRole } from "@/types/domain";

export type AppUserProfile = {
  uid: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: "active" | "inactive";
};

type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
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
}: RegisterUserInput) {
  const { firebaseAuth, firestore } = assertFirebaseClient();
  await enableAuthPersistence();

  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );

  await setDoc(doc(firestore, "users", credential.user.uid), {
    name,
    email,
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
    role?: UserRole;
    status?: "active" | "inactive";
  };

  if (!data.role) {
    return null;
  }

  return {
    uid,
    email: data.email ?? null,
    name: data.name ?? null,
    role: data.role,
    status: data.status ?? "active",
  };
}
