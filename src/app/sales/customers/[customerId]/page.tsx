"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  createCustomerLog,
  createCustomerMeetingLink,
  subscribeToCustomer,
  subscribeToCustomerLogs,
  subscribeToCustomerMeetings,
  updateCustomer,
  updateCustomerNextAction,
  type CustomerChurnRisk,
  type CustomerContractStatus,
  type CustomerLogRecord,
  type CustomerLogType,
  type CustomerRecord,
  type CustomerStatus,
  type CustomerTemperature,
  type SaveCustomerInput,
} from "@/lib/firebase/customers";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { createAppNotification } from "@/lib/firebase/notifications";
import { canUseSalesDomain } from "@/lib/sales-domains";

const statusOptions: Array<{ value: CustomerStatus; label: string }> = [
  { value: "not_contacted", label: "未接触" },
  { value: "called", label: "テレアポ済" },
  { value: "meeting_scheduled", label: "商談予定" },
  { value: "meeting_done", label: "商談済" },
  { value: "proposal", label: "提案中" },
  { value: "contracted", label: "契約中" },
  { value: "lost", label: "失注" },
  { value: "dormant", label: "休眠" },
];

const temperatureOptions: Array<{ value: CustomerTemperature; label: string }> = [
  { value: "high", label: "高" },
  { value: "middle", label: "中" },
  { value: "low", label: "低" },
];

const churnRiskOptions: Array<{ value: CustomerChurnRisk; label: string }> = [
  { value: "low", label: "低" },
  { value: "middle", label: "中" },
  { value: "high", label: "高" },
];

const contractStatusOptions: Array<{ value: CustomerContractStatus; label: string }> = [
  { value: "not_contracted", label: "未契約" },
  { value: "considering", label: "検討中" },
  { value: "needs_consultation", label: "要相談" },
  { value: "contracted", label: "契約中" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "解約" },
];

const logTypeOptions: Array<{ value: CustomerLogType; label: string }> = [
  { value: "teleapo", label: "テレアポ" },
  { value: "meeting", label: "商談" },
  { value: "email", label: "メール" },
  { value: "quote", label: "見積送付" },
  { value: "contract", label: "契約" },
  { value: "follow", label: "フォロー" },
  { value: "memo", label: "メモ" },
];

const completedActionLogTitle = "完了";

type CustomerFormState = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  employeeCount: string;
  collaboratorUserIds: string[];
  productIds: string[];
  status: CustomerStatus;
  temperature: CustomerTemperature;
  expectedAmount: string;
  lostReason: string;
  nextActionTitle: string;
  nextActionDate: string;
  lastContactDate: string;
  firstTouchMemo: string;
  customerContext: string;
  salesDirection: string;
  handoffMemo: string;
  memo: string;
  contractStatus: CustomerContractStatus;
  contractStartDate: string;
  contractPlan: string;
  monthlyAmount: string;
  renewalDate: string;
  churnRisk: CustomerChurnRisk;
};

