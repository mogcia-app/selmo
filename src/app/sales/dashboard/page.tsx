import Image from "next/image";

const kpis = [
  {
    label: "成約率",
    value: "28.6",
    unit: "%",
    note: "先月比",
    delta: "+3.2pt",
    deltaTone: "up" as const,
    icon: <TargetIcon />,
    tone: "green" as const,
  },
  {
    label: "打ち合わせ件数",
    value: "32",
    unit: "件",
    note: "先月比",
    delta: "+6件",
    deltaTone: "up" as const,
    icon: <CallIcon />,
    tone: "green" as const,
  },
  {
    label: "平均通話時間",
    value: "24分18",
    unit: "秒",
    note: "先月比",
    delta: "+3分45秒",
    deltaTone: "up" as const,
    icon: <ClockIcon />,
    tone: "green" as const,
  },
  {
    label: "マニュアル準拠率",
    value: "82",
    unit: "%",
    note: "先月比",
    delta: "+7%",
    deltaTone: "up" as const,
    icon: <ChecklistIcon />,
    tone: "yellow" as const,
  },
  {
    label: "トーク比率（営業・顧客）",
    value: "58 : 42",
    unit: "",
    note: "",
    delta: "良好",
    deltaTone: "neutral" as const,
    icon: <PeopleIcon />,
    tone: "yellow" as const,
  },
];

const trendPoints = [
  { month: "12月", value: "18.7%", x: 72, y: 170 },
  { month: "1月", value: "20.1%", x: 156, y: 158 },
  { month: "2月", value: "22.3%", x: 240, y: 145 },
  { month: "3月", value: "24.8%", x: 324, y: 128 },
  { month: "4月", value: "25.4%", x: 408, y: 124 },
  { month: "5月", value: "28.6%", x: 492, y: 102 },
];

const meetings = [
  ["05/24 14:00", "株式会社サンプル", "鈴木 様", "成約", "52:58"],
  ["05/23 10:30", "株式会社テスト", "田中 様", "商談中", "41:23"],
  ["05/22 15:00", "株式会社ハナマル", "佐藤 様", "失注", "33:12"],
  ["05/21 11:00", "株式会社ミライ", "山本 様", "商談中", "47:09"],
  ["05/20 16:30", "株式会社ネクスト", "伊藤 様", "失注", "28:47"],
];

const winningWords = [
  { rank: "1位", word: "導入後" },
  { rank: "2位", word: "業務効率化" },
  { rank: "3位", word: "サポート" },
  { rank: "4位", word: "安心" },
  { rank: "5位", word: "長期的" },
];

const lostWords = [
  { rank: "1位", word: "検討します" },
  { rank: "2位", word: "価格" },
  { rank: "3位", word: "比較" },
  { rank: "4位", word: "一旦" },
  { rank: "5位", word: "上司確認" },
];

