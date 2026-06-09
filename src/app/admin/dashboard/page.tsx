const kpis = [
  {
    label: "Meetings Logged",
    value: "847",
    unit: "件",
    note: "▲ +12.4% vs 先月",
    noteColor: "text-[var(--green)]",
  },
  {
    label: "Win Rate",
    value: "34.2",
    unit: "%",
    note: "▲ +2.1pt vs 先月",
    noteColor: "text-[var(--green)]",
  },
  {
    label: "Avg Duration",
    value: "42",
    unit: "分",
    note: "▼ −3分 vs 先月",
    noteColor: "text-[var(--accent)]",
  },
  {
    label: "Manual Compliance",
    value: "78.6",
    unit: "%",
    note: "— 横ばい",
    noteColor: "text-[var(--gray)]",
  },
];

const alerts = [
  {
    icon: "!",
    iconClass: "bg-[var(--accent)] text-[var(--paper)]",
    rowClass: "border-l-[var(--accent)] bg-[rgba(184,51,31,0.06)]",
    text: "佐藤 健一 ／ 3週連続で失注率が上昇（先月比 +18pt）。クロージング不足の傾向。",
    action: "詳細を見る →",
  },
  {
    icon: "▲",
    iconClass: "bg-[var(--accent-2)] text-[var(--ink)]",
    rowClass: "border-l-[var(--accent-2)] bg-[rgba(212,167,44,0.08)]",
    text: "商材C（高額プラン） 全体の成約率が 22% → 14% に低下。料金説明の所要時間が短くなっている可能性。",
    action: "分析を見る →",
  },
  {
    icon: "◎",
    iconClass: "bg-[var(--green)] text-[var(--paper)]",
    rowClass: "border-l-[var(--green)] bg-[rgba(45,90,61,0.06)]",
    text: "山田 麻衣 マニュアル準拠率が 92% に到達。今月のロールモデル候補。",
    action: "事例共有 →",
  },
];

const productRates = [
  ["商材A", "42%", "78%", false],
  ["商材B", "35%", "65%", false],
  ["商材C", "14%", "28%", true],
  ["商材D", "38%", "71%", false],
  ["商材E", "29%", "55%", false],
] as const;

const keywords = [
  ["01", "価格", "1,284", false],
  ["02", "検討します", "892", true],
  ["03", "導入", "764", false],
  ["04", "難しい", "612", true],
  ["05", "提案", "587", false],
  ["06", "サポート", "498", false],
  ["07", "高い", "421", true],
] as const;

