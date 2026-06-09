import Image from "next/image";
import Link from "next/link";

const customerFacts = [
  ["役職", "情報システム部 部長"],
  ["企業規模", "300名規模"],
  ["検討状況", "複数社を比較中"],
  ["重視ポイント", "価格・サポート体制"],
  ["性格", "慎重でコスパを重視する"],
] as const;

const customerTraits = [
  "価格に敏感で比較検討を重視する",
  "リスクを避ける慎重な意思決定タイプ",
  "サポート体制に不安を感じている",
] as const;

const messages = [
  {
    speaker: "AI顧客",
    text: "他社と比べて、やはり価格は高いですよね？",
    time: "00:12",
    side: "left",
  },
  {
    speaker: "あなた",
    text: "サポート体制を含めてご説明すると、導入後の運用コストまで考えると...",
    time: "00:18",
    side: "right",
  },
  {
    speaker: "AI顧客",
    text: "でも、初期費用の差が結構大きいので、上司を説得するのが難しくて...",
    time: "00:28",
    side: "left",
  },
  {
    speaker: "あなた",
    text: "そうですよね、予算を超えてしまうと社内調整も大変ですよね。",
    time: "00:32",
    side: "right",
  },
  {
    speaker: "AI顧客",
    text: "はい...正直、これ以上の予算は取れないと思います。",
    time: "00:40",
    side: "left",
  },
] as const;

const evaluations = [
  { label: "共感表現", score: "60点", tone: "red", state: "△" },
  { label: "価格説明", score: "80点", tone: "blue", state: "○" },
  { label: "価値訴求", score: "65点", tone: "green", state: "△" },
  { label: "クロージング", score: "—", tone: "red", state: "—" },
] as const;

