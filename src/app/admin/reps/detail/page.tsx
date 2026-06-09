export default function AdminRepDetailPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-8 border-b border-[var(--line)] pb-6">
        <h1 className="font-editorial text-[38px] font-bold leading-[1.05] text-[var(--ink)]">
          営業マン詳細
        </h1>
        <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
          Individual view · selected rep
        </p>
      </header>

      <section className="grid gap-8 xl:grid-cols-2">
        <div className="border border-[var(--line)] bg-[var(--paper)] p-6">
          <div className="font-editorial text-[24px] font-semibold text-[var(--ink)]">
            山田 麻衣
          </div>
          <p className="mt-2 text-[13px] text-[var(--gray)]">
            Sales-A · 入社3年目 · 今月38件
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <MetricCard label="成約率" value="47.4%" />
            <MetricCard label="平均通話時間" value="38分" />
            <MetricCard label="マニュアル準拠率" value="92%" />
            <MetricCard label="平均トーク比率" value="42:58" />
          </div>
        </div>

        <div className="border border-[var(--line)] bg-[var(--paper)] p-6">
          <div className="font-editorial text-[24px] font-semibold text-[var(--ink)]">
            AIコメント
          </div>
          <p className="mt-4 text-[14px] leading-7 text-[var(--ink)]">
            ヒアリングの深さと不安への応答は安定しています。価格提示後の次回アクション確定をさらに徹底すると、
            成約率の上振れが期待できます。
          </p>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line-soft)] bg-[var(--paper-2)] px-4 py-4">
      <div className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
        {label}
      </div>
      <div className="font-editorial mt-3 text-[28px] font-semibold text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}
