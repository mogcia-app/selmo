import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

export function getFirebaseAdminDb() {
  if (!initializeFirebaseAdminApp()) {
    return null;
  }

  return getFirestore();
}

export function getFirebaseAdminAuth() {
  if (!initializeFirebaseAdminApp()) {
    return null;
  }

  return getAuth();
}

export function getFirebaseAdminStorage() {
  if (!initializeFirebaseAdminApp()) {
    return null;
  }

  return getStorage();
}

function initializeFirebaseAdminApp() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId) {
    return false;
  }

  if (getApps().length === 0) {
    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        ...(storageBucket ? { storageBucket } : {}),
      });
    } else {
      initializeApp({ projectId, ...(storageBucket ? { storageBucket } : {}) });
    }
  }

  return true;
}