const reps = [
  ["01", "山田 麻衣", "SALES-A · 3年目", "38", "18 / 8 / 12", "47.4%", "38分", "92%", "絶好調", "good"],
  ["02", "鈴木 大輔", "SALES-A · 5年目", "42", "19 / 11 / 12", "45.2%", "45分", "88%", "好調", "good"],
  ["03", "高橋 由紀", "SALES-B · 2年目", "35", "14 / 9 / 12", "40.0%", "41分", "82%", "標準", "normal"],
  ["07", "佐藤 健一", "SALES-C · 2年目", "29", "5 / 16 / 8", "17.2%", "52分", "58%", "要支援", "risk"],
] as const;

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-6 py-10 md:px-10">
      <header className="mb-9 flex flex-col gap-6 border-b border-[var(--line)] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-editorial text-[38px] font-bold leading-[1.05] tracking-[-0.01em] text-[var(--ink)]">
            全体ダッシュボード
            <span className="mt-2 block text-[18px] font-medium text-[var(--gray)]">
              Sales Floor — 今月の状態
            </span>
          </h1>
          <p className="font-mono-ui mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--gray)]">
            Monthly Overview · 2026 May · Team of 25
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[var(--gray)]">
            Vol.05 / Issue 23
          </p>
          <p className="font-editorial mt-1 text-[15px] font-semibold text-[var(--ink)]">
            第伍月号
          </p>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 border border-[var(--line)] bg-[var(--paper)] md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, index) => (
          <article
            key={kpi.label}
            className={`border-[var(--line-soft)] px-6 py-6 ${
              index < kpis.length - 1 ? "border-b md:border-b-0 xl:border-r" : ""
            } ${index === 0 ? "md:border-r" : ""} ${index === 1 ? "xl:border-r" : ""}`}
          >
            <p className="font-mono-ui text-[9.5px] uppercase tracking-[0.22em] text-[var(--gray)]">
              {kpi.label}
            </p>
            <p className="font-editorial mt-3 text-[38px] font-bold leading-none text-[var(--ink)]">
              {kpi.value}
              <span className="ml-1 font-sans text-[14px] font-normal text-[var(--gray)]">
                {kpi.unit}
              </span>
            </p>
            <p className={`mt-3 text-[12px] ${kpi.noteColor}`}>{kpi.note}</p>
          </article>
        ))}
      </section>

      <section className="mb-8">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 className="font-editorial text-[26px] font-semibold text-[var(--ink)]">
            要注意 — 今週のアラート
          </h2>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[var(--gray)]">
            Auto-detected · 3 items
          </p>
        </div>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.text}
              className={`flex items-center gap-4 border border-[var(--line-soft)] border-l-[3px] px-5 py-4 ${alert.rowClass}`}
            >
              <span className={`inline-flex h-8 w-8 items-center justify-center text-[13px] font-semibold ${alert.iconClass}`}>
                {alert.icon}
              </span>
              <p className="flex-1 text-[14px] leading-7 text-[var(--ink)]">{alert.text}</p>
              <span className="text-[13px] text-[var(--gray-2)]">{alert.action}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid gap-8 xl:grid-cols-2">
        <Card title="月次推移 — 打ち合わせ数 × 成約率" meta="Last 6 months">
          <svg viewBox="0 0 600 200" className="h-[220px] w-full" preserveAspectRatio="none">
            <line x1="0" y1="40" x2="600" y2="40" stroke="var(--line-soft)" strokeWidth="1" />
            <line x1="0" y1="80" x2="600" y2="80" stroke="var(--line-soft)" strokeWidth="1" />
            <line x1="0" y1="120" x2="600" y2="120" stroke="var(--line-soft)" strokeWidth="1" />
            <line x1="0" y1="160" x2="600" y2="160" stroke="var(--line-soft)" strokeWidth="1" />
            <line x1="0" y1="180" x2="600" y2="180" stroke="var(--line)" strokeWidth="1" />
            <path
              d="M 50 120 L 150 95 L 250 75 L 350 110 L 450 65 L 550 50 L 550 180 L 50 180 Z"
              fill="var(--ink)"
              opacity="0.08"
            />
            <path
              d="M 50 120 L 150 95 L 250 75 L 350 110 L 450 65 L 550 50"
              fill="none"
              stroke="var(--ink)"
              strokeWidth="2"
            />
            <path
              d="M 50 145 L 150 130 L 250 110 L 350 125 L 450 95 L 550 85"
              fill="none"
              stroke="var(--accent)"
              strokeDasharray="6 5"
              strokeWidth="1.6"
            />
            {[50, 150, 250, 350, 450].map((x, i) => (
              <circle key={x} cx={x} cy={[120, 95, 75, 110, 65][i]} r="3" fill="var(--ink)" />
            ))}
            <circle cx="550" cy="50" r="4" fill="var(--accent-2)" stroke="var(--ink)" strokeWidth="1.5" />
            {["DEC", "JAN", "FEB", "MAR", "APR", "MAY*"].map((label, i) => (
              <text
                key={label}
                x={[50, 150, 250, 350, 450, 550][i]}
                y="195"
                textAnchor="middle"
                className="font-mono-ui"
                fontSize="9"
                fill="var(--gray)"
              >
                {label}
              </text>
            ))}
          </svg>
          <div className="font-mono-ui mt-3 flex gap-5 text-[11px] text-[var(--ink)]">
            <div className="flex items-center gap-2">
              <span className="h-[2px] w-4 bg-[var(--ink)]" />
              打ち合わせ数
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0 w-4 border-t border-dashed border-[var(--accent)]" />
              成約率
            </div>
          </div>
        </Card>

        <Card title="結果ステータス内訳" meta="May · 847 meetings">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="55" fill="none" stroke="var(--paper-3)" strokeWidth="22" />
              <circle
                cx="70"
                cy="70"
                r="55"
                fill="none"
                stroke="var(--green)"
                strokeWidth="22"
                strokeDasharray="118.3 345.4"
                transform="rotate(-90 70 70)"
              />
              <circle
                cx="70"
                cy="70"
                r="55"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="22"
                strokeDasharray="97.2 345.4"
                strokeDashoffset="-118.3"
                transform="rotate(-90 70 70)"
              />
              <circle
                cx="70"
                cy="70"
                r="55"
                fill="none"
                stroke="var(--accent-2)"
                strokeWidth="22"
                strokeDasharray="130 345.4"
                strokeDashoffset="-215.5"
                transform="rotate(-90 70 70)"
              />
              <text x="70" y="68" textAnchor="middle" className="font-editorial" fontSize="20" fontWeight="700" fill="var(--ink)">
                847
              </text>
              <text x="70" y="84" textAnchor="middle" className="font-mono-ui" fontSize="9" fill="var(--gray)">
                MEETINGS
              </text>
            </svg>
            <div className="w-full space-y-3">
              <LegendRow color="bg-[var(--green)]" label="成約" value="290 · 34.2%" />
              <LegendRow color="bg-[var(--accent)]" label="失注" value="238 · 28.1%" />
              <LegendRow color="bg-[var(--accent-2)]" label="検討中" value="319 · 37.7%" />
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-8 grid gap-8 xl:grid-cols-2">
        <Card title="商材別 — 成約率" meta="By product">
          <div className="grid grid-cols-5 items-end gap-5 px-2 pb-2 pt-4">
            {productRates.map(([label, value, height, danger]) => (
              <div key={label} className="flex flex-col items-center gap-3">
                <div className="flex h-40 w-full items-end bg-[var(--paper-2)] p-2">
                  <div
                    className={`relative flex w-full items-start justify-center pt-2 text-[12px] font-medium ${
                      danger ? "bg-[var(--accent)] text-[var(--paper)]" : "bg-[var(--ink)] text-[var(--paper)]"
                    }`}
                    style={{ height }}
                  >
                    {value}
                  </div>
                </div>
                <span className={`text-[12px] ${danger ? "text-[var(--accent)]" : "text-[var(--gray-2)]"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="よく出るワード — TOP10" meta="Team aggregate">
          <div className="divide-y divide-[var(--line-soft)]">
            {keywords.map(([rank, word, count, danger]) => (
              <div key={word} className="grid grid-cols-[48px_1fr_80px] items-center gap-3 py-3">
                <span
                  className={`font-editorial text-[16px] font-semibold ${
                    danger ? "text-[var(--accent)]" : "text-[var(--gray)]"
                  }`}
                >
                  {rank}
                </span>
                <span
                  className={`text-[15px] ${danger ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}
                >
                  {word}
                </span>
                <span className="font-mono-ui text-right text-[12px] text-[var(--gray-2)]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 className="font-editorial text-[26px] font-semibold text-[var(--ink)]">
            営業マン別一覧
          </h2>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[var(--gray)]">
            Sales Representatives · 25 members · May 2026
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 border border-[var(--line-soft)] bg-[var(--paper-2)] px-4 py-3 text-[12px] text-[var(--gray-2)]">
          <span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
            期間
          </span>
          <span>今月（5月）</span>
          <span className="font-mono-ui ml-3 text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
            商材
          </span>
          <span>すべて</span>
          <span className="font-mono-ui ml-3 text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
            顧客区分
          </span>
          <span>すべて</span>
          <span className="ml-auto font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[var(--gray)]">
            25 Rows
          </span>
        </div>

        <div className="overflow-hidden border border-[var(--line)] bg-[var(--paper)]">
          <table className="w-full text-left">
            <thead className="border-b border-[var(--line)] bg-[var(--paper-2)]">
              <tr className="text-[12px] text-[var(--gray-2)]">
                <th className="px-5 py-4 font-medium">#</th>
                <th className="px-5 py-4 font-medium">営業マン</th>
                <th className="px-5 py-4 font-medium">打ち合わせ数</th>
                <th className="px-5 py-4 font-medium">成約 / 失注 / 検討中</th>
                <th className="px-5 py-4 font-medium">成約率</th>
                <th className="px-5 py-4 font-medium">平均打ち合わせ時間</th>
                <th className="px-5 py-4 font-medium">マニュアル準拠率</th>
                <th className="px-5 py-4 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {reps.map(([rank, name, dept, meetings, outcomes, winRate, avg, manual, status, tone]) => (
                <tr
                  key={name}
                  className={`border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--paper-2)] ${
                    tone === "risk" ? "bg-[rgba(184,51,31,0.03)]" : ""
                  }`}
                >
                  <td
                    className={`font-editorial px-5 py-4 text-[16px] font-semibold ${
                      tone === "good"
                        ? "text-[var(--accent-2)]"
                        : tone === "risk"
                          ? "text-[var(--accent)]"
                          : "text-[var(--gray)]"
                    }`}
                  >
                    {rank}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center text-[13px] font-semibold ${
                          tone === "risk"
                            ? "bg-[rgba(184,51,31,0.15)] text-[var(--accent)]"
                            : "bg-[var(--paper-3)] text-[var(--ink)]"
                        }`}
                      >
                        {name.slice(0, 1)}
                      </span>
                      <div>
                        <div className={`text-[15px] ${tone === "risk" ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>
                          {name}
                        </div>
                        <div className="font-mono-ui text-[11px] text-[var(--gray)]">{dept}</div>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono-ui px-5 py-4 text-[12px] text-[var(--gray-2)]">{meetings}</td>
                  <td className="font-mono-ui px-5 py-4 text-[12px] text-[var(--gray-2)]">{outcomes}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono-ui text-[12px] ${
                          tone === "risk" ? "text-[var(--accent)]" : "text-[var(--ink)]"
                        }`}
                      >
                        {winRate}
                      </span>
                      <div className="h-[8px] w-24 bg-[var(--paper-3)]">
                        <div
                          className={`h-full ${
                            tone === "good"
                              ? "bg-[var(--green)]"
                              : tone === "risk"
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--ink)]"
                          }`}
                          style={{ width: `${Math.min(Number.parseFloat(winRate) * 2, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="font-mono-ui px-5 py-4 text-[12px] text-[var(--gray-2)]">{avg}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-ui text-[12px] text-[var(--gray-2)]">{manual}</span>
                      <div className="h-[8px] w-24 bg-[var(--paper-3)]">
                        <div
                          className={`h-full ${
                            tone === "good"
                              ? "bg-[var(--green)]"
                              : tone === "risk"
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--ink)]"
                          }`}
                          style={{ width: `${Number.parseInt(manual, 10)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill tone={tone} label={status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--line)] bg-[var(--paper)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] px-6 py-5">
        <div className="font-editorial text-[22px] font-semibold text-[var(--ink)]">
          {title}
        </div>
        <div className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--gray)]">
          {meta}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-[14px] text-[var(--ink)]">
        <span className={`h-3 w-3 ${color}`} />
        <span>{label}</span>
      </div>
      <span className="font-mono-ui text-[12px] text-[var(--gray-2)]">{value}</span>
    </div>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: string;
  label: string;
}) {
  const classes =
    tone === "good"
      ? "bg-[var(--green)] text-[var(--paper)]"
      : tone === "risk"
        ? "bg-[var(--accent)] text-[var(--paper)]"
        : "border border-[var(--line-soft)] bg-transparent text-[var(--gray-2)]";

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 text-[12px] ${classes}`}>
      <span className="h-[6px] w-[6px] rounded-full bg-current" />
      {label}
    </span>
  );
}
