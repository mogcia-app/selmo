"use client";

import {
  Timestamp,
  addDoc,
  collection,
  onSnapshot,
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

export type SalesManual = {
  id: string;
  companyId: string | null;
  title: string;
  content: string;
  criteria: string[];
  requiredQuestions: string[];
  scoringRules: string[];
  objectionHandling: string[];
  closingRules: string[];
  status: "active" | "draft";
  createdBy: string | null;
  updatedAt: Date | null;
};

export type SalesManualInput = {
  companyId?: string | null;
  title: string;
  content: string;
  criteria: string[];
  requiredQuestions: string[];
  scoringRules: string[];
  objectionHandling: string[];
  closingRules: string[];
  status: "active" | "draft";
  createdBy: string;
};

export function subscribeToSalesManuals(
  companyId: string | null | undefined,
  callback: (manuals: SalesManual[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const manualsQuery = companyId
    ? query(collection(firestore, "salesManuals"), where("companyId", "==", companyId))
    : collection(firestore, "salesManuals");

  return onSnapshot(
    manualsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapSalesManual)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export async function createSalesManual(input: SalesManualInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "salesManuals"), {
    companyId: input.companyId ?? null,
    title: input.title,
    content: input.content,
    criteria: input.criteria,
    requiredQuestions: input.requiredQuestions,
    scoringRules: input.scoringRules,
    objectionHandling: input.objectionHandling,
    closingRules: input.closingRules,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSalesManual(id: string, input: SalesManualInput) {
  const { firestore } = assertFirebaseClient();

  await setDoc(
    doc(firestore, "salesManuals", id),
    {
      companyId: input.companyId ?? null,
      title: input.title,
      content: input.content,
      criteria: input.criteria,
      requiredQuestions: input.requiredQuestions,
      scoringRules: input.scoringRules,
      objectionHandling: input.objectionHandling,
      closingRules: input.closingRules,
      status: input.status,
      createdBy: input.createdBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function mapSalesManual(snapshot: QueryDocumentSnapshot<DocumentData>): SalesManual {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    title: readString(data.title, "営業成功基準"),
    content: readString(data.content),
    criteria: readStringArray(data.criteria),
    requiredQuestions: readStringArray(data.requiredQuestions),
    scoringRules: readStringArray(data.scoringRules),
    objectionHandling: readStringArray(data.objectionHandling),
    closingRules: readStringArray(data.closingRules),
    status: data.status === "draft" ? "draft" : "active",
    createdBy: readNullableString(data.createdBy),
    updatedAt: readDate(data.updatedAt),
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function readDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
}
