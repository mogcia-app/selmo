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
const SYSTEM_KNOWLEDGE_UPDATED_AT = new Date("2026-06-29T00:00:00+09:00");
const SYSTEM_KNOWLEDGE_CATEGORY: KnowledgeCategory = {
  id: LOCAL_DEFAULT_CATEGORY_ID,
  companyId: null,
  title: "使い方",
  description: "営業向け・管理者向けの分析、ロープレ、ナレッジ運用の手順を確認できます。",
  knowledgeCount: 6,
  memoCount: 0,
  updatedAt: SYSTEM_KNOWLEDGE_UPDATED_AT,
};

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
  description: string;
  targetCustomer: string;
  painPoints: string[];
  valueProposition: string;
  pricing: string;
  competitors: string[];
  commonObjections: string[];
  faq: string[];
  successTalk: string[];
  ngTalk: string[];
  customFields: KnowledgeProductCustomField[];
  sourceUrl: string;
  sourceSummary: string;
  analyzedAt: Date | null;
  logoUrl: string;
  logoStoragePath: string;
  knowledgeCount: number;
  tabs: string[];
  updatedAt: Date | null;
};

export type KnowledgeProductCustomField = {
  id: string;
  label: string;
  value: string;
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
  sharedWithUserIds: string[];
  visibleToAdmin: boolean;
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
  sharedWithUserIds?: string[];
  visibleToAdmin?: boolean;
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

type SystemKnowledgeRole = "sales" | "admin";

export type KnowledgeProductAnalysisInput = {
  description?: string;
  targetCustomer?: string;
  painPoints?: string[];
  valueProposition?: string;
  pricing?: string;
  competitors?: string[];
  commonObjections?: string[];
  faq?: string[];
  successTalk?: string[];
  ngTalk?: string[];
  customFields?: KnowledgeProductCustomField[];
  sourceUrl?: string;
  sourceSummary?: string;
};

export function subscribeToKnowledgeCategories(
  companyId: string | null | undefined,
  callback: (categories: KnowledgeCategory[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const categoriesQuery = query(collection(firestore, "knowledgeCategories"), where("companyId", "==", companyId));

  return onSnapshot(
    categoriesQuery,
    (snapshot) =>
      callback(
        mergeSystemCategory(snapshot.docs.map(mapKnowledgeCategory)).sort(
          (left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0),
        ),
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
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const productsQuery = query(collection(firestore, "knowledgeProducts"), where("companyId", "==", companyId));

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
  input: { userId: string; companyId?: string | null; role?: SystemKnowledgeRole | null },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.companyId) {
    callback([]);
    return () => undefined;
  }
  const sharedQuery = query(
    collection(firestore, "knowledgeItems"),
    where("companyId", "==", input.companyId),
    where("scope", "==", "shared"),
  );
  const personalQuery = query(
    collection(firestore, "knowledgeItems"),
    where("companyId", "==", input.companyId),
    where("ownerId", "==", input.userId),
  );
  const assignedQuery = query(
    collection(firestore, "knowledgeItems"),
    where("companyId", "==", input.companyId),
    where("sharedWithUserIds", "array-contains", input.userId),
  );

  let isActive = true;

  Promise.all([getDocs(sharedQuery), getDocs(personalQuery), getDocs(assignedQuery)])
    .then(([sharedSnapshot, personalSnapshot, assignedSnapshot]) => {
      if (!isActive) {
        return;
      }

      const itemsById = new Map<string, KnowledgeItem>();
      [...sharedSnapshot.docs, ...personalSnapshot.docs, ...assignedSnapshot.docs].forEach((snapshot) => {
        itemsById.set(snapshot.id, mapKnowledgeItem(snapshot));
      });

      callback(
        mergeSystemKnowledgeItems(Array.from(itemsById.values()), input.role).sort(
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
  if (!companyId) {
    callback([]);
    return () => undefined;
  }
  const itemsQuery = query(collection(firestore, "knowledgeItems"), where("companyId", "==", companyId));

  return onSnapshot(
    itemsQuery,
    (snapshot) =>
      callback(
        mergeSystemKnowledgeItems(snapshot.docs.map(mapKnowledgeItem)).sort(
          (left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0),
        ),
      ),
    onError,
  );
}

export function subscribeToKnowledgeItemsByCategory(
  input: { categoryId: string; userId: string; companyId?: string | null; role?: SystemKnowledgeRole | null },
  callback: (items: KnowledgeItem[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return subscribeToVisibleKnowledgeItems(
    { userId: input.userId, companyId: input.companyId, role: input.role },
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
  const systemItem = getSystemKnowledgeItemById(knowledgeId);
  if (systemItem) {
    callback(systemItem);
    return () => undefined;
  }

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

export async function createKnowledgeProduct(input: { name: string; logoUrl?: string; logoStoragePath?: string; userId: string; companyId?: string | null } & KnowledgeProductAnalysisInput) {
  const { firestore } = assertFirebaseClient();
  const productRef = await addDoc(collection(firestore, "knowledgeProducts"), {
    companyId: input.companyId ?? null,
    name: input.name,
    description: input.description ?? "",
    targetCustomer: input.targetCustomer ?? "",
    painPoints: input.painPoints ?? [],
    valueProposition: input.valueProposition ?? "",
    pricing: input.pricing ?? "",
    competitors: input.competitors ?? [],
    commonObjections: input.commonObjections ?? [],
    faq: input.faq ?? [],
    successTalk: input.successTalk ?? [],
    ngTalk: input.ngTalk ?? [],
    customFields: input.customFields ?? [],
    sourceUrl: input.sourceUrl ?? "",
    sourceSummary: input.sourceSummary ?? "",
    analyzedAt: input.sourceSummary ? serverTimestamp() : null,
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

export async function updateKnowledgeProduct(input: { id: string; name: string; logoUrl?: string; logoStoragePath?: string } & KnowledgeProductAnalysisInput) {
  const { firestore } = assertFirebaseClient();

  await setDoc(
    doc(firestore, "knowledgeProducts", input.id),
    {
      name: input.name,
      description: input.description ?? "",
      targetCustomer: input.targetCustomer ?? "",
      painPoints: input.painPoints ?? [],
      valueProposition: input.valueProposition ?? "",
      pricing: input.pricing ?? "",
      competitors: input.competitors ?? [],
      commonObjections: input.commonObjections ?? [],
      faq: input.faq ?? [],
      successTalk: input.successTalk ?? [],
      ngTalk: input.ngTalk ?? [],
      customFields: input.customFields ?? [],
      sourceUrl: input.sourceUrl ?? "",
      sourceSummary: input.sourceSummary ?? "",
      analyzedAt: input.sourceSummary ? serverTimestamp() : null,
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
      throw new Error("商材が見つかりませんでした。");
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
      sharedWithUserIds: normalizeStringArray(input.sharedWithUserIds),
      visibleToAdmin: input.visibleToAdmin === true,
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
      sharedWithUserIds: normalizeStringArray(input.sharedWithUserIds),
      visibleToAdmin: input.visibleToAdmin === true,
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
    throw new Error("商材ロゴはPNGファイルを選択してください。");
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

function mergeSystemCategory(categories: KnowledgeCategory[]) {
  const hasDefaultCategory = categories.some((category) => category.id === SYSTEM_KNOWLEDGE_CATEGORY.id);
  return hasDefaultCategory ? categories : [SYSTEM_KNOWLEDGE_CATEGORY, ...categories];
}

function mergeSystemKnowledgeItems(items: KnowledgeItem[], role?: SystemKnowledgeRole | null) {
  const existingIds = new Set(items.map((item) => item.id));
  const systemItems = getSystemKnowledgeItems(role).filter((item) => !existingIds.has(item.id));
  return [...systemItems, ...items];
}

function getSystemKnowledgeItemById(knowledgeId: string) {
  return getSystemKnowledgeItems().find((item) => item.id === knowledgeId) ?? null;
}

function getSystemKnowledgeItems(role?: SystemKnowledgeRole | null): KnowledgeItem[] {
  const items = [
    buildSalesGettingStartedKnowledge(),
    buildSalesUploadAnalysisKnowledge(),
    buildSalesRoleplayAndKnowledgeKnowledge(),
    buildAdminBasicOperationsKnowledge(),
    buildAdminReviewCoachingKnowledge(),
    buildAdminKnowledgeOperationsKnowledge(),
  ];
  return role ? items.filter((item) => item.tags.includes(role)) : items;
}

function buildSystemKnowledgeItem(input: {
  id: string;
  title: string;
  description: string;
  body: string;
  tabTitle: string;
  tags: string[];
}): KnowledgeItem {
  return {
    id: input.id,
    companyId: null,
    title: input.title,
    description: input.description,
    body: input.body,
    tabTitle: input.tabTitle,
    categoryId: LOCAL_DEFAULT_CATEGORY_ID,
    productId: null,
    ownerId: null,
    scope: "shared",
    sharedWithUserIds: [],
    visibleToAdmin: true,
    kind: "knowledge",
    tags: ["使い方", "selmo", "ヘルプ", ...input.tags],
    links: [],
    attachments: [],
    createdAt: SYSTEM_KNOWLEDGE_UPDATED_AT,
    updatedAt: SYSTEM_KNOWLEDGE_UPDATED_AT,
  };
}

function buildSalesGettingStartedKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-sales-getting-started",
    title: "営業画面でまず最初にやること",
    tabTitle: "営業",
    description: "営業メンバーがログイン後に確認する場所、予定登録、日々の基本フローをまとめています。",
    tags: ["sales", "営業", "初期設定", "ダッシュボード", "カレンダー", "日次運用"],
    body: `営業画面でまず最初にやること

1. ダッシュボードで今日の状態を見る
- 今月の商談数、テレアポ数、AI分析済み件数、ロープレ実施状況を確認します。
- 数字だけで良し悪しを判断せず、直近の改善ポイントや未確認の分析結果も合わせて見ます。
- 週初めは「今週増やす行動」と「直近で直すトーク」を1つずつ決めておくと振り返りやすくなります。

2. カレンダーに予定を入れる
- 商談やテレアポの予定は、できるだけ実施前に登録します。
- 商材、顧客種別、商談目的、メモを入れておくと、後から分析やロープレに活かしやすくなります。
- 予定のメモには「相手の課題」「今回聞きたいこと」「次に進めたい状態」を短く入れるのがおすすめです。

3. 実施後は記録を残す
- 商談やテレアポが終わったら、音声または文字起こしテキストをアップロードします。
- 実施日時、終了時間、商材、商談目的、顧客種別は分析の精度に関わるため、分かる範囲で入力します。
- 音声ファイルは会社ごとの時間上限があります。上限を超える音声はアップロードできません。

4. 分析結果から次の行動を決める
- AI分析では、良かった点、改善点、顧客の温度感、次回アクションを確認します。
- 重要なのは点数そのものではなく、次の商談や電話で何を変えるかです。
- 気になる指摘があれば、必ず根拠となる発話や文字起こし本文も見直してください。

5. ロープレで練習する
- 分析で出た改善点は、ロープレで練習してから次の実商談に臨みます。
- 管理者が作った課題、またはAI作成の課題を選び、顧客役AIと会話します。
- 終了後は採点と改善点を確認し、次に意識する一言を決めてください。

注意点
- AIの提案は判断補助です。料金、契約条件、正式回答は必ず会社の公式情報を確認してください。
- 文字起こしに誤りがあると分析もずれるため、重要な発言は原文を見直してください。
- 個人だけで持っている有効トークやFAQは、管理者に共有してチームナレッジにしてください。`,
  });
}

function buildSalesUploadAnalysisKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-sales-upload-analysis",
    title: "商談・テレアポをアップロードして分析する",
    tabTitle: "営業",
    description: "音声または文字起こしを登録し、AI分析を確認して改善に使うまでの流れです。",
    tags: ["sales", "営業", "アップロード", "商談分析", "テレアポ分析", "文字起こし", "AI分析"],
    body: `商談・テレアポをアップロードして分析する

アップロード前に確認すること
- 種別が「商談」か「テレアポ」かを確認します。
- 音声ファイルの場合は、会社で設定された1ファイルあたりの時間上限内か確認します。
- 文字起こし貼り付けの場合は、話者や時系列が大きく崩れていないかを軽く見ます。

入力すると分析に効く項目
- 実施日時、終了時間、商材、商談目的、顧客種別はできるだけ入力します。
- 顧客名や個人情報は、社内ルールに沿って必要最小限にしてください。
- 商談目的が明確だと、AIが「その目的に対して会話が進んだか」を評価しやすくなります。

分析結果の見方
- まずサマリーで、商談の現在地や顧客の反応をつかみます。
- 次に改善点を見て、次回の会話で直すポイントを1つから3つに絞ります。
- スコアや判定だけでなく、根拠発話を確認して納得できる指摘か見ます。

商談分析で見るポイント
- 課題ヒアリングが十分か
- 提案が相手の課題に紐づいているか
- 次回アクション、決裁者、検討期限が確認できているか
- 不安や反論に対して、回答だけでなく確認質問ができているか

テレアポ分析で見るポイント
- 冒頭で相手が聞く理由を作れているか
- 断り文句に対して、押し切りではなく会話を戻せているか
- アポ打診のタイミングが早すぎないか、遅すぎないか
- 次の予定や送付物が曖昧なまま終わっていないか

分析後にやること
- 改善点を1つ選び、ロープレで練習します。
- 良かった言い回しはナレッジやメモに残します。
- 上司に相談する時は、分析結果と文字起こしの該当箇所をセットで見せると話が早くなります。`,
  });
}

function buildSalesRoleplayAndKnowledgeKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-sales-roleplay-knowledge",
    title: "ロープレとナレッジ検索を使いこなす",
    tabTitle: "営業",
    description: "AIロープレの練習方法と、商談中に必要な情報をナレッジから探すコツです。",
    tags: ["sales", "営業", "ロープレ", "ナレッジ", "検索", "FAQ", "反論対応"],
    body: `ロープレとナレッジ検索を使いこなす

ロープレを始める前に決めること
- 練習したい場面を1つに絞ります。例: 初回商談の課題ヒアリング、料金反論、受付突破。
- 直近のAI分析で指摘された改善点を見て、練習テーマにします。
- 商談かテレアポか、目的に合う課題を選びます。

ロープレ中の使い方
- 営業側から話し始め、AIは顧客役として返答します。
- うまく返せなかった時も途中でやめず、最後まで会話を進めます。
- 実際の商談のように、質問、確認、要約、次回提案まで行うと練習効果が高くなります。

ロープレ後に見るところ
- 採点結果で、良かった点と改善点を確認します。
- 次回の実商談で使う一言を決めます。
- 同じ課題をもう一度実施し、改善点が減っているか確認します。

ナレッジ検索のコツ
- 料金、競合、契約、解約、導入、セキュリティなど、相手の質問に近い単語で検索します。
- 商材名だけで探すより、「商材名 + 反論」「商材名 + 料金」のように組み合わせると見つかりやすくなります。
- 右下のナレッジチャットは、ロープレ前の確認や商談準備にも使えます。

検索結果が見つからない時
- 言い換え語で検索します。例: 料金、価格、費用、月額。
- 自社独自の項目やFAQが足りない場合は、管理者に追加を依頼します。
- 商談で実際に聞かれた質問は、後からナレッジ化するとチーム全体の対応速度が上がります。

注意点
- ナレッジに古い料金や条件がある場合は、そのまま顧客に伝えず管理者に確認してください。
- AIロープレは練習用です。実際の顧客情報や機密情報を入力する場合は社内ルールに従ってください。`,
  });
}

function buildAdminBasicOperationsKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-admin-basic-operations",
    title: "管理者画面の基本操作",
    tabTitle: "管理者",
    description: "管理者が日々確認する画面と、メンバー・商材・マニュアルを整える基本手順です。",
    tags: [
      "admin",
      "管理者",
      "基本操作",
      "ダッシュボード",
      "営業メンバー",
      "商材管理",
      "マニュアル",
      "利用制限",
    ],
    body: `管理者画面の基本操作

ダッシュボードで確認すること
- チーム全体の商談数、テレアポ数、AI分析状況、ロープレ実施状況を確認します。
- 数字を見るだけでなく、未確認の分析結果や改善が必要な商談がないかも確認します。
- 週次で見る場合は、活動量、分析結果、ロープレ実施の3つをセットで見ると状況をつかみやすくなります。

営業メンバーで確認すること
- メンバーごとの活動量、分析結果、ロープレ実施状況を確認します。
- スコアだけで判断せず、直近の商談内容や改善点も合わせて見ます。
- 指導が必要な場合は、レビュー詳細やロープレ結果を開いて具体的な発話を確認します。

商材管理で整えること
- 商材概要、ターゲット、料金、FAQ、反論対応、成功トーク、NGトークを登録します。
- 営業が検索する言葉に合わせて、略称やよく使う表現も入れておくと見つかりやすくなります。
- 自社独自の項目は自由欄に追加できます。標準項目にない情報もナレッジとして残してください。

マニュアルで整えること
- 商談分析やテレアポ分析で見てほしい観点を登録します。
- 評価基準は「良い例」「悪い例」「確認すべき発話」が分かるように書くと、AI分析と指導の両方で使いやすくなります。
- 料金や契約条件など、誤回答が困る情報は最新の公式文言にしてください。

ロープレ管理で整えること
- 初回商談、ヒアリング、料金反論、競合比較、受付突破など、よくある場面の課題を作成します。
- レビュー詳細からAI生成した課題は、内容を確認してから配信してください。
- 営業が迷わないよう、課題名には「誰に」「何を」「どうする」練習かが分かる言葉を入れます。

利用状況の確認
- AI利用回数の月次上限、音声アップロード時間の上限がある場合は、管理者側で利用状況を確認します。
- 上限に近い場合は、必要な分析やロープレを優先できるようチーム内で運用を決めてください。`,
  });
}

function buildAdminReviewCoachingKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-admin-review-coaching",
    title: "レビューとコーチングの進め方",
    tabTitle: "管理者",
    description: "商談・テレアポ分析を見て、営業への指導やロープレ課題作成につなげる手順です。",
    tags: [
      "admin",
      "管理者",
      "レビュー",
      "コーチング",
      "商談分析",
      "テレアポ分析",
      "ロープレ管理",
      "営業メンバー",
    ],
    body: `レビューとコーチングの進め方

レビュー前に見ること
- ダッシュボードで、チーム全体の活動量、未分析件数、要確認の商談を見ます。
- 営業メンバーごとに、商談数、テレアポ数、ロープレ実施状況、直近スコアを確認します。
- スコアが低い順だけでなく、重要商談、失注リスク、改善幅が大きいメンバーも優先して見ます。

商談分析のレビュー観点
- 顧客課題を具体化できているか
- 提案が課題や業務背景に紐づいているか
- 決裁者、予算、時期、比較対象、次回アクションが確認できているか
- 顧客の不安や反論に対して、確認質問と回答の両方ができているか

テレアポ分析のレビュー観点
- 冒頭で相手が聞く理由を作れているか
- 受付突破、担当者接続、興味づけのどこで詰まっているか
- 断り文句への返答が一方的になっていないか
- アポ打診や次回アクションが明確か

コメントの書き方
- 「良かった点」「改善する点」「次に試すこと」の順で書くと営業が動きやすくなります。
- 抽象的に「ヒアリング不足」と書くより、「導入時期を確認する質問を追加する」のように行動へ落とします。
- AIの指摘をそのまま貼るのではなく、文字起こしの該当箇所と合わせて判断してください。

ロープレ課題へのつなげ方
- 同じ改善点が複数回出ている場合は、専用のロープレ課題を作成します。
- レビュー詳細からAI生成すると、商談内容を踏まえた課題の下書きを作れます。
- 配信前に、顧客役の設定、難易度、合格条件、評価観点を管理者が編集してください。

定例運用のおすすめ
- 毎週、チーム全体で1つの改善テーマを決めます。
- 個人面談では、直近の商談1件とロープレ1件をセットで確認します。
- 翌週に同じ観点で再度確認し、改善が行動に出ているか見ます。`,
  });
}

function buildAdminKnowledgeOperationsKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-admin-knowledge-operations",
    title: "ナレッジ・マニュアル・ロープレ課題の整備",
    tabTitle: "管理者",
    description: "営業が迷わず使えるように、社内情報と練習課題を継続的に更新する運用方法です。",
    tags: ["admin", "管理者", "ナレッジ管理", "マニュアル", "商材管理", "ロープレ管理", "FAQ", "反論対応"],
    body: `ナレッジ・マニュアル・ロープレ課題の整備

ナレッジ管理でやること
- 営業が検索で答えに辿り着けるよう、公式情報、FAQ、反論対応、成功トークを整理します。
- 「料金」「競合」「導入」「解約」「セキュリティ」など、商談で聞かれやすい言葉を本文やタグに入れます。
- 検索されているのに回答がないテーマは、優先して追加してください。

商材管理でやること
- 商材概要、ターゲット、課題、価値提案、料金、競合、よくある反論を登録します。
- 標準項目にない自社独自の情報は、自由欄に追加します。
- 登録した商材情報は営業側のナレッジ検索やAI分析の文脈にも影響するため、古い内容を残さないようにします。

マニュアルでやること
- AI分析で重視してほしい評価観点やスコアルールを登録します。
- 「何を満たせば良いか」「どの発話がNGか」「どう言い換えると良いか」を入れると、営業へのフィードバックに使いやすくなります。
- 商談用、テレアポ用、商材別など、必要に応じて分けて管理します。

ロープレ管理でやること
- 管理者が作成したシナリオを営業に配信します。
- 課題は「場面」「顧客設定」「営業の目的」「評価観点」「難易度」を明確にします。
- レビュー詳細からAI生成した課題は、元の商談の癖が強く出ることがあるため、配信前に汎用化してください。

更新タイミングの目安
- 料金、契約条件、キャンペーンが変わった時
- 営業から同じ質問が複数回出た時
- 競合比較や反論の傾向が変わった時
- AI分析で同じ改善点が繰り返し出ている時

運用の注意点
- 営業が見るナレッジには、古い条件や社外秘の不要情報を残さないでください。
- マニュアルを細かくしすぎると分析が読みにくくなるため、評価したい観点を優先順位つきで整理します。
- ロープレ課題は作って終わりではなく、実施結果を見て難易度や評価観点を調整してください。`,
  });
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
    name: readString(data.name, "未設定商材"),
    description: readString(data.description),
    targetCustomer: readString(data.targetCustomer),
    painPoints: readStringArray(data.painPoints),
    valueProposition: readString(data.valueProposition),
    pricing: readString(data.pricing),
    competitors: readStringArray(data.competitors),
    commonObjections: readStringArray(data.commonObjections),
    faq: readStringArray(data.faq),
    successTalk: readStringArray(data.successTalk),
    ngTalk: readStringArray(data.ngTalk),
    customFields: readProductCustomFields(data.customFields),
    sourceUrl: readString(data.sourceUrl),
    sourceSummary: readString(data.sourceSummary),
    analyzedAt: readDate(data.analyzedAt),
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
    sharedWithUserIds: readStringArray(data.sharedWithUserIds),
    visibleToAdmin: data.visibleToAdmin === true,
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

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function normalizeStringArray(value: string[] | undefined) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}

function readProductCustomFields(value: unknown): KnowledgeProductCustomField[] {
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
    .filter((item): item is KnowledgeProductCustomField => Boolean(item));
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
