"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminKnowledgePage() {
  const { knowledgeItems, products, categories, meetings, error } = useAdminInsights();
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const sharedItems = knowledgeItems.filter((item) => item.scope === "shared");
  const filteredItems = sharedItems.filter((item) => {
    if (productId && item.productId !== productId) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    return true;
  });
  const words = useMemo(() => buildSearchLikeWords(meetings), [meetings]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="KNOWLEDGE ENABLEMENT"
          title="ナレッジ管理"
          description="公式ナレッジと共有ナレッジを整備し、営業が検索で答えに辿り着ける状態を作ります。"
          action={<Link href="/sales/knowledge/new?kind=knowledge&scope=shared" className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]">公式ナレッジ作成</Link>}
        />
        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <KpiCard label="公式/共有ナレッジ" value={`${sharedItems.length}件`} note="scope: shared" />
          <KpiCard label="商品数" value={`${products.length}件`} note="商品別ナレッジ入口" />
          <KpiCard label="閲覧数" value="-" note="集計準備中" />
          <KpiCard label="検索ヒット数" value="-" note="集計準備中" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <Panel title="公式ナレッジ一覧" actionLabel="salesで見る" href="/sales/knowledge">
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold outline-none">
                <option value="">商品すべて</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold outline-none">
                <option value="">カテゴリすべて</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
              </select>
            </div>
            {filteredItems.length > 0 ? (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <Link key={item.id} href={`/sales/knowledge/categories/${item.categoryId ?? "how-to"}/knowledge/${item.id}`} className="grid gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px]">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-black text-[#171717]">{item.title}</div>
                      <div className="mt-1 truncate text-[12px] text-[#7a808c]">{item.description || item.body || "説明未設定"}</div>
                    </div>
                    <span className="text-[13px] font-bold text-[#596273]">{item.tabTitle || "タブなし"}</span>
                    <span className="text-[13px] font-bold text-[#2672d9]">詳細</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="共有ナレッジはまだありません" body="公式ナレッジを作成すると、ここに表示されます。" />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel title="よく検索されているワード">
              {words.length > 0 ? (
                <WordList words={words} />
              ) : (
                <EmptyState title="検索ワードは集計準備中です" body="検索履歴や商談ログが蓄積されると表示します。" />
              )}
            </Panel>
            <Panel title="検索されているがナレッジがないワード">
              <Placeholder>集計準備中</Placeholder>
            </Panel>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function WordList({ words }: { words: Array<{ word: string; count: number }> }) {
  return (
    <div className="space-y-2">
      {words.slice(0, 5).map((word, index) => (
        <div key={word.word} className="flex items-center gap-3 rounded-[14px] bg-[#fcfcfd] px-3 py-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#343b48]">{word.word}</span>
          <span className="text-[12px] text-[#8a909b]">{word.count}回</span>
        </div>
      ))}
    </div>
  );
}

function buildSearchLikeWords(meetings: ReturnType<typeof useAdminInsights>["meetings"]) {
  const words = ["料金", "価格", "導入", "比較", "予算", "高い", "検討", "サポート"];
  const counts = new Map<string, number>();
  meetings.forEach((meeting) => {
    const text = [meeting.productType, meeting.transcriptionProbeText, ...(meeting.conversationLogs?.map((log) => log.text) ?? [])].join(" ");
    words.forEach((word) => {
      const count = text.split(word).length - 1;
      if (count > 0) counts.set(word, (counts.get(word) ?? 0) + count);
    });
  });
  return Array.from(counts.entries()).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