export default function SalesRoleplayPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
          <div className="flex items-center gap-4">
            <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">
              AIロープレ
            </h1>
            <div className="hidden items-center gap-2 lg:flex">
              <Step number="1" label="シナリオ選択" href="/sales/roleplay/scenarios" />
              <Step number="2" label="ロープレ中" active href="/sales/roleplay" />
              <Step number="3" label="分析結果" href="/sales/roleplay/results" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-bold text-[#171717]"
            >
              <GearIcon />
              設定
            </button>
            <Link
              href="/sales/roleplay/results"
              className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#ffb5b5] bg-white px-4 text-[13px] font-bold text-[#ff3d3d]"
            >
              <StopIcon />
              ロープレを終了
            </Link>
          </div>
        </header>

        <section className="mt-4 grid gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] lg:grid-cols-[minmax(0,1fr)_1px_420px]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[14px] font-black text-[#171717]">シナリオ</span>
            <span className="rounded-[10px] bg-[#fff3c8] px-3 py-1.5 text-[13px] font-bold text-[#8a6500]">
              価格交渉
            </span>
            <h2 className="text-[20px] font-black text-[#171717]">
              価格が高いと言われたときの値引き交渉
            </h2>
          </div>
          <div className="hidden bg-[#e2e6ee] lg:block" />
          <div className="flex items-center gap-4">
            <span className="text-[14px] font-black text-[#171717]">練習元（実会話ベース）</span>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border border-[#e2e6ee] bg-white px-3 py-2">
              <ClipboardIcon />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-[#171717]">株式会社DEF 商談記録</div>
                <div className="text-[12px] text-[#697180]">2024/05/12　失注案件</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[350px_minmax(0,1fr)_410px]">
          <aside className="rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-black text-[#171717]">AI顧客</h2>
              <button className="rounded-[10px] border border-[#e2e6ee] px-3 py-2 text-[12px] font-bold text-[#3d4350]">
                設定を確認
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center">
              <div className="relative h-[132px] w-[132px] rounded-full bg-[#fff3c8]">
                <Image
                  src="/mojiokoshi.png"
                  alt="AI顧客"
                  width={150}
                  height={150}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <span className="mt-3 rounded-full bg-[#fff3c8] px-4 py-2 text-[13px] font-bold text-[#8a6500]">
                価格重視タイプ
              </span>
            </div>

            <dl className="mt-6 space-y-3 border-b border-[#e8ebf0] pb-5">
              {customerFacts.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[13px]">
                  <dt className="font-bold text-[#171717]">{label}</dt>
                  <dd className="text-[#343b48]">: {value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <h3 className="text-[14px] font-black text-[#171717]">この顧客の特徴</h3>
              <ul className="mt-4 space-y-3">
                {customerTraits.map((trait) => (
                  <li key={trait} className="flex gap-2 text-[13px] text-[#343b48]">
                    <CheckIcon />
                    <span>{trait}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 rounded-[16px] bg-[#fff8df] px-4 py-4">
              <h3 className="text-[13px] font-black text-[#171717]">実際の発言例</h3>
              <div className="mt-3 space-y-2">
                {["費用対効果が見えません", "他社と比べて高いですよね？", "これ以上の予算は取れないです"].map((text) => (
                  <div key={text} className="rounded-[10px] bg-white px-3 py-2 text-[12px] font-semibold text-[#343b48]">
                    「{text}」
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-[18px] border border-[#e2e6ee] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between border-b border-[#e8ebf0] px-6 py-4">
              <div className="flex items-center gap-3">
                <WaveIcon />
                <span className="text-[13px] font-bold text-[#343b48]">通話中</span>
                <span className="text-[15px] font-black text-[#171717]">02:45</span>
              </div>
              <div className="flex items-center gap-3">
                <CircleButton label="ミュート"><MicIcon /></CircleButton>
                <button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ef3f3f] text-white">
                  <PhoneIcon />
                </button>
                <CircleButton label="設定"><GearIcon /></CircleButton>
              </div>
            </div>

            <div className="min-h-[590px] space-y-5 px-6 py-6">
              {messages.map((message) => (
                <ChatBubble key={`${message.speaker}-${message.time}`} message={message} />
              ))}
            </div>

            <div className="border-t border-[#e8ebf0] px-6 py-4">
              <div className="rounded-[12px] border border-[#e8ebf0] bg-white px-4 py-3 text-[13px] font-bold text-[#8a6500]">
                AI顧客が話しています...
              </div>
              <div className="mt-4 h-10 rounded-[12px] bg-[repeating-linear-gradient(90deg,#ffd12f_0_6px,transparent_6px_15px)] opacity-80" />
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-[13px] font-semibold text-[#343b48]">あなたの発話を待っています</span>
                <button className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-[#171717] px-8 text-[14px] font-bold text-white">
                  <MicIcon />
                  長押しで話す
                </button>
              </div>
            </div>
          </section>

          <aside className="rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-black text-[#171717]">リアルタイム分析</h2>
              <button className="rounded-[10px] border border-[#e2e6ee] px-3 py-2 text-[12px] font-bold text-[#3d4350]">
                分析の見方
              </button>
            </div>

            <div className="mt-6 flex items-center gap-6">
              <div className="flex h-[126px] w-[126px] items-center justify-center rounded-full bg-[conic-gradient(#ffd12f_0_72%,#eceef4_72%_100%)]">
                <div className="flex h-[90px] w-[90px] flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-[32px] font-black text-[#171717]">72</span>
                  <span className="text-[12px] text-[#596273]">/100点</span>
                </div>
              </div>
              <div>
                <div className="text-[17px] font-black text-[#171717]">いい調子です！</div>
                <p className="mt-2 text-[14px] leading-6 text-[#343b48]">このまま続けましょう</p>
              </div>
            </div>

            <div className="mt-7 border-t border-[#e8ebf0] pt-5">
              <div className="flex items-center justify-between text-[13px] font-bold text-[#171717]">
                <span>会話のバランス</span>
                <span>AI顧客</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#d8dbe1]">
                <div className="h-full w-[52%] rounded-full bg-[#ffd12f]" />
              </div>
              <div className="mt-3 flex justify-between text-[13px] text-[#343b48]">
                <span>あなた</span>
                <span>52%</span>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-[14px] font-black text-[#171717]">評価項目</h3>
              <div className="mt-3 space-y-2">
                {evaluations.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-[12px] border border-[#e8ebf0] bg-white px-3 py-3">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[9px] ${evaluationToneMap[item.tone]}`}>
                      {item.state}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-black text-[#171717]">{item.label}</div>
                      <div className="mt-0.5 truncate text-[11px] text-[#697180]">項目の達成度をリアルタイムで評価</div>
                    </div>
                    <span className="text-[13px] font-bold text-[#171717]">{item.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-[16px] bg-[#fff7e8] px-4 py-4">
              <div className="text-[14px] font-black text-[#171717]">AIからのアドバイス</div>
              <p className="mt-3 text-[13px] leading-6 text-[#343b48]">
                価格への懸念に対して、共感はできていますが、具体的な価値や他社との違いをもう少し説明すると効果的です。
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

const evaluationToneMap: Record<string, string> = {
  red: "bg-[#ffe8e8] text-[#ef3f3f]",
  blue: "bg-[#e8f1ff] text-[#4b7deb]",
  green: "bg-[#e6f7e9] text-[#35a854]",
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
        active
          ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]"
          : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}

function CircleButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e6ee] bg-white text-[#171717]"
    >
      {children}
    </button>
  );
}

function ChatBubble({ message }: { message: (typeof messages)[number] }) {
  const isUser = message.side === "right";
  return (
    <div className={`flex items-end gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? <Avatar type="ai" /> : null}
      <div
        className={`max-w-[430px] rounded-[16px] px-5 py-3 shadow-[0_6px_16px_rgba(17,24,39,0.08)] ${
          isUser ? "bg-[#fff4cf]" : "border border-[#e2e6ee] bg-white"
        }`}
      >
        <div className="text-[12px] font-bold text-[#596273]">{message.speaker}</div>
        <p className="mt-1 text-[15px] leading-7 text-[#171717]">{message.text}</p>
        <div className="mt-1 text-right text-[11px] text-[#697180]">{message.time}</div>
      </div>
      {isUser ? <Avatar type="user" /> : null}
    </div>
  );
}

function Avatar({ type }: { type: "ai" | "user" }) {
  if (type === "ai") {
    return (
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff3c8]">
        <Image src="/mojiokoshi.png" alt="AI顧客" width={42} height={42} className="h-10 w-10 object-contain" />
      </span>
    );
  }

  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e9eef7] text-[22px]">
      👨🏻‍💼
    </span>
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

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.9] text-[#171717]">
      <rect x="6" y="5" width="13" height="17" rx="2" />
      <path d="M9 5a3 3 0 0 1 6 0" />
      <path d="M9 10h7M9 14h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-[#d79d00] stroke-[2]">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-[#33bd6f] stroke-[2]">
      <path d="M4 14v-4M8 17V7M12 14v-4M16 17V7M20 14v-4" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[2.2]">
      <path d="M6.5 10.5c2 4 4 6 8 8l2.2-2.2a1.4 1.4 0 0 1 1.4-.3l2.2.7a1.3 1.3 0 0 1 .9 1.3V21a1.2 1.2 0 0 1-1.3 1.2C9.8 21.5 2.5 14.2 1.8 4.1A1.2 1.2 0 0 1 3 2.8h3a1.3 1.3 0 0 1 1.3.9l.7 2.2a1.4 1.4 0 0 1-.3 1.4L6.5 10.5Z" />
    </svg>
  );
}
