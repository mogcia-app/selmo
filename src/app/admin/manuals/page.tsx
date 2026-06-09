export default function AdminManualsPage() {
  const items = [
    ["01", "必要なヒアリングをしているか", "ACTIVE"],
    ["02", "商材説明ができているか", "ACTIVE"],
    ["03", "料金説明ができているか", "ACTIVE"],
    ["04", "顧客の不安に対応しているか", "ACTIVE"],
    ["05", "クロージングできているか", "ACTIVE"],
    ["06", "次回アクションを明確にしているか", "DRAFT"],
  ] as const;

  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-8 border-b border-[var(--line)] pb-6">
        <h1 className="font-editorial text-[38px] font-bold leading-[1.05] text-[var(--ink)]">
          マニュアル管理
        </h1>
        <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
          Checklist governance
        </p>
      </header>

      <section className="border border-[var(--line)] bg-[var(--paper)]">
        <div className="divide-y divide-[var(--line-soft)]">
          {items.map(([num, label, status]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-4">
                <span className="font-mono-ui text-[11px] text-[var(--gray)]">{num}</span>
                <span className="text-[14px] text-[var(--ink)]">{label}</span>
              </div>
              <span className="font-mono-ui text-[11px] text-[var(--gray-2)]">{status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
