"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import type { UserRole } from "@/types/domain";

const errorMessageMap: Record<string, string> = {
  "auth/email-already-in-use": "このメールアドレスは既に使用されています。",
  "auth/invalid-email": "メールアドレスの形式が正しくありません。",
  "auth/weak-password": "パスワードは6文字以上で入力してください。",
};

export function RegisterForm() {
  const router = useRouter();
  const { firebaseError, isFirebaseReady, isLoading, missingEnvKeys, signUp } =
    useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState<UserRole>("admin");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!acceptedTerms) {
      setErrorMessage("利用規約とプライバシーポリシーへの同意が必要です。");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("確認用パスワードが一致しません。");
      return;
    }

    if (!isFirebaseReady) {
      setErrorMessage(
        `${firebaseError ?? "Firebase environment variables are missing."} Please set ${missingEnvKeys.join(", ")}.`,
      );
      return;
    }

    try {
      const nextProfile = await signUp({
        name,
        email,
        password,
        role,
      });

      const nextPath =
        nextProfile?.role === "admin" ? "/admin/dashboard" : "/sales/dashboard";
      router.replace(nextPath);
    } catch (error) {
      if (error instanceof FirebaseError) {
        setErrorMessage(
          errorMessageMap[error.code] ??
            "新規登録に失敗しました。入力内容とFirestoreルールを確認してください。",
        );
        return;
      }

      setErrorMessage("新規登録に失敗しました。時間を置いて再度お試しください。");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
      {!isFirebaseReady ? (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-6 text-amber-800">
          Firebase の公開環境変数が未設定です。
          {missingEnvKeys.length > 0 ? ` ${missingEnvKeys.join(", ")}` : ""}
        </div>
      ) : null}

      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-[13px] font-semibold text-[var(--ink)]">
          アカウント種別
        </legend>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={`rounded-[14px] border px-3.5 py-2.5 text-left transition ${role === "admin" ? "border-[#ffc400] bg-[#fff6d7] text-[var(--ink)]" : "border-[#dcdfe5] bg-white text-[#66707d]"}`}
          >
            <div className="text-[14px] font-semibold">管理者</div>
            <div className="mt-1 text-[11px]">全体ダッシュボードを管理</div>
          </button>
          <button
            type="button"
            onClick={() => setRole("sales")}
            className={`rounded-[14px] border px-3.5 py-2.5 text-left transition ${role === "sales" ? "border-[#ffc400] bg-[#fff6d7] text-[var(--ink)]" : "border-[#dcdfe5] bg-white text-[#66707d]"}`}
          >
            <div className="text-[14px] font-semibold">営業</div>
            <div className="mt-1 text-[11px]">自分の打ち合わせを管理</div>
          </button>
        </div>
      </fieldset>

      <Field
        label="お名前"
        value={name}
        onChange={setName}
        placeholder="例）山田 太郎"
        autoComplete="name"
        required
        icon={<UserIcon />}
      />

      <Field
        label="メールアドレス"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="例）taro.yamada@example.com"
        autoComplete="email"
        required
        icon={<MailIcon />}
      />

      <Field
        label="パスワード"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        placeholder="8文字以上の英数字を入力してください"
        autoComplete="new-password"
        minLength={6}
        required
        icon={<LockIcon />}
        trailingButton={
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="text-[#8f96a3] transition hover:text-[var(--ink)]"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            <EyeIcon open={showPassword} />
          </button>
        }
      />

      <Field
        label="パスワード（確認）"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="もう一度パスワードを入力してください"
        autoComplete="new-password"
        minLength={6}
        required
        icon={<LockIcon />}
        trailingButton={
          <button
            type="button"
            onClick={() => setShowConfirmPassword((current) => !current)}
            className="text-[#8f96a3] transition hover:text-[var(--ink)]"
            aria-label={showConfirmPassword ? "確認用パスワードを隠す" : "確認用パスワードを表示"}
          >
            <EyeIcon open={showConfirmPassword} />
          </button>
        }
      />

      <Field
        label="会社名"
        value={companyName}
        onChange={setCompanyName}
        placeholder="例）株式会社サンプル"
        autoComplete="organization"
        icon={<OfficeIcon />}
      />

      <Field
        label="招待コード（任意）"
        value={inviteCode}
        onChange={setInviteCode}
        placeholder="招待コードをお持ちの方は入力してください"
        icon={<GiftIcon />}
      />

      <label className="flex items-start gap-3 pt-1 text-[12px] leading-6 text-[#596272]">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          className="mt-0.5 h-[16px] w-[16px] rounded-[5px] border border-[#cfd4db] accent-[#ffc400]"
        />
        <span>
          <span className="text-[#1f73ff]">利用規約</span> と{" "}
          <span className="text-[#1f73ff]">プライバシーポリシー</span> に同意します
        </span>
      </label>

      {errorMessage ? (
        <div className="rounded-[14px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] leading-6 text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isLoading || !isFirebaseReady}
        className="flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#ffc400] px-5 py-3 text-[16px] font-bold text-[var(--ink)] transition hover:bg-[#f0ba00] disabled:cursor-not-allowed disabled:bg-[#ecd990] disabled:text-[rgba(22,20,15,0.6)]"
      >
        <RegisterActionIcon />
        <span>{isLoading ? "登録中..." : "アカウントを作成する"}</span>
      </button>

      <div className="flex items-center gap-3 pt-1">
        <div className="h-px flex-1 bg-[#d9dde3]" />
        <span className="text-[13px] text-[#727986]">または</span>
        <div className="h-px flex-1 bg-[#d9dde3]" />
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-3 rounded-[14px] border border-[#d6d9df] bg-white px-5 py-3 text-[15px] font-medium text-[var(--ink)] transition hover:bg-[#fafafa]"
      >
        <GoogleIcon />
        <span>Google で登録</span>
      </button>

      <div className="border-t border-[#ebeef3] pt-4 text-center text-[13px] text-[#6d7482]">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-[#1f73ff] transition hover:text-[#1459cc]">
          ログイン
        </Link>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  icon: React.ReactNode;
  trailingButton?: React.ReactNode;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  required,
  minLength,
  icon,
  trailingButton,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-[var(--ink)]">
        {label}
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#99a0ab]">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-[14px] border border-[#d6d9df] bg-white py-2.5 text-[13px] text-[var(--ink)] outline-none transition placeholder:text-[#9aa1ad] focus:border-[#babfc8] focus:shadow-[0_0_0_3px_rgba(255,199,21,0.14)] ${trailingButton ? "pl-11 pr-11" : "pl-11 pr-4"}`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        {trailingButton ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {trailingButton}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.52 0 9.27 5.11 9.43 5.33a1.2 1.2 0 0 1 0 1.34 17.3 17.3 0 0 1-4.05 4.13" />
        <path d="M6.61 6.61A17.28 17.28 0 0 0 2.57 10.67a1.2 1.2 0 0 0 0 1.34C2.73 12.23 6.48 17.34 12 17.34a10.7 10.7 0 0 0 2.12-.21" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
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

function RegisterActionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current stroke-[1.8]">
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4.5 18.1c.88-2.7 3.08-4.35 5.5-4.35s4.62 1.65 5.5 4.35" />
      <path d="M18.2 8.8v6.4" />
      <path d="M15 12h6.4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="12" cy="8.1" r="3.1" />
      <path d="M5.5 18c1.02-3 3.52-4.85 6.5-4.85S17.48 15 18.5 18" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="3.75" y="5.75" width="16.5" height="12.5" rx="2.2" />
      <path d="m5.5 7.5 6.5 5 6.5-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7.5 10.5V8.75a4.5 4.5 0 1 1 9 0v1.75" />
      <rect x="5.25" y="10.5" width="13.5" height="9.75" rx="2.25" />
      <circle cx="12" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OfficeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M4.5 20.25V6.75a1.5 1.5 0 0 1 1.5-1.5h7.5v15" />
      <path d="M13.5 9.75h4.5a1.5 1.5 0 0 1 1.5 1.5v9" />
      <path d="M8.25 8.5h1.5" />
      <path d="M8.25 11.75h1.5" />
      <path d="M8.25 15h1.5" />
      <path d="M15.75 13h1.5" />
      <path d="M15.75 16.25h1.5" />
      <path d="M3.75 20.25h16.5" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M12 9v11" />
      <path d="M4 13.2h16" />
      <path d="M9.2 9c-1.9 0-3.2-.95-3.2-2.35 0-1.08.88-1.9 2-1.9 1.75 0 3.06 2.2 4 4.25-1.1 0-1.88 0-2.8 0Z" />
      <path d="M14.8 9c1.9 0 3.2-.95 3.2-2.35 0-1.08-.88-1.9-2-1.9-1.75 0-3.06 2.2-4 4.25 1.1 0 1.88 0 2.8 0Z" />
    </svg>
  );
}
