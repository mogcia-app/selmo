"use client";

import {
  FirestoreError,
  Timestamp,
  addDoc,
  collection,
  doc,
  increment,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentSnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

import { assertFirebaseClient } from "@/lib/firebase/client";

const LOCAL_DEFAULT_CATEGORY_ID = "how-to";

const knowledgeSearchAliases: Record<string, string[]> = {
  料金: ["価格", "費用", "月額", "初期費用", "プラン", "値段", "課金"],
  価格: ["料金", "費用", "月額", "初期費用", "プラン", "値段", "課金"],
  費用: ["料金", "価格", "月額", "初期費用", "プラン", "値段", "課金"],
  月額: ["料金", "価格", "費用", "プラン", "課金"],
  プラン: ["料金", "価格", "費用", "月額"],
  契約: ["導入", "申込", "更新", "解約"],
  解約: ["契約", "退会", "キャンセル", "更新"],
  競合: ["比較", "他社", "違い", "差別化"],
  比較: ["競合", "他社", "違い", "差別化"],
  導入: ["契約", "初期設定", "オンボーディング", "開始"],
  セキュリティ: ["安全", "権限", "認証", "情報管理"],
};

export type KnowledgeCategory = {
  id: string;
  companyId: string | null;
  title: string;
  description: string;
  knowledgeCount: number;
  memoCount: number;
  updatedAt: Date | null;
};

export type KnowledgeProduct = {
  id: string;
  companyId: string | null;
  name: string;
  logoUrl: string;
  logoStoragePath: string;
  knowledgeCount: number;
  tabs: string[];
  updatedAt: Date | null;
};

export type KnowledgeItem = {
  id: string;
  companyId: string | null;
  title: string;
  description: string;
  body: string;
  tabTitle: string;
  categoryId: string | null;
  productId: string | null;
  ownerId: string | null;
  scope: "personal" | "shared";
  kind: "knowledge" | "memo" | "qa";
  tags: string[];
  links: KnowledgeLink[];
  attachments: KnowledgeAttachment[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type KnowledgeLink = {
  title: string;
  url: string;
  description: string;
};

export type KnowledgeAttachment = {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedAt: Date | null;
  uploadedBy: string | null;
};

export type CreateKnowledgeItemInput = {
  companyId?: string | null;
  title: string;
  description?: string;
  body?: string;
  tabTitle?: string;
  categoryId?: string | null;
  productId?: string | null;
  ownerId: string;
  scope: "personal" | "shared";
  kind?: "knowledge" | "memo" | "qa";
  tags?: string[];
  links?: KnowledgeLink[];
  attachments?: KnowledgeAttachment[];
};

export type UpdateKnowledgeItemInput = Omit<CreateKnowledgeItemInput, "ownerId"> & {
  id: string;
};

export type KnowledgeSearchHistory = {
  id: string;
  term: string;
  searchedAt: Date | null;
};

export function subscribeToKnowledgeCategories(
  companyId: string | null | undefined,
  callback: (categories: KnowledgeCategory[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const categoriesQuery = companyId
    ? query(collection(firestore, "knowledgeCategories"), where("companyId", "==", companyId))
    : query(collection(firestore, "knowledgeCategories"), orderBy("updatedAt", "desc"));

  return onSnapshot(
    categoriesQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapKnowledgeCategory)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToKnowledgeProducts(
  companyId: string | null | undefined,
  callback: (products: KnowledgeProduct[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const productsQuery = companyId
    ? query(collection(firestore, "knowledgeProducts"), where("companyId", "==", companyId))
    : query(collection(firestore, "knowledgeProducts"), orderBy("updatedAt", "desc"));

  return onSnapshot(
    productsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapKnowledgeProduct)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToVisibleKnowledgeItems(
  input: { userId: string; companyId?: string | null },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const sharedQuery = input.companyId
    ? query(
        collection(firestore, "knowledgeItems"),
        where("companyId", "==", input.companyId),
        where("scope", "==", "shared"),
      )
    : query(collection(firestore, "knowledgeItems"), where("scope", "==", "shared"));
  const personalQuery = input.companyId
    ? query(
        collection(firestore, "knowledgeItems"),
        where("companyId", "==", input.companyId),
        where("ownerId", "==", input.userId),
      )
    : query(collection(firestore, "knowledgeItems"), where("ownerId", "==", input.userId));

  let isActive = true;

  Promise.all([getDocs(sharedQuery), getDocs(personalQuery)])
    .then(([sharedSnapshot, personalSnapshot]) => {
      if (!isActive) {
        return;
      }

      const itemsById = new Map<string, KnowledgeItem>();
      [...sharedSnapshot.docs, ...personalSnapshot.docs].forEach((snapshot) => {
        itemsById.set(snapshot.id, mapKnowledgeItem(snapshot));
      });

      callback(
        Array.from(itemsById.values()).sort(
          (left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0),
        ),
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

export function subscribeToAllKnowledgeItems(
  companyId: string | null | undefined,
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  const itemsQuery = companyId
    ? query(collection(firestore, "knowledgeItems"), where("companyId", "==", companyId))
    : collection(firestore, "knowledgeItems");

  return onSnapshot(
    itemsQuery,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapKnowledgeItem)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToKnowledgeItemsByCategory(
  input: { categoryId: string; userId: string; companyId?: string | null },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return subscribeToVisibleKnowledgeItems(
    { userId: input.userId, companyId: input.companyId },
    (items) => callback(items.filter((item) => item.categoryId === input.categoryId)),
    onError,
  );
}

export function subscribeToKnowledgeItemsByProduct(
  input: { productId: string; userId: string; companyId?: string | null },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return subscribeToVisibleKnowledgeItems(
    { userId: input.userId, companyId: input.companyId },
    (items) => callback(items.filter((item) => item.productId === input.productId)),
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

export async function createKnowledgeCategory(input: { title: string; description?: string; userId: string; companyId?: string | null }) {
  const { firestore } = assertFirebaseClient();
  await addDoc(collection(firestore, "knowledgeCategories"), {
    companyId: input.companyId ?? null,
    title: input.title,
    description: input.description ?? "",
    knowledgeCount: 0,
    memoCount: 0,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createKnowledgeProduct(input: { name: string; logoUrl?: string; logoStoragePath?: string; userId: string; companyId?: string | null }) {
  const { firestore } = assertFirebaseClient();
  const productRef = await addDoc(collection(firestore, "knowledgeProducts"), {
    companyId: input.companyId ?? null,
    name: input.name,
    logoUrl: input.logoUrl ?? "",
    logoStoragePath: input.logoStoragePath ?? "",
    knowledgeCount: 0,
    tabs: [],
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return productRef.id;
}

export async function updateKnowledgeProduct(input: { id: string; name: string; logoUrl?: string; logoStoragePath?: string }) {
  const { firestore } = assertFirebaseClient();

  await setDoc(
    doc(firestore, "knowledgeProducts", input.id),
    {
      name: input.name,
      logoUrl: input.logoUrl ?? "",
      logoStoragePath: input.logoStoragePath ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function addKnowledgeProductTab(input: { productId: string; title: string }) {
  const title = input.title.trim();

  if (!title) {
    return;
  }

  const { firestore } = assertFirebaseClient();
  const productRef = doc(firestore, "knowledgeProducts", input.productId);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(productRef);

    if (!snapshot.exists()) {
      throw new Error("商品が見つかりませんでした。");
    }

    const product = mapKnowledgeProduct(snapshot);
    const tabs = Array.from(new Set([...product.tabs, title]));

    transaction.update(productRef, {
      tabs,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function createKnowledgeItem(input: CreateKnowledgeItemInput) {
  const { firestore } = assertFirebaseClient();
  const itemRef = doc(collection(firestore, "knowledgeItems"));
  const categoryId = input.categoryId ?? null;
  const productId = input.productId ?? null;
  const kind = input.kind ?? "knowledge";

  await runTransaction(firestore, async (transaction) => {
    transaction.set(itemRef, {
      companyId: input.companyId ?? null,
      title: input.title,
      description: input.description ?? "",
      body: input.body ?? "",
      tabTitle: input.tabTitle ?? "",
      categoryId,
      productId,
      ownerId: input.ownerId,
      scope: input.scope,
      kind,
      tags: input.tags ?? [],
      links: input.links ?? [],
      attachments: input.attachments ?? [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (categoryId && categoryId !== LOCAL_DEFAULT_CATEGORY_ID) {
      transaction.update(doc(firestore, "knowledgeCategories", categoryId), {
        knowledgeCount: increment(kind === "knowledge" || kind === "qa" ? 1 : 0),
        memoCount: increment(kind === "memo" ? 1 : 0),
        updatedAt: serverTimestamp(),
      });
    }

    if (productId) {
      transaction.update(doc(firestore, "knowledgeProducts", productId), {
        knowledgeCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
  });

  return itemRef.id;
}

export async function updateKnowledgeItem(input: UpdateKnowledgeItemInput) {
  const { firestore } = assertFirebaseClient();
  const itemRef = doc(firestore, "knowledgeItems", input.id);
  const nextCategoryId = input.categoryId ?? null;
  const nextProductId = input.productId ?? null;
  const nextKind = input.kind ?? "knowledge";

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(itemRef);

    if (!snapshot.exists()) {
      throw new Error("ナレッジが見つかりませんでした。");
    }

    const current = mapKnowledgeItem(snapshot);

    transaction.update(itemRef, {
      title: input.title,
      description: input.description ?? "",
      body: input.body ?? "",
      tabTitle: input.tabTitle ?? "",
      categoryId: nextCategoryId,
      productId: nextProductId,
      scope: input.scope,
      kind: nextKind,
      tags: input.tags ?? [],
      links: input.links ?? [],
      attachments: input.attachments ?? [],
      updatedAt: serverTimestamp(),
    });

    applyCategoryCounterDiff(firestore, transaction, current, {
      categoryId: nextCategoryId,
      kind: nextKind,
    });
    applyProductCounterDiff(firestore, transaction, current.productId, nextProductId);
  });
}

export async function deleteKnowledgeItem(knowledgeId: string) {
  const { firestore } = assertFirebaseClient();
  const itemRef = doc(firestore, "knowledgeItems", knowledgeId);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(itemRef);

    if (!snapshot.exists()) {
      return;
    }

    const current = mapKnowledgeItem(snapshot);

    transaction.delete(itemRef);
    applyCategoryCounterChange(firestore, transaction, current.categoryId, current.kind, -1);
    applyProductCounterChange(firestore, transaction, current.productId, -1);
  });
}

export async function uploadKnowledgeAttachments(input: {
  knowledgeId: string;
  userId: string;
  files: File[];
  onUploadProgress?: (payload: { fileName: string; progress: number }) => void;
}) {
  const { firebaseStorage } = assertFirebaseClient();
  const attachments: KnowledgeAttachment[] = [];

  for (const file of input.files) {
    const storagePath = buildKnowledgeAttachmentPath(input.userId, input.knowledgeId, file.name);
    const storageRef = ref(firebaseStorage, storagePath);
    const metadata: UploadMetadata = {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        knowledgeId: input.knowledgeId,
        uploadedBy: input.userId,
        originalFileName: file.name,
      },
    };

    await uploadWithProgress(storageRef, file, metadata, (progress) => {
      input.onUploadProgress?.({ fileName: file.name, progress });
    });

    attachments.push({
      id: `${Date.now()}-${attachments.length}-${sanitizeFileName(file.name)}`,
      name: file.name,
      url: await getDownloadURL(storageRef),
      storagePath,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: input.userId,
    });
  }

  return attachments;
}

export async function uploadKnowledgeProductLogo(input: {
  productId: string;
  userId: string;
  file: File;
  onUploadProgress?: (progress: number) => void;
}) {
  if (input.file.type !== "image/png" && !input.file.name.toLowerCase().endsWith(".png")) {
    throw new Error("商品ロゴはPNGファイルを選択してください。");
  }

  const { firebaseStorage } = assertFirebaseClient();
  const storagePath = `knowledge-product-logos/${input.userId}/${input.productId}/${Date.now()}-${sanitizeFileName(input.file.name)}`;
  const storageRef = ref(firebaseStorage, storagePath);
  const metadata: UploadMetadata = {
    contentType: "image/png",
    customMetadata: {
      productId: input.productId,
      uploadedBy: input.userId,
      originalFileName: input.file.name,
    },
  };

  await uploadWithProgress(storageRef, input.file, metadata, input.onUploadProgress);

  return {
    url: await getDownloadURL(storageRef),
    storagePath,
  };
}

export function filterKnowledgeItems(items: KnowledgeItem[], term: string) {
  const searchTerms = buildKnowledgeSearchTerms(term);

  if (searchTerms.length === 0) {
    return [];
  }

  return items.filter((item) => {
    const searchableText = [
      item.title,
      item.description,
      item.body,
      item.tabTitle,
      item.kind,
      item.scope,
      ...item.tags,
      ...item.links.flatMap((link) => [link.title, link.url, link.description]),
      ...item.attachments.map((attachment) => attachment.name),
    ]
      .join(" ")
      .toLowerCase();

    return searchTerms.some((searchTerm) => searchableText.includes(searchTerm));
  });
}

export function buildKnowledgeSearchTerms(term: string) {
  const normalizedTerms = term
    .trim()
    .toLowerCase()
    .split(/[\s　,、]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      normalizedTerms.flatMap((normalizedTerm) => [
        normalizedTerm,
        ...(knowledgeSearchAliases[normalizedTerm] ?? []),
      ]),
    ),
  );
}

function mapKnowledgeCategory(snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeCategory {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
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
    companyId: readNullableString(data.companyId),
    name: readString(data.name, "未設定商品"),
    logoUrl: readString(data.logoUrl),
    logoStoragePath: readString(data.logoStoragePath),
    knowledgeCount: readNumber(data.knowledgeCount),
    tabs: Array.isArray(data.tabs) ? data.tabs.filter((tab): tab is string => typeof tab === "string" && Boolean(tab.trim())) : [],
    updatedAt: readDate(data.updatedAt),
  };
}

function mapKnowledgeItem(snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): KnowledgeItem {
  const data = snapshot.data() ?? {};
  const scope = data.scope === "shared" ? "shared" : "personal";
  const kind = data.kind === "memo" || data.kind === "qa" ? data.kind : "knowledge";

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    title: readString(data.title, "無題のナレッジ"),
    description: readString(data.description),
    body: readString(data.body),
    tabTitle: readString(data.tabTitle),
    categoryId: readNullableString(data.categoryId),
    productId: readNullableString(data.productId),
    ownerId: readNullableString(data.ownerId),
    scope,
    kind,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [],
    links: readKnowledgeLinks(data.links),
    attachments: readKnowledgeAttachments(data.attachments),
    createdAt: readDate(data.createdAt),
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

function readKnowledgeLinks(value: unknown): KnowledgeLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const url = readString(record.url);
      if (!url) return null;

      return {
        title: readString(record.title, url),
        url,
        description: readString(record.description),
      };
    })
    .filter((item): item is KnowledgeLink => Boolean(item));
}

function readKnowledgeAttachments(value: unknown): KnowledgeAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const storagePath = readString(record.storagePath);
      const url = readString(record.url);
      if (!storagePath || !url) return null;

      return {
        id: readString(record.id, storagePath),
        name: readString(record.name, "添付ファイル"),
        url,
        storagePath,
        contentType: readString(record.contentType, "application/octet-stream"),
        size: readNumber(record.size),
        uploadedAt: readDate(record.uploadedAt),
        uploadedBy: readNullableString(record.uploadedBy),
      };
    })
    .filter((item): item is KnowledgeAttachment => Boolean(item));
}

function buildKnowledgeAttachmentPath(userId: string, knowledgeId: string, fileName: string) {
  return `knowledge/${userId}/${knowledgeId}/attachments/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uploadWithProgress(
  storageRef: ReturnType<typeof ref>,
  file: File,
  metadata: UploadMetadata,
  onUploadProgress?: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      (snapshot) => {
        if (!onUploadProgress || snapshot.totalBytes === 0) {
          return;
        }

        onUploadProgress(Math.min(100, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)));
      },
      reject,
      () => resolve(),
    );
  });
}

function applyCategoryCounterDiff(
  firestore: Firestore,
  transaction: Transaction,
  current: Pick<KnowledgeItem, "categoryId" | "kind">,
  next: Pick<KnowledgeItem, "categoryId" | "kind">,
) {
  if (current.categoryId === next.categoryId && current.kind === next.kind) {
    return;
  }

  applyCategoryCounterChange(firestore, transaction, current.categoryId, current.kind, -1);
  applyCategoryCounterChange(firestore, transaction, next.categoryId, next.kind, 1);
}

function applyProductCounterDiff(
  firestore: Firestore,
  transaction: Transaction,
  currentProductId: string | null,
  nextProductId: string | null,
) {
  if (currentProductId === nextProductId) {
    return;
  }

  applyProductCounterChange(firestore, transaction, currentProductId, -1);
  applyProductCounterChange(firestore, transaction, nextProductId, 1);
}

function applyCategoryCounterChange(
  firestore: Firestore,
  transaction: Transaction,
  categoryId: string | null,
  kind: KnowledgeItem["kind"],
  direction: 1 | -1,
) {
  if (!categoryId || categoryId === LOCAL_DEFAULT_CATEGORY_ID) {
    return;
  }

  transaction.update(doc(firestore, "knowledgeCategories", categoryId), {
    knowledgeCount: increment(kind === "knowledge" || kind === "qa" ? direction : 0),
    memoCount: increment(kind === "memo" ? direction : 0),
    updatedAt: serverTimestamp(),
  });
}

function applyProductCounterChange(
  firestore: Firestore,
  transaction: Transaction,
  productId: string | null,
  direction: 1 | -1,
) {
  if (!productId) {
    return;
  }

  transaction.update(doc(firestore, "knowledgeProducts", productId), {
    knowledgeCount: increment(direction),
    updatedAt: serverTimestamp(),
  });
}
