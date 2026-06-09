import Link from "next/link";

export default function SalesRoleplayScenariosPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f8fb] px-5 py-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="scenario" />

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-10 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[24px] font-black text-[#171717]">シナリオを選択</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#596273]">
                  登録されたロープレシナリオがここに表示されます。
                </p>
              </div>
              <button
                type="button"
                className="rounded-[12px] border border-[#e2e6ee] bg-white px-4 py-3 text-[13px] font-bold text-[#3d4350]"
              >
                過去の商談から作成
              </button>
            </div>

            <div className="mt-6 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-12 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#8f96a3] shadow-[0_6px_14px_rgba(17,24,39,0.04)]">
                <ScenarioIcon />
              </span>
              <h3 className="mt-4 text-[20px] font-black text-[#171717]">シナリオはまだありません</h3>
              <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-7 text-[#7a808c]">
                商談データや管理者が作成した練習テーマが追加されると、ここから選択できます。
              </p>
            </div>
          </article>

          <aside className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
            <h2 className="text-[18px] font-black text-[#171717]">選択中のAI顧客</h2>
            <div className="mt-5 rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
              <h3 className="text-[18px] font-bold text-[#171717]">未選択</h3>
              <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                シナリオを選ぶと、AI顧客の条件が表示されます。
              </p>
            </div>
          </aside>
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

function ScenarioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  );
}
