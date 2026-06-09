import Image from "next/image";

import { RegisterForm } from "@/features/auth/register-form";

const featureItems = [
  {
    title: "営業状況の可視化",
    description: "成約率や通話件数などをダッシュボードで一目で確認できます。",
    icon: <ChartIcon />,
  },
  {
    title: "AIによる分析とコメント",
    description: "マニュアルチェックとAIコメントで改善ポイントが明確になります。",
    icon: <ChecklistIcon />,
  },
  {
    title: "安全なデータ管理",
    description: "音声データの暗号化とアクセス制限で安心してご利用いただけます。",
    icon: <ShieldIcon />,
  },
];

export function RegisterScreen() {
  return (
    <main className="min-h-screen bg-white px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <section className="mx-auto w-full max-w-[760px] overflow-hidden rounded-[18px] bg-white shadow-[0_12px_28px_rgba(31,41,55,0.05)]">
        <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative overflow-hidden px-3.5 py-4 sm:px-4 sm:py-5 lg:px-4.5 lg:py-5">
            <Image
              src="/sinki.png"
              alt="selmo register background"
              fill
              priority
              className="object-cover object-center"
            />
            <div className="relative z-10">
              <div className="mt-44 sm:mt-52 lg:mt-60">
                <p className="text-[14px] font-bold tracking-[-0.03em] text-[var(--ink)] sm:text-[16px]">
                  営業活動を、もっとスマートに。
                </p>
                <p className="mt-2 text-[10px] leading-5 text-[#606876] sm:text-[11px] sm:leading-6">
                  通話の分析と可視化で、
                  <br />
                  営業チームの成果を最大化します。
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {featureItems.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-2.5 rounded-[12px] bg-white/88 px-3 py-3 shadow-[0_5px_12px_rgba(255,196,0,0.05)]"
                  >
                    <div className="mt-0.5 shrink-0 text-[#ffc400]">{item.icon}</div>
                    <div>
                      <div className="text-[12px] font-bold tracking-[-0.02em] text-[var(--ink)]">
                        {item.title}
                      </div>
                      <p className="mt-1 text-[10px] leading-5 text-[#677080]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white px-3.5 py-4 sm:px-4 sm:py-5 lg:px-5 lg:py-5">
            <div className="mx-auto max-w-[300px]">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff3d0] text-[#f0b400]">
                <RegisterBadgeIcon />
              </div>

              <h2 className="mt-3 text-[18px] font-bold tracking-[-0.04em] text-[var(--ink)] sm:text-[22px]">
                新規アカウント登録
              </h2>
              <p className="mt-2 text-[11px] leading-5 text-[#5d6572] sm:text-[12px]">
                管理者アカウントを作成して
                <br />
                selmo. をはじめましょう。
              </p>

              <RegisterForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function RegisterBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5 fill-none stroke-current stroke-[1.8]">
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4.5 18.1c.88-2.7 3.08-4.35 5.5-4.35s4.62 1.65 5.5 4.35" />
      <path d="M18.2 8.8v6.4" />
      <path d="M15 12h6.4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M4 20h16" />
      <rect x="5" y="11" width="3.5" height="7" rx="1" />
      <rect x="10.25" y="7" width="3.5" height="11" rx="1" />
      <rect x="15.5" y="3" width="3.5" height="15" rx="1" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="5" y="3.5" width="14" height="17" rx="2.4" />
      <path d="M9 8.2h6.3" />
      <path d="M9 12.2h6.3" />
      <path d="M9 16.2h6.3" />
      <path d="m6.8 8.4 1 1 1.7-2.1" />
      <path d="m6.8 12.4 1 1 1.7-2.1" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 3 5.5 5.6v5.1c0 4.6 2.94 8.9 6.5 10 3.56-1.1 6.5-5.4 6.5-10V5.6L12 3Z" />
      <path d="M12 8.2v5.3" />
      <path d="M9.8 11.9h4.4" />
    </svg>
  );
}
