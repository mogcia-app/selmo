type DashboardRow = {
  name: string;
  meetingCount: number;
  winRate: string;
  averageDuration: string;
  manualScore: string;
};

type DashboardTableProps = {
  rows: DashboardRow[];
};

export function DashboardTable({ rows }: DashboardTableProps) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border">
      <table className="min-w-full divide-y divide-border text-left text-sm">
        <thead className="bg-brand-soft">
          <tr>
            <th className="px-5 py-4 font-semibold">営業マン</th>
            <th className="px-5 py-4 font-semibold">打ち合わせ数</th>
            <th className="px-5 py-4 font-semibold">成約率</th>
            <th className="px-5 py-4 font-semibold">平均打ち合わせ時間</th>
            <th className="px-5 py-4 font-semibold">マニュアル準拠率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-white/90">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-5 py-4 font-medium">{row.name}</td>
              <td className="px-5 py-4">{row.meetingCount}</td>
              <td className="px-5 py-4">{row.winRate}</td>
              <td className="px-5 py-4">{row.averageDuration}</td>
              <td className="px-5 py-4">{row.manualScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
