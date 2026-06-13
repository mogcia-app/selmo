"use client";

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { uploadUserAvatar } from "@/lib/firebase/auth";
import { assertFirebaseClient } from "@/lib/firebase/client";
import {
  fetchCompanyNotificationSettings,
  updateCompanyNotificationEmails,
} from "@/lib/firebase/company-settings";

export default function AdminAccountPage() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [notificationEmails, setNotificationEmails] = useState(["", "", ""]);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const initials = (profile?.name ?? profile?.email ?? "A").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(profile?.avatarUrl ?? null);
    }
  }, [avatarFile, profile?.avatarUrl]);

  useEffect(() => {
    if (!profile?.companyId) return;

    let isActive = true;
    fetchCompanyNotificationSettings(profile.companyId)
      .then((settings) => {
        if (!isActive) return;
        setNotificationEmails([
          settings.notificationEmails[0] ?? "",
          settings.notificationEmails[1] ?? "",
          settings.notificationEmails[2] ?? "",
        ]);
      })
      .catch(() => {
        if (isActive) {
          setNotificationError("通知先メールの取得に失敗しました。");
        }
      });

    return () => {
      isActive = false;
    };
  }, [profile?.companyId]);

  async function handleAvatarSave() {
    setAvatarMessage(null);
    setAvatarError(null);

    if (!profile?.uid || !avatarFile) {
      setAvatarError("保存する画像を選択してください。");
      return;
    }

    if (!avatarFile.type.startsWith("image/")) {
      setAvatarError("画像ファイルを選択してください。");
      return;
    }

    if (avatarFile.size > 5 * 1024 * 1024) {
      setAvatarError("画像は5MB以下で選択してください。");
      return;
    }

    setIsSavingAvatar(true);
    try {
      const result = await uploadUserAvatar({ userId: profile.uid, file: avatarFile });
      setAvatarPreview(result.avatarUrl);
      setAvatarFile(null);
      setAvatarMessage("アイコンを保存しました。");
    } catch {
      setAvatarError("アイコンの保存に失敗しました。");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (!profile?.email) {
      setPasswordError("メールアドレスを取得できませんでした。");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("新しいパスワードは8文字以上で入力してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("新しいパスワードが一致していません。");
      return;
    }

    setIsChangingPassword(true);
    try {
      const { firebaseAuth } = assertFirebaseClient();
      const currentUser = firebaseAuth.currentUser;

      if (!currentUser) {
        throw new Error("ログイン情報を確認できませんでした。");
      }

      const credential = EmailAuthProvider.credential(profile.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("パスワードを変更しました。");
    } catch (error) {
      setPasswordError(readPasswordErrorMessage(error));
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push("/admin/login");
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSaveNotificationEmails() {
    setNotificationMessage(null);
    setNotificationError(null);

    if (!profile?.companyId) {
      setNotificationError("会社情報を取得できませんでした。");
      return;
    }

    const invalidEmail = notificationEmails.find((email) => email.trim() && !isEmail(email.trim()));
    if (invalidEmail) {
      setNotificationError(`メールアドレスの形式を確認してください: ${invalidEmail}`);
      return;
    }

    setIsSavingNotifications(true);
    try {
      const result = await updateCompanyNotificationEmails({
        companyId: profile.companyId,
        notificationEmails,
      });
      setNotificationEmails([
        result.notificationEmails[0] ?? "",
        result.notificationEmails[1] ?? "",
        result.notificationEmails[2] ?? "",
      ]);
      setNotificationMessage("通知先メールを保存しました。");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "通知先メールの保存に失敗しました。");
    } finally {
      setIsSavingNotifications(false);
    }
  }

  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-3 pt-4 md:px-7 md:pb-4 md:pt-5">
      <div className="mx-auto max-w-[1180px]">
        <section className="mb-5 overflow-hidden rounded-[28px] border border-[#f0d46b] bg-[#fff7d6] px-5 py-5 shadow-[0_18px_34px_rgba(245,189,7,0.14)] md:px-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#8a6500]">Admin Account</p>
              <h1 className="mt-2 text-[30px] font-black text-[#171717] md:text-[36px]">
                管理者アカウント設定
              </h1>
              <p className="mt-2 max-w-[680px] text-[14px] leading-7 text-[#6f5500]">
                管理者プロフィール、パスワード、ログアウトを管理します。
              </p>
            </div>
            <Image
              src="/sai.png"
              alt="管理者アカウント"
              width={132}
              height={132}
              className="h-[112px] w-[112px] object-contain md:h-[132px] md:w-[132px]"
              priority
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
          <div className="space-y-5">
            <SettingsCard iconSrc="/nin.png" title="プロフィール">
              <div className="grid gap-6 md:grid-cols-[150px_minmax(0,1fr)]">
                <div className="flex flex-col items-center">
                  <label className="group relative block h-[132px] w-[132px] cursor-pointer rounded-full bg-[#fff6d2] p-2">
                    {avatarPreview ? (
                      <Image
                        src={avatarPreview}
                        alt="プロフィール画像"
                        width={132}
                        height={132}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-[#ffd84d] text-[44px] font-bold text-[#171717]">
                        {initials}
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-[#f0c655] bg-white text-[15px] font-bold text-[#8a6500] shadow-[0_8px_18px_rgba(17,24,39,0.12)]">
                      +
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file) {
                          setAvatarMessage(null);
                          setAvatarError(null);
                          setAvatarFile(file);
                          setAvatarPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleAvatarSave()}
                    disabled={!avatarFile || isSavingAvatar}
                    className="mt-4 h-10 rounded-[13px] bg-[#ffc400] px-4 text-[13px] font-bold text-[#171717] transition hover:bg-[#f0b400] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isSavingAvatar ? "保存中" : "アイコンを保存"}
                  </button>
                  {avatarMessage ? <p className="mt-2 text-center text-[12px] font-bold text-[#4e7a24]">{avatarMessage}</p> : null}
                  {avatarError ? <p className="mt-2 text-center text-[12px] font-bold text-[#cf4b39]">{avatarError}</p> : null}
                </div>

                <div className="space-y-4">
                  <ReadonlyField label="名前" value={profile?.name ?? "名前未設定"} />
                  <ReadonlyField label="メールアドレス" value={profile?.email ?? "メールアドレス未設定"} />
                  <ReadonlyField label="権限" value="管理者" />
                  <ReadonlyField label="会社" value={profile?.companyName ?? profile?.companyId ?? "会社未設定"} />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard iconSrc="/reload.png" title="パスワード設定">
              <form onSubmit={(event) => void handlePasswordChange(event)} className="space-y-4">
                <input
                  type="email"
                  name="username"
                  value={profile?.email ?? ""}
                  readOnly
                  autoComplete="username"
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <PasswordField label="現在のパスワード" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
                <PasswordField label="新しいパスワード" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
                <PasswordField label="新しいパスワード（確認）" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />

                {passwordError ? (
                  <MessageBox tone="error">{passwordError}</MessageBox>
                ) : null}
                {passwordMessage ? (
                  <MessageBox tone="success">{passwordMessage}</MessageBox>
                ) : null}

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="mt-2 h-12 w-full rounded-[14px] bg-[#ffc400] px-5 text-[14px] font-bold text-[#171717] transition hover:bg-[#f0b400] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isChangingPassword ? "変更中" : "パスワードを変更する"}
                </button>
              </form>
            </SettingsCard>
          </div>

          <div className="space-y-5">
            <SettingsCard iconSrc="/summary.png" title="管理者メニュー">
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickLink href="/admin/dashboard" label="ダッシュボード" body="チーム全体と個人の状況を見る" />
                <QuickLink href="/admin/members" label="営業メンバー" body="営業マン別の指導状況を見る" />
                <QuickLink href="/admin/analysis?category=meeting" label="商談分析" body="商談の改善点を確認する" />
                <QuickLink href="/admin/analysis?category=teleapo" label="テレアポ分析" body="テレアポの改善点を確認する" />
              </div>
            </SettingsCard>

            <SettingsCard iconSrc="/summary.png" title="メール通知先">
              <p className="mb-4 text-[13px] leading-6 text-[#596273]">
                週次レポートやAI利用回数アラートを届ける幹部・管理者メールを最大3件まで設定できます。
              </p>
              <div className="space-y-3">
                {notificationEmails.map((email, index) => (
                  <label key={index} className="block">
                    <span className="text-[13px] font-bold text-[#3d4350]">通知先 {index + 1}</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        const next = [...notificationEmails];
                        next[index] = event.target.value;
                        setNotificationEmails(next);
                      }}
                      placeholder={`manager${index + 1}@example.com`}
                      className="mt-2 h-12 w-full rounded-[12px] border border-[#e4e7ed] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#f0c655] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.14)]"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleSaveNotificationEmails()}
                disabled={isSavingNotifications}
                className="mt-4 h-12 w-full rounded-[14px] bg-[#ffc400] px-5 text-[14px] font-bold text-[#171717] transition hover:bg-[#f0b400] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingNotifications ? "保存中" : "通知先を保存"}
              </button>
              {notificationError ? <div className="mt-3"><MessageBox tone="error">{notificationError}</MessageBox></div> : null}
              {notificationMessage ? <div className="mt-3"><MessageBox tone="success">{notificationMessage}</MessageBox></div> : null}
            </SettingsCard>

            <SettingsCard iconSrc="/gaido.png" title="サポート">
              <div className="rounded-[18px] border border-[#f2e6ba] bg-[#fffaf0] px-4 py-4">
                <div className="space-y-3">
                  <SupportRow label="TEL" value="092-517-9804" href="tel:0925179804" />
                  <SupportRow
                    label="MAIL"
                    value="info@mogcia.jp"
                    href="mailto:info@mogcia.jp?subject=selmo%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88%E3%81%B8%E3%81%AE%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B"
                  />
                  <SupportRow label="営業時間" value="平日 10:00 - 17:00（土日祝除く）" />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard iconSrc="/reload.png" title="ログアウト">
              <p className="text-[13px] leading-6 text-[#596273]">
                管理画面からログアウトします。共有端末では、作業後に必ずログアウトしてください。
              </p>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="mt-4 h-12 w-full rounded-[14px] border border-[#171717] bg-[#171717] px-5 text-[14px] font-black text-white transition hover:bg-[#343b48] disabled:opacity-60"
              >
                {isSigningOut ? "ログアウト中" : "ログアウト"}
              </button>
            </SettingsCard>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsCard({
  iconSrc,
  title,
  children,
}: {
  iconSrc: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#e7e9ef] bg-white p-5 shadow-[0_12px_28px_rgba(17,24,39,0.04)] md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff3bd]">
          <Image src={iconSrc} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        </div>
        <h2 className="text-[20px] font-bold text-[#171717]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-[#3d4350]">{label}</span>
      <input
        value={value}
        readOnly
        className="mt-2 h-12 w-full rounded-[12px] border border-[#e4e7ed] bg-white px-4 text-[14px] text-[#171717] outline-none"
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-[#3d4350]">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-[12px] border border-[#e4e7ed] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#f0c655] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.14)]"
      />
    </label>
  );
}

function QuickLink({ href, label, body }: { href: string; label: string; body: string }) {
  return (
    <a href={href} className="rounded-[18px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 transition hover:border-[#f0c655] hover:bg-[#fffdf7]">
      <div className="text-[14px] font-black text-[#171717]">{label}</div>
      <p className="mt-1 text-[12px] leading-5 text-[#596273]">{body}</p>
    </a>
  );
}

function SupportRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#8a6500]">{label}</span>
      <span className="text-[14px] font-bold text-[#171717]">{value}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className="flex flex-col gap-1 rounded-[14px] bg-white/70 px-4 py-3 transition hover:bg-white">
        {content}
      </a>
    );
  }

  return <div className="flex flex-col gap-1 rounded-[14px] bg-white/70 px-4 py-3">{content}</div>;
}

function MessageBox({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return (
    <div className={`rounded-[14px] border px-4 py-3 text-[13px] font-bold ${tone === "success" ? "border-[#d9edc8] bg-[#f7fff2] text-[#4e7a24]" : "border-[#ffd2cc] bg-[#fff7f5] text-[#cf4b39]"}`}>
      {children}
    </div>
  );
}

function readPasswordErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("auth/wrong-password")) {
    return "現在のパスワードが正しくありません。";
  }

  if (error instanceof Error && error.message.includes("auth/invalid-credential")) {
    return "現在のパスワードが正しくありません。";
  }

  if (error instanceof Error && error.message.includes("auth/requires-recent-login")) {
    return "安全のため、再ログイン後にもう一度お試しください。";
  }

  return error instanceof Error ? error.message : "パスワード変更に失敗しました。";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
