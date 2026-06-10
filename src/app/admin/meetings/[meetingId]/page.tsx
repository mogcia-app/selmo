"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  formatDateTime,
  getMeetingOutcomeLabel,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminMeetingDetailPage() {
  const params = useParams<{ meetingId: string }>();
  const { meetings, memberRows, error } = useAdminInsights();
  const meeting = meetings.find((item) => item.id === params.meetingId);
  const member = meeting ? memberRows.find((row) => row.id === meeting.userId) : null;
  const transcript = meeting?.transcriptBlocks?.map((block) => block.text).join("\n\n") || meeting?.transcriptionProbeText || "";

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEETING DETAIL"
          title={meeting?.customerName ?? "商談詳細レビュー"}
          description="文字起こし、AI要約、改善点を確認し、指導対象にするか判断します。"
          action={<Link href="/admin/meetings" className="rounded-[14px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">一覧へ戻る</Link>}
        />
        {error ? <ErrorBox message={error} /> : null}

        {meeting ? (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-4">
              <InfoCard label="営業マン" value={member?.name ?? "未設定"} />
              <InfoCard label="商材" value={meeting.productType || "未設定"} />
              <InfoCard label="結果" value={getMeetingOutcomeLabel(meeting.status)} />
              <InfoCard label="実施日時" value={formatDateTime(meeting.recordedAt)} />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
              <div className="space-y-5">
                <Panel title="文字起こし本文">
                  {transcript ? (
                    <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 text-[14px] leading-7 text-[#343b48]">
                      {transcript}
                    </div>
                  ) : (
                    <EmptyState title="文字起こしはまだありません" body="文字起こし処理が完了すると本文が表示されます。" />
                  )}
                </Panel>

                <Panel title="AI要約">
                  {meeting.aiSummary ? (
                    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                      <p className="text-[14px] leading-7 text-[#343b48]">{meeting.aiSummary.overview}</p>
                      <ul className="mt-3 space-y-1 text-[13px] leading-6 text-[#596273]">
                        {meeting.aiSummary.bullets.map((bullet) => <li key={bullet}>・{bullet}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <EmptyState title="AI要約はまだありません" body="AI要約を実行すると、要点が表示されます。" />
                  )}
                </Panel>
              </div>

              <div className="space-y-5">
                <Panel title="レビュー観点">
                  <div className="space-y-3">
                    <ReviewRow label="良かった点" value="集計準備中" />
                    <ReviewRow label="改善点" value="集計準備中" />
                    <ReviewRow label="マニュアル準拠状況" value={meeting.conversationLogStatus === "completed" ? "集計準備中" : "分析待ち"} />
                    <ReviewRow label="失注要因" value={meeting.status === "lost" ? "集計準備中" : "対象外"} />
                    <ReviewRow label="指導対象フラグ" value={meeting.status === "lost" ? "要確認" : "通常"} />
                  </div>
                </Panel>

                <Panel title="上司コメント">
                  <textarea className="min-h-[150px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 outline-none focus:border-[#e0bd4b]" placeholder="この商談へのコメントを入力" />
                  <p className="mt-2 text-[12px] text-[#8a909b]">コメント保存は次フェーズで実装予定です。</p>
                </Panel>

                <Panel title="ロープレ課題">
                  <p className="text-[13px] leading-6 text-[#596273]">この商談内容をもとに、ロープレシナリオへ変換できます。</p>
                  <Link href="/admin/roleplay" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717]">
                    ロープレ課題に変換
                  </Link>
                </Panel>
              </div>
            </section>
          </>
        ) : (
          <div className="mt-6">
            <EmptyState title="商談が見つかりません" body="削除されたか、まだ読み込みが完了していない商談です。" />
          </div>
        )}
      </div>
    </PageShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-2 text-[18px] font-black text-[#171717]">{value}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const isFlag = value === "要確認";
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <span className="text-[13px] font-bold text-[#343b48]">{label}</span>
      {isFlag ? <StatusBadge tone="risk" label={value} /> : value === "集計準備中" ? <Placeholder /> : <span className="text-[13px] font-bold text-[#596273]">{value}</span>}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
