"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import { saveSalesActivityEvent } from "@/lib/firebase/activity";

export type RoleplayDifficulty = "easy" | "normal" | "hard";
export type RoleplayScenarioVisibility = "draft" | "all";
export type RoleplayScenarioCategory = "新規" | "既存" | "";
export type RoleplayType = "meeting" | "teleapo";

export type RoleplayScenarioCustomField = {
  id: string;
  label: string;
  value: string;
};

export type RoleplayScenario = {
  id: string;
  companyId: string | null;
  roleplayType: RoleplayType;
  title: string;
  description: string;
  productId: string | null;
  productName: string;
  scenarioCategory: RoleplayScenarioCategory;
  targetSegment: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  customFields: RoleplayScenarioCustomField[];
  difficulty: RoleplayDifficulty;
  visibility: RoleplayScenarioVisibility;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type RoleplayMessage = {
  role: "customer" | "sales";
  content: string;
  createdAt: string;
};

export type RoleplayResult = {
  id: string;
  companyId: string | null;
  scenarioId: string;
  scenarioTitle: string;
  roleplayType: RoleplayType;
  productName: string;
  userId: string;
  score: number;
  summary: string;
  evaluationCriteria: string[];
  strengths: string[];
  improvements: string[];
  improvementPhrases: string[];
  manualChecklistItems?: Array<{
    category: string;
    label: string;
    status: "done" | "missing";
    reason: string;
    scoreImpact: number | null;
  }>;
  messages: RoleplayMessage[];
  createdAt: Date | null;
};

export type RoleplayResultComment = {
  id: string;
  companyId: string | null;
  resultId: string;
  scenarioId: string;
  userId: string;
  comment: string;
  createdBy: string | null;
  createdAt: Date | null;
};

export type RoleplayAssignmentStatus = "assigned" | "completed";

export type RoleplayAssignment = {
  id: string;
  companyId: string | null;
  userId: string;
  scenarioId: string;
  scenarioTitle: string;
  productName: string;
  assignedBy: string;
  reason: string;
  status: RoleplayAssignmentStatus;
  createdAt: Date | null;
  completedAt: Date | null;
};

export type RoleplayTalkGuide = {
  id: string;
  companyId: string | null;
  productId: string;
  productName: string;
  scenarioCategory: Exclude<RoleplayScenarioCategory, "">;
  steps: string[];
  notes: string;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CreateRoleplayScenarioInput = {
  companyId?: string | null;
  roleplayType?: RoleplayType;
  title: string;
  description: string;
  productId?: string | null;
  productName?: string;
  scenarioCategory?: RoleplayScenarioCategory;
  targetSegment?: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  customFields?: RoleplayScenarioCustomField[];
  difficulty: RoleplayDifficulty;
  visibility?: RoleplayScenarioVisibility;
  createdBy: string;
};

export type SaveRoleplayTalkGuideInput = {
  companyId?: string | null;
  productId: string;
  productName: string;
  scenarioCategory: Exclude<RoleplayScenarioCategory, "">;
  steps: string[];
  notes?: string;
  createdBy: string;
};

export type CreateRoleplayResultCommentInput = {
  companyId?: string | null;
  resultId: string;
  scenarioId: string;
  userId: string;
  comment: string;
  createdBy: string;
};

export type CreateRoleplayAssignmentInput = {
  companyId?: string | null;
  userId: string;
  scenario: RoleplayScenario;
  assignedBy: string;
  reason: string;
};

export function subscribeToRoleplayScenarios(
  companyId: string | null | undefined,
  callback: (scenarios: RoleplayScenario[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const scenariosQuery = query(collection(firestore, "roleplayScenarios"), where("companyId", "==", companyId));
  let isActive = true;

  getDocs(scenariosQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapRoleplayScenario)
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

export function subscribeToRoleplayResults(
  input: { userId: string; companyId?: string | null; isAdmin?: boolean },
  callback: (results: RoleplayResult[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }
  const resultsQuery = input.isAdmin
    ? query(collection(firestore, "roleplayResults"), where("companyId", "==", input.companyId))
    : query(
        collection(firestore, "roleplayResults"),
        where("companyId", "==", input.companyId),
        where("userId", "==", input.userId),
      );

  let isActive = true;

  getDocs(resultsQuery)
    .then((snapshot) => {
      if (!isActive) {
        return;
      }

      callback(
        snapshot.docs
          .map(mapRoleplayResult)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) {
        onError?.(error);
      }
    });

  return () => {
    isActive = false;
  };
}

export function subscribeToRoleplayAssignments(
  input: { companyId?: string | null; userId?: string | null; isAdmin?: boolean },
  callback: (assignments: RoleplayAssignment[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }
  const assignmentsQuery = input.isAdmin
    ? query(collection(firestore, "roleplayAssignments"), where("companyId", "==", input.companyId))
    : query(
        collection(firestore, "roleplayAssignments"),
        where("companyId", "==", input.companyId),
        where("userId", "==", input.userId ?? ""),
      );
  let isActive = true;

  getDocs(assignmentsQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapRoleplayAssignment)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export function subscribeToRoleplayResultComments(
  input: { companyId?: string | null; resultId?: string | null; userId?: string | null },
  callback: (comments: RoleplayResultComment[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId || !input.resultId) {
    callback([]);
    return () => undefined;
  }
  const commentsQuery = query(
    collection(firestore, "roleplayResultComments"),
    where("companyId", "==", input.companyId),
    where("resultId", "==", input.resultId),
    ...(input.userId ? [where("userId", "==", input.userId)] : []),
  );
  let isActive = true;

  getDocs(commentsQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapRoleplayResultComment)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      );
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export function subscribeToRoleplayTalkGuides(
  companyId: string | null | undefined,
  callback: (guides: RoleplayTalkGuide[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const guidesQuery = query(collection(firestore, "roleplayTalkGuides"), where("companyId", "==", companyId));
  let isActive = true;

  getDocs(guidesQuery)
    .then((snapshot) => {
      if (!isActive) return;
      callback(
        snapshot.docs
          .map(mapRoleplayTalkGuide)
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

export async function createRoleplayScenario(input: CreateRoleplayScenarioInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayScenarios"), {
    companyId: input.companyId ?? null,
    roleplayType: input.roleplayType ?? "meeting",
    title: input.title,
    description: input.description,
    productId: input.productId ?? null,
    productName: input.productName ?? "",
    scenarioCategory: input.scenarioCategory ?? "",
    targetSegment: input.targetSegment ?? "",
    customerRole: input.customerRole,
    customerProfile: input.customerProfile,
    goal: input.goal,
    objections: input.objections,
    evaluationCriteria: input.evaluationCriteria,
    customFields: normalizeRoleplayScenarioCustomFields(input.customFields),
    difficulty: input.difficulty,
    visibility: input.visibility ?? "all",
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRoleplayScenario(id: string, input: CreateRoleplayScenarioInput) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "roleplayScenarios", id), {
    companyId: input.companyId ?? null,
    roleplayType: input.roleplayType ?? "meeting",
    title: input.title,
    description: input.description,
    productId: input.productId ?? null,
    productName: input.productName ?? "",
    scenarioCategory: input.scenarioCategory ?? "",
    targetSegment: input.targetSegment ?? "",
    customerRole: input.customerRole,
    customerProfile: input.customerProfile,
    goal: input.goal,
    objections: input.objections,
    evaluationCriteria: input.evaluationCriteria,
    customFields: normalizeRoleplayScenarioCustomFields(input.customFields),
    difficulty: input.difficulty,
    visibility: input.visibility ?? "all",
    createdBy: input.createdBy,
    updatedAt: serverTimestamp(),
  });
}

export async function updateRoleplayScenarioVisibility(
  id: string,
  visibility: RoleplayScenarioVisibility,
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "roleplayScenarios", id), {
    visibility,
    updatedAt: serverTimestamp(),
  });
}

export async function saveRoleplayResult(input: Omit<RoleplayResult, "id" | "createdAt">) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayResults"), {
    companyId: input.companyId ?? null,
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    roleplayType: input.roleplayType,
    productName: input.productName,
    userId: input.userId,
    score: input.score,
    summary: input.summary,
    evaluationCriteria: input.evaluationCriteria,
    strengths: input.strengths,
    improvements: input.improvements,
    improvementPhrases: input.improvementPhrases,
    manualChecklistItems: input.manualChecklistItems ?? [],
    messages: input.messages,
    createdAt: serverTimestamp(),
  });

  const assignmentsSnapshot = await getDocs(
    query(
      collection(firestore, "roleplayAssignments"),
      where("companyId", "==", input.companyId ?? null),
      where("userId", "==", input.userId),
      where("scenarioId", "==", input.scenarioId),
      where("status", "==", "assigned"),
    ),
  ).catch(() => null);

  await Promise.all(
    assignmentsSnapshot?.docs.map((assignment) =>
      updateDoc(doc(firestore, "roleplayAssignments", assignment.id), {
        status: "completed",
        completedAt: serverTimestamp(),
      }),
    ) ?? [],
  ).catch(() => undefined);

  await saveSalesActivityEvent({
    companyId: input.companyId,
    userId: input.userId,
    type: "roleplay_completed",
    title: "ロープレ完了",
    summary: `${input.scenarioTitle}を実施しました`,
    detail: [
      `シナリオ: ${input.scenarioTitle}`,
      `商材: ${input.productName || "未設定"}`,
      `スコア: ${input.score}点`,
      `要約: ${input.summary || "未生成"}`,
    ].join("\n"),
    href: "/admin/roleplay",
    metadata: {
      scenarioId: input.scenarioId,
      scenarioTitle: input.scenarioTitle,
      productName: input.productName,
      score: input.score,
    },
  }).catch(() => undefined);
}

export async function deleteRoleplayResult(id: string) {
  const { firestore } = assertFirebaseClient();
  await deleteDoc(doc(firestore, "roleplayResults", id));
}

export async function createRoleplayAssignment(input: CreateRoleplayAssignmentInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayAssignments"), {
    companyId: input.companyId ?? null,
    userId: input.userId,
    scenarioId: input.scenario.id,
    scenarioTitle: input.scenario.title,
    productName: input.scenario.productName,
    assignedBy: input.assignedBy,
    reason: input.reason,
    status: "assigned",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

export async function createRoleplayResultComment(input: CreateRoleplayResultCommentInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayResultComments"), {
    companyId: input.companyId ?? null,
    resultId: input.resultId,
    scenarioId: input.scenarioId,
    userId: input.userId,
    comment: input.comment,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createRoleplayTalkGuide(input: SaveRoleplayTalkGuideInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayTalkGuides"), {
    companyId: input.companyId ?? null,
    productId: input.productId,
    productName: input.productName,
    scenarioCategory: input.scenarioCategory,
    steps: input.steps,
    notes: input.notes ?? "",
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRoleplayTalkGuide(id: string, input: SaveRoleplayTalkGuideInput) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "roleplayTalkGuides", id), {
    companyId: input.companyId ?? null,
    productId: input.productId,
    productName: input.productName,
    scenarioCategory: input.scenarioCategory,
    steps: input.steps,
    notes: input.notes ?? "",
    createdBy: input.createdBy,
    updatedAt: serverTimestamp(),
  });
}

function mapRoleplayScenario(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayScenario {
  const data = snapshot.data();
  const difficulty = data.difficulty === "easy" || data.difficulty === "hard" ? data.difficulty : "normal";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    roleplayType: readRoleplayType(data.roleplayType),
    title: readString(data.title, "無題のシナリオ"),
    description: readString(data.description),
    productId: readNullableString(data.productId),
    productName: readString(data.productName),
    scenarioCategory: readScenarioCategory(data.scenarioCategory),
    targetSegment: readString(data.targetSegment),
    customerRole: readString(data.customerRole, "担当者"),
    customerProfile: readString(data.customerProfile),
    goal: readString(data.goal),
    objections: readStringArray(data.objections),
    evaluationCriteria: readStringArray(data.evaluationCriteria),
    customFields: readRoleplayScenarioCustomFields(data.customFields),
    difficulty,
    visibility: data.visibility === "draft" ? "draft" : "all",
    createdBy: readNullableString(data.createdBy),
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapRoleplayTalkGuide(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayTalkGuide {
  const data = snapshot.data();
  const scenarioCategory = data.scenarioCategory === "既存" ? "既存" : "新規";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    productId: readString(data.productId),
    productName: readString(data.productName),
    scenarioCategory,
    steps: readStringArray(data.steps),
    notes: readString(data.notes),
    createdBy: readNullableString(data.createdBy),
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
  };
}

function readScenarioCategory(value: unknown) {
  return value === "新規" || value === "既存" ? value : "";
}

function mapRoleplayResult(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayResult {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    scenarioId: readString(data.scenarioId),
    scenarioTitle: readString(data.scenarioTitle, "ロープレ"),
    roleplayType: readRoleplayType(data.roleplayType),
    productName: readString(data.productName),
    userId: readString(data.userId),
    score: readNumber(data.score),
    summary: readString(data.summary),
    evaluationCriteria: readStringArray(data.evaluationCriteria),
    strengths: readStringArray(data.strengths),
    improvements: readStringArray(data.improvements),
    improvementPhrases: readStringArray(data.improvementPhrases),
    manualChecklistItems: readManualChecklistItems(data.manualChecklistItems),
    messages: readMessages(data.messages),
    createdAt: readDate(data.createdAt),
  };
}

function readManualChecklistItems(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const category = readString(data.category).trim();
      const label = readString(data.label).trim();
      const status = readString(data.status);
      const reason = readString(data.reason).trim();
      const scoreImpact = typeof data.scoreImpact === "number" && Number.isFinite(data.scoreImpact) ? Math.round(data.scoreImpact) : null;

      if (!category || !label || (status !== "done" && status !== "missing")) return null;

      return { category, label, status, reason, scoreImpact };
    })
    .filter((item): item is { category: string; label: string; status: "done" | "missing"; reason: string; scoreImpact: number | null } => Boolean(item));

  return items.length > 0 ? items : undefined;
}

function readRoleplayType(value: unknown): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
}

function mapRoleplayResultComment(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayResultComment {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    resultId: readString(data.resultId),
    scenarioId: readString(data.scenarioId),
    userId: readString(data.userId),
    comment: readString(data.comment),
    createdBy: readNullableString(data.createdBy),
    createdAt: readDate(data.createdAt),
  };
}

function mapRoleplayAssignment(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayAssignment {
  const data = snapshot.data();
  const status = data.status === "completed" ? "completed" : "assigned";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readString(data.userId),
    scenarioId: readString(data.scenarioId),
    scenarioTitle: readString(data.scenarioTitle, "ロープレ課題"),
    productName: readString(data.productName),
    assignedBy: readString(data.assignedBy),
    reason: readString(data.reason),
    status,
    createdAt: readDate(data.createdAt),
    completedAt: readDate(data.completedAt),
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function normalizeRoleplayScenarioCustomFields(value: RoleplayScenarioCustomField[] | undefined) {
  return (value ?? [])
    .map((field) => ({
      id: field.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: field.label.trim(),
      value: field.value.trim(),
    }))
    .filter((field) => field.label && field.value)
    .slice(0, 12);
}

function readRoleplayScenarioCustomFields(value: unknown): RoleplayScenarioCustomField[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = readString(record.label).trim();
      const fieldValue = readString(record.value).trim();
      if (!label || !fieldValue) return null;

      return {
        id: readString(record.id) || `custom-${index + 1}`,
        label,
        value: fieldValue,
      };
    })
    .filter((item): item is RoleplayScenarioCustomField => Boolean(item))
    .slice(0, 12);
}

function readMessages(value: unknown): RoleplayMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "sales" ? "sales" : "customer";
      const content = readString(record.content);
      if (!content) return null;

      return {
        role,
        content,
        createdAt: readString(record.createdAt),
      };
    })
    .filter((item): item is RoleplayMessage => Boolean(item));
}
