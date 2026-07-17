"use client";

import {
  Timestamp,
  collection,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import { resolveCompanyId } from "@/lib/firebase/company";

export type SalesActivityType =
  | "meeting_uploaded"
  | "transcript_pasted"
  | "knowledge_searched"
  | "roleplay_completed"
  | "ai_analysis_completed";

export type SalesActivityEvent = {
  id: string;
  companyId: string;
  userId: string;
  type: SalesActivityType;
  title: string;
  summary: string;
  detail: string;
  href: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
};

export type SaveSalesActivityEventInput = {
  companyId?: string | null;
  userId: string;
  type: SalesActivityType;
  title: string;
  summary: string;
  detail?: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

export async function saveSalesActivityEvent(input: SaveSalesActivityEventInput) {
  const { firestore } = assertFirebaseClient();

  await setDoc(doc(collection(firestore, "salesActivityEvents")), {
    companyId: resolveCompanyId(input.companyId),
    userId: input.userId,
    type: input.type,
    title: input.title,
    summary: input.summary,
    detail: input.detail ?? input.summary,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
    createdAt: serverTimestamp(),
  });
}

export function subscribeToSalesActivityEvents(
  companyId: string,
  callback: (events: SalesActivityEvent[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const eventsQuery = query(
    collection(firestore, "salesActivityEvents"),
    where("companyId", "==", companyId),
  );
  let isActive = true;

  getDocs(eventsQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapSalesActivityEvent)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))
          .slice(0, 100),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

function mapSalesActivityEvent(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): SalesActivityEvent {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readString(data.companyId),
    userId: readString(data.userId),
    type: readActivityType(data.type),
    title: readString(data.title, "営業活動"),
    summary: readString(data.summary),
    detail: readString(data.detail),
    href: readNullableString(data.href),
    metadata: readMetadata(data.metadata),
    createdAt: readDate(data.createdAt),
  };
}

function readActivityType(value: unknown): SalesActivityType {
  if (
    value === "meeting_uploaded" ||
    value === "transcript_pasted" ||
    value === "knowledge_searched" ||
    value === "roleplay_completed" ||
    value === "ai_analysis_completed"
  ) {
    return value;
  }

  return "meeting_uploaded";
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