export default function SalesDashboardPage() {
  const trendPath = trendPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${trendPath} L 492 224 L 72 224 Z`;
  const trendChartOffsetX = 14;

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
      <section className="mb-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <Image
            src="/da.png"
            alt="dashboard avatar"
            width={64}
            height={64}
            className="mt-1 h-14 w-14 object-contain"
          />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.03em] text-[#171717]">
              山田さん、おはようございます
            </h1>
            <p className="mt-2 text-[16px] text-[#7a808c]">
              直近の商談傾向と改善ポイントをまとめています。今日の動きをここから確認できます。
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 self-start">
          <button
            type="button"
            className="flex items-center gap-3 rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] font-medium text-[#303544] shadow-[0_6px_20px_rgba(17,24,39,0.04)]"
          >
            <CalendarIcon />
            <span>2026年5月</span>
            <ChevronDownIcon />
          </button>
          <details className="group relative">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[14px] border border-[#e6e8ee] bg-white text-[#4f5663] shadow-[0_6px_20px_rgba(17,24,39,0.04)] marker:content-none">
              <BellIcon />
              <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#ffc400] px-1 text-[11px] font-bold text-[#171717]">
                3
              </span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+12px)] z-20 hidden w-[320px] rounded-[20px] border border-[#e7eaf0] bg-white p-3 shadow-[0_18px_40px_rgba(17,24,39,0.12)] group-open:block">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <div>
                  <div className="text-[14px] font-bold text-[#171717]">通知</div>
                  <div className="text-[12px] text-[#7a808c]">今日チェックしたい項目です</div>
                </div>
                <span className="rounded-full bg-[#fff3cd] px-2.5 py-1 text-[11px] font-semibold text-[#9c7600]">3件</span>
              </div>
              <div className="space-y-2">
                <NotificationItem
                  tone="yellow"
                  title="次回アクション未設定"
                  body="株式会社テストの商談で、次回日程がまだ入っていません。"
                  meta="5分前"
                />
                <NotificationItem
                  tone="green"
                  title="AI分析が完了"
                  body="05/24 14:00の打ち合わせ分析が見られるようになりました。"
                  meta="18分前"
                />
                <NotificationItem
                  tone="gray"
                  title="失注ワードが増加"
                  body="「検討します」「比較」が今週の失注商談で目立っています。"
                  meta="今日 09:20"
                />
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.22fr)_minmax(0,1fr)]">
        <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5 flex items-center gap-2 text-[#171717]">
            <SparkIcon />
            <h2 className="text-[18px] font-bold tracking-[-0.03em]">AIからのフィードバック</h2>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px] xl:items-center">
            <div className="space-y-3">
              <FeedbackCard
                tone="green"
                title="良かった点"
                body="・比較検討時の質問対応が強みです\n・導入後イメージの共有が成約時によく出ています"
              />
              <FeedbackCard
                tone="yellow"
                title="改善点"
                body="・クロージングが少し早い傾向があります\n・価格説明の前に、課題の深掘りを増やしましょう"
              />
              <FeedbackCard
                tone="purple"
                title="次回意識すること"
                body="ヒアリングを深く行い、お客様の課題を明確にした上で最適な提案を行いましょう。"
              />
            </div>

            <div className="flex flex-col items-center justify-center gap-4">
              <div className="relative rounded-[18px] border border-[#eceef4] bg-white px-4 py-4 text-[12px] leading-6 text-[#3d4350] shadow-[0_8px_18px_rgba(17,24,39,0.05)]">
                <div className="font-semibold text-[#171717]">先月より成約率が</div>
                <div className="whitespace-nowrap text-[13px] font-bold text-[#171717]">3.2ptアップしています！</div>
                <div>この調子です！ ✨</div>
                <span className="absolute left-1/2 top-full h-4 w-4 -translate-x-1/2 -translate-y-[7px] rotate-45 border-b border-r border-[#eceef4] bg-white" />
              </div>
              <Image
                src="/sai.png"
                alt="selmo"
                width={150}
                height={150}
                className="h-[118px] w-[118px] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.16)]"
              />
            </div>
          </div>
        </article>

        <article className="flex h-full flex-col rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#171717]">成約率の推移</h2>
            <button
              type="button"
              className="rounded-[12px] border border-[#e6e8ee] bg-white px-3 py-2 text-[13px] font-medium text-[#505866]"
            >
              月次
            </button>
          </div>

          <div className="flex flex-1 items-stretch">
            <svg viewBox="0 0 560 280" preserveAspectRatio="none" className="h-full min-h-[270px] w-full">
            <defs>
              <linearGradient id="dashboardTrendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffc400" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ffc400" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <g transform={`translate(${trendChartOffsetX} 0)`}>
              {[50, 105, 160, 215].map((y) => (
                <line key={y} x1="36" y1={y} x2="514" y2={y} stroke="#eceef4" strokeDasharray="3 6" />
              ))}
              {["40%", "30%", "20%", "10%", "0%"].map((label, index) => (
                <text key={label} x="0" y={[54, 109, 164, 219, 274][index]} fontSize="12" fill="#7a808c">
                  {label}
                </text>
              ))}
              <path d={areaPath} fill="url(#dashboardTrendFill)" />
              <path d={trendPath} fill="none" stroke="#f5bd07" strokeWidth="3.5" strokeLinecap="round" />
              {trendPoints.map((point, index) => (
                <g key={point.month}>
                  <text x={point.x - 12} y={point.y - 16} fontSize="12" fontWeight="600" fill="#303544">
                    {point.value}
                  </text>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={index === trendPoints.length - 1 ? 6 : 4}
                    fill={index === trendPoints.length - 1 ? "#f5bd07" : "#ffffff"}
                    stroke="#f5bd07"
                    strokeWidth="3"
                  />
                </g>
              ))}
              {trendPoints.map((point) => (
                <text key={`${point.month}-label`} x={point.x} y="258" textAnchor="middle" fontSize="13" fill="#7a808c">
                  {point.month}
                </text>
              ))}
              <rect x="454" y="66" width="64" height="32" rx="10" fill="#ffc400" />
              <text x="486" y="87" textAnchor="middle" fontSize="14" fontWeight="700" fill="#171717">
                28.6%
              </text>
            </g>
            </svg>
          </div>
        </article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <article className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#171717]">最近の打ち合わせ</h2>
            <a href="#" className="text-[14px] font-semibold text-[#7c84ff]">
              すべて見る ›
            </a>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#edf0f5] bg-[linear-gradient(180deg,#fcfcfe_0%,#f8f9fc_100%)] p-2">
            <table className="w-full border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-[12px] font-semibold text-[#7a808c]">
                  <th className="px-3 pb-1">日時</th>
                  <th className="px-3 pb-1">会社名 / 担当者</th>
                  <th className="px-3 pb-1">結果</th>
                  <th className="px-3 pb-1">通話時間</th>
                  <th className="px-3 pb-1">分析</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map(([date, company, contact, outcome, duration]) => (
                  <tr
                    key={`${date}-${company}`}
                    className="text-[14px] text-[#20242c] transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <td className="rounded-l-[16px] border-y border-l border-[#edf0f5] bg-white px-3 py-3 align-top text-[#5d6572]">
                      <div className="font-mono-ui text-[12px] font-semibold tracking-[0.02em] text-[#4d5562]">{date}</div>
                    </td>
                    <td className="border-y border-[#edf0f5] bg-white px-3 py-3">
                      <div className="font-semibold text-[#20242c]">{company}</div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-[#7a808c]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#34b86a]" />
                        {contact}
                      </div>
                    </td>
                    <td className="border-y border-[#edf0f5] bg-white px-3 py-3">
                      <OutcomeBadge value={outcome} />
                    </td>
                    <td className="border-y border-[#edf0f5] bg-white px-3 py-3">
                      <span className="font-mono-ui text-[13px] font-semibold text-[#303544]">{duration}</span>
                    </td>
                    <td className="rounded-r-[16px] border-y border-r border-[#edf0f5] bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d5efdf] bg-[#effaf3] text-[#30c16d]">
                          <CheckIcon />
                        </span>
                        <span className="text-[18px] leading-none text-[#a0a7b3]">›</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="flex h-full flex-col rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5">
            <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#171717]">よく使うワード TOP5</h2>
          </div>
          <div className="grid flex-1 gap-4 md:grid-cols-2">
            <WordPanel
              title="成約時によく出る言葉"
              tone="green"
              words={winningWords}
            />
            <WordPanel
              title="失注時によく出る言葉"
              tone="gray"
              words={lostWords}
            />
          </div>
        </article>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  unit,
  note,
  delta,
  deltaTone,
  icon,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  delta: string;
  deltaTone: "up" | "down" | "neutral";
  icon: React.ReactNode;
  tone: "green" | "yellow";
}) {
  const iconClass = tone === "green" ? "bg-[#edf9f1] text-[#35b86d]" : "bg-[#fff8e7] text-[#f0b400]";
  const deltaClass =
    deltaTone === "down"
      ? "text-[#ff5d47]"
      : deltaTone === "neutral"
        ? "rounded-full bg-[#f2edff] px-2 py-1 text-[#826dff]"
        : "text-[#34b86a]";

  return (
    <article className="rounded-[22px] border border-[#eceef4] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}>{icon}</div>
      <div className="text-[15px] font-semibold text-[#303544]">{label}</div>
      <div className="mt-4 flex items-end gap-1 text-[#171717]">
        <span className="text-[24px] font-bold leading-none tracking-[-0.03em]">{value}</span>
        {unit ? <span className="pb-0.5 text-[13px] font-semibold">{unit}</span> : null}
      </div>
      {note ? (
        <div className="mt-4 flex items-center gap-2 text-[13px]">
          <span className="text-[#7d8490]">{note}</span>
          <span className={`font-semibold ${deltaClass}`}>{delta}</span>
        </div>
      ) : (
        <div className="mt-4">
          <span className={`text-[12px] font-semibold ${deltaClass}`}>{delta}</span>
        </div>
      )}
    </article>
  );
}

function FeedbackCard({
  title,
  tone,
  body,
}: {
  title: string;
  tone: "green" | "yellow" | "purple";
  body: string;
}) {
  const toneClass =
    tone === "green"
      ? "bg-[#f4faf6] text-[#2f8f56]"
      : tone === "yellow"
        ? "bg-[#fff8ec] text-[#ff9b38]"
        : "bg-[#f5f2ff] text-[#7a68ff]";

  return (
    <div className={`rounded-[18px] px-4 py-4 ${toneClass}`}>
      <div className="mb-2 text-[14px] font-bold">{title}</div>
      <div className="whitespace-pre-line text-[14px] leading-7 text-[#3d4350]">{body}</div>
    </div>
  );
}

function WordPanel({
  title,
  tone,
  words,
}: {
  title: string;
  tone: "green" | "gray";
  words: Array<{ rank: string; word: string }>;
}) {
  const isGreen = tone === "green";

  return (
    <div
      className={`flex h-full flex-col rounded-[18px] border px-4 py-4 ${
        isGreen
          ? "border-[#e2efe6] bg-[#fcfefc]"
          : "border-[#eceef4] bg-[#fcfcfd]"
      }`}
    >
      <div className="mb-3">
        <div
          className={`inline-flex rounded-[10px] px-3 py-2 text-[13px] font-semibold ${
            isGreen ? "bg-[#eef8f0] text-[#5f9b70]" : "bg-[#f3f4f7] text-[#6f7785]"
          }`}
        >
          {title}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1">
        {words.map((item, index) => (
          <div key={item.word} className="flex items-center gap-3 px-1 py-1 text-[15px] text-[#303544]">
            <span
              className={`w-8 text-[13px] font-semibold ${
                index === 0 ? "text-[#171717]" : "text-[#6f7785]"
              }`}
            >
              {item.rank}
            </span>
            <span className="truncate font-medium text-[#303544]">{item.word}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeBadge({ value }: { value: string }) {
  const className =
    value === "成約"
      ? "bg-[#e9f9ee] text-[#30a65b]"
      : value === "商談中"
        ? "bg-[#fff4df] text-[#ff9b38]"
        : "bg-[#f1f3f7] text-[#6d7482]";

  return <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${className}`}>{value}</span>;
}

