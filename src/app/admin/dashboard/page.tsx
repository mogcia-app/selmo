import { DashboardTable } from "@/features/dashboard/components/dashboard-table";

const rows = [
  {
    name: "田中 美咲",
    callCount: 34,
    winRate: "38%",
    averageDuration: "68分",
    manualScore: "82%",
  },
  {
    name: "佐藤 翔太",
    callCount: 29,
    winRate: "21%",
    averageDuration: "74分",
    manualScore: "68%",
  },
  {
    name: "鈴木 健",
    callCount: 31,
    winRate: "44%",
    averageDuration: "61分",
    manualScore: "88%",
  },
];

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 md:px-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-deep">
            Admin Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold">営業マン別の状況一覧</h1>
          <p className="mt-3 max-w-2xl text-muted">
            MVPでは、まず一覧で通話数、成約率、平均通話時間、マニュアル準拠率を把握できる形から始めます。
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-[28px] border border-border bg-white/85 p-6 shadow-panel">
        <DashboardTable rows={rows} />
      </section>
    </main>
  );
}
