"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { resolveRoleSafePath } from "@/features/auth/role-routing";

const errorMessageMap: Record<string, string> = {
  "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません。",
  "auth/invalid-email": "メールアドレスの形式が正しくありません。",
  "auth/too-many-requests": "ログイン試行が多すぎます。少し待ってから再度お試しください。",
};

export function LoginForm({
  variant = "default",
}: {
  variant?: "default" | "admin";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseError, isFirebaseReady, missingEnvKeys, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isAdmin = variant === "admin";
  const formClassName = isAdmin ? "mt-6 w-full space-y-4 text-left sm:mt-7" : "mt-7 w-full space-y-4.5 text-left sm:mt-8";

  const nextPath = searchParams.get("next");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isFirebaseReady) {
      setErrorMessage(
        `${firebaseError ?? "Firebase environment variables are missing."} Please set ${missingEnvKeys.join(", ")}.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const nextProfile = await signIn(email, password);
      if (!nextProfile) {
        await waitForAuthStateFlush();
        router.replace(isAdmin ? "/admin/dashboard" : "/sales/dashboard");
        return;
      }

      await waitForAuthStateFlush();
      router.replace(resolveRoleSafePath(nextPath, nextProfile.role));
    } catch (error) {
      if (error instanceof FirebaseError) {
        setErrorMessage(errorMessageMap[error.code] ?? "ログインに失敗しました。設定とアカウントを確認してください。");
        return;
      }

      setErrorMessage("ログインに失敗しました。時間を置いて再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={formClassName}>
      {!isFirebaseReady ? (
        <div className="rounded-[14px] border border-[var(--accent-2)] bg-[rgba(200,148,31,0.08)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
          Firebase の公開環境変数が未設定です。
          {missingEnvKeys.length > 0 ? ` ${missingEnvKeys.join(", ")}` : ""}
        </div>
      ) : null}

      <label className="block">
        <span className={`mb-2.5 block font-semibold text-[var(--ink)] ${isAdmin ? "text-[13px] sm:text-[14px]" : "text-[14px] sm:text-[15px]"}`}>
          メールアドレス
        </span>
        <div className="relative">
          {isAdmin ? (
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#99a0ab]">
              <MailIcon />
            </span>
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`w-full rounded-[14px] border border-[#d6d9df] bg-white text-[14px] text-[var(--ink)] outline-none transition placeholder:text-[#9aa1ad] focus:border-[#babfc8] focus:shadow-[0_0_0_3px_rgba(255,199,21,0.14)] ${isAdmin ? "py-2.5 pl-14 pr-5 text-[13px] sm:py-3 sm:text-[14px]" : "px-5 py-3 sm:py-3.5 sm:text-[15px]"}`}
            placeholder="メールアドレスを入力してください"
            autoComplete="email"
            required
          />
        </div>
      </label>

      <label className="block">
        <span className={`mb-2.5 block font-semibold text-[var(--ink)] ${isAdmin ? "text-[13px] sm:text-[14px]" : "text-[14px] sm:text-[15px]"}`}>
          パスワード
        </span>
        <div className="relative">
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#99a0ab]">
            {isAdmin ? <LockIcon /> : null}
          </span>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`w-full rounded-[14px] border border-[#d6d9df] bg-white pr-14 text-[14px] text-[var(--ink)] outline-none transition placeholder:text-[#9aa1ad] focus:border-[#babfc8] focus:shadow-[0_0_0_3px_rgba(255,199,21,0.14)] ${isAdmin ? "py-2.5 pl-14 text-[13px] sm:py-3 sm:text-[14px]" : "py-3 pl-5 sm:py-3.5 sm:text-[15px]"}`}
            placeholder="パスワードを入力してください"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8f96a3] transition hover:text-[var(--ink)]"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
      </label>

      <div className={`flex justify-end py-1.5 text-[var(--ink)] ${isAdmin ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-[12px]"}`}>
        <button
          type="button"
          className="text-left text-[#1f73ff] transition hover:text-[#1459cc]"
        >
          パスワードをお忘れですか？
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-[14px] border border-[var(--accent)] bg-[rgba(184,51,31,0.06)] px-4 py-3 text-sm leading-6 text-[var(--accent)]">
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || !isFirebaseReady}
        className={`w-full rounded-[14px] bg-[#ffc400] px-6 font-bold text-[var(--ink)] transition hover:bg-[#f0ba00] disabled:cursor-not-allowed disabled:bg-[#ecd990] disabled:text-[rgba(22,20,15,0.6)] ${isAdmin ? "py-2.5 text-[15px] sm:py-3 sm:text-[16px]" : "py-3 text-[16px] sm:py-3.5 sm:text-[17px]"}`}
      >
        {isSubmitting
          ? "ログイン中..."
          : isAdmin
            ? "管理者としてログイン"
            : "ログイン"}
      </button>

      <div className={`flex items-center gap-4 ${isAdmin ? "pt-1.5" : "pt-2"}`}>
        <div className="h-px flex-1 bg-[#d9dde3]" />
        <span className={`text-[#727986] ${isAdmin ? "text-[13px]" : "text-[15px]"}`}>または</span>
        <div className="h-px flex-1 bg-[#d9dde3]" />
      </div>

      <button
        type="button"
        className={`flex w-full items-center justify-center gap-3 rounded-[14px] border border-[#d6d9df] bg-white px-6 font-medium text-[var(--ink)] transition hover:bg-[#fafafa] ${isAdmin ? "py-2.5 text-[15px] sm:py-3 sm:text-[16px]" : "py-3 text-[16px] sm:py-3.5 sm:text-[17px]"}`}
      >
        <GoogleIcon />
        <span>Google でログイン</span>
      </button>

      <div className={`flex justify-end pt-2 text-[var(--gray)] ${isAdmin ? "text-[12px]" : "text-sm"}`}>
        <Link
          href={isAdmin ? "/login" : "/admin/login"}
          className="transition hover:text-[var(--ink)]"
        >
          {isAdmin ? "通常ログインはこちら" : "管理者はこちら"}
        </Link>
      </div>
    </form>
  );
}

