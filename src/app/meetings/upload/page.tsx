"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createMeeting,
  subscribeToMeetings,
  getMeetingPurposeLabel,
  type MeetingRecord,
} from "@/lib/firebase/meetings";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";
import type { MeetingPurpose } from "@/types/domain";

const maxRecommendedDurationSec = 120 * 60;
const maxOpenAiTranscriptionFileSizeBytes = 25 * 1024 * 1024;
const supportedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);
const meetingPurposeOptions: MeetingPurpose[] = [
  "new_proposal",
  "closing",
  "existing_followup",
  "relationship_building",
  "check_in",
  "upsell_cross_sell",
  "onboarding",
  "retention",
];

export default function MeetingUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { firebaseError, isFirebaseReady, isLoading, missingEnvKeys, profile } =
    useAuth();
  const [recordedAt, setRecordedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [transcriptEndedAtTime, setTranscriptEndedAtTime] = useState(() => toTimeInputValue(addMinutes(new Date(), 60)));
  const [customerName, setCustomerName] = useState("");
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [productType, setProductType] = useState("");
  const [customerType, setCustomerType] = useState<"new" | "existing">("new");
  const [meetingPurpose, setMeetingPurpose] = useState<MeetingPurpose>("new_proposal");
  const [status, setStatus] = useState<"won" | "considering" | "lost">("considering");
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
  const [inputMode, setInputMode] = useState<"audio" | "transcript">("audio");
  const [transcriptText, setTranscriptText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDurationSec, setDetectedDurationSec] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const salesDomain: SalesDomain = searchParams.get("category") === "teleapo" ? "teleapo" : "meeting";
  const canAccessDomain = isLoading || canUseSalesDomain(profile, salesDomain);

  useEffect(() => {
    if (!isFirebaseReady || !profile?.companyId) {
      return;
    }

    const unsubscribe = subscribeToKnowledgeProducts(
      profile.companyId,
      (nextProducts) => {
        setProducts(nextProducts);
        setProductType((current) => current || nextProducts[0]?.name || "");
      },
      () => setErrorMessage("商材一覧の読み込みに失敗しました。"),
    );

    return unsubscribe;
  }, [isFirebaseReady, profile?.companyId]);

  useEffect(() => {
    if (!profile?.uid || !profile.role || !profile.companyId) {
      return;
    }

    const unsubscribe = subscribeToMeetings(
      { role: profile.role, userId: profile.uid, companyId: profile.companyId },
      setMeetings,
      () => setMeetings([]),
    );

    return unsubscribe;
  }, [profile?.companyId, profile?.role, profile?.uid]);

  const productOptions = useMemo(() => products.map((product) => product.name), [products]);
  const monthlyUploadCount = useMemo(
    () => meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt)).length,
    [meetings],
  );
  const audioRetentionLimit = useMemo(
    () => readSharedAiQuota(profile?.monthlyTranscriptionQuota ?? 15, profile?.monthlyRoleplayQuota ?? 15),
    [profile?.monthlyRoleplayQuota, profile?.monthlyTranscriptionQuota],
  );
  const savedAudioCount = useMemo(
    () => meetings.filter((meeting) => meeting.audioFilePath && !meeting.audioDeletedAt).length,
    [meetings],
  );

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

    if (!canAccessDomain) {
      setErrorMessage(salesDomain === "teleapo" ? "テレアポ機能を利用する権限がありません。" : "商談機能を利用する権限がありません。");
      return;
    }

    if (inputMode === "audio" && !selectedFile) {
      setErrorMessage("文字起こし検証のため、音声ファイルを選択してください。");
      return;
    }

    const normalizedTranscriptText =
      inputMode === "transcript" ? normalizePastedTranscript(transcriptText) : "";

    if (inputMode === "transcript" && normalizedTranscriptText.length < 20) {
      setErrorMessage("文字起こしテキストを20文字以上入力してください。");
      return;
    }

    const normalizedRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
    const transcriptDurationSec =
      inputMode === "transcript"
        ? calculateTranscriptDurationSec(normalizedRecordedAt, transcriptEndedAtTime)
        : null;

    if (inputMode === "transcript" && transcriptDurationSec === null) {
      setErrorMessage("終了時間は実施日時より後の時間を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    const normalizedCustomerName =
      customerName.trim() || buildUntitledMeetingName(normalizedRecordedAt);

    try {
      const meetingId = await createMeeting({
        userId: profile.uid,
        companyId: profile.companyId,
        salesDomain,
        customerName: normalizedCustomerName,
        productType,
        customerType,
        meetingPurpose,
        recordedAt: normalizedRecordedAt,
        location: location.trim(),
        memo: memo.trim(),
        status,
        audioFile: inputMode === "audio" ? selectedFile : null,
        audioDurationSec: inputMode === "audio" ? detectedDurationSec : transcriptDurationSec,
        transcriptText: inputMode === "transcript" ? normalizedTranscriptText : null,
        audioRetentionLimit,
        onUploadProgress: setUploadProgress,
      });

      setSuccessMessage(
        inputMode === "transcript"
          ? `文字起こしテキストを保存しました。ID: ${meetingId}`
          : `アップロード完了しました。処理状況は一覧で確認できます。ID: ${meetingId}`,
      );
      router.push(`/meetings?category=${salesDomain}`);
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
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      {!canAccessDomain ? (
        <div className="mx-auto max-w-[860px] rounded-[24px] border border-[#f2d6d6] bg-white px-6 py-10 text-center">
          <h1 className="text-[28px] font-black tracking-[-0.04em] text-[#171717]">この機能は利用できません</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#596273]">
            {salesDomain === "teleapo" ? "テレアポ機能" : "商談機能"}の利用権限がありません。必要な場合は管理者に依頼してください。
          </p>
          <button
            type="button"
            onClick={() => router.push("/sales/dashboard")}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-6 text-[14px] font-black text-[#171717]"
          >
            ダッシュボードへ戻る
          </button>
        </div>
      ) : null}
      {canAccessDomain ? (
      <>
      <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.04em] text-[#171717]">
            {salesDomain === "teleapo" ? "架電ログを追加" : "商談を追加"}
          </h1>
          <p className="mt-2 text-[16px] text-[#7a808c]">
            {salesDomain === "teleapo"
              ? "音声ファイル、または既存の文字起こしテキストから架電分析を始められます。"
              : "音声ファイル、または既存の文字起こしテキストから商談分析を始められます。"}
          </p>
        </div>

        <div className="rounded-[18px] border border-[#eceef4] bg-white px-5 py-4 text-right shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="text-[13px] text-[#8a909b]">今月のアップロード件数</div>
          <div className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-[#171717]">
            {monthlyUploadCount}件
          </div>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <section className="rounded-[24px] border border-[#eceef4] bg-white p-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff8e4] text-[#f0b400]">
                <UploadGlyph />
              </div>
              <div className="min-w-0">
                <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
                  入力方法
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-[#7a808c]">
                  音声アップロード、または文字起こし貼り付け
                </p>
              </div>
            </div>
            <Segmented
              options={[
                { label: "音声", value: "audio" },
                { label: "文字起こし", value: "transcript" },
              ]}
              active={inputMode}
              onChange={(value) => {
                setInputMode(value as "audio" | "transcript");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
            />
          </div>

          {inputMode === "audio" ? (
            <>
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
                  mp3 / wav / m4a に対応しています
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
                  accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
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
                        "対応している形式は mp3 / wav / m4a です。別形式の場合は変換してから再度お試しください。",
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

              <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-[#505866]">音声保存枠</div>
                  <div className="text-[13px] font-bold text-[#8a6500]">
                    {savedAudioCount} / {audioRetentionLimit ?? "-"}件
                  </div>
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                  上限に達している場合、最も古い音声ファイルだけを自動削除して新しい音声を保存します。商談履歴と分析結果は残ります。
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[22px] border border-[#e6e8ee] bg-[#fafafa] px-5 py-5">
              <div className="text-[18px] font-bold text-[#171717]">文字起こしテキストを貼り付け</div>
              <p className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                Zoom / Teams / Notta などで作成済みの文字起こしを貼り付けると、音声なしで商談分析に進めます。
              </p>
              <textarea
                value={transcriptText}
                onChange={(event) => setTranscriptText(event.target.value)}
                className={`${inputClassName} mt-4 min-h-[260px] resize-y leading-7`}
                placeholder="営業: 本日はありがとうございます。\n顧客: よろしくお願いします。\n..."
              />
              <div className="mt-2 text-right text-[12px] font-semibold text-[#8a909b]">
                {transcriptText.trim().length.toLocaleString()}文字
              </div>
            </div>
          )}

          {inputMode === "audio" && selectedFile ? (
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

          <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-white px-5 py-4">
            <div className="text-[13px] font-semibold text-[#505866]">処理ステータス</div>
            <div className="mt-2 text-[14px] leading-6 text-[#7a808c]">
              {isSubmitting
                ? inputMode === "audio"
                  ? "音声をアップロード中です。完了後、ツール内通知でお知らせします。"
                  : "文字起こしテキストを保存し、AIで要約と分析を作成しています。"
                : inputMode === "audio"
                  ? selectedFile
                    ? "アップロード前です。保存すると処理待ちとして一覧に表示されます。"
                    : "音声ファイルを選択してください。"
                  : "保存すると、貼り付けた文字起こしからAI要約と分析を作成します。"}
            </div>
          </div>

          {inputMode === "audio" && detectedDurationSec !== null && detectedDurationSec > maxRecommendedDurationSec ? (
            <AlertBox>
              120分を超える音声です。文字起こし検証の観点では価値がありますが、
              まずは短めの音声でも1本通して精度確認するのがおすすめです。
            </AlertBox>
          ) : null}

          {inputMode === "audio" && selectedFile && selectedFile.size > maxOpenAiTranscriptionFileSizeBytes ? (
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
              <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
                打ち合わせ情報
              </h2>
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

            {inputMode === "transcript" ? (
              <Field label="終了時間" required>
                <input
                  type="time"
                  className={inputClassName}
                  value={transcriptEndedAtTime}
                  onChange={(event) => setTranscriptEndedAtTime(event.target.value)}
                />
              </Field>
            ) : null}

            <Field label="商材タイプ" required>
              <select
                className={inputClassName}
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
              >
                {productOptions.length === 0 ? (
                  <option value="">商材未登録</option>
                ) : null}
                {productOptions.map((product) => (
                  <option key={product} value={product}>
                    {product}
                  </option>
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

            <Field label="商談目的" required>
              <select
                className={inputClassName}
                value={meetingPurpose}
                onChange={(event) => setMeetingPurpose(event.target.value as MeetingPurpose)}
              >
                {meetingPurposeOptions.map((option) => (
                  <option key={option} value={option}>
                    {getMeetingPurposeLabel(option)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="成約/失注ステータス" required>
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

            <Field label="営業メモ">
              <textarea
                className={`${inputClassName} min-h-[112px] resize-y leading-7`}
                placeholder="商談中に気になったこと、次回確認したいことなど"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-[14px] border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] font-medium text-[#575f6d]"
              >
                入力を保持
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="rounded-[14px] bg-[#171717] px-5 py-3 text-[14px] font-medium text-white transition hover:bg-[#2a2d33] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
              >
                {isSubmitting
                  ? inputMode === "audio"
                    ? `アップロード中... ${uploadProgress}%`
                    : "保存中..."
                  : inputMode === "audio"
                    ? "音声をアップロード"
                    : "文字起こしを保存"}
              </button>
            </div>
          </form>
        </section>
      </section>
      </>
      ) : null}
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
    <div className="grid grid-cols-2 rounded-[16px] border border-[#e6e8ee] bg-[#f7f8fb] p-1">
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-11 rounded-[13px] px-4 text-[13px] font-bold transition ${
              isActive
                ? "bg-[#171717] text-white shadow-[0_8px_18px_rgba(17,24,39,0.12)]"
                : "text-[#596273] hover:bg-white hover:text-[#171717]"
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

  return lowerName.endsWith(".mp3") || lowerName.endsWith(".wav") || lowerName.endsWith(".m4a");
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

function normalizePastedTranscript(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function toDatetimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function calculateTranscriptDurationSec(startedAt: Date, endedAtTime: string) {
  const [hoursText, minutesText] = endedAtTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  const endedAt = new Date(startedAt);
  endedAt.setHours(hours, minutes, 0, 0);

  const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  return durationSec > 0 ? durationSec : null;
}

function isCurrentMonth(date: Date | null) {
  if (!date) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function readSharedAiQuota(transcriptionQuota: number | null, roleplayQuota: number | null) {
  if (transcriptionQuota === null || roleplayQuota === null) {
    return null;
  }

  return Math.min(transcriptionQuota, roleplayQuota);
}
