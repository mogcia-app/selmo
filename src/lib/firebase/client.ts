import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import {
  firebasePublicEnv,
  getFirebaseConfigErrorMessage,
  isFirebaseConfigured,
} from "@/lib/firebase/env";

export const firebaseApp =
  isFirebaseConfigured && firebasePublicEnv
    ? getApps().length > 0
      ? getApp()
      : initializeApp(firebasePublicEnv)
    : null;

export const firebaseAuth = firebaseApp ? createFirebaseAuth() : null;

export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;

function createFirebaseAuth() {
  try {
    return initializeAuth(firebaseApp!, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(firebaseApp!);
  }
}

export function assertFirebaseClient() {
  if (!firebaseApp || !firebaseAuth || !firestore || !firebaseStorage) {
    throw new Error(
      getFirebaseConfigErrorMessage() ??
        "Firebase client is not configured correctly.",
    );
  }

  return {
    firebaseApp,
    firebaseAuth,
    firestore,
    firebaseStorage,
  };
}
