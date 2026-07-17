import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import {
  firebasePublicEnv,
  getFirebaseConfigErrorMessage,
  isFirebaseConfigured,
} from "@/lib/firebase/env";

const FIRESTORE_PERMISSION_MESSAGE = "Missing or insufficient permissions.";
const FIRESTORE_PERMISSION_DISPLAY_MESSAGE = "このデータを表示する権限がありません。";

installFirestoreInternalAssertionGuard();

export const firebaseApp =
  isFirebaseConfigured && firebasePublicEnv
    ? getApps().length > 0
      ? getApp()
      : initializeApp(firebasePublicEnv)
    : null;

export const firebaseAuth = firebaseApp ? createFirebaseAuth() : null;

export const firestore = firebaseApp ? createFirestore() : null;

export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;

function createFirebaseAuth() {
  try {
    return initializeAuth(firebaseApp!, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(firebaseApp!);
  }
}

function createFirestore() {
  return getFirestore(firebaseApp!);
}

function installFirestoreInternalAssertionGuard() {
  if (typeof window === "undefined") return;

  const globalWithFlag = window as typeof window & {
    __selmoFirestoreInternalAssertionGuardInstalled?: boolean;
  };
  if (globalWithFlag.__selmoFirestoreInternalAssertionGuardInstalled) return;
  globalWithFlag.__selmoFirestoreInternalAssertionGuardInstalled = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isFirestoreInternalAssertion)) {
      return;
    }
    originalConsoleError(...args);
  };

  window.addEventListener("error", (event) => {
    if (isFirestoreInternalAssertion(event.error) || isFirestoreInternalAssertion(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isFirestoreInternalAssertion(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  installFirestorePermissionMessageGuard();
}

function isFirestoreInternalAssertion(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";

  return (
    message.includes("FIRESTORE") &&
    message.includes("INTERNAL ASSERTION FAILED") &&
    (message.includes("ID: ca9") || message.includes("ID: b815"))
  );
}

function installFirestorePermissionMessageGuard() {
  const replacePermissionMessage = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) {
      const text = root.textContent;
      if (text?.includes(FIRESTORE_PERMISSION_MESSAGE)) {
        root.textContent = text.replaceAll(FIRESTORE_PERMISSION_MESSAGE, FIRESTORE_PERMISSION_DISPLAY_MESSAGE);
      }
      return;
    }

    root.childNodes.forEach((child) => replacePermissionMessage(child));
  };

  const startObserver = () => {
    if (!document.body) return;
    replacePermissionMessage(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => replacePermissionMessage(node));
        if (mutation.type === "characterData") {
          replacePermissionMessage(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  };

  if (document.body) {
    startObserver();
  } else {
    window.addEventListener("DOMContentLoaded", startObserver, { once: true });
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
