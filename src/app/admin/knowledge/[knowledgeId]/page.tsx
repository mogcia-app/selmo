"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  PageHeader,
  PageShell,
  Panel,
} from "@/app/admin/_components/admin-insights";
import {
  subscribeToKnowledgeItem,
  type KnowledgeItem,
} from "@/lib/firebase/knowledge";

export default function AdminKnowledgeDetailPage() {
  const params = useParams<{ knowledgeId: string }>();
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
    <PageShell>
      <div className="mx-auto max-w-[1120px]">
        <PageHeader
          eyebrow="KNOWLEDGE DETAIL"
          title={knowledge?.title ?? "ナレッジ詳細"}
          description="営業メンバーに共有される公式ナレッジの内容を確認します。"
          action={
            <Link href="/admin/knowledge" className="rounded-[14px] border border-[#e6eaf0] bg-white px-5 py-3 text-[13px] font-black text-[#343b48]">
              一覧へ戻る
            </Link>
          }
        />

        {error ? (
          <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {knowledge ? (
          <div className="mt-8 space-y-6">
            <Panel title="本文">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={knowledge.scope === "shared" ? "全営業向け" : "個人用"} tone="yellow" />
                <Badge label={knowledge.kind} />
                {knowledge.tabTitle ? <Badge label={knowledge.tabTitle} /> : null}
                <span className="text-[12px] font-bold text-[#8a909b]">更新: {formatDate(knowledge.updatedAt)}</span>
              </div>
              {knowledge.description ? (
                <p className="mt-5 text-[14px] leading-7 text-[#596273]">{knowledge.description}</p>
              ) : null}
              {knowledge.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {knowledge.tags.map((tag) => (
                    <Badge key={tag} label={tag} />
                  ))}
                </div>
              ) : null}
              <div className="mt-6 whitespace-pre-wrap rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-5 py-5 text-[14px] leading-8 text-[#2d3340]">
                {knowledge.body || "本文はまだ入力されていません。"}
              </div>
            </Panel>

            {knowledge.links.length > 0 ? (
              <Panel title="関連リンク">
                <div className="grid gap-3 md:grid-cols-2">
                  {knowledge.links.map((link, index) => (
                    <a
                      key={`${link.url}-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[16px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                    >
                      <div className="text-[14px] font-black text-[#171717]">{link.title}</div>
                      {link.description ? <p className="mt-1 text-[12px] leading-5 text-[#596273]">{link.description}</p> : null}
                      <div className="mt-2 truncate text-[12px] font-bold text-[#8a6500]">{link.url}</div>
                    </a>
                  ))}
                </div>
              </Panel>
            ) : null}

            {knowledge.attachments.length > 0 ? (
              <Panel title="添付ファイル">
                <div className="space-y-3">
                  {knowledge.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-[#fffdf7]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-black text-[#171717]">{attachment.name}</span>
                        <span className="mt-1 block text-[12px] text-[#7a808c]">{formatFileSize(attachment.size)}</span>
                      </span>
                      <span className="text-[12px] font-black text-[#8a6500]">開く</span>
                    </a>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        ) : (
          <div className="mt-8 rounded-[22px] border border-dashed border-[#f0c655] bg-[#fffdf7] px-6 py-14 text-center">
            <h2 className="text-[22px] font-black text-[#171717]">ナレッジが見つかりません</h2>
            <p className="mt-2 text-[14px] leading-7 text-[#7a808c]">削除されたか、読み込み権限がないナレッジです。</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Badge({ label, tone = "gray" }: { label: string; tone?: "gray" | "yellow" }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-black ${tone === "yellow" ? "bg-[#fff4c2] text-[#8a6500]" : "bg-[#f1f2f5] text-[#596273]"}`}>
      {label}
    </span>
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

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "サイズ不明";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10}MB`;
}
