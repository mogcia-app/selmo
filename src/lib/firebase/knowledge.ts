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
const SYSTEM_KNOWLEDGE_UPDATED_AT = new Date("2026-06-14T00:00:00+09:00");
const SYSTEM_KNOWLEDGE_CATEGORY: KnowledgeCategory = {
  id: LOCAL_DEFAULT_CATEGORY_ID,
  companyId: null,
  title: "使い方",
  description: "selmo.の営業向け・管理者向けの基本操作と注意点を確認できます。",
  knowledgeCount: 2,
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
  const items = [buildSalesHelpKnowledge(), buildAdminHelpKnowledge()];
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

function buildSalesHelpKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-sales",
    title: "使い方",
    tabTitle: "営業",
    description: "営業画面の各ページで何を見るか、何を登録するか、注意点をまとめた共通ナレッジです。",
    tags: [
      "sales",
      "営業",
      "ダッシュボード",
      "カレンダー",
      "アップロード",
      "商談分析",
      "テレアポ分析",
      "打ち合わせ一覧",
      "ロープレ",
      "ナレッジ",
    ],
    body: `営業向けの使い方

ダッシュボード
- 今日見るべき数字、直近商談、営業アクションを確認するページです。
- まずは今月の商談数、分析済み件数、AIスコアを見て、改善テーマを決めます。
- 数字だけで判断せず、直近商談の改善ポイントと合わせて確認してください。

カレンダー
- 商談やテレアポの予定を登録し、事前準備やロープレにつなげるページです。
- 予定には商材、顧客種別、商談目的、メモを入れておくと、アップロード時やロープレ前の確認がしやすくなります。
- 予定を開くと詳細を確認できます。

アップロード
- 音声ファイル、または文字起こしテキストから商談・テレアポの記録を残すページです。
- 音声の場合はAI文字起こしが動きます。文字起こし貼り付けの場合は、貼り付けた本文を整形して保存します。
- 実施日時、終了時間、商材、商談目的、顧客種別は後の分析に使うため、分かる範囲で入れてください。

商談分析
- 商談の現在地、温度感、検討度、営業品質、改善点を確認するページです。
- AIサマリーは文字起こし本文、商材情報、商談目的、顧客種別、マニュアルやスコアルールをもとに生成されます。
- 根拠となる発話を確認し、重要判断は必ず自分でも見直してください。

テレアポ分析
- テレアポの受付突破、興味づけ、アポ獲得につながる会話を確認するページです。
- 冒頭の入り方、断り文句への返答、次回アクションの有無を重点的に見ます。
- 商談分析と同じく、AIの指摘は根拠発話とセットで確認してください。

打ち合わせ一覧 / テレアポ一覧
- 保存した記録を一覧で確認し、詳細やAI分析へ移動するページです。
- メモアイコンから打ち合わせ情報を確認できます。
- 不要な記録は一覧から削除できます。削除するとadmin側の表示にも反映されます。

ロープレ
- 登録済みシナリオ、またはAI作成シナリオで練習するページです。
- 商談とテレアポでシナリオは分かれます。目的に合った方を選んでください。
- 営業側から話し始め、AIは顧客役として返答します。終了後に採点と改善点を確認できます。

ナレッジ
- 商材情報、料金、FAQ、反論対応、社内メモを検索するページです。
- 右下のナレッジチャットからも検索できます。ロープレ中やカレンダー確認中でも使えます。
- 検索結果は該当ワードが強調されます。料金や競合比較など、商談中にすぐ確認したい情報を探す用途に向いています。

注意点
- AI分析は補助です。顧客への回答、契約条件、料金判断は必ず公式情報を確認してください。
- 文字起こしに誤りがあると分析もずれるため、重要発言は原文を見直してください。
- 個人メモと共有ナレッジを使い分け、チーム全体に必要な情報は管理者に共有してください。`,
  });
}

function buildAdminHelpKnowledge() {
  return buildSystemKnowledgeItem({
    id: "system-help-admin",
    title: "使い方",
    tabTitle: "管理者",
    description: "管理者画面で見るべき項目、営業への共有、指導時の注意点をまとめた共通ナレッジです。",
    tags: [
      "admin",
      "管理者",
      "ナレッジ管理",
      "商材管理",
      "マニュアル",
      "ロープレ管理",
      "営業メンバー",
      "活動ログ",
    ],
    body: `管理者向けの使い方

ダッシュボード
- チーム全体の活動量、分析状況、要対応の商談を確認します。
- 個人の評価だけでなく、チーム平均との差、先月比、未分析件数も見てください。

営業メンバー
- 営業ごとの商談数、スコア、ロープレ回数、指導優先度を確認します。
- スコアだけで判断せず、未達項目や実施トークの根拠を見てコメントしてください。

商談分析 / テレアポ分析
- 商談目的や顧客種別ごとに、営業品質と顧客反応を確認します。
- 指導時は「何が起きたか」「なぜ起きたか」「次に何をするか」の順で見ると整理しやすくなります。

ナレッジ管理
- 営業が検索で答えに辿り着けるよう、公式ナレッジを整備するページです。
- よく検索されているワード、検索されているがナレッジがないワードを見て、不足情報を追加してください。

商材管理
- 商材概要、ターゲット、料金、FAQ、反論、成功トーク、NGトークを登録します。
- 登録した商材情報は営業側のナレッジ検索にも表示されます。

マニュアル
- アップロード後のAI分析で使う評価基準やスコアルールを登録します。
- ロープレシナリオとは別物ですが、採点基準や改善観点として活用できます。

ロープレ管理
- 管理者が作成したシナリオを営業に配信できます。
- 営業が実施したロープレ結果は結果詳細から確認し、必要に応じてコメントできます。

注意点
- AIスコアは指導のきっかけです。最終判断は文字起こし、根拠発話、営業状況を合わせて行ってください。
- 共有ナレッジは営業の検索結果に出るため、古い料金や条件が残らないように定期的に見直してください。`,
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