function waitForAuthStateFlush() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.8]">
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.52 0 9.27 5.11 9.43 5.33a1.2 1.2 0 0 1 0 1.34 17.3 17.3 0 0 1-4.05 4.13" />
        <path d="M6.61 6.61A17.28 17.28 0 0 0 2.57 10.67a1.2 1.2 0 0 0 0 1.34C2.73 12.23 6.48 17.34 12 17.34a10.7 10.7 0 0 0 2.12-.21" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.8]">
      <path d="M2.57 10.67C2.73 10.45 6.48 5.34 12 5.34s9.27 5.11 9.43 5.33a1.2 1.2 0 0 1 0 1.34c-.16.22-3.91 5.33-9.43 5.33S2.73 12.23 2.57 12.01a1.2 1.2 0 0 1 0-1.34Z" />
      <circle cx="12" cy="11.34" r="3" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill="#EA4335"
        d="M12.24 10.29v3.89h5.42c-.22 1.25-1.67 3.67-5.42 3.67-3.26 0-5.92-2.7-5.92-6.03s2.66-6.03 5.92-6.03c1.86 0 3.11.79 3.82 1.47l2.61-2.53C17 3.29 14.9 2.34 12.24 2.34c-5.28 0-9.56 4.29-9.56 9.58s4.28 9.58 9.56 9.58c5.52 0 9.18-3.88 9.18-9.34 0-.63-.07-1.11-.16-1.59h-9.02Z"
      />
      <path
        fill="#34A853"
        d="M3.78 7.43 6.98 9.8c.87-2.59 3.3-4.44 6.26-4.44 1.86 0 3.11.79 3.82 1.47l2.61-2.53C17 3.29 14.9 2.34 12.24 2.34c-3.67 0-6.83 2.08-8.46 5.09Z"
      />
      <path
        fill="#FBBC05"
        d="M12.24 21.5c2.58 0 4.74-.85 6.32-2.3l-2.92-2.39c-.78.54-1.83.91-3.4.91-2.9 0-5.36-1.95-6.24-4.57l-3.3 2.55c1.61 3.07 4.82 5.8 9.54 5.8Z"
      />
      <path
        fill="#4285F4"
        d="M3.68 15.69 7 13.14a6.07 6.07 0 0 1 0-3.86L3.78 7.43a9.66 9.66 0 0 0-.98 4.49c0 1.36.26 2.67.88 3.77Z"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.8]">
      <path d="M7.5 10.5V8.75a4.5 4.5 0 1 1 9 0v1.75" />
      <rect x="5.25" y="10.5" width="13.5" height="9.75" rx="2.25" />
      <circle cx="12" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.8]">
      <rect x="3.75" y="5.75" width="16.5" height="12.5" rx="2.2" />
      <path d="m5.5 7.5 6.5 5 6.5-5" />
    </svg>
  );
}
