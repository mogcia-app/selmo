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
  const review = buildMeetingReview(meeting);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="MEETING DETAIL"
          title={meeting?.customerName ?? "商談詳細レビュー"}
          description="salesの分析結果、文字起こし、改善点を指導用レビューとして確認します。"
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

                <Panel title="AI分析結果を確認">
                  {meeting.aiSummary ? (
                    <div className="space-y-3">
                      <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4">
                        <p className="text-[14px] leading-7 text-[#343b48]">{meeting.aiSummary.overview}</p>
                        <ul className="mt-3 space-y-1 text-[13px] leading-6 text-[#596273]">
                          {meeting.aiSummary.bullets.map((bullet) => <li key={bullet}>・{bullet}</li>)}
                        </ul>
                      </div>
                      {meeting.aiSummary.manualCompliance ? (
                        <div className="rounded-[16px] border border-[#f0e3c1] bg-[#fffaf0] px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-[14px] font-black text-[#171717]">salesの分析結果</h3>
                              <p className="mt-1 text-[12px] leading-5 text-[#6f6250]">
                                sales側で作成された分析結果をレビュー用に表示しています。
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="inline-flex rounded-full border border-[#f0d992] bg-white px-3 py-1 text-[12px] font-black text-[#8a6500]">
                                {meeting.aiSummary.manualCompliance.mode === "manual" ? "会社基準: 適用済み" : "会社基準: 未適用"}
                              </span>
                              <div className="mt-2 text-[13px] font-black text-[#8a6500]">
                                準拠スコア {meeting.aiSummary.manualCompliance.score === null ? "-" : `${meeting.aiSummary.manualCompliance.score}点`}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <ReviewList title="salesに表示された達成基準" items={meeting.aiSummary.manualCompliance.matchedCriteria} />
                            <ReviewList title="salesに表示された不足基準" items={meeting.aiSummary.manualCompliance.missingCriteria} />
                            <ReviewList title="商品観点" items={meeting.aiSummary.manualCompliance.productNotes} />
                            <ReviewList title="次回フレーズ" items={meeting.aiSummary.manualCompliance.improvementPhrases} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyState title="salesの分析結果はまだありません" body="sales側で商談分析が完了すると、要点が表示されます。" />
                  )}
                </Panel>
              </div>

              <div className="space-y-5">
                <Panel title="指導用レビュー">
                  <div className="space-y-3">
                    <ReviewRow label="良かった点" value={review.goodPoint} />
                    <ReviewRow label="改善点" value={review.improvementPoint} />
                    <ReviewRow
                      label="会社基準の適用"
                      value={meeting.aiSummary?.manualCompliance?.mode === "manual" ? "適用済み" : meeting.aiSummary ? "未適用" : "分析待ち"}
                    />
                    <ReviewRow label="失注要因" value={meeting.status === "lost" ? review.lostReason : "対象外"} />
                    <ReviewRow label="指導対象フラグ" value={meeting.status === "lost" ? "要確認" : "通常"} />
                  </div>
                </Panel>

                <Panel title="上司コメント">
                  <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 text-[13px] leading-6 text-[#596273]">
                    {review.managerComment}
                  </div>
                </Panel>

                <Panel title="ロープレ課題">
                  <p className="text-[13px] leading-6 text-[#596273]">この商談内容をもとに、営業マンへロープレ課題を割り当てます。</p>
                  <Link href="/admin/roleplay" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717]">
                    ロープレ課題を作成
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
      {isFlag ? <StatusBadge tone="risk" label={value} /> : value === "データなし" ? <Placeholder /> : <span className="text-[13px] font-bold text-[#596273]">{value}</span>}
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[14px] border border-[#f0e3c1] bg-white px-3 py-3">
      <div className="text-[12px] font-black text-[#8a6500]">{title}</div>
      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#596273]">
        {(items.length > 0 ? items : ["未検出"]).map((item) => <li key={item}>・{item}</li>)}
      </ul>
    </div>
  );
}

function buildMeetingReview(meeting: ReturnType<typeof useAdminInsights>["meetings"][number] | undefined) {
  const compliance = meeting?.aiSummary?.manualCompliance;
  const firstBullet = meeting?.aiSummary?.bullets[0] ?? meeting?.aiSummary?.overview ?? "分析結果を確認してください";
  const goodPoint = compliance?.matchedCriteria[0] ?? firstBullet;
  const improvementPoint = compliance?.missingCriteria[0] ?? compliance?.improvementPhrases[0] ?? meeting?.aiSummary?.bullets[1] ?? "次回アクションを確認";
  const lostReason = meeting?.aiSummary?.bullets.find((bullet) => /不安|懸念|価格|高い|競合|検討/.test(bullet)) ?? firstBullet;

  return {
    goodPoint,
    improvementPoint,
    lostReason,
    managerComment: `次回の指導では「${improvementPoint}」を中心に確認してください。`,
  };
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
