import Link from "next/link";

const scoreItems = [
  { label: "共感表現", score: 60, note: "相手の懸念には触れられていますが、感情への寄り添いを一言足すと自然です。", tone: "red" },
  { label: "価格説明", score: 80, note: "初期費用だけでなく運用コストまで含めて説明できています。", tone: "blue" },
  { label: "価値訴求", score: 65, note: "価値は伝えていますが、他社比較の具体例があるとさらに強くなります。", tone: "green" },
  { label: "クロージング", score: 52, note: "次回アクションの合意をもう少し明確にすると良いです。", tone: "yellow" },
] as const;

const highlights = [
  "価格懸念に対して、すぐ値引きに寄らずサポート体制を説明できた",
  "顧客の予算制約に共感する発言があった",
  "導入後のコスト削減効果を数字で補足できるとさらに良い",
] as const;

const transcript = [
  { speaker: "AI顧客", text: "他社と比べて、やはり価格は高いですよね？", time: "00:12" },
  { speaker: "あなた", text: "サポート体制を含めてご説明すると、導入後の運用コストまで考えると...", time: "00:18" },
  { speaker: "AI顧客", text: "でも、初期費用の差が結構大きいので、上司を説得するのが難しくて...", time: "00:28" },
  { speaker: "あなた", text: "そうですよね、予算を超えてしまうと社内調整も大変ですよね。", time: "00:32" },
] as const;

export default function SalesRoleplayResultsPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex items-center gap-4">
            <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
            <div className="hidden items-center gap-2 lg:flex">
              <Step number="1" label="シナリオ選択" href="/sales/roleplay/scenarios" />
              <Step number="2" label="ロープレ中" href="/sales/roleplay" />
              <Step number="3" label="分析結果" active href="/sales/roleplay/results" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sales/roleplay/scenarios"
              className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-bold text-[#171717]"
            >
              別シナリオで練習
            </Link>
            <Link
              href="/sales/roleplay"
              className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[#ffd12f] px-4 text-[13px] font-bold text-[#171717]"
            >
              もう一度ロープレ
            </Link>
          </div>
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="text-[14px] font-bold text-[#596273]">総合スコア</div>
            <div className="mt-5 flex justify-center">
              <div className="flex h-[190px] w-[190px] items-center justify-center rounded-full bg-[conic-gradient(#ffd12f_0_72%,#eceef4_72%_100%)]">
                <div className="flex h-[138px] w-[138px] flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-[48px] font-black text-[#171717]">72</span>
                  <span className="text-[13px] text-[#596273]">/100点</span>
                </div>
              </div>
            </div>
            <div className="mt-5 text-center">
              <h2 className="text-[22px] font-black text-[#171717]">いい調子です</h2>
              <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                価格説明は良好です。共感表現と次回アクションの明確化を強化しましょう。
              </p>
            </div>

            <div className="mt-6 rounded-[16px] bg-[#fff8df] px-4 py-4">
              <div className="text-[14px] font-black text-[#171717]">次に意識すること</div>
              <p className="mt-3 text-[13px] leading-6 text-[#343b48]">
                価格の話に入る前に「ご予算の制約は大きな判断材料ですよね」と一度受け止めると、提案が入りやすくなります。
              </p>
            </div>
          </aside>

          <div className="space-y-4">
            <section className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h2 className="text-[20px] font-black text-[#171717]">評価項目</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {scoreItems.map((item) => (
                  <article key={item.label} className="rounded-[14px] border border-[#e8ebf0] bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[15px] font-black text-[#171717]">{item.label}</h3>
                      <span className="text-[18px] font-black text-[#171717]">{item.score}点</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8ebf0]">
                      <div className={`h-full rounded-full ${scoreToneMap[item.tone]}`} style={{ width: `${item.score}%` }} />
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-[#596273]">{item.note}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <article className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
                <h2 className="text-[20px] font-black text-[#171717]">会話ハイライト</h2>
                <ul className="mt-5 space-y-3">
                  {highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-3 rounded-[12px] bg-[#fbfbfc] px-4 py-3 text-[14px] leading-6 text-[#343b48]">
                      <CheckIcon />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
                <h2 className="text-[20px] font-black text-[#171717]">会話バランス</h2>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e8ebf0]">
                  <div className="h-full w-[52%] rounded-full bg-[#ffd12f]" />
                </div>
                <div className="mt-3 flex justify-between text-[13px] font-bold text-[#596273]">
                  <span>あなた 52%</span>
                  <span>AI顧客 48%</span>
                </div>
                <p className="mt-5 text-[13px] leading-6 text-[#596273]">
                  話す量は適切です。次は質問のあとに相手の回答をもう一段掘ると、ニーズ把握が深まります。
                </p>
              </article>
            </section>

            <section className="rounded-[18px] border border-[#e2e6ee] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h2 className="text-[20px] font-black text-[#171717]">会話ログ</h2>
              <div className="mt-5 space-y-3">
                {transcript.map((line) => (
                  <div key={`${line.speaker}-${line.time}`} className="grid gap-3 rounded-[12px] border border-[#e8ebf0] px-4 py-3 md:grid-cols-[90px_minmax(0,1fr)_64px]">
                    <div className="text-[13px] font-black text-[#171717]">{line.speaker}</div>
                    <div className="text-[13px] leading-6 text-[#343b48]">{line.text}</div>
                    <div className="text-right text-[12px] text-[#697180]">{line.time}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

const scoreToneMap: Record<string, string> = {
  red: "bg-[#ef3f3f]",
  blue: "bg-[#4b7deb]",
  green: "bg-[#35a854]",
  yellow: "bg-[#ffd12f]",
};

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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 fill-none stroke-[#d79d00] stroke-[2]">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}
