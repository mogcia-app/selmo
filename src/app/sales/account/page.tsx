"use client";

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { assertFirebaseClient } from "@/lib/firebase/client";
import { uploadUserAvatar } from "@/lib/firebase/auth";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";

type ActivityCounts = {
  knowledgeSearch: number;
};

export default function SalesAccountPage() {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [activityCounts, setActivityCounts] = useState<ActivityCounts>({ knowledgeSearch: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
  const initials = (profile?.name ?? profile?.email ?? "S").slice(0, 1).toUpperCase();
  const monthlyMeetings = useMemo(
    () => meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt)),
    [meetings],
  );
  const monthlyRoleplayResults = useMemo(
    () => roleplayResults.filter((result) => isCurrentMonth(result.createdAt)),
    [roleplayResults],
  );

  useEffect(() => {
    if (!profile?.uid || !profile.role || !profile.companyId) {
      return;
    }

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId },
        setMeetings,
        () => setErrorMessage("商談分析の利用状況を取得できませんでした。"),
      ),
      subscribeToRoleplayResults(
        { userId: profile.uid, companyId: profile.companyId, isAdmin: profile.role === "admin" },
        setRoleplayResults,
        () => setErrorMessage("ロープレの利用状況を取得できませんでした。"),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [profile?.companyId, profile?.role, profile?.uid]);

  useEffect(() => {
    if (!profile?.companyId || !profile.uid) {
      return;
    }

    let isActive = true;

    fetchMonthlyKnowledgeSearchCount({
      companyId: profile.companyId,
      userId: profile.uid,
    })
      .then((knowledgeSearch) => {
        if (isActive) {
          setActivityCounts({ knowledgeSearch });
        }
      })
      .catch(() => {
        if (isActive) {
          setActivityCounts({ knowledgeSearch: 0 });
        }
      });

    return () => {
      isActive = false;
    };
  }, [profile?.companyId, profile?.uid]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(profile?.avatarUrl ?? null);
    }
  }, [avatarFile, profile?.avatarUrl]);

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

  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-0 pt-4 md:px-7 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1240px]">
        {errorMessage ? (
          <div className="mb-5 rounded-[18px] border border-[#ffd2cc] bg-[#fff2ef] px-4 py-3 text-[14px] text-[#cf4b39]">
            {errorMessage}
          </div>
        ) : null}

        <section className="mb-5 overflow-hidden rounded-[28px] border border-[#f0d46b] bg-[#fff7d6] px-5 py-5 shadow-[0_18px_34px_rgba(245,189,7,0.14)] md:px-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#8a6500]">My Account</p>
              <h1 className="mt-2 text-[30px] font-black text-[#171717] md:text-[36px]">
                マイアカウント設定
              </h1>
              <p className="mt-2 max-w-[680px] text-[14px] leading-7 text-[#6f5500]">
                プロフィール、活動状況、AI回数をまとめて管理できます。
              </p>
            </div>
            <Image
              src="/sai.png"
              alt="AIコーチ"
              width={132}
              height={132}
              className="h-[112px] w-[112px] object-contain md:h-[132px] md:w-[132px]"
              priority
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_minmax(420px,1fr)]">
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
                  <ReadonlyField label="役職" value={profile?.role === "admin" ? "管理者" : "営業担当"} />
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
                <PasswordField
                  label="現在のパスワード"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
                <PasswordField
                  label="新しいパスワード"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
                <PasswordField
                  label="新しいパスワード（確認）"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />

                {passwordError ? (
                  <div className="rounded-[14px] border border-[#ffd2cc] bg-[#fff7f5] px-4 py-3 text-[13px] font-bold text-[#cf4b39]">
                    {passwordError}
                  </div>
                ) : null}
                {passwordMessage ? (
                  <div className="rounded-[14px] border border-[#d9edc8] bg-[#f7fff2] px-4 py-3 text-[13px] font-bold text-[#4e7a24]">
                    {passwordMessage}
                  </div>
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
            <SettingsCard iconSrc="/summary.png" title="今月の活動">
              <div className="grid gap-3 sm:grid-cols-3">
                <ActivityCard label="商談分析" value={`${monthlyMeetings.length}回`} />
                <ActivityCard label="ロープレ" value={`${monthlyRoleplayResults.length}回`} />
                <ActivityCard label="ナレッジ検索" value={`${activityCounts.knowledgeSearch}回`} />
              </div>
            </SettingsCard>

            <SettingsCard iconSrc="/gaido.png" title="サポート">
              <div className="rounded-[18px] border border-[#f2e6ba] bg-[#fffaf0] px-4 py-4">
                <div className="space-y-3">
                  <SupportRow
                    label="TEL"
                    value="092-517-9804"
                    href="tel:0925179804"
                  />
                  <SupportRow
                    label="MAIL"
                    value="info@mogcia.jp"
                    href="mailto:info@mogcia.jp?subject=selmo%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88%E3%81%B8%E3%81%AE%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B"
                  />
                  <SupportRow
                    label="営業時間"
                    value="平日 10:00 - 17:00（土日祝除く）"
                  />
                </div>
              </div>
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
          <Image
            src={iconSrc}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
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

function ActivityCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#f0c655] bg-[#fffaf0] px-4 py-4">
      <div className="text-[12px] font-bold text-[#8a6500]">{label}</div>
      <div className="mt-2 text-[24px] font-bold text-[#171717]">{value}</div>
    </div>
  );
}

function SupportRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#8a6500]">
        {label}
      </span>
      <span className="text-[14px] font-bold text-[#171717]">{value}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="flex flex-col gap-1 rounded-[14px] bg-white/70 px-4 py-3 transition hover:bg-white"
      >
        {content}
      </a>
    );
  }

  return <div className="flex flex-col gap-1 rounded-[14px] bg-white/70 px-4 py-3">{content}</div>;
}

async function fetchMonthlyKnowledgeSearchCount(input: { companyId: string; userId: string }) {
  const { firestore } = assertFirebaseClient();
  const usageQuery = query(
    collection(firestore, "aiUsageLogs"),
    where("companyId", "==", input.companyId),
    where("userId", "==", input.userId),
    where("feature", "==", "knowledge_search"),
  );
  const snapshot = await getDocs(usageQuery);

  return snapshot.docs.filter((docSnapshot) => {
    const data = docSnapshot.data() as { createdAt?: Timestamp | Date | null };
    return isCurrentMonth(readDate(data.createdAt));
  }).length;
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

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function readDate(value: Timestamp | Date | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  return null;
}
