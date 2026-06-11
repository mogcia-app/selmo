"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

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

export default function AdminMemberDetailPage() {
  const params = useParams<{ userId: string }>();
  const { memberRows, salesUsers, meetings, roleplayResults, knowledgeItems, error } = useAdminInsights();
  const member = memberRows.find((row) => row.id === params.userId);
  const profile = salesUsers.find((user) => user.uid === params.userId);
  const userMeetings = meetings.filter((meeting) => meeting.userId === params.userId);
  const userResults = roleplayResults.filter((result) => result.userId === params.userId);
  const winRate = calcWinRate(userMeetings);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEMBER DETAIL"
          title={member?.name ?? profile?.name ?? "営業マン詳細"}
          description="この営業マンに何を指導すべきか、商談・ロープレ・ナレッジ状況から確認します。"
          action={<Link href="/admin/members" className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">一覧へ戻る</Link>}
        />

        {error ? <ErrorBox message={error} /> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <KpiCard label="商談件数" value={`${userMeetings.length}件`} note="このメンバーの商談" />
          <KpiCard label="成約率" value={winRate === null ? "-" : `${winRate}%`} note={winRate === null ? "集計準備中" : "商談結果より算出"} />
          <KpiCard label="ロープレ実施" value={`${userResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={member?.averageScore === null || !member ? "-" : `${member.averageScore}点`} note={member?.averageScore === null ? "集計準備中" : "ロープレ結果より算出"} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
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
                <InsightRow label="よくある失注理由" value="集計準備中" />
                <InsightRow label="改善ポイント" value={member?.guidance ?? "集計準備中"} />
                <InsightRow label="ナレッジ閲覧状況" value="集計準備中" />
                <InsightRow label="作成済みナレッジ" value={`${knowledgeItems.filter((item) => item.ownerId === params.userId).length}件`} />
              </div>
            </Panel>

            <Panel title="上司メモ">
              <textarea className="min-h-[150px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#e0bd4b]" placeholder="指導時のメモを入力" />
              <p className="mt-2 text-[12px] text-[#8a909b]">メモ保存は次フェーズで実装予定です。</p>
            </Panel>

            <Panel title="次回指導メモ">
              <textarea className="min-h-[150px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#e0bd4b]" placeholder="次回1on1や育成テーマを入力" />
              <p className="mt-2 text-[12px] text-[#8a909b]">保存先は未設計のため、現在は入力欄のみです。</p>
            </Panel>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-[#343b48]">{value === "集計準備中" ? <Placeholder /> : value}</div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
