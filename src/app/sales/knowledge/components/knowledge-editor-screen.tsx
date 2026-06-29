"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  addKnowledgeProductTab,
  createKnowledgeItem,
  deleteKnowledgeProductTab,
  subscribeToKnowledgeItemsByProduct,
  subscribeToKnowledgeItem,
  subscribeToKnowledgeProducts,
  updateKnowledgeItem,
  uploadKnowledgeAttachments,
  type CreateKnowledgeItemInput,
  type KnowledgeAttachment,
  type KnowledgeItem,
  type KnowledgeLink,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { canUseSalesDomain } from "@/lib/sales-domains";

type PublicationTarget = "private" | "all_sales" | "selected_sales";

type KnowledgeEditorScreenProps = {
  mode: "create" | "edit";
  knowledgeId?: string;
  audience?: "sales" | "admin";
};

type ProductTabDraft = {
  title: string;
  description: string;
  body: string;
  tagsText: string;
};

type BodyFormat = "h2" | "h3" | "bold" | "italic" | "underline" | "list" | "link";

const emptyProductTabDraft: ProductTabDraft = {
  title: "",
  description: "",
  body: "",
  tagsText: "",
};

export function KnowledgeEditorScreen({ mode, knowledgeId, audience = "sales" }: KnowledgeEditorScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const isAdminAuthoring = audience === "admin";
  const canAccessKnowledge =
    isAdminAuthoring ||
    !profile ||
    canUseSalesDomain(profile, "meeting") ||
    canUseSalesDomain(profile, "teleapo");
  const backHref = isAdminAuthoring ? "/admin/knowledge" : "/sales/knowledge";
  const pageTitle = isAdminAuthoring
    ? mode === "edit"
      ? "公式ナレッジを編集"
      : "公式ナレッジを作成"
    : mode === "edit"
      ? "ナレッジを編集"
      : "ナレッジを作成";
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [salesUsers, setSalesUsers] = useState<AppUserProfile[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem | null>(null);
  const [productKnowledgeItems, setProductKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [activeKnowledgeId, setActiveKnowledgeId] = useState<string | null>(knowledgeId ?? null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [tabTitle, setTabTitle] = useState(searchParams.get("tabTitle") ?? "");
  const [productTabDrafts, setProductTabDrafts] = useState<Record<string, ProductTabDraft>>({});
  const [newTabTitle, setNewTabTitle] = useState("");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") ?? "how-to");
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [kind, setKind] = useState<CreateKnowledgeItemInput["kind"]>(
    readKind(searchParams.get("kind")) ?? "knowledge",
  );
  const [publicationTarget, setPublicationTarget] = useState<PublicationTarget>(
    isAdminAuthoring || searchParams.get("scope") === "shared" ? "all_sales" : "private",
  );
  const [selectedSalesUserIds, setSelectedSalesUserIds] = useState<string[]>([]);
  const [visibleToAdmin, setVisibleToAdmin] = useState(isAdminAuthoring);
  const [tagsText, setTagsText] = useState("");
  const [links, setLinks] = useState<KnowledgeLink[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [attachments, setAttachments] = useState<KnowledgeAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [deletingTabTitle, setDeletingTabTitle] = useState<string | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!companyId || !canAccessKnowledge) {
      setProducts([]);
      setSalesUsers([]);
      return;
    }
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToKnowledgeProducts(companyId, setProducts, handleError),
      subscribeToUserProfiles(setSalesUsers, handleError, companyId),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [canAccessKnowledge, companyId]);

  useEffect(() => {
    if (mode !== "edit" || !knowledgeId || !canAccessKnowledge) {
      if (mode === "edit") setKnowledge(null);
      return;
    }

    return subscribeToKnowledgeItem(
      knowledgeId,
      setKnowledge,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [canAccessKnowledge, knowledgeId, mode]);

  useEffect(() => {
    if (!knowledge) return;

    setTitle(knowledge.title);
    setActiveKnowledgeId(knowledge.id);
    setDescription(knowledge.description);
    setBody(knowledge.body);
    setTabTitle(knowledge.tabTitle);
    setCategoryId(knowledge.categoryId ?? "");
    setProductId(knowledge.productId ?? "");
    setKind(knowledge.kind);
    setPublicationTarget(readPublicationTarget(knowledge));
    setSelectedSalesUserIds(knowledge.sharedWithUserIds);
    setVisibleToAdmin(isAdminAuthoring || knowledge.visibleToAdmin);
    setTagsText(knowledge.tags.join(", "));
    setLinks(knowledge.links);
    setAttachments(knowledge.attachments);
    setPendingFiles([]);
    setUploadProgress({});
  }, [isAdminAuthoring, knowledge]);

  useEffect(() => {
    if (mode !== "edit" || !productId || !userId || !companyId || !canAccessKnowledge) {
      setProductKnowledgeItems([]);
      return;
    }

    return subscribeToKnowledgeItemsByProduct(
      { productId, userId, companyId },
      setProductKnowledgeItems,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [canAccessKnowledge, companyId, mode, productId, userId]);

  useEffect(() => {
    if (mode !== "edit" || !productId || productKnowledgeItems.length === 0) return;

    const drafts = Object.fromEntries(
      productKnowledgeItems.map((item) => [
        item.tabTitle || "未分類",
        {
          title: item.title,
          description: item.description,
          body: item.body,
          tagsText: item.tags.filter((tag) => tag !== item.tabTitle).join(", "),
        },
      ]),
    );
    setProductTabDrafts(drafts);
  }, [mode, productId, productKnowledgeItems]);

  useEffect(() => {
    if (isAdminAuthoring) {
      setPublicationTarget("all_sales");
      setVisibleToAdmin(true);
    }
  }, [isAdminAuthoring]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const selectableSalesUsers = useMemo(
    () => salesUsers.filter((user) => user.role === "sales" && user.status === "active" && user.uid !== userId),
    [salesUsers, userId],
  );
  const tabOptions = useMemo(
    () => buildTabOptions(tabTitle, [...(selectedProduct?.tabs ?? []), ...productKnowledgeItems.map((item) => item.tabTitle)]),
    [productKnowledgeItems, selectedProduct?.tabs, tabTitle],
  );
  const tags = useMemo(
    () => buildSearchTags({
      manualText: tagsText,
      tabTitle: productId ? tabTitle : "",
      title,
      body,
      productName: selectedProduct?.name,
    }),
    [body, productId, selectedProduct?.name, tabTitle, tagsText, title],
  );
  const wordCount = body.length;
  const lineCount = body ? body.split(/\n/).length : 0;
  const canEdit = mode === "create" || Boolean(knowledge && (knowledge.ownerId === userId || profile?.role === "admin"));
  const isProductTabEditor = Boolean(productId);
  const isProductTabCreate = mode === "create" && Boolean(productId);
  const canDeleteSelectedTab = Boolean(selectedProduct?.tabs.includes(tabTitle));
  const productTabSaveCount = useMemo(
    () => buildSavableProductTabEntries(
      mergeProductTabDraft(productTabDrafts, tabTitle, { title, description, body, tagsText }),
      tabOptions,
    ).length,
    [body, description, productTabDrafts, tabOptions, tabTitle, tagsText, title],
  );
  const previewDraft = useMemo(() => {
    return { title, description, body, tagsText };
  }, [body, description, tagsText, title]);

  useEffect(() => {
    if (productId && !tabTitle && tabOptions[0]) {
      setTabTitle(tabOptions[0]);
    }
  }, [productId, tabOptions, tabTitle]);

  const saveKnowledge = async (nextPublicationTarget = publicationTarget) => {
    if (!userId || !companyId) {
      setError("ログイン情報を確認できませんでした。再読み込みしてからお試しください。");
      return;
    }

    if (!canEdit) {
      setError("このナレッジを編集する権限がありません。");
      return;
    }

    const nextProductTabDrafts = mergeProductTabDraft(productTabDrafts, tabTitle, { title, description, body, tagsText });
    const productTabEntries = isProductTabCreate
      ? buildSavableProductTabEntries(nextProductTabDrafts, tabOptions)
      : [];

    const effectivePublicationTarget = isAdminAuthoring ? "all_sales" : nextPublicationTarget;
    const nextSharedWithUserIds =
      effectivePublicationTarget === "selected_sales" ? selectedSalesUserIds : [];

    if (effectivePublicationTarget === "selected_sales" && nextSharedWithUserIds.length === 0) {
      setError("公開する営業マンを1名以上選択してください。");
      return;
    }

    setIsSaving(true);
    setError(null);

    const basePayload: Omit<CreateKnowledgeItemInput, "title" | "description" | "body" | "tabTitle" | "tags"> = {
      companyId,
      categoryId: categoryId || "how-to",
      productId: productId || null,
      ownerId: userId,
      scope: effectivePublicationTarget === "all_sales" ? "shared" : "personal",
      sharedWithUserIds: nextSharedWithUserIds,
      visibleToAdmin: isAdminAuthoring || visibleToAdmin,
      kind,
      links,
      attachments,
    };
    const payload: CreateKnowledgeItemInput = {
      ...basePayload,
      title: buildKnowledgeTitle({
        title,
        body,
        selectedProductName: selectedProduct?.name,
        tabTitle,
        kind,
      }),
      description: buildAutoDescription(body, title, description),
      body: body.trim(),
      tabTitle: productId ? tabTitle.trim() : "",
      tags,
    };

    try {
      const shouldCreateProductTabs = isProductTabCreate && productTabEntries.length > 0;

      if (shouldCreateProductTabs) {
        for (const entry of productTabEntries) {
          const entryPayload: CreateKnowledgeItemInput = {
            ...basePayload,
            title: buildKnowledgeTitle({
              title: entry.draft.title,
              body: entry.draft.body,
              selectedProductName: selectedProduct?.name,
              tabTitle: entry.tabTitle,
              kind,
            }),
            description: buildAutoDescription(entry.draft.body, entry.draft.title, entry.draft.description),
            body: entry.draft.body.trim(),
            tabTitle: entry.tabTitle,
            tags: buildSearchTags({
              manualText: entry.draft.tagsText,
              tabTitle: entry.tabTitle,
              title: entry.draft.title,
              body: entry.draft.body,
              productName: selectedProduct?.name,
            }),
          };
          const nextId = await createKnowledgeItem(entryPayload);

          if (pendingFiles.length > 0) {
            const uploadedAttachments = await uploadKnowledgeAttachments({
              knowledgeId: nextId,
              userId,
              files: pendingFiles,
              onUploadProgress: ({ fileName, progress }) => {
                setUploadProgress((current) => ({ ...current, [fileName]: progress }));
              },
            });
            await updateKnowledgeItem({
              ...entryPayload,
              id: nextId,
              attachments: [...attachments, ...uploadedAttachments],
            });
          }
        }

        router.replace(isAdminAuthoring ? "/admin/knowledge" : `/sales/knowledge/products/${productId}`);
        return;
      }

      const nextId =
        mode === "edit" && activeKnowledgeId
          ? await updateExistingKnowledge(activeKnowledgeId, payload)
          : await createKnowledgeItem(payload);
      if (pendingFiles.length > 0) {
        const uploadedAttachments = await uploadKnowledgeAttachments({
          knowledgeId: nextId,
          userId,
          files: pendingFiles,
          onUploadProgress: ({ fileName, progress }) => {
            setUploadProgress((current) => ({ ...current, [fileName]: progress }));
          },
        });
        const nextAttachments = [...attachments, ...uploadedAttachments];
        await updateKnowledgeItem({
          ...payload,
          id: nextId,
          attachments: nextAttachments,
        });
      }
      router.replace(
        isAdminAuthoring
          ? "/admin/knowledge"
          : payload.productId
            ? `/sales/knowledge/products/${payload.productId}/knowledge/${nextId}`
            : `/sales/knowledge/categories/${payload.categoryId ?? "how-to"}/knowledge/${nextId}`,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ナレッジの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLink = () => {
    const normalizedUrl = linkUrl.trim();

    if (!normalizedUrl) {
      setError("URLを入力してください。");
      return;
    }

    try {
      const url = new URL(normalizedUrl);
      setLinks((current) => [
        ...current,
        {
          title: linkTitle.trim() || url.hostname,
          url: url.toString(),
          description: linkDescription.trim(),
        },
      ]);
      setLinkTitle("");
      setLinkUrl("");
      setLinkDescription("");
      setError(null);
    } catch {
      setError("有効なURLを入力してください。");
    }
  };

  const handleSelectFiles = (files: FileList | null) => {
    if (!files) return;

    const pdfFiles = Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

    if (pdfFiles.length !== files.length) {
      setError("PDFファイルのみ添付できます。");
    }

    setPendingFiles((current) => [...current, ...pdfFiles]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveKnowledge(publicationTarget);
  };

  const updateCurrentProductTabDraft = (patch: Partial<ProductTabDraft>) => {
    if (!isProductTabEditor || !tabTitle.trim()) {
      return;
    }

    setProductTabDrafts((current) => ({
      ...current,
      [tabTitle]: {
        ...emptyProductTabDraft,
        ...current[tabTitle],
        title,
        description,
        body,
        tagsText,
        ...patch,
      },
    }));
  };

  const handleChangeTitle = (nextTitle: string) => {
    setTitle(nextTitle);
    updateCurrentProductTabDraft({ title: nextTitle });
  };

  const handleChangeBody = (nextBody: string) => {
    setBody(nextBody);
    updateCurrentProductTabDraft({ body: nextBody });
  };

  const handleApplyBodyFormat = (format: BodyFormat) => {
    const textarea = bodyTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? body.length;
    const selectionEnd = textarea?.selectionEnd ?? body.length;
    const result = formatBodySelection(body, selectionStart, selectionEnd, format);

    handleChangeBody(result.value);
    requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
      bodyTextareaRef.current?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleChangeProductId = (nextProductId: string) => {
    setProductId(nextProductId);
    setProductTabDrafts({});
    setTabTitle("");
  };

  const handleSelectTabTitle = (nextTabTitle: string) => {
    if (isProductTabEditor) {
      const nextDrafts = mergeProductTabDraft(productTabDrafts, tabTitle, { title, description, body, tagsText });
      const nextDraft = nextDrafts[nextTabTitle] ?? emptyProductTabDraft;
      const nextKnowledge = productKnowledgeItems.find((item) => (item.tabTitle || "未分類") === nextTabTitle);
      setProductTabDrafts(nextDrafts);
      setActiveKnowledgeId(nextKnowledge?.id ?? null);
      setTitle(nextDraft.title);
      setDescription(nextDraft.description);
      setBody(nextDraft.body);
      setTagsText(nextDraft.tagsText);
      if (nextKnowledge) {
        setCategoryId(nextKnowledge.categoryId ?? "");
        setKind(nextKnowledge.kind);
        setPublicationTarget(readPublicationTarget(nextKnowledge));
        setSelectedSalesUserIds(nextKnowledge.sharedWithUserIds);
        setVisibleToAdmin(isAdminAuthoring || nextKnowledge.visibleToAdmin);
        setLinks(nextKnowledge.links);
        setAttachments(nextKnowledge.attachments);
        setPendingFiles([]);
        setUploadProgress({});
      } else {
        setLinks([]);
        setAttachments([]);
        setPendingFiles([]);
        setUploadProgress({});
      }
    }

    setTabTitle(nextTabTitle);
  };

  const handleAddProductTab = async () => {
    const title = newTabTitle.trim();

    if (!title) {
      setError("追加するタブ名を入力してください。");
      return;
    }

    if (!productId) {
      setError("先に商材を選択してください。");
      return;
    }

    setIsAddingTab(true);
    setError(null);
    try {
      await addKnowledgeProductTab({ productId, title });
      setNewTabTitle("");
      handleSelectTabTitle(title);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "タブの追加に失敗しました。");
    } finally {
      setIsAddingTab(false);
    }
  };

  const handleDeleteProductTab = async (title: string) => {
    if (!productId || deletingTabTitle) {
      return;
    }

    setDeletingTabTitle(title);
    setError(null);
    try {
      await deleteKnowledgeProductTab({ productId, title });
      setProductTabDrafts((current) => {
        const next = { ...current };
        delete next[title];
        return next;
      });

      if (tabTitle === title) {
        const nextTab = tabOptions.find((tab) => tab !== title) ?? "";
        if (nextTab) {
          const nextKnowledge = productKnowledgeItems.find((item) => (item.tabTitle || "未分類") === nextTab);
          const nextDraft = productTabDrafts[nextTab] ?? emptyProductTabDraft;
          setActiveKnowledgeId(nextKnowledge?.id ?? null);
          setTabTitle(nextTab);
          setTitle(nextDraft.title);
          setDescription(nextDraft.description);
          setBody(nextDraft.body);
          setTagsText(nextDraft.tagsText);
        } else {
          setTabTitle("");
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "タブの削除に失敗しました。");
    } finally {
      setDeletingTabTitle(null);
    }
  };

  const handleToggleSalesUser = (salesUserId: string) => {
    setSelectedSalesUserIds((current) =>
      current.includes(salesUserId)
        ? current.filter((userId) => userId !== salesUserId)
        : [...current, salesUserId],
    );
  };

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1580px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e6eaf0] bg-white text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
              aria-label="ナレッジへ戻る"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
              {pageTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[13px] font-bold text-[#343b48] shadow-[0_8px_18px_rgba(17,24,39,0.04)] disabled:opacity-60"
            >
              {isAdminAuthoring ? "公式ナレッジを保存" : "下書きを保存"}
            </button>
            <a
              href="#preview"
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[13px] font-bold text-[#343b48] shadow-[0_8px_18px_rgba(17,24,39,0.04)]"
            >
              プレビュー
            </a>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void saveKnowledge(publicationTarget)}
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.16)] disabled:opacity-60"
            >
              {isSaving ? "保存中" : isAdminAuthoring ? "公式として保存" : "公開する"}
            </button>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#171717] shadow-[0_10px_18px_rgba(17,24,39,0.12)]">
              <Image src="/nareji.png" alt="ナレッジ" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            </span>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {isAdminAuthoring ? (
          <div className="mt-5 rounded-[18px] border border-[#f0e3c1] bg-[#fffaf0] px-5 py-4 text-[13px] leading-6 text-[#6f6250]">
            このページで作成したナレッジは、全salesが検索・閲覧できる公式ナレッジとして保存されます。
            個人メモではなく、商談準備や回答品質の基準になる内容として登録してください。
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1120px)_460px]">
          <div className="space-y-5">
            <section id="basic" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <h2 className="text-[18px] font-bold text-[#171717]">基本情報</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="商材">
                  <select
                    value={productId}
                    onChange={(event) => handleChangeProductId(event.target.value)}
                    className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                  >
                    <option value="">未設定</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {productId ? (
                <Field label="商材内タブ">
                  <div className="space-y-2">
                    <div className={canDeleteSelectedTab ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]" : "grid gap-2"}>
                      <select
                        value={tabTitle}
                        onChange={(event) => handleSelectTabTitle(event.target.value)}
                        className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] font-bold text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                      >
                        {tabOptions.map((tab) => (
                          <option key={tab} value={tab}>
                            {tab}
                          </option>
                        ))}
                      </select>
                      {canDeleteSelectedTab ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteProductTab(tabTitle)}
                          disabled={!tabTitle || deletingTabTitle === tabTitle}
                          className="inline-flex h-12 items-center justify-center rounded-[14px] border border-[#f1d2cc] bg-[#fff8f7] px-3 text-[13px] font-bold text-[#b4232a] transition hover:bg-[#fff0ed] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingTabTitle === tabTitle ? "削除中" : "削除"}
                        </button>
                      ) : null}
                    </div>
                    {isProductTabEditor && productTabSaveCount > 0 ? (
                      <div className="text-[12px] font-bold text-[#8a6500]">
                        入力済み {productTabSaveCount}タブ
                      </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <input
                        value={newTabTitle}
                        onChange={(event) => setNewTabTitle(event.target.value)}
                        placeholder={productId ? "例：比較情報、活用シーン" : "商材を選択するとタブを追加できます"}
                        disabled={!productId || isAddingTab}
                        className="h-11 w-full rounded-[13px] border border-dashed border-[#d7dde8] bg-white px-4 text-[13px] text-[#171717] outline-none transition placeholder:text-[#9aa1ac] focus:border-[#e0bd4b] disabled:bg-[#f7f8fb]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddProductTab()}
                        disabled={!productId || isAddingTab}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[13px] border border-[#f0c655] bg-[#fffdf7] px-3 text-[13px] font-bold text-[#8a6500] disabled:cursor-not-allowed disabled:border-[#e4e8ef] disabled:bg-[#f7f8fb] disabled:text-[#9aa1ac]"
                      >
                        <PlusIcon />
                        {isAddingTab ? "追加中" : "追加"}
                      </button>
                    </div>
                  </div>
                </Field>
                ) : null}

                <Field label="タイトル">
                  <input
                    value={title}
                    onChange={(event) => handleChangeTitle(event.target.value)}
                    placeholder={productId && tabTitle ? `${selectedProduct?.name ?? "商材"} ${tabTitle}` : "未入力なら自動で名前を付けます"}
                    className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                  />
                </Field>

              </div>
            </section>

            <section id="body" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <h2 className="text-[18px] font-bold text-[#171717]">本文</h2>
              <div className="mt-4 rounded-[16px] border border-[#e4e8ef] bg-white">
                <div className="flex flex-wrap items-center gap-1 border-b border-[#eef1f5] px-3 py-2 text-[12px] font-bold text-[#596273]">
                  {[
                    { label: "H2", format: "h2" },
                    { label: "H3", format: "h3" },
                    { label: "B", format: "bold" },
                    { label: "I", format: "italic" },
                    { label: "U", format: "underline" },
                    { label: "箇条書き", format: "list" },
                    { label: "リンク", format: "link" },
                  ].map((item) => (
                    <button
                      key={item.format}
                      type="button"
                      onClick={() => handleApplyBodyFormat(item.format as BodyFormat)}
                      className="rounded-[9px] px-2 py-1 transition hover:bg-[#f7f8fb] hover:text-[#171717]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => handleChangeBody(event.target.value)}
                  placeholder="本文を入力してください"
                  className="min-h-[360px] w-full resize-y rounded-b-[16px] border-0 bg-white px-4 py-4 text-[14px] leading-7 text-[#171717] outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#7a808c]">
                <span>{`文字数：${wordCount}　行数：${lineCount}`}</span>
                <span className="font-semibold text-[#0a9d58]">下書きは保存ボタンで保存できます</span>
              </div>
            </section>

            <section id="assets" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <h2 className="text-[18px] font-bold text-[#171717]">HP・添付ファイル</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-3">
                  <Field label="HP / URL">
                    <input
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                      placeholder="https://example.com"
                      className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                    />
                  </Field>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="表示名">
                      <input
                        value={linkTitle}
                        onChange={(event) => setLinkTitle(event.target.value)}
                        placeholder="公式HP"
                        className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                      />
                    </Field>
                    <Field label="説明">
                      <input
                        value={linkDescription}
                        onChange={(event) => setLinkDescription(event.target.value)}
                        placeholder="サービスサイト"
                        className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLink}
                    className="inline-flex h-10 items-center justify-center rounded-[13px] border border-[#f0c655] bg-white px-4 text-[13px] font-bold text-[#171717]"
                  >
                    URLを追加
                  </button>
                </div>
                <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-4 py-5 text-center transition hover:border-[#f0c655] hover:bg-[#fffdf7]">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    onChange={(event) => handleSelectFiles(event.target.files)}
                    className="sr-only"
                  />
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#9c7600] shadow-[0_6px_14px_rgba(17,24,39,0.05)]">
                    <FileIcon />
                  </span>
                  <span className="mt-3 text-[13px] font-bold text-[#171717]">PDFを追加</span>
                  <span className="mt-1 text-[12px] leading-5 text-[#7a808c]">複数ファイルを添付できます</span>
                </label>
              </div>

              {links.length > 0 || attachments.length > 0 || pendingFiles.length > 0 ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <AssetList
                    title="登録URL"
                    emptyText="URLはまだありません"
                    items={links.map((link, index) => ({
                      id: `${link.url}-${index}`,
                      title: link.title,
                      body: link.url,
                      onRemove: () => setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index)),
                    }))}
                  />
                  <AssetList
                    title="添付PDF"
                    emptyText="PDFはまだありません"
                    items={[
                      ...attachments.map((attachment) => ({
                        id: attachment.id,
                        title: attachment.name,
                        body: `${formatFileSize(attachment.size)} / 登録済み`,
                        onRemove: () => setAttachments((current) => current.filter((item) => item.id !== attachment.id)),
                      })),
                      ...pendingFiles.map((file, index) => ({
                        id: `${file.name}-${index}`,
                        title: file.name,
                        body: `${formatFileSize(file.size)} / ${uploadProgress[file.name] ? `${uploadProgress[file.name]}%` : "保存時にアップロード"}`,
                        onRemove: () => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)),
                      })),
                    ]}
                  />
                </div>
              ) : null}
            </section>

          </div>

          <aside id="preview" className="space-y-5">
            <section className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)]">
              <h2 className="text-[18px] font-bold text-[#171717]">プレビュー</h2>
              <article className="mt-4 overflow-hidden rounded-[18px] border border-[#e6eaf0] bg-white">
                <div className="p-5">
                  {!productId || hasProductTabDraftContent(previewDraft) ? (
                    <PreviewArticle
                      title={previewDraft.title}
                      body={previewDraft.body}
                      description={previewDraft.description}
                      selectedProduct={selectedProduct}
                      links={links}
                      attachments={attachments}
                      pendingFiles={pendingFiles}
                      authorName={profile?.name ?? "作成者"}
                    />
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-5 py-10 text-center">
                      <h3 className="text-[18px] font-bold text-[#171717]">{tabTitle || "商材内タブ"}</h3>
                      <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                        このタブにはまだ本文がありません。商材ページでは、このタブに紐づくナレッジがここに表示されます。
                      </p>
                    </div>
                  )}
                </div>
              </article>
            </section>
            <section id="publish" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)]">
              <h2 className="text-[18px] font-bold text-[#171717]">公開設定</h2>
              <div className="mt-5 space-y-5">
                <Field label="公開範囲">
                  {isAdminAuthoring ? (
                    <div className="rounded-[16px] border border-[#f0e3c1] bg-[#fffaf0] px-4 py-3">
                      <div className="text-[13px] font-bold text-[#8a6500]">全salesに公開</div>
                      <p className="mt-1 text-[12px] leading-5 text-[#6f6250]">
                        adminで作成するナレッジは、公式ナレッジとして全営業担当に表示されます。
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <RadioButton checked={publicationTarget === "private"} onClick={() => setPublicationTarget("private")}>
                        自分のみ
                      </RadioButton>
                      <RadioButton checked={publicationTarget === "all_sales"} onClick={() => setPublicationTarget("all_sales")}>
                        他の営業マン全員
                      </RadioButton>
                      <RadioButton checked={publicationTarget === "selected_sales"} onClick={() => setPublicationTarget("selected_sales")}>
                        営業マンを複数選択
                      </RadioButton>
                      {publicationTarget === "selected_sales" ? (
                        <div className="rounded-[16px] border border-[#e4e8ef] bg-[#fcfcfd] px-3 py-3">
                          {selectableSalesUsers.length > 0 ? (
                            <div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">
                              {selectableSalesUsers.map((salesUser) => (
                                <label
                                  key={salesUser.uid}
                                  className="flex cursor-pointer items-center gap-3 rounded-[12px] bg-white px-3 py-2 text-[13px] font-bold text-[#343b48]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSalesUserIds.includes(salesUser.uid)}
                                    onChange={() => handleToggleSalesUser(salesUser.uid)}
                                    className="h-4 w-4 accent-[#f0c655]"
                                  />
                                  <span className="min-w-0 flex-1 truncate">{salesUser.name ?? salesUser.email ?? "名前未設定"}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px] leading-5 text-[#7a808c]">選択できる営業マンがまだいません。</p>
                          )}
                        </div>
                      ) : null}
                      <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3">
                        <input
                          type="checkbox"
                          checked={visibleToAdmin}
                          onChange={(event) => setVisibleToAdmin(event.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-[#f0c655]"
                        />
                        <span>
                          <span className="block text-[13px] font-bold text-[#343b48]">adminにも公開</span>
                          <span className="mt-1 block text-[12px] leading-5 text-[#7a808c]">
                            管理者側で確認・整備できるナレッジとして扱います。
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </Field>
                <Field label="ステータス">
                  {isAdminAuthoring ? (
                    <div className="rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-3">
                      <div className="text-[13px] font-bold text-[#171717]">公式として公開</div>
                      <p className="mt-1 text-[12px] leading-5 text-[#7a808c]">
                        保存後、sales側のナレッジ一覧と検索結果に表示されます。
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <RadioButton checked>{formatPublicationTarget(publicationTarget)}</RadioButton>
                      {visibleToAdmin ? <RadioButton checked>adminにも公開</RadioButton> : null}
                    </div>
                  )}
                </Field>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveKnowledge(publicationTarget)}
                  className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.16)] disabled:opacity-60"
                >
                  {isSaving ? "保存中" : isAdminAuthoring ? "公式として保存" : "公開する"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </form>
    </main>
  );
}

async function updateExistingKnowledge(id: string, payload: CreateKnowledgeItemInput) {
  await updateKnowledgeItem({
    ...payload,
    id,
  });

  return id;
}

function Field({
  label,
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[13px] font-bold text-[#343b48]">
        {label}
        {required ? <span className="text-[#e04f4f]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function AssetList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{
    id: string;
    title: string;
    body: string;
    onRemove: () => void;
  }>;
}) {
  return (
    <div>
      <div className="text-[13px] font-bold text-[#343b48]">{title}</div>
      <div className="mt-2 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-[#171717]">{item.title}</div>
                <div className="mt-1 truncate text-[12px] text-[#7a808c]">{item.body}</div>
              </div>
              <button
                type="button"
                onClick={item.onRemove}
                className="text-[18px] leading-none text-[#9aa1ac] transition hover:text-[#b4232a]"
                aria-label={`${item.title}を削除`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-4 py-5 text-center text-[13px] text-[#7a808c]">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewArticle({
  title,
  body,
  description,
  selectedProduct,
  links,
  attachments,
  pendingFiles,
  authorName,
}: {
  title: string;
  body: string;
  description: string;
  selectedProduct: KnowledgeProduct | undefined;
  links: KnowledgeLink[];
  attachments: KnowledgeAttachment[];
  pendingFiles: File[];
  authorName: string;
}) {
  return (
    <>
      <div className="flex items-start gap-4">
        <ProductLogo product={selectedProduct} />
        <div className="min-w-0">
          <h3 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">
            {selectedProduct?.name || title || "商材名"}
          </h3>
        </div>
      </div>

      <section className="mt-6">
        <h4 className="text-[16px] font-bold text-[#171717]">{title || `${selectedProduct?.name ?? "商材"} の概要`}</h4>
        {description ? <p className="mt-3 text-[14px] leading-7 text-[#3d4350]">{description}</p> : null}
        <div className="mt-5 whitespace-pre-wrap text-[14px] leading-7 text-[#2d3340]">
          {body || "本文のプレビューがここに表示されます。"}
        </div>
      </section>

      {links.length > 0 ? (
        <div className="mt-6 border-t border-[#eef1f5] pt-5">
          <h4 className="text-[14px] font-bold text-[#171717]">関連リンク</h4>
          <div className="mt-3 space-y-2">
            {links.map((link, index) => (
              <div key={`${link.url}-${index}`} className="rounded-[12px] border border-[#e6eaf0] px-3 py-3">
                <div className="text-[13px] font-bold text-[#171717]">{link.title}</div>
                <div className="mt-1 truncate text-[12px] text-[#5767c8]">{link.url}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {attachments.length > 0 || pendingFiles.length > 0 ? (
        <div className="mt-6 border-t border-[#eef1f5] pt-5">
          <h4 className="text-[14px] font-bold text-[#171717]">添付ファイル</h4>
          <div className="mt-3 space-y-2">
            {[...attachments, ...pendingFiles.map(fileToAttachmentPreview)].map((attachment) => (
              <div key={attachment.id} className="flex items-center gap-3 rounded-[12px] border border-[#e6eaf0] px-3 py-3 text-[13px] text-[#343b48]">
                <FileIcon />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <span className="text-[12px] text-[#8a909b]">{formatFileSize(attachment.size)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-7 flex items-center gap-3 border-t border-[#eef1f5] pt-5 text-[12px] text-[#596273]">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#171717]">
          <Image src="/nareji.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
        </span>
        <span>{authorName}</span>
      </div>
    </>
  );
}

function ProductLogo({ product }: { product: KnowledgeProduct | undefined }) {
  if (product?.logoUrl) {
    return (
      <span className="inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-[14px] border border-[#eceef4] bg-white shadow-[0_8px_18px_rgba(17,24,39,0.05)]">
        <span
          aria-label={`${product.name}のロゴ`}
          role="img"
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${product.logoUrl}")` }}
        />
      </span>
    );
  }

  return (
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#ffc400] text-white">
      <BoxIcon />
    </span>
  );
}

function RadioButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48]"
    >
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          checked ? "border-[#f0c655]" : "border-[#cfd5df]"
        }`}
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-[#f0c655]" /> : null}
      </span>
      {children}
    </button>
  );
}

function readKind(value: string | null): CreateKnowledgeItemInput["kind"] | null {
  if (value === "memo" || value === "qa" || value === "knowledge") {
    return value;
  }

  return null;
}

function readPublicationTarget(knowledge: KnowledgeItem): PublicationTarget {
  if (knowledge.scope === "shared") {
    return "all_sales";
  }

  if (knowledge.sharedWithUserIds.length > 0) {
    return "selected_sales";
  }

  return "private";
}

function formatPublicationTarget(target: PublicationTarget) {
  if (target === "all_sales") return "他の営業マン全員に公開";
  if (target === "selected_sales") return "選択した営業マンに公開";
  return "自分のみ";
}

function mergeProductTabDraft(
  drafts: Record<string, ProductTabDraft>,
  tabTitle: string,
  draft: ProductTabDraft,
) {
  const normalizedTabTitle = tabTitle.trim();

  if (!normalizedTabTitle) {
    return drafts;
  }

  return {
    ...drafts,
    [normalizedTabTitle]: draft,
  };
}

function buildSavableProductTabEntries(
  drafts: Record<string, ProductTabDraft>,
  tabOptions: string[],
) {
  return tabOptions
    .map((tabTitle) => ({
      tabTitle,
      draft: drafts[tabTitle] ?? emptyProductTabDraft,
    }))
    .filter((entry) => hasProductTabDraftContent(entry.draft));
}

function hasProductTabDraftContent(draft: ProductTabDraft) {
  return Boolean(
    draft.title.trim() ||
    draft.description.trim() ||
    draft.body.trim() ||
    draft.tagsText.trim(),
  );
}

function buildSearchTags(input: {
  manualText?: string;
  tabTitle?: string;
  title?: string;
  body?: string;
  productName?: string;
}) {
  const words = [
    input.tabTitle,
    input.productName,
    input.title,
    ...extractKeywordCandidates(input.manualText ?? ""),
    ...extractKeywordCandidates(input.body ?? ""),
  ];

  return Array.from(
    new Set(words.map((word) => word?.trim()).filter((word): word is string => Boolean(word))),
  ).slice(0, 12);
}

function extractKeywordCandidates(value: string) {
  return value
    .replace(/[。、！？!?「」『』（）()[\]【】]/g, " ")
    .split(/[\s　,、]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 8);
}

function buildTabOptions(currentTabTitle: string, productTabs: string[]) {
  const baseTabs = [
    ...productTabs.map((tab) => tab.trim()),
    "概要",
    "料金",
    "機能",
    "フロー",
    "Q&A",
  ].filter(Boolean);
  const tabs = Array.from(new Set(baseTabs));
  const normalizedCurrentTabTitle = currentTabTitle.trim();

  if (normalizedCurrentTabTitle && !tabs.includes(normalizedCurrentTabTitle)) {
    tabs.push(normalizedCurrentTabTitle);
  }

  return tabs;
}

function buildAutoDescription(body: string, title: string, fallback = "") {
  const source = body.trim() || title.trim() || fallback.trim();
  const normalized = source.replace(/\s+/g, " ").trim();

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function buildKnowledgeTitle(input: {
  title: string;
  body: string;
  selectedProductName?: string;
  tabTitle?: string;
  kind?: CreateKnowledgeItemInput["kind"];
}) {
  const normalizedTitle = input.title.trim();
  if (normalizedTitle) return normalizedTitle;

  if (input.selectedProductName && input.tabTitle) {
    return `${input.selectedProductName} ${input.tabTitle}`;
  }

  const bodyTitle = input.body.trim().replace(/\s+/g, " ").slice(0, 32);
  if (bodyTitle) return bodyTitle;

  if (input.kind === "memo") return "無題のメモ";
  if (input.kind === "qa") return "無題のQ&A";
  return "無題のナレッジ";
}

function formatBodySelection(value: string, selectionStart: number, selectionEnd: number, format: BodyFormat) {
  const selectedText = value.slice(selectionStart, selectionEnd);

  if (format === "h2" || format === "h3" || format === "list") {
    return formatSelectedLines(value, selectionStart, selectionEnd, format);
  }

  const fallbackText =
    format === "link"
      ? "リンク名"
      : format === "bold"
        ? "太字"
        : format === "italic"
          ? "斜体"
          : "下線";
  const text = selectedText || fallbackText;
  const wrapped =
    format === "bold"
      ? `**${text}**`
      : format === "italic"
        ? `*${text}*`
        : format === "underline"
          ? `<u>${text}</u>`
          : `[${text}](https://)`;
  const nextSelectionStart = selectionStart + wrapped.indexOf(text);
  const nextSelectionEnd = nextSelectionStart + text.length;

  return {
    value: `${value.slice(0, selectionStart)}${wrapped}${value.slice(selectionEnd)}`,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

function formatSelectedLines(value: string, selectionStart: number, selectionEnd: number, format: Extract<BodyFormat, "h2" | "h3" | "list">) {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const prefix = format === "h2" ? "## " : format === "h3" ? "### " : "- ";
  const fallbackText = format === "h2" ? "見出し" : format === "h3" ? "小見出し" : "箇条書き";
  const lines = selectedBlock || fallbackText;
  const formattedBlock = lines
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      return line.startsWith(prefix) ? line : `${prefix}${line}`;
    })
    .join("\n");

  return {
    value: `${value.slice(0, lineStart)}${formattedBlock}${value.slice(lineEnd)}`,
    selectionStart: lineStart + prefix.length,
    selectionEnd: lineStart + formattedBlock.length,
  };
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${size}B`;
}

function fileToAttachmentPreview(file: File): KnowledgeAttachment {
  return {
    id: `pending-${file.name}-${file.size}`,
    name: file.name,
    url: "",
    storagePath: "",
    contentType: file.type || "application/pdf",
    size: file.size,
    uploadedAt: null,
    uploadedBy: null,
  };
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 13h6M9 16h5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.1]">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9]">
      <path d="m12 3 7 4v8l-7 4-7-4V7l7-4Z" />
      <path d="m5 7 7 4 7-4" />
      <path d="M12 11v8" />
    </svg>
  );
}
