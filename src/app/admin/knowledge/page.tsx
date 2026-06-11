"use client";

import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { useEffect } from "react";
import { useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  getWorkExperienceBucket,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToSalesActivityEvents, type SalesActivityEvent } from "@/lib/firebase/activity";

export default function AdminKnowledgePage() {
  const { profile } = useAuth();
  const { knowledgeItems, products, categories, meetings, memberRows, error } = useAdminInsights();
  const [events, setEvents] = useState<SalesActivityEvent[]>([]);
  const [eventError, setEventError] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const sharedItems = knowledgeItems.filter((item) => item.scope === "shared");
  const searchEvents = events.filter((event) => event.type === "knowledge_searched");
  const filteredItems = sharedItems.filter((item) => {
    if (productId && item.productId !== productId) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    return true;
  });
  const words = useMemo(() => buildSearchWords(searchEvents, meetings, memberRows), [meetings, memberRows, searchEvents]);
  const noResultWords = useMemo(() => buildNoResultWords(searchEvents, memberRows), [memberRows, searchEvents]);
  const memberSearchRows = useMemo(() => buildMemberSearchRows(searchEvents, memberRows), [memberRows, searchEvents]);
  const freshmanWords = useMemo(() => buildFreshmanSearchWords(searchEvents, memberRows), [memberRows, searchEvents]);
  const totalSearchHits = searchEvents.reduce((sum, event) => sum + readNumber(event.metadata.resultCount), 0);

  useEffect(() => {
    if (!profile?.companyId) {
      setEvents([]);
      return;
    }

    return subscribeToSalesActivityEvents(
      profile.companyId,
      setEvents,
      (nextError: FirebaseError) => setEventError(nextError.message),
    );
  }, [profile?.companyId]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="KNOWLEDGE ENABLEMENT"
          title="ナレッジ管理"
          description="公式ナレッジと共有ナレッジを整備し、営業が検索で答えに辿り着ける状態を作ります。"
          action={<Link href="/admin/knowledge/new" className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]">公式ナレッジ作成</Link>}
        />
        {error || eventError ? <ErrorBox message={error ?? eventError ?? ""} /> : null}

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <KpiCard label="公式/共有ナレッジ" value={`${sharedItems.length}件`} note="全営業向け" />
          <KpiCard label="商品数" value={`${products.length}件`} note="商品別ナレッジ入口" />
          <KpiCard label="検索回数" value={`${searchEvents.length}回`} note="ナレッジ検索ログ" />
          <KpiCard label="検索ヒット数" value={`${totalSearchHits}件`} note="検索結果件数の合計" />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(460px,0.75fr)]">
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
                <EmptyState title="検索ワードはまだありません" body="検索履歴や商談ログが蓄積されると表示します。" />
              )}
            </Panel>
            <Panel title="検索されているがナレッジがないワード">
              {noResultWords.length > 0 ? (
                <WordList words={noResultWords} />
              ) : (
                <EmptyState title="未ヒットワードはありません" body="検索結果0件のキーワードが発生すると、ここに表示されます。" />
              )}
            </Panel>
            <Panel title="新卒・新人がよく見るワード">
              {freshmanWords.length > 0 ? (
                <WordList words={freshmanWords} />
              ) : (
                <EmptyState title="新人の検索ログはまだありません" body="勤務年数が1年未満の営業メンバーが検索すると、よく見るワードが表示されます。" />
              )}
            </Panel>
          </div>
        </section>

        <section className="mt-8">
          <Panel title="営業マン別 検索状況">
            {memberSearchRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                      <th className="px-4 py-3 font-bold">営業マン</th>
                      <th className="px-4 py-3 font-bold">検索回数</th>
                      <th className="px-4 py-3 font-bold">未ヒット</th>
                      <th className="px-4 py-3 font-bold">検索ワード</th>
                      <th className="px-4 py-3 font-bold">最終検索</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberSearchRows.map((row) => (
                      <tr key={row.userId} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fff3cf] text-[13px] font-black text-[#8a6500]">
                              {row.name.slice(0, 1)}
                            </span>
                            <div>
                              <div className="text-[14px] font-black text-[#171717]">{row.name}</div>
                              <div className="mt-0.5 text-[12px] text-[#8a909b]">{row.email || "メール未登録"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] font-black text-[#343b48]">{row.searchCount}回</td>
                        <td className="px-4 py-4 text-[13px] font-black text-[#343b48]">{row.noResultCount}回</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {row.words.map((word) => (
                              <span key={word.word} className="rounded-full border border-[#e4e8ef] bg-white px-2.5 py-1 text-[11px] font-bold text-[#596273]">
                                {word.word} {word.count}回
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[13px] font-bold text-[#596273]">{formatDateTime(row.lastSearchedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="検索ログはまだありません" body="営業メンバーがナレッジ検索を行うと、個人別の検索状況が表示されます。" />
            )}
          </Panel>
        </section>
      </div>
    </PageShell>
  );
}

function WordList({ words }: { words: SearchWordRow[] }) {
  return (
    <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
      {words.map((word, index) => (
        <div key={word.word} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#343b48]">{word.word}</span>
            <span className="text-[12px] text-[#8a909b]">{word.count}回</span>
          </div>
          {word.members.length > 0 ? (
            <div className="mt-3 grid gap-1.5 pl-9 sm:grid-cols-2">
              {word.members.map((member) => (
                <span key={member.id} className="rounded-full border border-[#e4e8ef] bg-white px-2.5 py-1 text-[11px] font-bold text-[#596273]">
                  {member.name} {member.count}回
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type SearchWordRow = {
  word: string;
  count: number;
  members: Array<{ id: string; name: string; count: number }>;
};

type MemberSearchRow = {
  userId: string;
  name: string;
  email: string;
  searchCount: number;
  noResultCount: number;
  words: Array<{ word: string; count: number }>;
  lastSearchedAt: Date | null;
};

function buildSearchWords(
  events: SalesActivityEvent[],
  meetings: ReturnType<typeof useAdminInsights>["meetings"],
  members: ReturnType<typeof useAdminInsights>["memberRows"],
) {
  const eventWords = events.map((event) => ({
    word: readString(event.metadata.query),
    userId: event.userId,
  })).filter((item) => item.word);
  if (eventWords.length > 0) {
    return countWords(eventWords, members);
  }

  const words = ["料金", "価格", "導入", "比較", "予算", "高い", "検討", "サポート"];
  const counts = new Map<string, number>();
  meetings.forEach((meeting) => {
    const text = [meeting.productType, meeting.transcriptionProbeText, ...(meeting.conversationLogs?.map((log) => log.text) ?? [])].join(" ");
    words.forEach((word) => {
      const count = text.split(word).length - 1;
      if (count > 0) counts.set(word, (counts.get(word) ?? 0) + count);
    });
  });
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count, members: [] }))
    .sort((a, b) => b.count - a.count);
}

function buildNoResultWords(
  events: SalesActivityEvent[],
  members: ReturnType<typeof useAdminInsights>["memberRows"],
) {
  return countWords(
    events
      .filter((event) => readNumber(event.metadata.resultCount) === 0)
      .map((event) => ({ word: readString(event.metadata.query), userId: event.userId }))
      .filter((item) => item.word),
    members,
  );
}

function buildFreshmanSearchWords(
  events: SalesActivityEvent[],
  members: ReturnType<typeof useAdminInsights>["memberRows"],
) {
  const freshmanIds = new Set(
    members
      .filter((member) => getWorkExperienceBucket(member.workExperienceTotalMonths) === "新卒・1年未満")
      .map((member) => member.id),
  );

  return countWords(
    events
      .filter((event) => freshmanIds.has(event.userId))
      .map((event) => ({ word: readString(event.metadata.query), userId: event.userId }))
      .filter((item) => item.word),
    members,
  );
}

function countWords(words: Array<{ word: string; userId: string }>, members: ReturnType<typeof useAdminInsights>["memberRows"]): SearchWordRow[] {
  const rows = new Map<string, { count: number; memberCounts: Map<string, number> }>();
  words.forEach(({ word, userId }) => {
    const current = rows.get(word) ?? { count: 0, memberCounts: new Map<string, number>() };
    current.count += 1;
    current.memberCounts.set(userId, (current.memberCounts.get(userId) ?? 0) + 1);
    rows.set(word, current);
  });

  return Array.from(rows.entries())
    .map(([word, row]) => ({
      word,
      count: row.count,
      members: Array.from(row.memberCounts.entries())
        .map(([id, count]) => ({
          id,
          name: members.find((member) => member.id === id)?.name ?? "未設定",
          count,
        }))
        .sort((left, right) => right.count - left.count),
    }))
    .sort((a, b) => b.count - a.count);
}

function buildMemberSearchRows(events: SalesActivityEvent[], members: ReturnType<typeof useAdminInsights>["memberRows"]): MemberSearchRow[] {
  const rows = new Map<string, {
    searchCount: number;
    noResultCount: number;
    lastSearchedAt: Date | null;
    wordCounts: Map<string, number>;
  }>();

  events.forEach((event) => {
    const word = readString(event.metadata.query);
    if (!word) return;
    const current = rows.get(event.userId) ?? {
      searchCount: 0,
      noResultCount: 0,
      lastSearchedAt: null,
      wordCounts: new Map<string, number>(),
    };
    current.searchCount += 1;
    if (readNumber(event.metadata.resultCount) === 0) {
      current.noResultCount += 1;
    }
    if (!current.lastSearchedAt || (event.createdAt && event.createdAt > current.lastSearchedAt)) {
      current.lastSearchedAt = event.createdAt;
    }
    current.wordCounts.set(word, (current.wordCounts.get(word) ?? 0) + 1);
    rows.set(event.userId, current);
  });

  return Array.from(rows.entries())
    .map(([userId, row]) => {
      const member = members.find((item) => item.id === userId);
      return {
        userId,
        name: member?.name ?? "未設定",
        email: member?.email ?? "",
        searchCount: row.searchCount,
        noResultCount: row.noResultCount,
        lastSearchedAt: row.lastSearchedAt,
        words: Array.from(row.wordCounts.entries())
          .map(([word, count]) => ({ word, count }))
          .sort((left, right) => right.count - left.count),
      };
    })
    .sort((left, right) => right.searchCount - left.searchCount);
}

function formatDateTime(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
