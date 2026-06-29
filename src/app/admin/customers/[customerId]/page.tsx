"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  subscribeToCustomer,
  subscribeToCustomerLogs,
  type CustomerLogRecord,
  type CustomerRecord,
} from "@/lib/firebase/customers";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";

const completedActionLogTitle = "完了";

export default function AdminCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const { profile } = useAuth();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [logs, setLogs] = useState<CustomerLogRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!params.customerId) return;
    return subscribeToCustomer(
      params.customerId,
      setCustomer,
      (nextError: FirebaseError) => setErrorMessage(nextError.message),
    );
  }, [params.customerId]);

  useEffect(() => {
    if (!profile?.companyId || !profile.uid || !params.customerId) {
      setLogs([]);
      setMeetings([]);
      return;
    }

    const unsubscribers = [
      subscribeToCustomerLogs(
        { companyId: profile.companyId, customerId: params.customerId, isAdmin: true },
        setLogs,
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
      subscribeToMeetings(
        { role: "admin", userId: profile.uid, companyId: profile.companyId },
        setMeetings,
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [params.customerId, profile?.companyId, profile?.uid]);

  const completedActionLogs = useMemo(() => logs.filter(isCompletedActionLog), [logs]);
  const timelineLogs = useMemo(() => logs.filter((log) => !isCompletedActionLog(log)), [logs]);
  const relatedMeetings = useMemo(() => {
    if (!customer) return [];
    const normalizedName = customer.companyName.trim().toLowerCase();
    return meetings
      .filter((meeting) => meeting.customerName.trim().toLowerCase() === normalizedName)
      .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0));
  }, [customer, meetings]);

  if (!customer) {
    return (
      <main className="bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          {errorMessage ? <MessageBox tone="risk" message={errorMessage} /> : null}
          <EmptyState title="顧客カルテを読み込み中です" body="表示できない場合は、メンバー詳細またはダッシュボードから開き直してください。" />
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a6500]">Customer Monitor</p>
            <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{customer.companyName || "会社名未設定"}</h1>
            <p className="mt-2 text-[13px] leading-6 text-[#596273]">
              先方担当者: {customer.contactName || "未設定"} ・ 担当営業: {customer.assignedUserName || "未設定"}
            </p>
          </div>
          <Link href={`/admin/members/${customer.assignedUserId}`} className="rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-black text-[#343b48]">
            担当営業ページへ
          </Link>
        </div>

        {errorMessage ? <MessageBox tone="risk" message={errorMessage} /> : null}

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <KpiCard label="現在ステータス" value={readStatusLabel(customer.status)} note="営業状況" />
          <KpiCard label="温度感" value={readTemperatureLabel(customer.temperature)} note="営業判断" tone={customer.temperature === "high" ? "risk" : "normal"} />
          <KpiCard label="契約状況" value={readContractStatusLabel(customer.contractStatus)} note={customer.contractPlan || "契約情報"} tone={customer.contractStatus === "contracted" ? "good" : customer.contractStatus === "needs_consultation" ? "risk" : "normal"} />
          <KpiCard label="関連商談" value={`${relatedMeetings.length}件`} note="顧客名一致の商談" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
          <div className="space-y-5">
            <Panel title="引き継ぎサマリー">
              <CustomerStory customer={customer} />
            </Panel>

            <Panel title="基本情報">
              <InfoGrid rows={[
                ["会社名", customer.companyName],
                ["先方担当者名", customer.contactName || "未設定"],
                ["電話番号", customer.phone || "未設定"],
                ["メールアドレス", customer.email || "未設定"],
                ["業種", customer.industry || "未設定"],
                ["従業員数", customer.employeeCount === null ? "未設定" : `${customer.employeeCount}人`],
                ["商材", customer.productNames.length > 0 ? customer.productNames.join(" / ") : "未設定"],
                ["担当営業", customer.assignedUserName || "未設定"],
                ["共同担当・同行者", customer.collaboratorUserNames.length > 0 ? customer.collaboratorUserNames.join(" / ") : "未設定"],
              ]} />
            </Panel>

            <Panel title="営業状況・契約情報">
              <InfoGrid rows={[
                ["現在ステータス", readStatusLabel(customer.status)],
                ["見込み金額", formatCurrency(customer.expectedAmount)],
                ["失注理由", customer.lostReason || "未設定"],
                ["現在の次回アクション", customer.nextActionTitle || "未設定"],
                ["次回アクション予定日", formatDate(customer.nextActionDate)],
                ["最終接触日", formatDate(customer.lastContactDate)],
                ["契約状況", readContractStatusLabel(customer.contractStatus)],
                ["契約開始日", formatDate(customer.contractStartDate)],
                ["契約プラン", customer.contractPlan || "未設定"],
                ["月額金額", formatCurrency(customer.monthlyAmount)],
                ["契約更新予定日", formatDate(customer.renewalDate)],
                ["解約リスク", readChurnRiskLabel(customer.churnRisk)],
              ]} />
            </Panel>

            <Panel title="関連商談">
              <MeetingHistory meetings={relatedMeetings} />
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="現在の次回アクション">
              <CurrentNextAction actionTitle={customer.nextActionTitle} actionDate={customer.nextActionDate} />
            </Panel>

            <Panel title="完了したアクション履歴">
              <CompletedActionHistory logs={completedActionLogs} />
            </Panel>

            <Panel title="タイムライン">
              <Timeline logs={timelineLogs} />
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[16px] border border-[#e4e8ef] bg-white shadow-[0_6px_16px_rgba(17,24,39,0.04)]">
      <div className="border-b border-[#eef1f5] px-4 py-3.5">
        <h2 className="text-[16px] font-black text-[#171717]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, note, tone = "normal" }: { label: string; value: string; note: string; tone?: "normal" | "good" | "risk" }) {
  const valueClass = tone === "good" ? "text-[#16834f]" : tone === "risk" ? "text-[#d63c2f]" : "text-[#171717]";
  return (
    <div className="rounded-[16px] border border-[#e4e8ef] bg-white px-4 py-4 shadow-[0_6px_16px_rgba(17,24,39,0.04)]">
      <div className="text-[12px] font-black text-[#596273]">{label}</div>
      <div className={`mt-2 text-[26px] font-black tracking-[-0.03em] ${valueClass}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold text-[#8a909b]">{note}</div>
    </div>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
          <div className="mt-1 whitespace-pre-wrap text-[13px] font-black leading-6 text-[#343b48]">{value}</div>
        </div>
      ))}
    </div>
  );
}

function CustomerStory({ customer }: { customer: CustomerRecord }) {
  const rows = [
    ["初回接点・背景", customer.firstTouchMemo],
    ["顧客像・課題", customer.customerContext],
    ["今後の方針", customer.salesDirection],
    ["引き継ぎメモ", customer.handoffMemo],
  ];
  const hasStory = rows.some(([, value]) => value.trim());

  if (!hasStory) {
    return <EmptyState title="顧客の文脈はまだ未入力です" body="担当営業側で初回接点・顧客像・今後の方針が入力されると、ここで監視できます。" />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] font-bold leading-6 text-[#343b48]">{value || "未設定"}</p>
        </div>
      ))}
    </div>
  );
}

function CurrentNextAction({ actionTitle, actionDate }: { actionTitle: string; actionDate: Date | null }) {
  if (!actionTitle && !actionDate) {
    return <EmptyState title="現在の次回アクションはありません" body="担当営業が次のタスクを設定すると表示されます。" />;
  }

  return (
    <div className="rounded-[12px] border border-[#f0c655] bg-[#fffaf0] px-4 py-3">
      <div className="text-[12px] font-black text-[#8a6500]">現在のタスク</div>
      <div className="mt-1 text-[15px] font-black leading-6 text-[#171717]">{actionTitle || "内容未設定"}</div>
      <div className="mt-1 text-[12px] font-bold text-[#8a909b]">予定日: {formatDate(actionDate)}</div>
    </div>
  );
}

function CompletedActionHistory({ logs }: { logs: CustomerLogRecord[] }) {
  if (logs.length === 0) {
    return <EmptyState title="完了したアクションはまだありません" body="担当営業がタスクを完了すると、ここに履歴が残ります。" />;
  }

  return (
    <div className="max-h-[360px] space-y-3 overflow-auto pr-1">
      {logs.map((log) => (
        <div key={log.id} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-black text-[#171717]">{stripCompletedActionLogPrefix(log.title) || "未設定"}</div>
              <div className="mt-1 text-[12px] font-bold text-[#8a909b]">完了日: {formatDate(log.actionDate ?? log.createdAt)}</div>
            </div>
            <span className="rounded-full bg-[#edf7f0] px-3 py-1 text-[12px] font-black text-[#16834f]">完了</span>
          </div>
          {log.body ? <p className="mt-2 whitespace-pre-wrap text-[12px] font-bold leading-6 text-[#596273]">{log.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Timeline({ logs }: { logs: CustomerLogRecord[] }) {
  if (logs.length === 0) return <EmptyState title="ログはまだありません" body="電話・メール・商談・メモなどの活動ログがここに表示されます。" />;
  return (
    <div className="max-h-[460px] space-y-3 overflow-auto pr-1">
      {logs.map((log) => (
        <div key={log.id} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-black text-[#171717]">{log.title}</div>
              <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{readLogTypeLabel(log.type)} ・ {formatDate(log.actionDate ?? log.createdAt)}</div>
            </div>
            <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-[12px] font-black text-[#8a6500]">{readLogTypeLabel(log.type)}</span>
          </div>
          {log.body ? <p className="mt-2 whitespace-pre-wrap text-[13px] font-bold leading-6 text-[#596273]">{log.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

function MeetingHistory({ meetings }: { meetings: MeetingRecord[] }) {
  if (meetings.length === 0) return <EmptyState title="関連商談はまだありません" body="同じ顧客名の商談が登録されると表示されます。" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead className="bg-[#fcfcfd]">
          <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
            <th className="px-3 py-3 font-bold">商談日</th>
            <th className="px-3 py-3 font-bold">商談タイトル</th>
            <th className="px-3 py-3 font-bold">ステータス</th>
            <th className="px-3 py-3 font-bold"></th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr key={meeting.id} className="border-b border-[#f0f2f6] last:border-b-0">
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{formatDate(meeting.recordedAt)}</td>
              <td className="px-3 py-3 text-[13px] font-black text-[#171717]">{meeting.customerName || meeting.productType || "未設定"}</td>
              <td className="px-3 py-3 text-[12px] font-black text-[#8a6500]">{meeting.status || "未設定"}</td>
              <td className="px-3 py-3 text-right">
                <Link href={`/admin/meetings/${meeting.id}`} className="rounded-[9px] border border-[#ead8a8] bg-[#fffaf0] px-3 py-2 text-[12px] font-black text-[#8a6500]">分析</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
      <h3 className="text-[16px] font-black text-[#171717]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function MessageBox({ message, tone }: { message: string; tone: "good" | "risk" }) {
  return <div className={`mt-5 rounded-[12px] border px-4 py-3 text-[13px] font-bold ${tone === "good" ? "border-[#ccebd8] bg-[#f4fbf6] text-[#16834f]" : "border-[#f4d4d4] bg-[#fff8f8] text-[#b4232a]"}`}>{message}</div>;
}

function isCompletedActionLog(log: CustomerLogRecord) {
  return log.type === "follow" && log.title.startsWith(`${completedActionLogTitle}:`);
}

function stripCompletedActionLogPrefix(title: string) {
  return title.startsWith(`${completedActionLogTitle}:`) ? title.slice(`${completedActionLogTitle}:`.length).trim() : title;
}

function readLogTypeLabel(type: CustomerLogRecord["type"]) {
  const labels: Record<CustomerLogRecord["type"], string> = {
    teleapo: "テレアポ",
    meeting: "商談",
    email: "メール",
    quote: "見積送付",
    contract: "契約",
    follow: "フォロー",
    memo: "メモ",
  };
  return labels[type] ?? "メモ";
}

function readStatusLabel(status: CustomerRecord["status"]) {
  const labels: Record<CustomerRecord["status"], string> = {
    not_contacted: "未接触",
    called: "テレアポ済",
    meeting_scheduled: "商談予定",
    meeting_done: "商談済",
    proposal: "提案中",
    contracted: "契約中",
    lost: "失注",
    dormant: "休眠",
  };
  return labels[status] ?? "未接触";
}

function readTemperatureLabel(temperature: CustomerRecord["temperature"]) {
  const labels: Record<CustomerRecord["temperature"], string> = { high: "高", middle: "中", low: "低" };
  return labels[temperature] ?? "中";
}

function readChurnRiskLabel(risk: CustomerRecord["churnRisk"]) {
  const labels: Record<CustomerRecord["churnRisk"], string> = { high: "高", middle: "中", low: "低" };
  return labels[risk] ?? "低";
}

function readContractStatusLabel(status: CustomerRecord["contractStatus"]) {
  const labels: Record<CustomerRecord["contractStatus"], string> = {
    not_contracted: "未契約",
    considering: "検討中",
    needs_consultation: "要相談",
    contracted: "契約中",
    paused: "保留",
    cancelled: "解約",
  };
  return labels[status] ?? "未契約";
}

function formatDate(date: Date | null) {
  if (!date) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatCurrency(value: number | null) {
  if (value === null) return "未設定";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}
