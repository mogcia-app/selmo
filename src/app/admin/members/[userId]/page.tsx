"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  calcWinRate,
  formatDate,
  getMeetingOutcomeLabel,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToSalesActivityEvents, type SalesActivityEvent } from "@/lib/firebase/activity";
import type { MeetingRecord } from "@/lib/firebase/meetings";
import { createAppNotification } from "@/lib/firebase/notifications";

export default function AdminMemberDetailPage() {
  const params = useParams<{ userId: string }>();
  const { profile: adminProfile } = useAuth();
  const { memberRows, salesUsers, meetings, roleplayResults, knowledgeItems, error } = useAdminInsights();
  const [activityEvents, setActivityEvents] = useState<SalesActivityEvent[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [guidanceComment, setGuidanceComment] = useState("");
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);
  const [isSendingGuidance, setIsSendingGuidance] = useState(false);
  const member = memberRows.find((row) => row.id === params.userId);
  const profile = salesUsers.find((user) => user.uid === params.userId);
  const userMeetings = meetings.filter((meeting) => meeting.userId === params.userId);
  const userResults = roleplayResults.filter((result) => result.userId === params.userId);
  const userKnowledgeItems = knowledgeItems.filter((item) => item.ownerId === params.userId);
  const searchWordRows = useMemo(
    () => buildSearchWordRows(activityEvents, params.userId),
    [activityEvents, params.userId],
  );
  const lostReason = buildLostReason(userMeetings);
  const latestRoleplayFeedback = userResults[0]?.improvementPhrases?.[0] ?? userResults[0]?.summary ?? member?.guidance ?? "商談ログを確認";
  const winRate = calcWinRate(userMeetings);

  useEffect(() => {
    if (!adminProfile?.companyId) {
      setActivityEvents([]);
      return;
    }

    return subscribeToSalesActivityEvents(
      adminProfile.companyId,
      setActivityEvents,
      (nextError: FirebaseError) => setActivityError(nextError.message),
    );
  }, [adminProfile?.companyId]);

  async function handleSendGuidanceComment() {
    if (!adminProfile?.uid || !adminProfile.companyId || !member) {
      setGuidanceMessage("送信先の営業マン情報を取得できませんでした。");
      return;
    }

    const comment = guidanceComment.trim();
    if (!comment) {
      setGuidanceMessage("指導コメントを入力してください。");
      return;
    }

    setIsSendingGuidance(true);
    setGuidanceMessage(null);
    try {
      await createAppNotification({
        companyId: adminProfile.companyId,
        userId: member.id,
        title: "上司から指導コメントが届きました",
        body: comment,
        href: "/sales/dashboard",
        type: "admin_guidance",
        createdBy: adminProfile.uid,
        metadata: {
          targetUserId: member.id,
          targetUserName: member.name,
        },
      });
      setGuidanceComment("");
      setGuidanceMessage("営業マンへ通知しました。");
    } catch (nextError) {
      setGuidanceMessage(nextError instanceof Error ? nextError.message : "通知の送信に失敗しました。");
    } finally {
      setIsSendingGuidance(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEMBER DETAIL"
          title={member?.name ?? profile?.name ?? "営業マン詳細"}
          description="この営業マンに何を指導すべきか、商談・ロープレ・ナレッジ状況から確認します。"
          action={<Link href="/admin/members" className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">一覧へ戻る</Link>}
        />

        {error || activityError ? <ErrorBox message={error ?? activityError ?? ""} /> : null}

        {member ? (
          <section className="mt-8 rounded-[24px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
            <div className="flex flex-wrap items-center gap-4">
              <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
              <div>
                <div className="text-[22px] font-black tracking-[-0.04em] text-[#171717]">{member.name}</div>
                <div className="mt-1 text-[13px] font-bold text-[#596273]">{member.email || "メール未登録"} ・ {member.workExperienceLabel}</div>
              </div>
              <StatusBadge tone={member.tone} label={member.guidance} />
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <KpiCard label="商談件数" value={`${userMeetings.length}件`} note="このメンバーの商談" />
          <KpiCard label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "商談なし" : "商談結果より算出"} />
          <KpiCard label="ロープレ実施" value={`${userResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={member?.averageScore === null || !member ? "-" : `${member.averageScore}点`} note={member?.averageScore === null ? "結果なし" : "ロープレ結果より算出"} />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="space-y-5">
            <Panel title="商談/通話履歴">
              {userMeetings.length > 0 ? (
                <div className="space-y-3">
                  {userMeetings.slice(0, 8).map((meeting) => (
                    <Link key={meeting.id} href={`/admin/meetings/${meeting.id}`} className="grid gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px]">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{meeting.customerName || "顧客名未設定"}</div>
                        <div className="mt-1 text-[12px] text-[#7a808c]">{meeting.productType || "商材未設定"} ・ {formatDate(meeting.recordedAt)}</div>
                      </div>
                      <StatusBadge tone={getOutcomeTone(meeting.status)} label={getMeetingOutcomeLabel(meeting.status)} />
                      <span className="text-[13px] font-bold text-[#2672d9]">レビュー</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="商談履歴はまだありません" body="音声アップロードや商談登録後、履歴が表示されます。" />
              )}
            </Panel>

            <Panel title="salesの分析結果">
              {userMeetings.some((meeting) => meeting.aiSummary) ? (
                <div className="space-y-3">
                  {userMeetings.filter((meeting) => meeting.aiSummary).map((meeting) => (
                    <div key={meeting.id} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                      <div className="text-[14px] font-black text-[#171717]">{meeting.customerName}</div>
                      <p className="mt-2 text-[13px] leading-6 text-[#596273]">{meeting.aiSummary?.overview}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="salesの分析結果はまだありません" body="商談分析が完了すると、指導用レビューとしてここに表示されます。" />
              )}
            </Panel>

            <Panel title="ロープレ結果">
              {userResults.length > 0 ? (
                <div className="space-y-3">
                  {userResults.slice(0, 6).map((result) => (
                    <div key={result.id} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[14px] font-black text-[#171717]">{result.scenarioTitle}</h3>
                        <span className="rounded-full bg-[#171717] px-3 py-1 text-[12px] font-black text-white">{result.score}点</span>
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#596273]">{result.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="ロープレ結果はまだありません" body="シナリオを実施すると、スコアと改善ポイントが表示されます。" />
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="指導判断">
              <div className="space-y-3">
                <InsightRow label="よくある失注理由" value={lostReason} />
                <InsightRow label="改善ポイント" value={latestRoleplayFeedback} />
                <InsightRow label="ナレッジ作成状況" value={`${userKnowledgeItems.length}件`} />
                <InsightRow label="作成済みナレッジ" value={`${userKnowledgeItems.length}件`} />
              </div>
            </Panel>

            <Panel title="よく検索するワード TOP10">
              {searchWordRows.length > 0 ? (
                <div className="space-y-2">
                  {searchWordRows.map((row, index) => (
                    <div key={row.word} className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ffd84d] text-[12px] font-black text-[#171717]">
                            {index + 1}
                          </span>
                          <span className="truncate text-[14px] font-black text-[#343b48]">{row.word}</span>
                        </div>
                        <span className="text-[13px] font-black text-[#8a6500]">{row.count}回</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[12px] font-bold text-[#8a909b]">
                        <span>未ヒット {row.noResultCount}回</span>
                        <span>最終検索 {formatDate(row.lastSearchedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="検索ワードはまだありません" body="この営業マンがナレッジ検索を行うと、よく検索するワードが表示されます。" />
              )}
            </Panel>

            <Panel title="指導コメントを送信">
              <div className="space-y-3">
                <textarea
                  value={guidanceComment}
                  onChange={(event) => setGuidanceComment(event.target.value)}
                  className="min-h-[120px] w-full resize-y rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none transition focus:border-[#e0bd4b]"
                  placeholder="例：価格説明の前に、相手の現状課題をもう一段深掘りしましょう。次回は導入後の効果から話す練習をしてください。"
                />
                <button
                  type="button"
                  onClick={() => void handleSendGuidanceComment()}
                  disabled={isSendingGuidance}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60"
                >
                  {isSendingGuidance ? "送信中" : "営業マンへ通知する"}
                </button>
                {guidanceMessage ? (
                  <div className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[12px] font-bold leading-5 text-[#596273]">
                    {guidanceMessage}
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel title="次回指導メモ">
              <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 text-[13px] leading-6 text-[#596273]">
                次回テーマ: {latestRoleplayFeedback}
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function buildSearchWordRows(events: SalesActivityEvent[], userId: string) {
  const rows = new Map<string, { count: number; noResultCount: number; lastSearchedAt: Date | null }>();

  events
    .filter((event) => event.userId === userId && event.type === "knowledge_searched")
    .forEach((event) => {
      const word = readString(event.metadata.query);
      if (!word) return;
      const current = rows.get(word) ?? { count: 0, noResultCount: 0, lastSearchedAt: null };
      current.count += 1;
      if (readNumber(event.metadata.resultCount) === 0) {
        current.noResultCount += 1;
      }
      if (!current.lastSearchedAt || (event.createdAt && event.createdAt > current.lastSearchedAt)) {
        current.lastSearchedAt = event.createdAt;
      }
      rows.set(word, current);
    });

  return Array.from(rows.entries())
    .map(([word, row]) => ({ word, ...row }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-[#343b48]">{value === "データなし" ? <Placeholder /> : value}</div>
    </div>
  );
}

function buildLostReason(meetings: MeetingRecord[]) {
  const lostMeetings = meetings.filter((meeting) => meeting.status === "lost");
  if (lostMeetings.length === 0) return "失注商談なし";
  const latest = lostMeetings[0];
  return latest.aiSummary?.bullets[0] ?? latest.aiSummary?.overview ?? "失注商談の詳細を確認";
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full object-cover" />;
  }

  return (
    <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fff3cf] text-[22px] font-black text-[#8a6500]">
      {name.slice(0, 1)}
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
