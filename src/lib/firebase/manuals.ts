"use client";

import {
  Timestamp,
  addDoc,
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

export type SalesManualDomain = "meeting" | "teleapo";

export type SalesManual = {
  id: string;
  companyId: string | null;
  manualDomain: SalesManualDomain;
  title: string;
  productId: string | null;
  productName: string;
  manualCategory: "新規" | "既存" | "";
  targetSegment: string;
  content: string;
  criteria: string[];
  requiredQuestions: string[];
  scoringRules: string[];
  objectionHandling: string[];
  closingRules: string[];
  customFields: SalesManualCustomField[];
  status: "active" | "draft";
  createdBy: string | null;
  updatedAt: Date | null;
};

export type SalesManualCustomField = {
  id: string;
  label: string;
  value: string;
};

export type SalesManualInput = {
  companyId?: string | null;
  manualDomain?: SalesManualDomain;
  title: string;
  productId?: string | null;
  productName?: string;
  manualCategory?: "新規" | "既存" | "";
  targetSegment?: string;
  content: string;
  criteria: string[];
  requiredQuestions: string[];
  scoringRules: string[];
  objectionHandling: string[];
  closingRules: string[];
  customFields?: SalesManualCustomField[];
  status: "active" | "draft";
  createdBy: string;
};

export function subscribeToSalesManuals(
  companyId: string | null | undefined,
  callback: (manuals: SalesManual[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const manualsQuery = query(collection(firestore, "salesManuals"), where("companyId", "==", companyId));
  let isActive = true;

  getDocs(manualsQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapSalesManual)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export async function createSalesManual(input: SalesManualInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "salesManuals"), {
    companyId: input.companyId ?? null,
    manualDomain: input.manualDomain ?? "meeting",
    title: input.title,
    productId: input.productId ?? null,
    productName: input.productName ?? "",
    manualCategory: input.manualCategory ?? "",
    targetSegment: input.targetSegment ?? "",
    content: input.content,
    criteria: input.criteria,
    requiredQuestions: input.requiredQuestions,
    scoringRules: input.scoringRules,
    objectionHandling: input.objectionHandling,
    closingRules: input.closingRules,
    customFields: input.customFields ?? [],
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
      manualDomain: input.manualDomain ?? "meeting",
      title: input.title,
      productId: input.productId ?? null,
      productName: input.productName ?? "",
      manualCategory: input.manualCategory ?? "",
      targetSegment: input.targetSegment ?? "",
      content: input.content,
      criteria: input.criteria,
      requiredQuestions: input.requiredQuestions,
      scoringRules: input.scoringRules,
      objectionHandling: input.objectionHandling,
      closingRules: input.closingRules,
      customFields: input.customFields ?? [],
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
    manualDomain: readManualDomain(data.manualDomain),
    title: readString(data.title, "営業成功基準"),
    productId: readNullableString(data.productId),
    productName: readString(data.productName),
    manualCategory: readManualCategory(data.manualCategory),
    targetSegment: readString(data.targetSegment),
    content: readString(data.content),
    criteria: readStringArray(data.criteria),
    requiredQuestions: readStringArray(data.requiredQuestions),
    scoringRules: readStringArray(data.scoringRules),
    objectionHandling: readStringArray(data.objectionHandling),
    closingRules: readStringArray(data.closingRules),
    customFields: readManualCustomFields(data.customFields),
    status: data.status === "draft" ? "draft" : "active",
    createdBy: readNullableString(data.createdBy),
    updatedAt: readDate(data.updatedAt),
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readManualCategory(value: unknown) {
  return value === "新規" || value === "既存" ? value : "";
}

function readManualDomain(value: unknown) {
  return value === "teleapo" ? "teleapo" : "meeting";
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function readManualCustomFields(value: unknown): SalesManualCustomField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const label = readString(data.label).trim();
      const fieldValue = readString(data.value).trim();
      if (!label || !fieldValue) return null;
      return {
        id: readString(data.id, `custom-${index}`),
        label,
        value: fieldValue,
      };
    })
    .filter((item): item is SalesManualCustomField => Boolean(item));
}

function readDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  return null;
}
