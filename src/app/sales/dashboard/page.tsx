import { StatCard } from "@/components/stat-card";

const metrics = [
  { label: "今月の通話件数", value: "32件", helper: "先月比 +4件" },
  { label: "成約率", value: "35%", helper: "検討中を除く" },
  { label: "平均通話時間", value: "71分", helper: "直近3か月平均" },
  { label: "トーク比率", value: "58:42", helper: "営業 : 顧客" },
];

export default function SalesDashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-deep">
          Sales Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold">自分の通話パフォーマンス</h1>
        <p className="mt-3 max-w-2xl text-muted">
          営業マン向け画面では、本人の改善点がすぐ見えることを優先して、数値とコメントを先に出します。
        </p>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard key={metric.label} {...metric} />
        ))}
      </section>
    </main>
  );
}
