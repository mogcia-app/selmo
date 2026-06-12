"use client";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";

export default function AdminUsersPage() {
  const { users, error } = useAdminInsights();

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="USERS"
          title="ユーザー管理"
          description="同じ会社に所属する管理者・営業担当のアカウントを確認します。"
        />

        {error ? <ErrorBox message={error} /> : null}

        <Panel title="ユーザー一覧">
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-[#eef1f5] text-[12px] font-bold text-[#7a808c]">
                    <th className="px-5 py-4">名前</th>
                    <th className="px-5 py-4">メール</th>
                    <th className="px-5 py-4">権限</th>
                    <th className="px-5 py-4">利用領域</th>
                    <th className="px-5 py-4">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.uid} className="border-b border-[#f0f2f6] last:border-b-0 hover:bg-[#fffdf7]">
                      <td className="px-5 py-4 text-[14px] font-black text-[#171717]">{user.name ?? "未設定"}</td>
                      <td className="px-5 py-4 text-[13px] text-[#596273]">{user.email ?? "未登録"}</td>
                      <td className="px-5 py-4 text-[13px] font-bold text-[#343b48]">{formatRole(user.role)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <DomainBadge enabled={user.enabledSalesDomains.meeting} label="商談" />
                          <DomainBadge enabled={user.enabledSalesDomains.teleapo} label="テレアポ" />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={user.status === "active" ? "good" : "normal"} label={user.status === "active" ? "有効" : "停止中"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="ユーザーはまだありません" body="同じ会社のユーザーが追加されると、ここに表示されます。" />
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

function formatRole(role: string) {
  if (role === "owner") return "オーナー";
  if (role === "admin") return "管理者";
  return "営業担当";
}

function DomainBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-black ${enabled ? "bg-[#fff4c2] text-[#8a6500]" : "bg-[#f1f2f5] text-[#9aa1ad]"}`}>
      {label}
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
