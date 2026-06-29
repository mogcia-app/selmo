"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useEffect } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import {
  createCustomer,
  subscribeToCustomers,
  type CustomerChurnRisk,
  type CustomerContractStatus,
  type CustomerRecord,
  type CustomerStatus,
  type CustomerTemperature,
  type SaveCustomerInput,
} from "@/lib/firebase/customers";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import { createAppNotification } from "@/lib/firebase/notifications";

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

const customersPerPage = 9;

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

const initialFormState: CustomerFormState = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  industry: "",
  employeeCount: "",
  collaboratorUserIds: [],
  productIds: [],
  status: "not_contacted",
  temperature: "middle",
  expectedAmount: "",
  lostReason: "",
  nextActionTitle: "",
  nextActionDate: "",
  lastContactDate: "",
  firstTouchMemo: "",
  customerContext: "",
  salesDirection: "",
  handoffMemo: "",
  memo: "",
  contractStatus: "not_contracted",
  contractStartDate: "",
  contractPlan: "",
  monthlyAmount: "",
  renewalDate: "",
  churnRisk: "low",
};

export default function SalesCustomersPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [salesUsers, setSalesUsers] = useState<AppUserProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formState, setFormState] = useState<CustomerFormState>(initialFormState);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!profile?.companyId || !profile.uid) {
      setCustomers([]);
      return;
    }

    return subscribeToCustomers(
      { companyId: profile.companyId, userId: profile.uid, isAdmin: false },
      setCustomers,
      (nextError: FirebaseError) => setErrorMessage(nextError.message),
    );
  }, [profile?.companyId, profile?.uid]);

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

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch = !normalizedSearch || [
        customer.companyName,
        customer.contactName,
        ...customer.productNames,
        customer.phone,
        customer.email,
        customer.industry,
        customer.nextActionTitle,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / customersPerPage));
  const displayPage = Math.min(currentPage, pageCount);
  const visibleCustomers = useMemo(() => {
    return filteredCustomers.slice((displayPage - 1) * customersPerPage, displayPage * customersPerPage);
  }, [displayPage, filteredCustomers]);

  const contractedCount = customers.filter((customer) => customer.isContracted || customer.status === "contracted").length;
  const overdueCount = customers.filter(isActionOverdue).length;
  const proposalCount = customers.filter((customer) => customer.status === "proposal").length;

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!profile?.companyId || !profile.uid) {
      setErrorMessage("ログイン情報を取得できませんでした。");
      return;
    }

    if (!formState.companyName.trim()) {
      setErrorMessage("会社名を入力してください。");
      return;
    }

    setIsCreating(true);
    try {
      const customerId = await createCustomer(buildCustomerInput(formState, products, salesUsers, {
        companyId: profile.companyId,
        userId: profile.uid,
        userName: profile.name ?? profile.email ?? "未設定",
      }));
      await notifyCustomerCollaborators({
        companyId: profile.companyId,
        customerId,
        customerName: formState.companyName.trim(),
        collaboratorUserIds: formState.collaboratorUserIds,
        actorUserId: profile.uid,
        actorName: profile.name ?? profile.email ?? "担当者",
        title: "顧客カルテの共同担当に追加されました",
      });
      setFormState(initialFormState);
      setShowCreateForm(false);
      setSuccessMessage("顧客カルテを追加しました。");
      router.push(`/sales/customers/${customerId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "顧客の追加に失敗しました。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="bg-[#f6f7f9] px-4 pb-8 pt-5 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a6500]">Customer Karte</p>
            <h1 className="mt-1 text-[28px] font-black tracking-[-0.04em] text-[#171717]">顧客カルテ</h1>
            <p className="mt-2 text-[13px] leading-6 text-[#596273]">
              テレアポ、商談、契約後フォローまで、担当顧客の状態と次アクションを管理します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
            className="rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 py-3 text-[13px] font-black text-[#171717] shadow-sm transition hover:bg-[#ffcf33]"
          >
            {showCreateForm ? "フォームを閉じる" : "新規顧客を追加"}
          </button>
        </div>

        {errorMessage ? <MessageBox tone="risk" message={errorMessage} /> : null}
        {successMessage ? <MessageBox tone="good" message={successMessage} /> : null}

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <KpiCard label="担当顧客" value={`${customers.length}件`} note="自分の担当カルテ" />
          <KpiCard label="契約中" value={`${contractedCount}件`} note="成約後フォロー対象" tone="good" />
          <KpiCard label="提案中" value={`${proposalCount}件`} note="追客強化対象" />
          <KpiCard label="期限超過" value={`${overdueCount}件`} note="次回アクション遅れ" tone={overdueCount > 0 ? "risk" : "normal"} />
        </section>

        {showCreateForm ? (
          <section className="mt-5 rounded-[16px] border border-[#e4e8ef] bg-white p-5 shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
            <h2 className="text-[18px] font-black text-[#171717]">新規顧客カルテ</h2>
            <CustomerForm
              formState={formState}
              onChange={setFormState}
              onSubmit={handleCreateCustomer}
              submitLabel={isCreating ? "追加中" : "顧客カルテを作成"}
              disabled={isCreating}
              products={products}
              salesUsers={salesUsers}
              currentUserId={profile?.uid ?? ""}
            />
          </section>
        ) : null}

        <section className="mt-5 rounded-[16px] border border-[#e4e8ef] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.05)]">
          <div className="grid gap-3 border-b border-[#eef1f5] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_180px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
              placeholder="会社名・先方担当者名・次回アクションで検索"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | CustomerStatus)}
              className="h-11 rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
            >
              <option value="all">全ステータス</option>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          {filteredCustomers.length > 0 ? (
            <div className="px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px] font-bold text-[#8a909b]">
                  {filteredCustomers.length}件中 {(displayPage - 1) * customersPerPage + 1}-{Math.min(displayPage * customersPerPage, filteredCustomers.length)}件を表示
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3 md:grid-cols-2">
                {visibleCustomers.map((customer) => (
                  <CustomerCard key={customer.id} customer={customer} />
                ))}
              </div>
              {pageCount > 1 ? (
                <Pagination currentPage={displayPage} pageCount={pageCount} onChange={setCurrentPage} />
              ) : null}
            </div>
          ) : (
            <EmptyState title="顧客カルテはまだありません" body="新規顧客を追加すると、次回アクションや契約状況を一覧で管理できます。" />
          )}
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
  const setField = <Key extends keyof CustomerFormState>(key: Key, value: CustomerFormState[Key]) => {
    onChange({ ...formState, [key]: value });
  };

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

      <CollaboratorSelect
        users={salesUsers}
        currentUserId={currentUserId}
        selectedIds={formState.collaboratorUserIds}
        onChange={(collaboratorUserIds) => setField("collaboratorUserIds", collaboratorUserIds)}
      />

      <ProductSelect
        products={products}
        selectedIds={formState.productIds}
        onChange={(productIds) => setField("productIds", productIds)}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label="ステータス" value={formState.status} options={statusOptions} onChange={(value) => setField("status", value as CustomerStatus)} />
        <SelectField label="温度感" value={formState.temperature} options={temperatureOptions} onChange={(value) => setField("temperature", value as CustomerTemperature)} />
        <TextField label="見込み金額" value={formState.expectedAmount} onChange={(value) => setField("expectedAmount", value)} type="number" />
        <TextField label="失注理由" value={formState.lostReason} onChange={(value) => setField("lostReason", value)} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="次回アクション内容" value={formState.nextActionTitle} onChange={(value) => setField("nextActionTitle", value)} />
        <TextField label="次回アクション日" value={formState.nextActionDate} onChange={(value) => setField("nextActionDate", value)} type="date" />
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
        <TextField label="契約更新予定日" value={formState.renewalDate} onChange={(value) => setField("renewalDate", value)} type="date" />
      </div>

      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <SelectField label="解約リスク" value={formState.churnRisk} options={churnRiskOptions} onChange={(value) => setField("churnRisk", value as CustomerChurnRisk)} />
        <label>
          <span className="text-[12px] font-black text-[#596273]">メモ</span>
          <textarea
            value={formState.memo}
            onChange={(event) => setField("memo", event.target.value)}
            className="mt-1 min-h-[90px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={disabled} className="rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717] disabled:opacity-60">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function buildCustomerInput(formState: CustomerFormState, products: KnowledgeProduct[], salesUsers: AppUserProfile[], user: { companyId: string; userId: string; userName: string }): SaveCustomerInput {
  const selectedProducts = products.filter((product) => formState.productIds.includes(product.id));
  const selectedCollaborators = formState.collaboratorUserIds
    .filter((userId) => userId !== user.userId)
    .map((userId) => {
      const salesUser = salesUsers.find((profile) => profile.uid === userId);
      return { id: userId, name: salesUser?.name ?? salesUser?.email ?? "未設定" };
    });
  return {
    companyId: user.companyId,
    companyName: formState.companyName.trim(),
    contactName: formState.contactName.trim(),
    phone: formState.phone.trim(),
    email: formState.email.trim(),
    industry: formState.industry.trim(),
    employeeCount: readOptionalNumber(formState.employeeCount),
    assignedUserId: user.userId,
    assignedUserName: user.userName,
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

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        className="mt-1 h-11 w-full rounded-[10px] border border-[#dfe4ec] px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-[12px] font-black text-[#596273]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[92px] w-full resize-y rounded-[10px] border border-[#dfe4ec] px-3 py-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
      />
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-[10px] border border-[#dfe4ec] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#d7aa1f]"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const label = statusOptions.find((option) => option.value === status)?.label ?? "未接触";
  const className =
    status === "contracted"
      ? "bg-[#edf7f0] text-[#16834f]"
      : status === "lost" || status === "dormant"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : status === "proposal" || status === "meeting_scheduled"
          ? "bg-[#fff3cf] text-[#8a6500]"
          : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function CustomerCard({ customer }: { customer: CustomerRecord }) {
  const overdue = isActionOverdue(customer);
  const story = customer.customerContext || customer.salesDirection || customer.firstTouchMemo || customer.memo;

  return (
    <article className={`flex min-h-[330px] flex-col rounded-[16px] border bg-white p-4 shadow-[0_6px_16px_rgba(17,24,39,0.04)] ${overdue ? "border-[#f4d4d4] bg-[#fffafa]" : "border-[#e4e8ef]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black text-[#171717]">{customer.companyName || "会社名未設定"}</h3>
          <p className="mt-1 truncate text-[12px] font-bold text-[#8a909b]">{customer.contactName || "先方担当者未設定"}</p>
          {customer.collaboratorUserNames.length > 0 ? (
            <p className="mt-1 truncate text-[12px] font-bold text-[#8a6500]">共同: {customer.collaboratorUserNames.join(" / ")}</p>
          ) : null}
        </div>
        <CustomerStatusBadge status={customer.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <TemperatureBadge temperature={customer.temperature} />
        <ContractStatusBadge status={customer.contractStatus} />
      </div>

      <div className="mt-4 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a909b]">Next Action</div>
        <div className={`mt-1 line-clamp-2 text-[13px] font-black leading-6 ${overdue ? "text-[#d63c2f]" : "text-[#343b48]"}`}>
          {customer.nextActionTitle || "未設定"}
        </div>
        <div className="mt-1 text-[12px] font-bold text-[#8a909b]">{formatDate(customer.nextActionDate)}</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CardMiniInfo label="商材" value={customer.productNames.length > 0 ? customer.productNames.join(" / ") : "未設定"} />
        <CardMiniInfo label="最終接触" value={formatDate(customer.lastContactDate)} />
        <CardMiniInfo label="見込み" value={formatCurrency(customer.expectedAmount)} />
      </div>

      <p className="mt-3 line-clamp-3 min-h-[60px] rounded-[12px] bg-[#fcfcfd] px-3 py-2 text-[12px] font-bold leading-5 text-[#596273]">
        {story || "顧客メモはまだありません"}
      </p>

      <div className="mt-auto flex justify-end pt-4">
        <Link href={`/sales/customers/${customer.id}`} className="rounded-[10px] border border-[#ead8a8] bg-[#fffaf0] px-3 py-2 text-[12px] font-black text-[#8a6500] transition hover:bg-[#fff3cd]">
          詳細
        </Link>
      </div>
    </article>
  );
}

function CardMiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-[#f6f7f9] px-3 py-2">
      <div className="text-[11px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 truncate text-[12px] font-black text-[#343b48]">{value}</div>
    </div>
  );
}

function Pagination({ currentPage, pageCount, onChange }: { currentPage: number; pageCount: number; onChange: (page: number) => void }) {
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onChange(page)}
          className={`h-9 min-w-9 rounded-[10px] border px-3 text-[13px] font-black transition ${
            page === currentPage
              ? "border-[#f0c655] bg-[#ffd84d] text-[#171717]"
              : "border-[#e2e6ee] bg-white text-[#596273] hover:border-[#ead8a8] hover:bg-[#fffaf0]"
          }`}
        >
          {page}
        </button>
      ))}
    </nav>
  );
}

