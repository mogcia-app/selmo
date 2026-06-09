export default function AdminRepsPage() {
  const reps = [
    ["01", "山田 麻衣", "SALES-A", "38件", "47.4%", "92%"],
    ["02", "鈴木 大輔", "SALES-A", "42件", "45.2%", "88%"],
    ["03", "高橋 由紀", "SALES-B", "35件", "40.0%", "82%"],
    ["04", "佐藤 健一", "SALES-C", "29件", "17.2%", "58%"],
  ] as const;

  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-8 border-b border-[var(--line)] pb-6">
        <h1 className="font-editorial text-[38px] font-bold leading-[1.05] text-[var(--ink)]">
          営業マン別一覧
        </h1>
        <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
          Team list · performance snapshot
        </p>
      </header>

      <section className="overflow-hidden border border-[var(--line)] bg-[var(--paper)]">
        <table className="w-full text-left">
          <thead className="border-b border-[var(--line)] bg-[var(--paper-2)]">
            <tr className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
              <th className="px-5 py-4 font-medium">No</th>
              <th className="px-5 py-4 font-medium">営業マン</th>
              <th className="px-5 py-4 font-medium">チーム</th>
              <th className="px-5 py-4 font-medium">通話数</th>
              <th className="px-5 py-4 font-medium">成約率</th>
              <th className="px-5 py-4 font-medium">準拠率</th>
            </tr>
          </thead>
          <tbody>
            {reps.map(([rank, name, team, count, winRate, compliance]) => (
              <tr
                key={name}
                className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--paper-2)]"
              >
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{rank}</td>
                <td className="px-5 py-4 text-[14px] text-[var(--ink)]">{name}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{team}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{count}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{winRate}</td>
                <td className="px-5 py-4 text-[13px] text-[var(--gray-2)]">{compliance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
