import Image from "next/image";
import Link from "next/link";

export default function SalesRoleplayPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="practice" />

        <section className="mt-4 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-12 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-10 md:py-16">
          <Image
            src="/mojiokoshi.png"
            alt="AIロープレ"
            width={180}
            height={180}
            priority
            className="mx-auto h-[140px] w-[140px] object-contain"
          />
          <h1 className="mt-5 text-[28px] font-black tracking-[-0.04em] text-[#171717]">
            ロープレはまだ開始されていません
          </h1>
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
            シナリオを選択すると、AI顧客との練習画面がここに表示されます。
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/sales/roleplay/scenarios"
              className="inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]"
            >
              シナリオを選択
            </Link>
            <Link
              href="/sales/roleplay/results"
              className="inline-flex h-12 items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white px-7 text-[14px] font-bold text-[#3d4350]"
            >
              分析結果を見る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function RoleplayHeader({ activeStep }: { activeStep: "scenario" | "practice" | "results" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href="/sales/roleplay/scenarios" />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href="/sales/roleplay" />
        <Step number="3" label="分析結果" active={activeStep === "results"} href="/sales/roleplay/results" />
      </div>
    </header>
  );
}

function Step({ number, label, active = false, href }: { number: string; label: string; active?: boolean; href: string }) {
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
