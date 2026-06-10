"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteKnowledgeItem,
  subscribeToKnowledgeItem,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";

export default function SalesKnowledgeDetailPage() {
  const router = useRouter();
  const params = useParams<{ categoryId: string; knowledgeId: string }>();
  const { profile } = useAuth();
  const [knowledge, setKnowledge] = useState<KnowledgeItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const userId = profile?.uid;
  const canEdit = Boolean(knowledge && (knowledge.ownerId === userId || profile?.role === "admin"));

  useEffect(() => {
    if (!params.knowledgeId) return;

    return subscribeToKnowledgeItem(
      params.knowledgeId,
      setKnowledge,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [params.knowledgeId]);

  const handleDeleteKnowledge = async () => {
    if (!knowledge) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteKnowledgeItem(knowledge.id);
      router.replace(`/sales/knowledge/categories/${params.categoryId}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ナレッジの削除に失敗しました。");
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fbfbfc] px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/sales/knowledge/categories/${params.categoryId}`}
            className="text-[14px] font-semibold text-[#5767c8]"
          >
            ← カテゴリに戻る
          </Link>
          {knowledge && canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sales/knowledge/categories/${params.categoryId}/knowledge/${params.knowledgeId}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#e6eaf0] bg-white px-4 text-[13px] font-bold text-[#343b48] shadow-[0_6px_16px_rgba(17,24,39,0.04)]"
              >
                <PenIcon />
                編集
              </Link>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-[13px] border border-[#f3cccc] bg-white px-4 text-[13px] font-bold text-[#b4232a] shadow-[0_6px_16px_rgba(17,24,39,0.04)]"
              >
                <TrashIcon />
                削除
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {knowledge ? (
          <article className="mt-6 rounded-[18px] border border-[#e5e9f0] bg-white px-7 py-8 shadow-[0_8px_22px_rgba(17,24,39,0.03)] md:px-10 md:py-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#fff5d8] px-3 py-1 text-[12px] font-bold text-[#8a6500]">
                {knowledge.scope === "shared" ? "共有" : "自分用"}
              </span>
              <span className="rounded-full bg-[#f1f2f5] px-3 py-1 text-[12px] font-semibold text-[#596273]">
                {knowledge.kind}
              </span>
              {knowledge.tabTitle ? (
                <span className="rounded-full bg-[#edf2ff] px-3 py-1 text-[12px] font-semibold text-[#5767c8]">
                  {knowledge.tabTitle}
                </span>
              ) : null}
              <span className="text-[13px] text-[#8a909b]">更新：{formatDate(knowledge.updatedAt)}</span>
            </div>

            <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-[-0.03em] text-[#171717]">
              {knowledge.title}
            </h1>
            {knowledge.description ? (
              <p className="mt-4 text-[15px] leading-7 text-[#596273]">{knowledge.description}</p>
            ) : null}
            {knowledge.tags.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {knowledge.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[#e6eaf0] bg-white px-3 py-1 text-[12px] font-semibold text-[#596273]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-8 whitespace-pre-wrap rounded-[16px] border border-[#eef1f5] bg-[#fbfbfc] px-5 py-5 text-[15px] leading-8 text-[#2d3340]">
              {knowledge.body || "本文はまだ入力されていません。"}
            </div>
            {knowledge.links.length > 0 ? (
              <section className="mt-6 rounded-[16px] border border-[#eef1f5] bg-white px-5 py-5">
                <h2 className="text-[17px] font-bold text-[#171717]">関連リンク</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {knowledge.links.map((link, index) => (
                    <a
                      key={`${link.url}-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[14px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
                    >
                      <div className="text-[14px] font-bold text-[#171717]">{link.title}</div>
                      {link.description ? (
                        <div className="mt-1 text-[12px] leading-5 text-[#596273]">{link.description}</div>
                      ) : null}
                      <div className="mt-2 truncate text-[12px] font-semibold text-[#5767c8]">{link.url}</div>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
            {knowledge.attachments.length > 0 ? (
              <section className="mt-6 rounded-[16px] border border-[#eef1f5] bg-white px-5 py-5">
                <h2 className="text-[17px] font-bold text-[#171717]">添付ファイル</h2>
                <div className="mt-4 space-y-3">
                  {knowledge.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-[14px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#ead8a8] hover:bg-[#fffdf7]"
                    >
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#b4232a] shadow-[0_5px_12px_rgba(17,24,39,0.04)]">
                        <FileIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-[#171717]">{attachment.name}</span>
                        <span className="mt-1 block text-[12px] text-[#7a808c]">{formatFileSize(attachment.size)}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        ) : (
          <div className="mt-6 rounded-[18px] border border-dashed border-[#f0c655] bg-[#fffdf7] px-6 py-14 text-center">
            <h1 className="text-[22px] font-bold text-[#171717]">ナレッジが見つかりません</h1>
            <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-7 text-[#7a808c]">
              削除されたか、まだ作成されていないナレッジです。
            </p>
          </div>
        )}
      </div>

      {deleteConfirmOpen && knowledge ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
          <div className="w-full max-w-[460px] rounded-[24px] border border-[#f1d4d4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
            <h2 className="text-[22px] font-bold text-[#171717]">ナレッジを削除しますか？</h2>
            <p className="mt-3 text-[14px] leading-7 text-[#596273]">
              「{knowledge.title}」を削除します。削除すると一覧や検索結果からも表示されなくなります。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteKnowledge}
                disabled={isDeleting}
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f3cccc] bg-[#fff5f5] px-6 text-[14px] font-bold text-[#b4232a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "削除中" : "削除する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <path d="m4 20 4.2-1 9.9-9.9a1.8 1.8 0 0 0 0-2.6l-.6-.6a1.8 1.8 0 0 0-2.6 0L5 15.8 4 20Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <path d="M5 7h14M10 11v6M14 11v6M8 7l.7 13h6.6L16 7M9.5 7l.5-3h4l.5 3" />
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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${size}B`;
}
