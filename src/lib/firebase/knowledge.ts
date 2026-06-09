"use client";

import {
  FirestoreError,
  Timestamp,
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentSnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";

export type KnowledgeCategory = {
  id: string;
  title: string;
  description: string;
  knowledgeCount: number;
  memoCount: number;
  updatedAt: Date | null;
};

export type KnowledgeProduct = {
  id: string;
  name: string;
  knowledgeCount: number;
  updatedAt: Date | null;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  description: string;
  body: string;
  categoryId: string | null;
  productId: string | null;
  ownerId: string | null;
  scope: "personal" | "shared";
  kind: "knowledge" | "memo" | "qa";
  tags: string[];
  updatedAt: Date | null;
};

export type KnowledgeSearchHistory = {
  id: string;
  term: string;
  searchedAt: Date | null;
};

export function subscribeToKnowledgeCategories(
  callback: (categories: KnowledgeCategory[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const categoriesQuery = query(collection(firestore, "knowledgeCategories"), orderBy("updatedAt", "desc"));

  return onSnapshot(
    categoriesQuery,
    (snapshot) => callback(snapshot.docs.map(mapKnowledgeCategory)),
    onError,
  );
}

export function subscribeToKnowledgeProducts(
  callback: (products: KnowledgeProduct[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const productsQuery = query(collection(firestore, "knowledgeProducts"), orderBy("updatedAt", "desc"));

  return onSnapshot(
    productsQuery,
    (snapshot) => callback(snapshot.docs.map(mapKnowledgeProduct)),
    onError,
  );
}

export function subscribeToVisibleKnowledgeItems(
  userId: string,
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const itemsById = new Map<string, KnowledgeItem>();

  const emit = () => {
    callback(
      Array.from(itemsById.values()).sort(
        (left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0),
      ),
    );
  };

  const sharedQuery = query(collection(firestore, "knowledgeItems"), where("scope", "==", "shared"));
  const personalQuery = query(collection(firestore, "knowledgeItems"), where("ownerId", "==", userId));

  const unsubscribeShared = onSnapshot(
    sharedQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "removed") {
          itemsById.delete(change.doc.id);
          return;
        }

        itemsById.set(change.doc.id, mapKnowledgeItem(change.doc));
      });
      emit();
    },
    onError,
  );

  const unsubscribePersonal = onSnapshot(
    personalQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "removed") {
          itemsById.delete(change.doc.id);
          return;
        }

        itemsById.set(change.doc.id, mapKnowledgeItem(change.doc));
      });
      emit();
    },
    onError,
  );

  return () => {
    unsubscribeShared();
    unsubscribePersonal();
  };
}

export function subscribeToKnowledgeItemsByCategory(
  input: { categoryId: string; userId: string },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return subscribeToVisibleKnowledgeItems(
    input.userId,
    (items) => callback(items.filter((item) => item.categoryId === input.categoryId)),
    onError,
  );
}

export function subscribeToKnowledgeItem(
  knowledgeId: string,
  callback: (item: KnowledgeItem | null) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    doc(firestore, "knowledgeItems", knowledgeId),
    (snapshot) => {
      callback(snapshot.exists() ? mapKnowledgeItem(snapshot) : null);
    },
    onError,
  );
}

export function subscribeToRecentKnowledgeSearches(
  userId: string,
  callback: (items: KnowledgeSearchHistory[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const historyQuery = query(
    collection(firestore, "users", userId, "knowledgeSearchHistory"),
    orderBy("searchedAt", "desc"),
    limit(5),
  );

  return onSnapshot(
    historyQuery,
    (snapshot) => callback(snapshot.docs.map(mapSearchHistory)),
    onError,
  );
}

export async function saveKnowledgeSearch(userId: string, term: string) {
  const normalizedTerm = term.trim();

  if (!normalizedTerm) {
    return;
  }

  const { firestore } = assertFirebaseClient();
  await setDoc(doc(firestore, "users", userId, "knowledgeSearchHistory", encodeSearchId(normalizedTerm)), {
    term: normalizedTerm,
    searchedAt: serverTimestamp(),
  });
}

export async function createKnowledgeCategory(input: { title: string; description?: string; userId: string }) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "knowledgeCategories"), {
    title: input.title,
    description: input.description ?? "",
    knowledgeCount: 0,
    memoCount: 0,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createKnowledgeProduct(input: { name: string; userId: string }) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "knowledgeProducts"), {
    name: input.name,
    knowledgeCount: 0,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createKnowledgeItem(input: {
  title: string;
  description?: string;
  body?: string;
  categoryId?: string | null;
  productId?: string | null;
  ownerId: string;
  scope: "personal" | "shared";
  kind?: "knowledge" | "memo" | "qa";
  tags?: string[];
}) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "knowledgeItems"), {
    title: input.title,
    description: input.description ?? "",
    body: input.body ?? "",
    categoryId: input.categoryId ?? null,
    productId: input.productId ?? null,
    ownerId: input.ownerId,
    scope: input.scope,
    kind: input.kind ?? "knowledge",
    tags: input.tags ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function filterKnowledgeItems(items: KnowledgeItem[], term: string) {
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    return [];
  }

  return items.filter((item) =>
    [item.title, item.description, item.body, item.kind, item.scope, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalizedTerm),
  );
}

function mapKnowledgeCategory(snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeCategory {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    title: readString(data.title, "未設定カテゴリ"),
    description: readString(data.description),
    knowledgeCount: readNumber(data.knowledgeCount),
    memoCount: readNumber(data.memoCount),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapKnowledgeProduct(snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeProduct {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: readString(data.name, "未設定商品"),
    knowledgeCount: readNumber(data.knowledgeCount),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapKnowledgeItem(snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): KnowledgeItem {
  const data = snapshot.data() ?? {};
  const scope = data.scope === "shared" ? "shared" : "personal";
  const kind = data.kind === "memo" || data.kind === "qa" ? data.kind : "knowledge";

  return {
    id: snapshot.id,
    title: readString(data.title, "無題のナレッジ"),
    description: readString(data.description),
    body: readString(data.body),
    categoryId: readNullableString(data.categoryId),
    productId: readNullableString(data.productId),
    ownerId: readNullableString(data.ownerId),
    scope,
    kind,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [],
    updatedAt: readDate(data.updatedAt),
  };
}

function mapSearchHistory(snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeSearchHistory {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    term: readString(data.term),
    searchedAt: readDate(data.searchedAt),
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

function encodeSearchId(term: string) {
  return encodeURIComponent(term).replace(/\./g, "%2E").slice(0, 400);
}