function TemperatureBadge({ temperature }: { temperature: CustomerTemperature }) {
  const label = temperatureOptions.find((option) => option.value === temperature)?.label ?? "中";
  const className =
    temperature === "high"
      ? "bg-[#fff0ed] text-[#d63c2f]"
      : temperature === "middle"
        ? "bg-[#fff3cf] text-[#8a6500]"
        : "bg-[#eef6ff] text-[#2672d9]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

function ContractStatusBadge({ status }: { status: CustomerContractStatus }) {
  const label = contractStatusOptions.find((option) => option.value === status)?.label ?? "未契約";
  const className =
    status === "contracted"
      ? "bg-[#edf7f0] text-[#16834f]"
      : status === "considering"
        ? "bg-[#fff3cf] text-[#8a6500]"
        : status === "needs_consultation"
          ? "bg-[#fff0ed] text-[#d63c2f]"
          : status === "paused"
            ? "bg-[#eef6ff] text-[#2672d9]"
            : status === "cancelled"
              ? "bg-[#f1f2f5] text-[#7a808c]"
              : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
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
    <div className="px-5 py-12 text-center">
      <h3 className="text-[17px] font-black text-[#171717]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

function MessageBox({ message, tone }: { message: string; tone: "good" | "risk" }) {
  return (
    <div className={`mt-5 rounded-[12px] border px-4 py-3 text-[13px] font-bold ${tone === "good" ? "border-[#ccebd8] bg-[#f4fbf6] text-[#16834f]" : "border-[#f4d4d4] bg-[#fff8f8] text-[#b4232a]"}`}>
      {message}
    </div>
  );
}

function isActionOverdue(customer: CustomerRecord) {
  if (!customer.nextActionDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return customer.nextActionDate.getTime() < today.getTime() && customer.status !== "contracted";
}

function formatDate(date: Date | null) {
  if (!date) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatCurrency(value: number | null) {
  if (value === null) return "未設定";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function readOptionalDate(value: string) {
  return value ? new Date(value) : null;
}

function readOptionalNumber(value: string) {
  if (!value) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function notifyCustomerCollaborators({
  companyId,
  customerId,
  customerName,
  collaboratorUserIds,
  actorUserId,
  actorName,
  title,
}: {
  companyId: string;
  customerId: string;
  customerName: string;
  collaboratorUserIds: string[];
  actorUserId: string;
  actorName: string;
  title: string;
}) {
  const targetUserIds = Array.from(new Set(collaboratorUserIds)).filter((userId) => userId && userId !== actorUserId);
  await Promise.all(
    targetUserIds.map((userId) =>
      createAppNotification({
        companyId,
        userId,
        title,
        body: `${actorName}さんが「${customerName || "顧客カルテ"}」を更新しました。`,
        href: `/sales/customers/${customerId}`,
        type: "customer_collaboration",
        createdBy: actorUserId,
        metadata: { customerId },
      }).catch(() => undefined),
    ),
  );
}
