"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";

export type AnalysisConfigType = "meeting_upload" | "teleapo_upload" | "meeting_roleplay" | "teleapo_roleplay";

export type AnalysisConfigItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

export type AnalysisConfig = {
  id: string;
  companyId: string | null;
  productId: string | null;
  productName: string;
  analysisType: AnalysisConfigType;
  title: string;
  checklistItems: AnalysisConfigItem[];
  scoringRules: string[];
  improvementInstruction: string;
  customPrompt: string;
  status: "active" | "draft";
  createdBy: string | null;
  updatedAt: Date | null;
};

export type AnalysisConfigInput = {
  companyId?: string | null;
  productId?: string | null;
  productName?: string;
  analysisType: AnalysisConfigType;
  title: string;
  checklistItems: AnalysisConfigItem[];
  scoringRules: string[];
  improvementInstruction: string;
  customPrompt: string;
  status: "active" | "draft";
  createdBy: string;
};

export const analysisTypeLabels: Record<AnalysisConfigType, string> = {
  meeting_upload: "商談アップロード分析",
  teleapo_upload: "テレアポアップロード分析",
  meeting_roleplay: "商談ロープレ分析",
  teleapo_roleplay: "テレアポロープレ分析",
};

export function subscribeToAnalysisConfigs(
  companyId: string | null | undefined,
  callback: (configs: AnalysisConfig[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }

  const configsQuery = query(collection(firestore, "analysisConfigs"), where("companyId", "==", companyId));
  return onSnapshot(
    configsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapAnalysisConfig)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export async function createAnalysisConfig(input: AnalysisConfigInput) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "analysisConfigs"), buildAnalysisConfigPayload(input, true));
}

export async function updateAnalysisConfig(id: string, input: AnalysisConfigInput) {
  const { firestore } = assertFirebaseClient();
  await setDoc(doc(firestore, "analysisConfigs", id), buildAnalysisConfigPayload(input, false), { merge: true });
}

function buildAnalysisConfigPayload(input: AnalysisConfigInput, includeCreatedAt: boolean) {
  return {
    companyId: input.companyId ?? null,
    productId: input.productId ?? null,
    productName: input.productName ?? "",
    analysisType: input.analysisType,
    title: input.title,
    checklistItems: normalizeChecklistItems(input.checklistItems),
    scoringRules: input.scoringRules,
    improvementInstruction: input.improvementInstruction,
    customPrompt: input.customPrompt,
    status: input.status,
    createdBy: input.createdBy,
    ...(includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  };
}

function mapAnalysisConfig(snapshot: QueryDocumentSnapshot<DocumentData>): AnalysisConfig {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    productId: readNullableString(data.productId),
    productName: readString(data.productName),
    analysisType: readAnalysisType(data.analysisType),
    title: readString(data.title, "分析設定"),
    checklistItems: readChecklistItems(data.checklistItems),
    scoringRules: readStringArray(data.scoringRules),
    improvementInstruction: readString(data.improvementInstruction),
    customPrompt: readString(data.customPrompt),
    status: data.status === "draft" ? "draft" : "active",
    createdBy: readNullableString(data.createdBy),
    updatedAt: readDate(data.updatedAt),
  };
}

function normalizeChecklistItems(items: AnalysisConfigItem[]) {
  return items
    .map((item, index) => ({
      id: item.id || `item-${index}`,
      label: item.label.trim(),
      description: item.description.trim(),
      required: item.required,
    }))
    .filter((item) => item.label);
}

function readChecklistItems(value: unknown): AnalysisConfigItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const label = readString(data.label).trim();
      if (!label) return null;
      return {
        id: readString(data.id, `item-${index}`),
        label,
        description: readString(data.description),
        required: data.required === true,
      };
    })
    .filter((item): item is AnalysisConfigItem => Boolean(item));
}

function readAnalysisType(value: unknown): AnalysisConfigType {
  if (
    value === "meeting_upload" ||
    value === "teleapo_upload" ||
    value === "meeting_roleplay" ||
    value === "teleapo_roleplay"
  ) {
    return value;
  }
  return "meeting_roleplay";
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
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}