function NotificationItem({
  title,
  body,
  meta,
  tone,
}: {
  title: string;
  body: string;
  meta: string;
  tone: "green" | "yellow" | "gray";
}) {
  const dotClass =
    tone === "green" ? "bg-[#34b86a]" : tone === "yellow" ? "bg-[#f0b400]" : "bg-[#9aa3b2]";

  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-[16px] border border-[#edf0f5] bg-[#fbfbfd] px-3 py-3 text-left transition-colors hover:bg-white"
    >
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-[#20242c]">{title}</span>
          <span className="shrink-0 text-[11px] text-[#8b92a0]">{meta}</span>
        </span>
        <span className="mt-1 block text-[12px] leading-5 text-[#68707d]">{body}</span>
      </span>
    </button>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M16.4 7.6 20 4" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M6.3 4.8c.4-.4 1-.54 1.53-.35l2.1.8c.68.25 1.07.98.9 1.68l-.42 1.82a1.3 1.3 0 0 0 .31 1.18l3.34 3.34c.3.3.75.42 1.18.31l1.82-.42c.7-.16 1.43.23 1.68.9l.8 2.1c.2.53.05 1.13-.35 1.53l-1.25 1.25c-.8.8-1.99 1.1-3.08.79-2.66-.76-5.59-2.88-8.08-5.37C5.2 13.66 3.08 10.73 2.32 8.07c-.31-1.09 0-2.28.79-3.08L4.36 3.73Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.6v4.8l3.2 1.9" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 3.8 5.6 6.2v4.9c0 4.15 2.72 7.93 6.4 9.1 3.68-1.17 6.4-4.95 6.4-9.1V6.2L12 3.8Z" />
      <path d="m9.4 11.8 1.6 1.6 3.6-4.1" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="8.2" cy="9" r="2.6" />
      <circle cx="15.8" cy="9" r="2.6" />
      <path d="M3.8 17.6c.7-2.3 2.63-3.6 4.4-3.6 1.76 0 3.7 1.3 4.4 3.6" />
      <path d="M11.4 17.6c.7-2.3 2.63-3.6 4.4-3.6 1.76 0 3.7 1.3 4.4 3.6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-[#ffc400]">
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3ZM19.5 4.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4ZM18.2 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-none stroke-current stroke-[2]">
      <path d="m3.2 8.1 2.2 2.2 4.7-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="3.75" y="5.5" width="16.5" height="14.5" rx="2.2" />
      <path d="M7.5 3.75v3.5M16.5 3.75v3.5M3.75 9.5h16.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] fill-none stroke-current stroke-[2]">
      <path d="M6.7 16.4h10.6l-1.2-1.8V10a4.1 4.1 0 0 0-8.2 0v4.6l-1.2 1.8Z" />
      <path d="M10 18.2a2 2 0 0 0 4 0" />
    </svg>
  );
}
