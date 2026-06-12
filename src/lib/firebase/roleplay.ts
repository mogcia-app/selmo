"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
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

export type RoleplayScenario = {
  id: string;
  companyId: string | null;
  title: string;
  description: string;
  productId: string | null;
  productName: string;
  scenarioCategory: "新規" | "既存" | "";
  targetSegment: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  difficulty: RoleplayDifficulty;
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
  productName: string;
  userId: string;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  improvementPhrases: string[];
  messages: RoleplayMessage[];
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

export type CreateRoleplayScenarioInput = {
  companyId?: string | null;
  title: string;
  description: string;
  productId?: string | null;
  productName?: string;
  scenarioCategory?: "新規" | "既存" | "";
  targetSegment?: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  difficulty: RoleplayDifficulty;
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

  return onSnapshot(
    scenariosQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapRoleplayScenario)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
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
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))
          .slice(0, 30),
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

  return onSnapshot(
    assignmentsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapRoleplayAssignment)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export async function createRoleplayScenario(input: CreateRoleplayScenarioInput) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayScenarios"), {
    companyId: input.companyId ?? null,
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
    difficulty: input.difficulty,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRoleplayScenario(id: string, input: CreateRoleplayScenarioInput) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "roleplayScenarios", id), {
    companyId: input.companyId ?? null,
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
    difficulty: input.difficulty,
    createdBy: input.createdBy,
    updatedAt: serverTimestamp(),
  });
}

export async function saveRoleplayResult(input: Omit<RoleplayResult, "id" | "createdAt">) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "roleplayResults"), {
    companyId: input.companyId ?? null,
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    productName: input.productName,
    userId: input.userId,
    score: input.score,
    summary: input.summary,
    strengths: input.strengths,
    improvements: input.improvements,
    improvementPhrases: input.improvementPhrases,
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

function mapRoleplayScenario(snapshot: QueryDocumentSnapshot<DocumentData>): RoleplayScenario {
  const data = snapshot.data();
  const difficulty = data.difficulty === "easy" || data.difficulty === "hard" ? data.difficulty : "normal";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
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
    difficulty,
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
    productName: readString(data.productName),
    userId: readString(data.userId),
    score: readNumber(data.score),
    summary: readString(data.summary),
    strengths: readStringArray(data.strengths),
    improvements: readStringArray(data.improvements),
    improvementPhrases: readStringArray(data.improvementPhrases),
    messages: readMessages(data.messages),
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
