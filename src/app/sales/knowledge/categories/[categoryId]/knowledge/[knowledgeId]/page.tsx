"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  subscribeToKnowledgeItem,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";

export default function SalesKnowledgeDetailPage() {
  const params = useParams<{ categoryId: string; knowledgeId: string }>();
  const [knowledge, setKnowledge] = useState<KnowledgeItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.knowledgeId) return;

    return subscribeToKnowledgeItem(
      params.knowledgeId,
      setKnowledge,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [params.knowledgeId]);

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
              <span className="text-[13px] text-[#8a909b]">更新：{formatDate(knowledge.updatedAt)}</span>
            </div>

            <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-[-0.03em] text-[#171717]">
              {knowledge.title}
            </h1>
            {knowledge.description ? (
              <p className="mt-4 text-[15px] leading-7 text-[#596273]">{knowledge.description}</p>
            ) : null}
            <div className="mt-8 whitespace-pre-wrap rounded-[16px] border border-[#eef1f5] bg-[#fbfbfc] px-5 py-5 text-[15px] leading-8 text-[#2d3340]">
              {knowledge.body || "本文はまだ入力されていません。"}
            </div>
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