export default function SalesCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const { profile } = useAuth();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [salesUsers, setSalesUsers] = useState<AppUserProfile[]>([]);
  const [logs, setLogs] = useState<CustomerLogRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [linkedMeetingIds, setLinkedMeetingIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<CustomerFormState | null>(null);
  const [logType, setLogType] = useState<CustomerLogType>("memo");
  const [logTitle, setLogTitle] = useState("");
  const [logBody, setLogBody] = useState("");
  const [logActionDate, setLogActionDate] = useState("");
  const [completedActionDate, setCompletedActionDate] = useState(getTodayInputValue);
  const [completedActionMemo, setCompletedActionMemo] = useState("");
  const [followingActionTitle, setFollowingActionTitle] = useState("");
  const [followingActionDate, setFollowingActionDate] = useState("");
  const allowedSalesDomains = useMemo(
    () => [
      ...(canUseSalesDomain(profile, "meeting") ? (["meeting"] as const) : []),
      ...(canUseSalesDomain(profile, "teleapo") ? (["teleapo"] as const) : []),
    ],
    [profile],
  );

  useEffect(() => {
    if (!params.customerId) return;
    return subscribeToCustomer(
      params.customerId,
      (nextCustomer) => {
        setCustomer(nextCustomer);
        if (nextCustomer) {
          setFormState(buildFormState(nextCustomer));
        }
      },
      (nextError: FirebaseError) => setErrorMessage(nextError.message),
    );
  }, [params.customerId]);

  useEffect(() => {
    if (!profile?.companyId || !params.customerId || !profile.uid) return;
    const unsubscribers = [
      subscribeToCustomerLogs(
        { companyId: profile.companyId, customerId: params.customerId, isAdmin: true },
        setLogs,
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
      subscribeToCustomerMeetings(
        { companyId: profile.companyId, customerId: params.customerId },
        (links) => setLinkedMeetingIds(links.map((link) => link.meetingId)),
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
      subscribeToMeetings(
        {
          role: "sales",
          userId: profile.uid,
          companyId: profile.companyId,
          salesDomains: allowedSalesDomains,
        },
        setMeetings,
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [allowedSalesDomains, params.customerId, profile?.companyId, profile?.uid]);

  useEffect(() => {
    if (!profile?.companyId) {
      setProducts([]);
      setSalesUsers([]);
      return;
    }
    const unsubscribers = [
      subscribeToKnowledgeProducts(
        profile.companyId,
        setProducts,
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
      ),
      subscribeToUserProfiles(
        (profiles) => setSalesUsers(profiles.filter((user) => user.role === "sales" && user.status === "active")),
        (nextError: FirebaseError) => setErrorMessage(nextError.message),
        profile.companyId,
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [profile?.companyId]);

  const relatedMeetings = useMemo(() => {
    if (!customer) return [];
    const normalizedName = customer.companyName.trim().toLowerCase();
    return meetings
      .filter((meeting) => linkedMeetingIds.includes(meeting.id) || (!!normalizedName && meeting.customerName.trim().toLowerCase() === normalizedName))
      .sort((left, right) => (right.recordedAt?.getTime() ?? 0) - (left.recordedAt?.getTime() ?? 0));
  }, [customer, linkedMeetingIds, meetings]);

  const completedActionLogs = useMemo(() => logs.filter(isCompletedActionLog), [logs]);
  const timelineLogs = useMemo(() => logs.filter((log) => !isCompletedActionLog(log)), [logs]);

  const linkCandidates = useMemo(() => {
    if (!customer) return [];
    return meetings
      .filter((meeting) => !linkedMeetingIds.includes(meeting.id))
      .filter((meeting) => meeting.customerName || meeting.productType)
      .slice(0, 8);
  }, [customer, linkedMeetingIds, meetings]);

  async function handleUpdateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !formState) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextCustomerInput = buildCustomerInput(formState, products, salesUsers, customer);
      await updateCustomer(customer.id, nextCustomerInput);
      if (profile?.uid) {
        await notifyCustomerMembers({
          customer,
          extraUserIds: nextCustomerInput.collaboratorUserIds,
          actorUserId: profile.uid,
          actorName: profile.name ?? profile.email ?? "担当者",
          title: "顧客カルテが更新されました",
        });
      }
      setIsEditing(false);
      setSuccessMessage("顧客カルテを更新しました。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "顧客カルテの更新に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !profile?.uid || !profile.companyId) return;
    if (!logTitle.trim()) {
      setErrorMessage("ログタイトルを入力してください。");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await createCustomerLog({
        companyId: profile.companyId,
        customerId: customer.id,
        userId: customer.assignedUserId,
        type: logType,
        title: logTitle.trim(),
        body: logBody.trim(),
        actionDate: readOptionalDate(logActionDate),
        createdBy: profile.uid,
      });
      setLogTitle("");
      setLogBody("");
      setLogActionDate("");
      setLogType("memo");
      setSuccessMessage("タイムラインログを追加しました。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ログ追加に失敗しました。");
    }
  }

  async function handleCompleteNextAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !profile?.uid) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    const hasCurrentNextAction = Boolean(customer.nextActionTitle.trim() || customer.nextActionDate);
    const completedDateValue = readOptionalDate(completedActionDate) ?? new Date();
    const followingActionTitleValue = followingActionTitle.trim();
    const followingActionDateValue = readOptionalDate(followingActionDate);

    if (!hasCurrentNextAction && !followingActionTitleValue && !followingActionDateValue) {
      setErrorMessage("次のアクション内容か予定日を入力してください。");
      return;
    }

    try {
      if (hasCurrentNextAction) {
        await createCompletedActionLog({
          customer,
          createdBy: profile.uid,
          completedDate: completedDateValue,
          memo: completedActionMemo.trim(),
          nextTitle: followingActionTitleValue,
          nextDate: followingActionDateValue,
        });
      }
      await updateCustomerNextAction(customer.id, {
        nextActionTitle: followingActionTitleValue,
        nextActionDate: followingActionDateValue,
        ...(hasCurrentNextAction ? { lastContactDate: completedDateValue } : {}),
      });
      await notifyCustomerMembers({
        customer,
        actorUserId: profile.uid,
        actorName: profile.name ?? profile.email ?? "担当者",
        title: hasCurrentNextAction ? "顧客アクションが完了されました" : "次回アクションが設定されました",
      });
      setCompletedActionDate(getTodayInputValue());
      setCompletedActionMemo("");
      setFollowingActionTitle("");
      setFollowingActionDate("");
      setSuccessMessage(
        hasCurrentNextAction
          ? followingActionTitleValue ? "アクションを完了し、次のアクションを設定しました。" : "アクションを完了しました。"
          : "次のアクションを設定しました。",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "アクション完了の保存に失敗しました。");
    }
  }

  async function handleLinkMeeting(meetingId: string) {
    if (!customer || !profile?.companyId) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await createCustomerMeetingLink({ companyId: profile.companyId, customerId: customer.id, meetingId });
      setSuccessMessage("商談履歴を紐付けました。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "商談履歴の紐付けに失敗しました。");
    }
  }

  if (!customer) {
    return (
      <main className="bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <EmptyState title="顧客カルテを読み込み中です" body="表示できない場合は、一覧からもう一度開いてください。" />
        </div>
      </main>
    );
  }

  const contractMonths = calcContractMonths(customer.contractStartDate);
  const aiAverage = calcMeetingAverageScore(relatedMeetings);
  const hasCurrentNextAction = Boolean(customer.nextActionTitle.trim() || customer.nextActionDate);

  return (
    <main className="bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a6500]">Customer Karte</p>
            <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">{customer.companyName}</h1>
            <p className="mt-2 text-[13px] leading-6 text-[#596273]">
              先方担当者: {customer.contactName || "未設定"} ・ 担当営業: {customer.assignedUserName || "未設定"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/customers" className="rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-black text-[#343b48]">一覧へ戻る</Link>
            <button type="button" onClick={() => setIsEditing((current) => !current)} className="rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 py-3 text-[13px] font-black text-[#171717]">
              {isEditing ? "編集を閉じる" : "編集"}
            </button>
          </div>
        </div>

        {errorMessage ? <MessageBox tone="risk" message={errorMessage} /> : null}
        {successMessage ? <MessageBox tone="good" message={successMessage} /> : null}

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <KpiCard label="現在ステータス" value={readStatusLabel(customer.status)} note="営業状況" />
          <KpiCard label="温度感" value={readTemperatureLabel(customer.temperature)} note="営業判断" tone={customer.temperature === "high" ? "risk" : "normal"} />
          <KpiCard label="契約状況" value={readContractStatusLabel(customer.contractStatus)} note={contractMonths === null ? "契約開始日未設定" : `${contractMonths}ヶ月経過`} tone={customer.contractStatus === "contracted" ? "good" : customer.contractStatus === "needs_consultation" ? "risk" : "normal"} />
          <KpiCard label="商談AI平均" value={aiAverage === null ? "-" : `${aiAverage}点`} note={`${relatedMeetings.length}件の履歴`} />
        </section>

        {isEditing && formState ? (
          <section className="mt-5 rounded-[16px] border border-[#e4e8ef] bg-white p-5 shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
            <h2 className="text-[18px] font-black text-[#171717]">顧客カルテ編集</h2>
            <CustomerForm formState={formState} onChange={setFormState} onSubmit={handleUpdateCustomer} submitLabel={isSaving ? "保存中" : "保存"} disabled={isSaving} products={products} salesUsers={salesUsers} currentUserId={profile?.uid ?? ""} />
          </section>
        ) : null}

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
                ["メモ", customer.memo || "未設定"],
              ]} />
            </Panel>

            <Panel title="営業状況">
              <InfoGrid rows={[
                ["現在ステータス", readStatusLabel(customer.status)],
                ["温度感", readTemperatureLabel(customer.temperature)],
                ["見込み金額", formatCurrency(customer.expectedAmount)],
                ["失注理由", customer.lostReason || "未設定"],
                ["次回アクション", customer.nextActionTitle || "未設定"],
                ["次回アクション予定日", formatDate(customer.nextActionDate)],
                ["最終接触日", formatDate(customer.lastContactDate)],
              ]} />
            </Panel>

            <Panel title="契約情報">
              <InfoGrid rows={[
                ["契約状況", readContractStatusLabel(customer.contractStatus)],
                ["契約開始日", formatDate(customer.contractStartDate)],
                ["契約プラン", customer.contractPlan || "未設定"],
                ["月額金額", formatCurrency(customer.monthlyAmount)],
                ["契約経過月数", contractMonths === null ? "未設定" : `${contractMonths}ヶ月`],
                ["契約更新予定日", formatDate(customer.renewalDate)],
                ["解約リスク", readChurnRiskLabel(customer.churnRisk)],
              ]} />
            </Panel>

            <Panel title="商談履歴">
              <MeetingHistory meetings={relatedMeetings} />
              {linkCandidates.length > 0 ? (
                <div className="mt-4 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] p-3">
                  <div className="text-[13px] font-black text-[#171717]">商談履歴を紐付け</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {linkCandidates.map((meeting) => (
                      <button key={meeting.id} type="button" onClick={() => void handleLinkMeeting(meeting.id)} className="rounded-[9px] border border-[#e2e6ee] bg-white px-3 py-2 text-[12px] font-black text-[#343b48]">
                        {meeting.customerName || "未設定"} / {formatDate(meeting.recordedAt)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="現在の次回アクション">
              <CurrentNextAction actionTitle={customer.nextActionTitle} actionDate={customer.nextActionDate} />
              <form onSubmit={handleCompleteNextAction} className="mt-4 space-y-3">
                {hasCurrentNextAction ? (
                  <>
                    <TextField label="完了日" value={completedActionDate} onChange={setCompletedActionDate} type="date" />
                    <label>
                      <span className="text-[12px] font-black text-[#596273]">完了メモ</span>
                      <textarea value={completedActionMemo} onChange={(event) => setCompletedActionMemo(event.target.value)} className="mt-1 min-h-[86px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]" />
                    </label>
                  </>
                ) : null}
                <TextField label="次のアクション" value={followingActionTitle} onChange={setFollowingActionTitle} />
                <TextField label="次の予定日" value={followingActionDate} onChange={setFollowingActionDate} type="date" />
                <button type="submit" className="w-full rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 py-3 text-[13px] font-black text-[#171717]">
                  {hasCurrentNextAction ? "完了して次を保存" : "次のアクションを保存"}
                </button>
              </form>
            </Panel>

            <Panel title="完了したアクション履歴">
              <CompletedActionHistory logs={completedActionLogs} />
            </Panel>

            <Panel title="タイムライン">
              <Timeline logs={timelineLogs} />
            </Panel>

            <Panel title="活動ログ追加">
              <form onSubmit={handleAddLog} className="space-y-3">
                <SelectField label="ログ種別" value={logType} options={logTypeOptions} onChange={(value) => setLogType(value as CustomerLogType)} />
                <TextField label="タイトル" value={logTitle} onChange={setLogTitle} />
                <TextField label="活動日" value={logActionDate} onChange={setLogActionDate} type="date" />
                <label>
                  <span className="text-[12px] font-black text-[#596273]">本文</span>
                  <textarea value={logBody} onChange={(event) => setLogBody(event.target.value)} className="mt-1 min-h-[110px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]" />
                </label>
                <button type="submit" className="w-full rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 py-3 text-[13px] font-black text-[#171717]">
                  ログを追加
                </button>
              </form>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function CustomerForm({
  formState,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  products,
  salesUsers,
  currentUserId,
}: {
  formState: CustomerFormState;
  onChange: (state: CustomerFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  disabled?: boolean;
  products: KnowledgeProduct[];
  salesUsers: AppUserProfile[];
  currentUserId: string;
}) {
  const setField = <Key extends keyof CustomerFormState>(key: Key, value: CustomerFormState[Key]) => onChange({ ...formState, [key]: value });
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="会社名" value={formState.companyName} onChange={(value) => setField("companyName", value)} required />
        <TextField label="先方担当者名" value={formState.contactName} onChange={(value) => setField("contactName", value)} />
        <TextField label="電話番号" value={formState.phone} onChange={(value) => setField("phone", value)} />
        <TextField label="メールアドレス" value={formState.email} onChange={(value) => setField("email", value)} />
        <TextField label="業種" value={formState.industry} onChange={(value) => setField("industry", value)} />
        <TextField label="従業員数" value={formState.employeeCount} onChange={(value) => setField("employeeCount", value)} type="number" />
      </div>
      <CollaboratorSelect users={salesUsers} currentUserId={currentUserId} selectedIds={formState.collaboratorUserIds} onChange={(collaboratorUserIds) => setField("collaboratorUserIds", collaboratorUserIds)} />
      <ProductSelect products={products} selectedIds={formState.productIds} onChange={(productIds) => setField("productIds", productIds)} />
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label="ステータス" value={formState.status} options={statusOptions} onChange={(value) => setField("status", value as CustomerStatus)} />
        <SelectField label="温度感" value={formState.temperature} options={temperatureOptions} onChange={(value) => setField("temperature", value as CustomerTemperature)} />
        <TextField label="見込み金額" value={formState.expectedAmount} onChange={(value) => setField("expectedAmount", value)} type="number" />
        <TextField label="失注理由" value={formState.lostReason} onChange={(value) => setField("lostReason", value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="次回アクション" value={formState.nextActionTitle} onChange={(value) => setField("nextActionTitle", value)} />
        <TextField label="次回日" value={formState.nextActionDate} onChange={(value) => setField("nextActionDate", value)} type="date" />
        <TextField label="最終接触日" value={formState.lastContactDate} onChange={(value) => setField("lastContactDate", value)} type="date" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaField label="初回接点・背景" value={formState.firstTouchMemo} onChange={(value) => setField("firstTouchMemo", value)} />
        <TextAreaField label="顧客像・課題" value={formState.customerContext} onChange={(value) => setField("customerContext", value)} />
        <TextAreaField label="今後の方針" value={formState.salesDirection} onChange={(value) => setField("salesDirection", value)} />
        <TextAreaField label="引き継ぎメモ" value={formState.handoffMemo} onChange={(value) => setField("handoffMemo", value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <SelectField label="契約ラベル" value={formState.contractStatus} options={contractStatusOptions} onChange={(value) => setField("contractStatus", value as CustomerContractStatus)} />
        <TextField label="契約開始日" value={formState.contractStartDate} onChange={(value) => setField("contractStartDate", value)} type="date" />
        <TextField label="契約プラン" value={formState.contractPlan} onChange={(value) => setField("contractPlan", value)} />
        <TextField label="月額金額" value={formState.monthlyAmount} onChange={(value) => setField("monthlyAmount", value)} type="number" />
        <TextField label="更新予定日" value={formState.renewalDate} onChange={(value) => setField("renewalDate", value)} type="date" />
      </div>
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <SelectField label="解約リスク" value={formState.churnRisk} options={churnRiskOptions} onChange={(value) => setField("churnRisk", value as CustomerChurnRisk)} />
        <label>
          <span className="text-[12px] font-black text-[#596273]">メモ</span>
          <textarea value={formState.memo} onChange={(event) => setField("memo", event.target.value)} className="mt-1 min-h-[90px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]" />
        </label>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={disabled} className="rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717] disabled:opacity-60">{submitLabel}</button>
      </div>
    </form>
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

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
          <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
          <div className="mt-1 text-[13px] font-black leading-6 text-[#343b48]">{value}</div>
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
    return <EmptyState title="顧客の文脈はまだ未入力です" body="編集から、初回接点・顧客像・今後の方針を残すと、引き継ぎや再開時に状況をつかみやすくなります。" />;
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

function Timeline({ logs }: { logs: CustomerLogRecord[] }) {
  if (logs.length === 0) return <EmptyState title="ログはまだありません" body="テレアポ、商談、メール、フォローなどの活動ログを追加できます。" />;
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
          {log.body ? <p className="mt-2 text-[13px] font-bold leading-6 text-[#596273]">{log.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

function CurrentNextAction({ actionTitle, actionDate }: { actionTitle: string; actionDate: Date | null }) {
  if (!actionTitle && !actionDate) {
    return <EmptyState title="現在の次回アクションはありません" body="次のアクションが決まったら、この下の入力欄から設定できます。" />;
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
    return <EmptyState title="完了したアクションはまだありません" body="現在の次回アクションを完了すると、ここに履歴が残ります。" />;
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
          {log.body ? <p className="mt-2 text-[12px] font-bold leading-6 text-[#596273]">{log.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

function MeetingHistory({ meetings }: { meetings: MeetingRecord[] }) {
  if (meetings.length === 0) return <EmptyState title="紐付いた商談履歴はありません" body="同じ顧客名の商談、または手動で紐付けた商談がここに表示されます。" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-[#fcfcfd]">
          <tr className="border-b border-[#eef1f5] text-[12px] text-[#7a808c]">
            <th className="px-3 py-3 font-bold">商談日</th>
            <th className="px-3 py-3 font-bold">商談タイトル</th>
            <th className="px-3 py-3 font-bold">AIスコア</th>
            <th className="px-3 py-3 font-bold">要改善点</th>
            <th className="px-3 py-3 font-bold">失注リスク</th>
            <th className="px-3 py-3 font-bold"></th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr key={meeting.id} className="border-b border-[#f0f2f6] last:border-b-0">
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{formatDate(meeting.recordedAt)}</td>
              <td className="px-3 py-3 text-[13px] font-black text-[#171717]">{meeting.customerName || meeting.productType || "未設定"}</td>
              <td className="px-3 py-3 text-[13px] font-black text-[#8a6500]">{calcMeetingScore(meeting) ?? "-"}点</td>
              <td className="px-3 py-3 text-[12px] font-bold text-[#596273]">{readMeetingImprovement(meeting)}</td>
              <td className="px-3 py-3"><RiskBadge meeting={meeting} /></td>
              <td className="px-3 py-3 text-right">
                <Link href={`/meetings/${meeting.id}/summary`} className="rounded-[9px] border border-[#ead8a8] bg-[#fffaf0] px-3 py-2 text-[12px] font-black text-[#8a6500]">分析</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskBadge({ meeting }: { meeting: MeetingRecord }) {
  const risk = meeting.status === "lost" || meeting.aiSummary?.diagnosis?.temperature?.level === "low";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${risk ? "bg-[#fff0ed] text-[#d63c2f]" : "bg-[#edf7f0] text-[#16834f]"}`}>{risk ? "高" : "低"}</span>;
}

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} className="mt-1 h-11 w-full rounded-[10px] border border-[#dfe4ec] px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]" />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-[92px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]" />
    </label>
  );
}

function CollaboratorSelect({
  users,
  currentUserId,
  selectedIds,
  onChange,
}: {
  users: AppUserProfile[];
  currentUserId: string;
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}) {
  const candidates = users.filter((user) => user.uid !== currentUserId);
  const toggleUser = (userId: string) => {
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  };

  return (
    <div className="rounded-[12px] border border-[#dfe4ec] bg-[#fcfcfd] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-black text-[#596273]">共同担当・同行者</span>
        <span className="text-[11px] font-bold text-[#8a909b]">{selectedIds.length > 0 ? `${selectedIds.length}名選択中` : "任意"}</span>
      </div>
      {candidates.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.map((user) => {
            const selected = selectedIds.includes(user.uid);
            return (
              <button
                key={user.uid}
                type="button"
                onClick={() => toggleUser(user.uid)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-black transition ${
                  selected
                    ? "border-[#f0c655] bg-[#ffd84d] text-[#171717]"
                    : "border-[#e2e6ee] bg-white text-[#596273] hover:border-[#ead8a8]"
                }`}
              >
                {user.name ?? user.email ?? "名前未設定"}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[12px] font-bold text-[#8a909b]">選択できる他メンバーはいません。</p>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ProductSelect({
  products,
  selectedIds,
  onChange,
}: {
  products: KnowledgeProduct[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">商材</span>
      <select
        value={selectedIds[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        disabled={products.length === 0}
        className="mt-1 h-11 w-full rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f] disabled:bg-[#f6f7f9] disabled:text-[#8a909b]"
      >
        <option value="">{products.length > 0 ? "商材を選択" : "商材が未登録です"}</option>
        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    </label>
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

function buildFormState(customer: CustomerRecord): CustomerFormState {
  return {
    companyName: customer.companyName,
    contactName: customer.contactName,
    phone: customer.phone,
    email: customer.email,
    industry: customer.industry,
    employeeCount: customer.employeeCount?.toString() ?? "",
    collaboratorUserIds: customer.collaboratorUserIds,
    productIds: customer.productIds,
    status: customer.status,
    temperature: customer.temperature,
    expectedAmount: customer.expectedAmount?.toString() ?? "",
    lostReason: customer.lostReason,
    nextActionTitle: customer.nextActionTitle,
    nextActionDate: toDateInputValue(customer.nextActionDate),
    lastContactDate: toDateInputValue(customer.lastContactDate),
    firstTouchMemo: customer.firstTouchMemo,
    customerContext: customer.customerContext,
    salesDirection: customer.salesDirection,
    handoffMemo: customer.handoffMemo,
    memo: customer.memo,
    contractStatus: customer.contractStatus,
    contractStartDate: toDateInputValue(customer.contractStartDate),
    contractPlan: customer.contractPlan,
    monthlyAmount: customer.monthlyAmount?.toString() ?? "",
    renewalDate: toDateInputValue(customer.renewalDate),
    churnRisk: customer.churnRisk,
  };
}

function buildCustomerInput(formState: CustomerFormState, products: KnowledgeProduct[], salesUsers: AppUserProfile[], customer: CustomerRecord): SaveCustomerInput {
  const selectedProducts = products.filter((product) => formState.productIds.includes(product.id));
  const selectedCollaborators = formState.collaboratorUserIds
    .filter((userId) => userId !== customer.assignedUserId)
    .map((userId) => {
      const salesUser = salesUsers.find((profile) => profile.uid === userId);
      return { id: userId, name: salesUser?.name ?? salesUser?.email ?? customer.collaboratorUserNames[customer.collaboratorUserIds.indexOf(userId)] ?? "未設定" };
    });
  return {
    companyId: customer.companyId,
    companyName: formState.companyName.trim(),
    contactName: formState.contactName.trim(),
    phone: formState.phone.trim(),
    email: formState.email.trim(),
    industry: formState.industry.trim(),
    employeeCount: readOptionalNumber(formState.employeeCount),
    assignedUserId: customer.assignedUserId,
    assignedUserName: customer.assignedUserName,
    collaboratorUserIds: selectedCollaborators.map((collaborator) => collaborator.id),
    collaboratorUserNames: selectedCollaborators.map((collaborator) => collaborator.name),
    productIds: selectedProducts.map((product) => product.id),
    productNames: selectedProducts.map((product) => product.name),
    status: formState.contractStatus === "contracted" ? "contracted" : formState.status,
    temperature: formState.temperature,
    expectedAmount: readOptionalNumber(formState.expectedAmount),
    lostReason: formState.lostReason.trim(),
    nextActionTitle: formState.nextActionTitle.trim(),
    nextActionDate: readOptionalDate(formState.nextActionDate),
    lastContactDate: readOptionalDate(formState.lastContactDate),
    firstTouchMemo: formState.firstTouchMemo.trim(),
    customerContext: formState.customerContext.trim(),
    salesDirection: formState.salesDirection.trim(),
    handoffMemo: formState.handoffMemo.trim(),
    memo: formState.memo.trim(),
    isContracted: formState.contractStatus === "contracted",
    contractStatus: formState.contractStatus,
    contractStartDate: readOptionalDate(formState.contractStartDate),
    contractPlan: formState.contractPlan.trim(),
    monthlyAmount: readOptionalNumber(formState.monthlyAmount),
    renewalDate: readOptionalDate(formState.renewalDate),
    churnRisk: formState.churnRisk,
  };
}

async function createCompletedActionLog({
  customer,
  createdBy,
  completedDate,
  memo,
  nextTitle,
  nextDate,
}: {
  customer: CustomerRecord;
  createdBy: string;
  completedDate: Date;
  memo: string;
  nextTitle: string;
  nextDate: Date | null;
}) {
  await createCustomerLog({
    companyId: customer.companyId,
    customerId: customer.id,
    userId: customer.assignedUserId,
    type: "follow",
    title: `${completedActionLogTitle}: ${customer.nextActionTitle || "次回アクション"}`,
    body: buildCompletedActionLogBody({
      dueDate: customer.nextActionDate,
      memo,
      nextTitle,
      nextDate,
    }),
    actionDate: completedDate,
    createdBy,
  });
}

function calcMeetingAverageScore(meetings: MeetingRecord[]) {
  const scores = meetings.map(calcMeetingScore).filter((score): score is number => score !== null);
  return scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
}

function calcMeetingScore(meeting: MeetingRecord) {
  const evaluations = meeting.aiSummary?.diagnosis?.salesEvaluation ?? [];
  if (evaluations.length > 0) {
    return Math.round(evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length);
  }
  return meeting.aiSummary?.manualCompliance?.score ?? meeting.aiSummary?.diagnosis?.consideration?.score ?? null;
}

function readMeetingImprovement(meeting: MeetingRecord) {
  return meeting.aiSummary?.manualCompliance?.missingCriteria[0]
    ?? meeting.aiSummary?.manualCompliance?.improvementPhrases[0]
    ?? meeting.aiSummary?.bullets[0]
    ?? "未分析";
}

function calcContractMonths(date: Date | null) {
  if (!date) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth());
}

function readStatusLabel(status: CustomerStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? "未接触";
}

function readTemperatureLabel(temperature: CustomerTemperature) {
  return temperatureOptions.find((option) => option.value === temperature)?.label ?? "中";
}

function readChurnRiskLabel(risk: CustomerChurnRisk) {
  return churnRiskOptions.find((option) => option.value === risk)?.label ?? "低";
}

function readContractStatusLabel(status: CustomerContractStatus) {
  return contractStatusOptions.find((option) => option.value === status)?.label ?? "未契約";
}

function readLogTypeLabel(type: CustomerLogType) {
  return logTypeOptions.find((option) => option.value === type)?.label ?? "メモ";
}

function isCompletedActionLog(log: CustomerLogRecord) {
  return log.type === "follow" && log.title.startsWith(`${completedActionLogTitle}:`);
}

function stripCompletedActionLogPrefix(title: string) {
  return title.startsWith(`${completedActionLogTitle}:`) ? title.slice(`${completedActionLogTitle}:`.length).trim() : title;
}

function formatDate(date: Date | null) {
  if (!date) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatCurrency(value: number | null) {
  if (value === null) return "未設定";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTodayInputValue() {
  return toDateInputValue(new Date());
}

function buildCompletedActionLogBody({
  dueDate,
  memo,
  nextTitle,
  nextDate,
}: {
  dueDate: Date | null;
  memo: string;
  nextTitle: string;
  nextDate: Date | null;
}) {
  return [
    `元の予定日: ${formatDate(dueDate)}`,
    memo ? `完了メモ: ${memo}` : "",
    nextTitle ? `次のアクション: ${nextTitle}` : "次のアクション: 未設定",
    nextTitle || nextDate ? `次の予定日: ${formatDate(nextDate)}` : "",
  ].filter(Boolean).join("\n");
}

function readOptionalDate(value: string) {
  return value ? new Date(value) : null;
}

function readOptionalNumber(value: string) {
  if (!value) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function notifyCustomerMembers({
  customer,
  extraUserIds = [],
  actorUserId,
  actorName,
  title,
}: {
  customer: CustomerRecord;
  extraUserIds?: string[];
  actorUserId: string;
  actorName: string;
  title: string;
}) {
  const targetUserIds = Array.from(new Set([customer.assignedUserId, ...customer.collaboratorUserIds, ...extraUserIds]))
    .filter((userId) => userId && userId !== actorUserId);

  await Promise.all(
    targetUserIds.map((userId) =>
      createAppNotification({
        companyId: customer.companyId,
        userId,
        title,
        body: `${actorName}さんが「${customer.companyName || "顧客カルテ"}」を更新しました。`,
        href: `/sales/customers/${customer.id}`,
        type: "customer_collaboration",
        createdBy: actorUserId,
        metadata: { customerId: customer.id },
      }).catch(() => undefined),
    ),
  );
}
