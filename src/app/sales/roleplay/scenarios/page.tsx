import Image from "next/image";
import Link from "next/link";

const scenarios = [
  {
    title: "価格が高いと言われたときの値引き交渉",
    category: "価格交渉",
    difficulty: "標準",
    description: "価格に強い懸念を持つ顧客に対して、価値と導入後コストを説明する練習です。",
    source: "株式会社DEF 商談記録",
    selected: true,
  },
  {
    title: "他社サービスとの違いを聞かれたとき",
    category: "競合比較",
    difficulty: "やや難しい",
    description: "機能比較だけでなく、運用支援や成果まで含めて差別化を伝える練習です。",
    source: "株式会社A 商談記録",
    selected: false,
  },
  {
    title: "AI導入に不安がある顧客への説明",
    category: "導入不安",
    difficulty: "標準",
    description: "セキュリティ、運用負荷、社内浸透への不安に寄り添いながら説明します。",
    source: "株式会社B 初回商談",
    selected: false,
  },
] as const;

const customerProfiles = [
  ["役職", "情報システム部 部長"],
  ["企業規模", "300名規模"],
  ["検討状況", "複数社を比較中"],
  ["重視ポイント", "価格・サポート体制"],
] as const;

export default function SalesRoleplayScenariosPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex items-center gap-4">
            <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
            <div className="hidden items-center gap-2 lg:flex">
              <Step number="1" label="シナリオ選択" active href="/sales/roleplay/scenarios" />
              <Step number="2" label="ロープレ中" href="/sales/roleplay" />
              <Step number="3" label="分析結果" href="/sales/roleplay/results" />
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-bold text-[#171717]"
          >
            <GearIcon />
            設定
          </button>
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[24px] font-black text-[#171717]">シナリオを選択</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                  練習したい商談シーンを選んで、AI顧客とのロープレを開始します。
                </p>
              </div>
              <button
                type="button"
                className="rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#3d4350]"
              >
                過去の商談から作成
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {scenarios.map((scenario) => (
                <article
                  key={scenario.title}
                  className={`rounded-[16px] border px-5 py-5 transition ${
                    scenario.selected
                      ? "border-[#f0c655] bg-[#fffdf6] shadow-[0_8px_20px_rgba(245,189,7,0.12)]"
                      : "border-[#e2e6ee] bg-white hover:border-[#f0c655]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-[10px] bg-[#fff3c8] px-3 py-1 text-[12px] font-bold text-[#8a6500]">
                          {scenario.category}
                        </span>
                        <span className="rounded-[10px] bg-[#f1f2f5] px-3 py-1 text-[12px] font-bold text-[#596273]">
                          {scenario.difficulty}
                        </span>
                      </div>
                      <h3 className="mt-3 text-[20px] font-black text-[#171717]">{scenario.title}</h3>
                      <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-[#596273]">
                        {scenario.description}
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[#697180]">
                        <ClipboardIcon />
                        {scenario.source}
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-black ${
                        scenario.selected
                          ? "border-[#ffd12f] bg-[#ffd12f] text-[#171717]"
                          : "border-[#cfd5df] text-[#8a909b]"
                      }`}
                    >
                      {scenario.selected ? "✓" : ""}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Link
                href="/sales/roleplay"
                className="inline-flex h-12 items-center justify-center rounded-[12px] bg-[#ffd12f] px-8 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]"
              >
                ロープレを開始
              </Link>
            </div>
          </div>

          <aside className="rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <h2 className="text-[17px] font-black text-[#171717]">選択中のAI顧客</h2>
            <div className="mt-6 flex flex-col items-center">
              <div className="relative h-[140px] w-[140px] rounded-full bg-[#fff3c8]">
                <Image src="/mojiokoshi.png" alt="AI顧客" width={150} height={150} className="absolute inset-0 h-full w-full object-contain" />
              </div>
              <span className="mt-3 rounded-full bg-[#fff3c8] px-4 py-2 text-[13px] font-bold text-[#8a6500]">
                価格重視タイプ
              </span>
            </div>

            <dl className="mt-6 space-y-3">
              {customerProfiles.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[13px]">
                  <dt className="font-bold text-[#171717]">{label}</dt>
                  <dd className="text-[#343b48]">: {value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-7 rounded-[16px] bg-[#fff8df] px-4 py-4">
              <div className="text-[14px] font-black text-[#171717]">練習のポイント</div>
              <p className="mt-3 text-[13px] leading-6 text-[#343b48]">
                値引きだけで返さず、導入後の支援や運用コストまで含めて価値を説明することを意識しましょう。
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Step({
  number,
  label,
  active = false,
  href,
}: {
  number: string;
  label: string;
  active?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 min-w-[170px] items-center justify-center gap-3 rounded-[12px] border px-4 text-[13px] font-bold ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      <path d="m19 13.5.1-1.5-.1-1.5 2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L13.7 2h-3.4L10 5.1A8 8 0 0 0 7.4 6.6l-2.4-1-2 3.4 2 1.5-.1 1.5.1 1.5-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.3 3.1h3.4l.3-3.1a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <rect x="6" y="5" width="13" height="17" rx="2" />
      <path d="M9 5a3 3 0 0 1 6 0" />
      <path d="M9 10h7M9 14h7" />
    </svg>
  );
}
