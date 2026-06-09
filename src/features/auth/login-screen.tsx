import { Suspense } from "react";
import Image from "next/image";

import { LoginForm } from "@/features/auth/login-form";

type LoginScreenProps = {
  variant?: "default" | "admin";
};

export function LoginScreen({ variant = "default" }: LoginScreenProps) {
  const isAdmin = variant === "admin";

  return (
    <main className="flex min-h-screen justify-center bg-white pt-2 pb-3 sm:pt-3 sm:pb-4 md:pt-4 md:pb-5">
      <section
        className={
          isAdmin
            ? "flex w-full flex-col items-center px-6 pt-0 pb-3 text-center sm:px-14 sm:pt-1 sm:pb-5 md:px-[30vw] md:pt-2 md:pb-7 lg:px-[36vw] xl:px-[39vw]"
            : "flex w-full flex-col items-center px-6 pt-0 pb-3 text-center sm:px-14 sm:pt-1 sm:pb-5 md:px-[28vw] md:pt-2 md:pb-7 lg:px-[34vw] xl:px-[37vw]"
        }
      >
          <Image
            src="/sels1.png"
            alt="selmo"
            width={216}
            height={168}
            priority
            className={`block h-auto ${isAdmin ? "w-[92px] sm:w-[104px] md:w-[118px]" : "w-[104px] sm:w-[118px] md:w-[132px]"}`}
          />

          <div className="mt-2 text-[34px] font-semibold tracking-[0.24em] text-[var(--ink)] sm:text-[38px] md:text-[42px]">
            <span>selmo</span>
            <span className="text-[#ffc400]">.</span>
          </div>

          {isAdmin ? (
            <>
              <div className="mt-3.5 inline-flex items-center gap-2 sm:mt-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#ffc400] text-[var(--ink)] sm:h-8 sm:w-8 sm:rounded-[11px]">
                  <ShieldIcon />
                </span>
                <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--ink)] sm:text-[22px] md:text-[25px]">
                  管理者ログイン
                </h1>
              </div>
              <p className="mt-2.5 text-[12px] leading-6 text-[#4f5663] sm:mt-3 sm:text-[13px] sm:leading-6 md:text-[14px]">
                管理者専用のダッシュボードにアクセスします。
                <br />
                全体の営業状況を可視化・分析できます。
              </p>
              <div className="mt-4.5 h-px w-full bg-[#e5e7eb] sm:mt-5" />
            </>
          ) : (
            <>
              <h1 className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-[var(--ink)] sm:text-[24px] md:text-[28px]">
                ログイン
              </h1>
              <p className="mt-2.5 text-[13px] leading-6 text-[#4f5663] sm:text-[14px] md:text-[15px]">
                アカウントにログインして、続きをはじめましょう。
              </p>
            </>
          )}

          <Suspense
            fallback={
              <div className="mt-10 w-full text-left text-sm text-[var(--gray)]">
                フォームを読み込み中...
              </div>
            }
          >
            <LoginForm variant={variant} />
          </Suspense>
      </section>
    </main>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M12 2.5 4.5 5.38v5.75c0 5.1 3.25 9.88 7.5 10.87 4.25-.99 7.5-5.77 7.5-10.87V5.38L12 2.5Zm2.98 7.36-3.36 4.7a.9.9 0 0 1-1.33.18L8.04 13a.9.9 0 1 1 1.12-1.4l1.5 1.2 2.86-4a.9.9 0 1 1 1.46 1.06Z" />
    </svg>
  );
}
