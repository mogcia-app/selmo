"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  formatDate,
  getMeetingOutcomeLabel,
  getMeetingScore,
  getOutcomeTone,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminMeetingsPage() {
  const { meetings, memberRows, error } = useAdminInsights();
  const [memberId, setMemberId] = useState("");
  const [product, setProduct] = useState("");
  const [outcome, setOutcome] = useState("");
  const [sort, setSort] = useState("date");
  const products = useMemo(() => Array.from(new Set(meetings.map((meeting) => meeting.productType).filter(Boolean))), [meetings]);
  const filteredMeetings = useMemo(() => {
    const rows = meetings.filter((meeting) => {
      if (memberId && meeting.userId !== memberId) return false;
      if (product && meeting.productType !== product) return false;
      if (outcome && meeting.status !== outcome) return false;
      return true;
    });

    if (sort === "score") {
      return [...rows].sort((left, right) => String(getMeetingScore(right)).localeCompare(String(getMeetingScore(left))));
    }
    return rows;
  }, [meetings, memberId, outcome, product, sort]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader eyebrow="MEETING REVIEW" title="商談レビュー" description="全営業マンの商談・通話を確認し、要確認の商談を見つけます。" />
        {error ? <ErrorBox message={error} /> : null}

        <Panel title="フィルター">
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={memberId} onChange={setMemberId} options={[["", "営業マンすべて"], ...memberRows.map((member) => [member.id, member.name] as [string, string])]} />
            <Select value={product} onChange={setProduct} options={[["", "商材すべて"], ...products.map((item) => [item, item] as [string, string])]} />
            <Select value={outcome} onChange={setOutcome} options={[["", "結果すべて"], ["won", "成約"], ["lost", "失注"], ["considering", "検討中"]]} />
            <Select value={sort} onChange={setSort} options={[["date", "新しい順"], ["score", "スコア順"]]} />
          </div>
        </Panel>

        <Panel title="商談一覧">
          {filteredMeetings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
                    <th className="px-4 py-3 font-bold">顧客</th>
                    <th className="px-4 py-3 font-bold">営業マン</th>
                    <th className="px-4 py-3 font-bold">商材</th>
                    <th className="px-4 py-3 font-bold">結果</th>
                    <th className="px-4 py-3 font-bold">スコア</th>
                    <th className="px-4 py-3 font-bold">要確認</th>
                    <th className="px-4 py-3 font-bold">実施日</th>
                    <th className="px-4 py-3 font-bold">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeetings.map((meeting) => {
                    const member = memberRows.find((row) => row.id === meeting.userId);
                    const needsReview = meeting.status === "lost" || meeting.processingStatus === "failed";
                    return (
                      <tr key={meeting.id} className="border-b border-[#f0f2f6] last:border-b-0">
                        <td className="px-4 py-4 text-[14px] font-black text-[#171717]">{meeting.customerName || "未設定"}</td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{member?.name ?? "未設定"}</td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{meeting.productType || "未設定"}</td>
                        <td className="px-4 py-4"><StatusBadge tone={getOutcomeTone(meeting.status)} label={getMeetingOutcomeLabel(meeting.status)} /></td>
                        <td className="px-4 py-4"><Placeholder>{getMeetingScore(meeting)}</Placeholder></td>
                        <td className="px-4 py-4">{needsReview ? <StatusBadge tone="risk" label="要確認" /> : <StatusBadge tone="normal" label="通常" />}</td>
                        <td className="px-4 py-4 text-[13px] text-[#596273]">{formatDate(meeting.recordedAt)}</td>
                        <td className="px-4 py-4"><Link href={`/admin/meetings/${meeting.id}`} className="text-[13px] font-bold text-[#2672d9]">レビュー</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="商談はまだありません" body="音声アップロードや商談登録後、一覧に表示されます。" />
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]">
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
