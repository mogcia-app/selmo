"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  CreateKnowledgeItemInput,
  KnowledgeItem,
  KnowledgeProduct,
} from "@/lib/firebase/knowledge";

type KnowledgeCreateDialogProps = {
  open: boolean;
  products: KnowledgeProduct[];
  ownerId: string | null | undefined;
  canCreateShared: boolean;
  defaultCategoryId?: string | null;
  defaultKind?: CreateKnowledgeItemInput["kind"];
  defaultScope?: CreateKnowledgeItemInput["scope"];
  initialItem?: KnowledgeItem | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (input: CreateKnowledgeItemInput) => Promise<void>;
};

export function KnowledgeCreateDialog({
  open,
  products,
  ownerId,
  canCreateShared,
  defaultCategoryId = null,
  defaultKind = "knowledge",
  defaultScope = "personal",
  initialItem = null,
  title: dialogTitle = "ナレッジを作成",
  description: dialogDescription = "商談で使う切り返し、提案トーク、Q&Aを保存できます。",
  submitLabel = "作成する",
  onClose,
  onSubmit,
}: KnowledgeCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "how-to");
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<CreateKnowledgeItemInput["kind"]>(defaultKind);
  const [scope, setScope] = useState<CreateKnowledgeItemInput["scope"]>(
    canCreateShared ? defaultScope : "personal",
  );
  const [tagsText, setTagsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setTitle(initialItem?.title ?? "");
    setDescription(initialItem?.description ?? "");
    setBody(initialItem?.body ?? "");
    setCategoryId(initialItem?.categoryId ?? defaultCategoryId ?? "");
    setProductId(initialItem?.productId ?? "");
    setKind(initialItem?.kind ?? defaultKind);
    setScope(canCreateShared ? (initialItem?.scope ?? defaultScope) : "personal");
    setTagsText(initialItem?.tags.join(", ") ?? "");
    setError(null);
    setIsSaving(false);
  }, [canCreateShared, defaultCategoryId, defaultKind, defaultScope, initialItem, open]);

  const normalizedTags = useMemo(
    () => buildSearchTags({ manualText: tagsText, title, body, productName: products.find((product) => product.id === productId)?.name }),
    [body, productId, products, tagsText, title],
  );

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ownerId) {
      setError("ログイン情報を確認できませんでした。再読み込みしてからお試しください。");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSubmit({
        title: buildKnowledgeTitle(title, body, kind),
        description: description.trim(),
        body: body.trim(),
        categoryId: categoryId || "how-to",
        productId: productId || null,
        ownerId,
        scope,
        kind,
        tags: normalizedTags,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ナレッジの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_24px_70px_rgba(17,24,39,0.18)] md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">{dialogTitle}</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">
              {dialogDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#e6eaf0] text-[22px] leading-none text-[#8a909b] transition hover:text-[#171717]"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="text-[13px] font-bold text-[#343b48]">タイトル</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="未入力なら自動で名前を付けます"
              className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
              autoFocus
            />
          </label>

          <label>
            <span className="text-[13px] font-bold text-[#343b48]">種類</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as CreateKnowledgeItemInput["kind"])}
              className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
            >
              <option value="knowledge">ナレッジ</option>
              <option value="qa">Q&A</option>
            </select>
          </label>

          <label>
            <span className="text-[13px] font-bold text-[#343b48]">公開範囲</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as CreateKnowledgeItemInput["scope"])}
              className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
            >
              <option value="personal">自分用</option>
              {canCreateShared ? <option value="shared">共有</option> : null}
            </select>
          </label>

          <label>
            <span className="text-[13px] font-bold text-[#343b48]">商材</span>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
            >
              <option value="">未設定</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="md:col-span-2">
            <span className="text-[13px] font-bold text-[#343b48]">概要</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="検索結果や一覧に表示する短い説明"
              className="mt-2 h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]"
            />
          </label>

          <label className="md:col-span-2">
            <span className="text-[13px] font-bold text-[#343b48]">本文</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="商談で使う説明、判断基準、FAQの回答など"
              className="mt-2 min-h-[160px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]"
            />
          </label>

        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-bold text-[#171717] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "保存中" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function buildKnowledgeTitle(title: string, body: string, kind: CreateKnowledgeItemInput["kind"]) {
  const normalizedTitle = title.trim();
  if (normalizedTitle) return normalizedTitle;

  const bodyTitle = body.trim().replace(/\s+/g, " ").slice(0, 32);
  if (bodyTitle) return bodyTitle;

  if (kind === "qa") return "無題のQ&A";
  return "無題のナレッジ";
}

function buildSearchTags(input: { manualText?: string; title?: string; body?: string; productName?: string }) {
  const words = [
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
