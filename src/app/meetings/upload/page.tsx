"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { createMeeting } from "@/lib/firebase/meetings";

const productOptions = ["商材A", "商材B", "商材C", "商材D"];
const maxRecommendedDurationSec = 120 * 60;
const maxOpenAiTranscriptionFileSizeBytes = 25 * 1024 * 1024;
const supportedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);
export default function MeetingUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { firebaseError, isFirebaseReady, isLoading, missingEnvKeys, profile } =
    useAuth();
  const [recordedAt, setRecordedAt] = useState("2026-05-24T14:00");
  const [customerName, setCustomerName] = useState("");
  const [productType, setProductType] = useState(productOptions[0]);
  const [customerType, setCustomerType] = useState<"new" | "existing">("new");
  const [status, setStatus] = useState<"won" | "considering" | "lost">("considering");
  const [location, setLocation] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDurationSec, setDetectedDurationSec] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isFirebaseReady) {
      setErrorMessage(
        `${firebaseError ?? "Firebase environment variables are missing."} Please set ${missingEnvKeys.join(", ")}.`,
      );
      return;
    }

    if (!profile?.uid) {
      setErrorMessage("ログイン中のユーザー情報を取得できませんでした。");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("文字起こし検証のため、音声ファイルを選択してください。");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    const normalizedRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
    const normalizedCustomerName =
      customerName.trim() || buildUntitledMeetingName(normalizedRecordedAt);

    try {
      const meetingId = await createMeeting({
        userId: profile.uid,
        customerName: normalizedCustomerName,
        productType,
        customerType,
        recordedAt: normalizedRecordedAt,
        location: location.trim(),
        status,
        audioFile: selectedFile,
        audioDurationSec: detectedDurationSec,
        onUploadProgress: setUploadProgress,
      });

      setSuccessMessage("打ち合わせ情報を保存しました。詳細画面へ移動します。");
      router.push(`/meetings/${meetingId}`);
    } catch (error) {
      if (error instanceof FirebaseError) {
        setErrorMessage(
          `保存に失敗しました。${error.code === "permission-denied" ? "Firestoreルール" : "Firebase設定"}を確認してください。`,
        );
      } else {
        setErrorMessage("保存に失敗しました。時間を置いて再度お試しください。");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-6 md:px-8 md:py-7">
      <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 text-[13px] font-medium text-[#8a909b]">
            〈 打ち合わせ一覧へ戻る
          </div>
          <h1 className="text-[34px] font-bold tracking-[-0.04em] text-[#171717]">
            打ち合わせアップロード
          </h1>
          <p className="mt-2 text-[16px] text-[#7a808c]">
            音声ファイルを登録して、文字起こしと分析の準備を進めます。
          </p>
        </div>

        <div className="rounded-[18px] border border-[#eceef4] bg-white px-5 py-4 text-right shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="text-[13px] text-[#8a909b]">今月のアップロード件数</div>
          <div className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-[#171717]">
            23 / 30
          </div>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <section className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff8e4] text-[#f0b400]">
              <UploadGlyph />
            </div>
            <div>
              <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">
                音声ファイル
              </h2>
              <p className="text-[14px] text-[#7a808c]">
                mp3推奨 / wav対応 / 長時間音声も検証できます
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-dashed border-[#dfe3ea] bg-[#fafafa] px-6 py-9 text-center">
            <Image
              src="/uplod.png"
              alt="selmo"
              width={124}
              height={124}
              className="mx-auto h-[124px] w-[124px] object-contain"
            />
            <div className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
              音声ファイルをアップロード
            </div>
            <div className="mt-2 text-[14px] leading-7 text-[#7a808c]">
              ドラッグ&ドロップ、またはクリックしてファイルを選択
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-6 rounded-[14px] bg-[#171717] px-5 py-3 text-[14px] font-medium text-white transition hover:bg-[#2a2d33]"
            >
              ファイルを選択
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0] ?? null;
                setErrorMessage(null);
                setSuccessMessage(null);
                setUploadProgress(0);
                setSelectedFile(null);
                setDetectedDurationSec(null);

                if (!file) {
                  return;
                }

                if (!isSupportedAudioFile(file)) {
                  setErrorMessage(
                    "対応している形式は mp3 / wav です。別形式の場合は変換してから再度お試しください。",
                  );
                  return;
                }

                setSelectedFile(file);

                try {
                  const durationSec = await readAudioDuration(file);
                  setDetectedDurationSec(durationSec);
                } catch {
                  setErrorMessage(
                    "ファイルは選択できましたが、音声時間を取得できませんでした。アップロード自体は続行できます。",
                  );
                }
              }}
            />
          </div>

          {selectedFile ? (
            <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-[#fafbfc] px-5 py-4">
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
                <MetaBlock label="ファイル名" value={selectedFile.name} />
                <MetaBlock label="ファイルサイズ" value={formatFileSize(selectedFile.size)} />
                <MetaBlock
                  label="再生時間"
                  value={
                    detectedDurationSec !== null
                      ? formatDuration(detectedDurationSec)
                      : "確認中"
                  }
                />
              </div>
              <div className="mt-3 text-[13px] text-[#7a808c]">
                {selectedFile.type || "audio/mpeg"}
              </div>
            </div>
          ) : null}

          {detectedDurationSec !== null && detectedDurationSec > maxRecommendedDurationSec ? (
            <AlertBox>
              120分を超える音声です。文字起こし検証の観点では価値がありますが、
              まずは短めの音声でも1本通して精度確認するのがおすすめです。
            </AlertBox>
          ) : null}

          {selectedFile && selectedFile.size > maxOpenAiTranscriptionFileSizeBytes ? (
            <AlertBox>
              この音声は 25MB を超えています。文字起こしテストでは自動で軽量 mp3 に分割して投入します。
            </AlertBox>
          ) : null}

          {isSubmitting ? (
            <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-white px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-[13px] text-[#6d7482]">
                <span>アップロード進捗</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-[8px] overflow-hidden rounded-full bg-[#eceef4]">
                <div
                  className="h-full rounded-full bg-[#f5bd07] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-[18px] bg-[#fff8e7] px-5 py-4 text-[13px] leading-7 text-[#6d7482]">
            音声だけ先に保存して、打ち合わせ情報はあとから追記できます。
          </div>
        </section>

        <section className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff8e4] text-[#f0b400]">
              <InfoIcon />
            </div>
            <div>
              <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">
                打ち合わせ情報
              </h2>
              <p className="text-[14px] text-[#7a808c]">
                詳細画面であとから編集できるので、まずは最低限でも大丈夫です
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage ? <ErrorBox>{errorMessage}</ErrorBox> : null}
            {successMessage ? <SuccessBox>{successMessage}</SuccessBox> : null}

            <Field label="顧客名 / 会社名">
              <input
                type="text"
                className={inputClassName}
                placeholder="空欄なら自動で仮タイトルを設定"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>

            <Field label="実施日時" required>
              <input
                type="datetime-local"
                className={inputClassName}
                value={recordedAt}
                onChange={(event) => setRecordedAt(event.target.value)}
              />
            </Field>

            <Field label="商材タイプ" required>
              <select
                className={inputClassName}
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
              >
                {productOptions.map((product) => (
                  <option key={product}>{product}</option>
                ))}
              </select>
            </Field>

            <Field label="顧客区分" required>
              <Segmented
                options={[
                  { label: "新規", value: "new" },
                  { label: "既存", value: "existing" },
                ]}
                active={customerType}
                onChange={(value) => setCustomerType(value as "new" | "existing")}
              />
            </Field>

            <Field label="商談ステータス" required>
              <Segmented
                options={[
                  { label: "成約", value: "won" },
                  { label: "検討中", value: "considering" },
                  { label: "失注", value: "lost" },
                ]}
                active={status}
                onChange={(value) => setStatus(value as "won" | "considering" | "lost")}
              />
            </Field>

            <Field label="場所">
              <input
                type="text"
                className={inputClassName}
                placeholder="先方オフィス / Zoom / 自社会議室"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] font-medium text-[#575f6d]"
              >
                下書き保存
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="rounded-[14px] bg-[#171717] px-5 py-3 text-[14px] font-medium text-white transition hover:bg-[#2a2d33] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
              >
                {isSubmitting ? `アップロード中... ${uploadProgress}%` : "音声をアップロード"}
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

const inputClassName =
  "w-full rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] text-[#171717] outline-none transition placeholder:text-[#96a0ad] focus:border-[#d7dae2] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-[#505866]">
        {label}
        {required ? <span className="ml-1 text-[#ff5d47]">*</span> : null}
      </div>
      {children}
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[14px] font-medium text-[#171717]">{value}</div>
    </div>
  );
}

function AlertBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-[18px] border border-[#ffd8cc] bg-[#fff4ef] px-5 py-4 text-[13px] leading-7 text-[#cf4b39]">
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-[#ffd8cc] bg-[#fff4ef] px-4 py-3 text-[14px] leading-6 text-[#cf4b39]">
      {children}
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-[#d6f2df] bg-[#f4fbf5] px-4 py-3 text-[14px] leading-6 text-[#2f8f56]">
      {children}
    </div>
  );
}

function Segmented({
  options,
  active,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-[14px] border px-4 py-3 text-[14px] font-medium transition ${
              isActive
                ? "border-[#171717] bg-[#171717] text-white"
                : "border-[#e6e8ee] bg-white text-[#303544] hover:bg-[#fafafa]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.2v5.2" />
      <circle cx="12" cy="7.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isSupportedAudioFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (supportedAudioTypes.has(file.type)) {
    return true;
  }

  return lowerName.endsWith(".mp3") || lowerName.endsWith(".wav");
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)}KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(durationSec: number) {
  const totalSeconds = Math.max(0, Math.round(durationSec));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readAudioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");

    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Failed to read audio metadata"));
    };
    audio.src = objectUrl;
  });
}

function buildUntitledMeetingName(recordedAt: Date) {
  const year = recordedAt.getFullYear();
  const month = String(recordedAt.getMonth() + 1).padStart(2, "0");
  const day = String(recordedAt.getDate()).padStart(2, "0");
  const hours = String(recordedAt.getHours()).padStart(2, "0");
  const minutes = String(recordedAt.getMinutes()).padStart(2, "0");

  return `未設定_${year}${month}${day}_${hours}${minutes}`;
}
