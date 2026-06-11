"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  addKnowledgeProductTab,
  createKnowledgeItem,
  subscribeToKnowledgeCategories,
  subscribeToKnowledgeItem,
  subscribeToKnowledgeProducts,
  updateKnowledgeItem,
  uploadKnowledgeAttachments,
  type CreateKnowledgeItemInput,
  type KnowledgeAttachment,
  type KnowledgeCategory,
  type KnowledgeItem,
  type KnowledgeLink,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";

type KnowledgeEditorScreenProps = {
  mode: "create" | "edit";
  knowledgeId?: string;
};

export function KnowledgeEditorScreen({ mode, knowledgeId }: KnowledgeEditorScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const canCreateShared = profile?.role === "admin";
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [tabTitle, setTabTitle] = useState(searchParams.get("tabTitle") ?? "");
  const [newTabTitle, setNewTabTitle] = useState("");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") ?? "");
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [kind, setKind] = useState<CreateKnowledgeItemInput["kind"]>(
    readKind(searchParams.get("kind")) ?? "knowledge",
  );
  const [scope, setScope] = useState<CreateKnowledgeItemInput["scope"]>(
    searchParams.get("scope") === "shared" ? "shared" : "personal",
  );
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

  useEffect(() => {
    if (!companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToKnowledgeCategories(companyId, setCategories, handleError),
      subscribeToKnowledgeProducts(companyId, setProducts, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [companyId]);

  useEffect(() => {
    if (mode !== "edit" || !knowledgeId) return;

    return subscribeToKnowledgeItem(
      knowledgeId,
      setKnowledge,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [knowledgeId, mode]);

  useEffect(() => {
    if (!knowledge) return;

    setTitle(knowledge.title);
    setDescription(knowledge.description);
    setBody(knowledge.body);
    setTabTitle(knowledge.tabTitle);
    setCategoryId(knowledge.categoryId ?? "");
    setProductId(knowledge.productId ?? "");
    setKind(knowledge.kind);
    setScope(canCreateShared ? knowledge.scope : "personal");
    setTagsText(knowledge.tags.join(", "));
    setLinks(knowledge.links);
    setAttachments(knowledge.attachments);
    setPendingFiles([]);
    setUploadProgress({});
  }, [canCreateShared, knowledge]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const tabOptions = useMemo(() => buildTabOptions(tabTitle, selectedProduct?.tabs ?? []), [selectedProduct?.tabs, tabTitle]);
  const [previewTab, setPreviewTab] = useState("");
  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12),
    [tagsText],
  );
  const wordCount = body.length;
  const lineCount = body ? body.split(/\n/).length : 0;
  const canEdit = mode === "create" || Boolean(knowledge && (knowledge.ownerId === userId || profile?.role === "admin"));

  useEffect(() => {
    if (!previewTab || !tabOptions.includes(previewTab)) {
      setPreviewTab(tabTitle || tabOptions[0] || "");
    }
  }, [previewTab, tabOptions, tabTitle]);

  useEffect(() => {
    if (productId && !tabTitle && tabOptions[0]) {
      setTabTitle(tabOptions[0]);
      setPreviewTab(tabOptions[0]);
    }
  }, [productId, tabOptions, tabTitle]);

  const saveKnowledge = async (nextScope = scope) => {
    if (!userId || !companyId) {
      setError("ログイン情報を確認できませんでした。再読み込みしてからお試しください。");
      return;
    }

    if (!canEdit) {
      setError("このナレッジを編集する権限がありません。");
      return;
    }

    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload: CreateKnowledgeItemInput = {
      companyId,
      title: title.trim(),
      description: buildAutoDescription(body, title, description),
      body: body.trim(),
      tabTitle: productId ? tabTitle.trim() : "",
      categoryId: categoryId || null,
      productId: productId || null,
      ownerId: userId,
      scope: canCreateShared ? nextScope : "personal",
      kind,
      tags,
      links,
      attachments,
    };

    try {
      const nextId =
        mode === "edit" && knowledgeId
          ? await updateExistingKnowledge(knowledgeId, payload)
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
      router.replace(`/sales/knowledge/categories/${payload.categoryId ?? "how-to"}/knowledge/${nextId}`);
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
    void saveKnowledge(scope);
  };

  const handleSelectTabTitle = (nextTabTitle: string) => {
    setTabTitle(nextTabTitle);
    setPreviewTab(nextTabTitle);
  };

  const handleAddProductTab = async () => {
    const title = newTabTitle.trim();

    if (!title) {
      setError("追加するタブ名を入力してください。");
      return;
    }

    if (!productId) {
      setError("先に商品・サービスを選択してください。");
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

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-5 md:px-8">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1580px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/sales/knowledge"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e6eaf0] bg-white text-[#171717] shadow-[0_8px_18px_rgba(17,24,39,0.05)]"
              aria-label="ナレッジへ戻る"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
              {mode === "edit" ? "ナレッジを編集" : "ナレッジを作成"}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[13px] font-bold text-[#343b48] shadow-[0_8px_18px_rgba(17,24,39,0.04)] disabled:opacity-60"
            >
              下書きを保存
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
              onClick={() => void saveKnowledge(canCreateShared ? "shared" : "personal")}
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.16)] disabled:opacity-60"
            >
              {isSaving ? "保存中" : "公開する"}
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

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1120px)_460px]">
          <div className="space-y-5">
            <section id="basic" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <h2 className="text-[18px] font-bold text-[#171717]">基本情報</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="商品・サービス">
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
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
                <Field label="商品内タブ">
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-[#e4e8ef] bg-white md:grid-cols-5">
                      {tabOptions.slice(0, 5).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => handleSelectTabTitle(tab)}
                          className={`h-12 border-r border-[#eef1f5] px-3 text-[13px] font-bold last:border-r-0 ${
                            tabTitle === tab ? "bg-[#fffdf7] text-[#d09200] shadow-[inset_0_-2px_0_#ffc400]" : "text-[#596273]"
                          }`}
                        >
                          <span className="block truncate">{tab}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <input
                        value={newTabTitle}
                        onChange={(event) => setNewTabTitle(event.target.value)}
                        placeholder={productId ? "例：比較情報、活用シーン" : "商品を選択するとタブを追加できます"}
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

                <Field label="タイトル" required>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="例：商品Aの概要"
                    className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                  />
                </Field>

                <Field label="カテゴリ">
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                  >
                    <option value="">未設定</option>
                    <option value="how-to">使い方</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="タグ" className="md:col-span-1">
                  <input
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder="サービス概要, SFA, 営業支援"
                    className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
                  />
                </Field>

              </div>
            </section>

            <section id="body" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[18px] font-bold text-[#171717]">本文</h2>
                <button
                  type="button"
                  onClick={() => setBody(formatBody(body))}
                  className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[12px] font-bold text-[#343b48]"
                >
                  <SparkIcon />
                  文章を整える
                </button>
              </div>
              <div className="mt-4 rounded-[16px] border border-[#e4e8ef] bg-white">
                <div className="flex flex-wrap items-center gap-1 border-b border-[#eef1f5] px-3 py-2 text-[12px] font-bold text-[#596273]">
                  {["H2", "H3", "B", "I", "U", "箇条書き", "リンク"].map((label) => (
                    <span key={label} className="rounded-[9px] px-2 py-1">
                      {label}
                    </span>
                  ))}
                </div>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="本文を入力してください"
                  className="min-h-[360px] w-full resize-y rounded-b-[16px] border-0 bg-white px-4 py-4 text-[14px] leading-7 text-[#171717] outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#7a808c]">
                <span>{`文字数：${wordCount}　行数：${lineCount}`}</span>
                <span className="font-semibold text-[#0a9d58]">下書きは保存ボタンで保存できます</span>
              </div>
            </section>

            <section id="related" className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.04)] md:p-6">
              <h2 className="text-[18px] font-bold text-[#171717]">関連情報</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <RelatedBox title="関連ナレッジ" value={title ? `${title} に関連するナレッジ` : "保存後に関連候補を表示"} />
                <RelatedBox title="関連商談" value="商談データ連携後に候補を表示" />
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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-bold text-[#171717]">プレビュー</h2>
                <button
                  type="button"
                  onClick={() => setPreviewTab(tabTitle || tabOptions[0] || "")}
                  className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#e4e8ef] bg-white px-3 text-[12px] font-bold text-[#596273]"
                >
                  <RefreshIcon />
                  更新
                </button>
              </div>
              <article className="mt-4 overflow-hidden rounded-[18px] border border-[#e6eaf0] bg-white">
                {productId ? (
                  <div className="grid grid-cols-2 border-b border-[#f0e7c9] bg-[#fffdf7] sm:grid-cols-5">
                    {tabOptions.slice(0, 5).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setPreviewTab(tab)}
                        className={`h-12 border-r border-[#f0e7c9] px-2 text-[12px] font-bold last:border-r-0 ${
                          previewTab === tab ? "bg-white text-[#171717] shadow-[inset_0_-2px_0_#ffc400]" : "text-[#596273]"
                        }`}
                      >
                        <span className="block truncate">{tab}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="p-5">
                  {!productId || previewTab === tabTitle || (!tabTitle && previewTab === tabOptions[0]) ? (
                    <PreviewArticle
                      title={title}
                      body={body}
                      description={description}
                      selectedProduct={selectedProduct}
                      links={links}
                      attachments={attachments}
                      pendingFiles={pendingFiles}
                      authorName={profile?.name ?? "作成者"}
                    />
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d7dde8] bg-[#fcfcfd] px-5 py-10 text-center">
                      <h3 className="text-[18px] font-bold text-[#171717]">{previewTab}</h3>
                      <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                        このタブにはまだ本文がありません。商品ページでは、このタブに紐づくナレッジがここに表示されます。
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
                  <div className="grid gap-3">
                    <RadioButton checked={scope === "personal"} onClick={() => setScope("personal")}>
                      自分のみ
                    </RadioButton>
                    {canCreateShared ? (
                      <RadioButton checked={scope === "shared"} onClick={() => setScope("shared")}>
                        全体に公開
                      </RadioButton>
                    ) : null}
                  </div>
                </Field>
                <Field label="ステータス">
                  <div className="grid gap-3">
                    <RadioButton checked>下書き</RadioButton>
                    <RadioButton checked={false}>公開する</RadioButton>
                  </div>
                </Field>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveKnowledge(canCreateShared ? "shared" : "personal")}
                  className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.16)] disabled:opacity-60"
                >
                  {isSaving ? "保存中" : "公開する"}
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

function RelatedBox({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] font-bold text-[#343b48]">{title}</div>
      <div className="mt-2 flex min-h-12 items-center justify-between rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[13px] text-[#596273]">
        <span className="truncate">{value}</span>
        <span className="text-[#9aa1ac]">×</span>
      </div>
    </div>
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
            {selectedProduct?.name || title || "商品名"}
          </h3>
        </div>
      </div>

      <section className="mt-6">
        <h4 className="text-[16px] font-bold text-[#171717]">{title || `${selectedProduct?.name ?? "商品"} の概要`}</h4>
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

function buildTabOptions(currentTabTitle: string, productTabs: string[]) {
  return Array.from(
    new Set([
      currentTabTitle.trim(),
      ...productTabs.map((tab) => tab.trim()),
      "概要",
      "料金",
      "機能",
      "フロー",
      "Q&A",
    ].filter(Boolean)),
  );
}

function buildAutoDescription(body: string, title: string, fallback = "") {
  const source = body.trim() || title.trim() || fallback.trim();
  const normalized = source.replace(/\s+/g, " ").trim();

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function formatBody(value: string) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 2.8 14.2 9l6.2 2.2-6.2 2.2L12 19.6l-2.2-6.2-6.2-2.2L9.8 9 12 2.8Z" />
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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.7 6.4L4 9" />
      <path d="M5.8 15A7 7 0 0 0 17.3 17.6L20 15" />
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
