"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import type { UserRole } from "@/types/domain";

type RouteGuardProps = {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
};

export function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isFirebaseReady, isLoading, profile, missingEnvKeys } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
      router.replace(profile.role === "admin" ? "/admin/dashboard" : "/sales/dashboard");
    }
  }, [allowedRoles, isAuthenticated, isLoading, pathname, profile, router]);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isFirebaseReady) {
    return (
      <GuardMessage
        title="Firebase環境変数が未設定です"
        body={`少なくとも ${missingEnvKeys[0] ?? "NEXT_PUBLIC_FIREBASE_API_KEY"} を設定してから再度お試しください。`}
      />
    );
  }

  if (!isAuthenticated) {
    return <GuardMessage title="ログインが必要です" body="ログイン後にこの画面へ移動できます。" />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return (
      <GuardMessage
        title="この画面にはアクセスできません"
        body={`現在の権限は ${profile.role} です。閲覧可能なダッシュボードへ移動します。`}
      />
    );
  }

  return <>{children}</>;
}

function AuthLoadingScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fffdf8] px-4 py-8 sm:px-6 sm:py-10">
      <Image
        src="/nin.png"
        alt="認証中の背景"
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-white/18" />

      <section className="relative z-10 w-full max-w-[820px] rounded-[14px] border border-[#ece8df] bg-white/92 px-6 py-14 text-center shadow-[0_24px_70px_rgba(31,28,20,0.10)] backdrop-blur-[3px] sm:px-10 md:px-16 md:py-20">
        <Image
          src="/nini.png"
          alt="selmo"
          width={260}
          height={190}
          priority
          className="mx-auto h-auto w-[150px] sm:w-[180px] md:w-[210px]"
        />

        <h1 className="mt-4 text-[30px] font-bold tracking-[-0.04em] text-[#20242c] sm:text-[36px]">
          認証中です
        </h1>
        <p className="mx-auto mt-5 max-w-[420px] text-[16px] leading-8 text-[#3f4652] sm:text-[18px]">
          しばらくお待ちください。
          <br />
          安全にログイン処理を行っています。
        </p>

        <div className="mt-10 flex justify-center">
          <span className="block h-16 w-16 animate-spin rounded-full border-[8px] border-[#fff1ce] border-t-[#ffc400]" />
        </div>

        <p className="mt-9 text-[15px] text-[#6f7684] sm:text-[17px]">
          この画面を閉じずにお待ちください
        </p>
      </section>
    </main>
  );
}

function GuardMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <Image
        src="/nin.png"
        alt="authentication background"
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-white/70" />
      <div className="absolute inset-x-0 bottom-0 h-[26vh] bg-[linear-gradient(180deg,rgba(255,235,193,0)_0%,rgba(255,231,176,0.78)_100%)]" />

      <div className="relative z-10 w-full max-w-[840px] rounded-[30px] border border-white/70 bg-white/92 px-6 py-10 text-center shadow-[0_24px_60px_rgba(17,24,39,0.08)] backdrop-blur-[2px] sm:px-10 sm:py-12 md:px-16 md:py-16">
        <Image
          src="/nini.png"
          alt="authentication icon"
          width={210}
          height={160}
          priority
          className="mx-auto h-auto w-[132px] sm:w-[154px] md:w-[176px]"
        />

        <h1 className="mt-5 text-[30px] font-bold tracking-[-0.04em] text-[var(--ink)] sm:text-[36px]">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-[420px] text-[16px] leading-8 text-[#5f6673]">
          {body}
        </p>

        <div className="mt-8 flex justify-center">
          <span className="block h-14 w-14 animate-spin rounded-full border-[6px] border-[#f7edd0] border-t-[#ffc400]" />
        </div>

        <p className="mt-8 text-[15px] text-[#737b88]">この画面を閉じずにお待ちください</p>

        {title !== "認証状態を確認中です..." ? (
          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-[#ffc400] px-5 py-3 font-semibold text-[var(--ink)] transition hover:bg-[#f0ba00]"
          >
            ログイン画面へ
          </Link>
        ) : null}
      </div>
    </main>
  );
}
