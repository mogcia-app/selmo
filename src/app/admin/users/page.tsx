import Link from "next/link";

export default function AdminUsersPage() {
  const users = [
    ["管理者", "admin@example.com", "admin", "active"],
    ["山田 麻衣", "sales-a@example.com", "sales", "active"],
    ["鈴木 大輔", "sales-b@example.com", "sales", "active"],
    ["佐藤 健一", "sales-c@example.com", "sales", "inactive"],
  ] as const;

  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-8 flex flex-col gap-4 border-b border-[var(--line)] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-editorial text-[38px] font-bold leading-[1.05] text-[var(--ink)]">
            ユーザー管理
          </h1>
          <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
            Roles · access control
          </p>
        </div>
        <Link
          href="/register"
          className="inline-flex border border-[var(--line)] bg-[var(--ink)] px-4 py-[10px] text-[12.5px] font-medium text-[var(--paper)] transition hover:bg-[var(--line)]"
        >
          ＋ ユーザー登録
        </Link>
      </header>

      <section className="overflow-hidden border border-[var(--line)] bg-[var(--paper)]">
        <table className="w-full text-left">
          <thead className="border-b border-[var(--line)] bg-[var(--paper-2)]">
            <tr className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
              <th className="px-5 py-4 font-medium">名前</th>
              <th className="px-5 py-4 font-medium">メール</th>
              <th className="px-5 py-4 font-medium">権限</th>
              <th className="px-5 py-4 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {users.map(([name, email, role, status]) => (
              <tr
                key={email}
                className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--paper-2)]"
              >
                <td className="px-5 py-4 text-[14px] text-[var(--ink)]">{name}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{email}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{role}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
