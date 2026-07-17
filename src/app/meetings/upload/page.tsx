"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
  DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
} from "@/lib/ai-usage-limit";
import { firebaseAuth } from "@/lib/firebase/client";
import { fetchCompanyNotificationSettings } from "@/lib/firebase/company-settings";
import {
  subscribeToCalendarEvents,
  type CalendarEvent,
} from "@/lib/firebase/calendar-events";
import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import { subscribeToCustomers, type CustomerRecord } from "@/lib/firebase/customers";
import { subscribeToKnowledgeProducts, type KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createMeeting,
  subscribeToMeetings,
  getMeetingPurposeLabel,
  type MeetingRecord,
} from "@/lib/firebase/meetings";
import { canUseSalesDomain, type SalesDomain } from "@/lib/sales-domains";
import {
  getEffectiveUploadDurationLimitSec,
  uploadDurationGraceMinutes,
} from "@/lib/upload-duration-limit";
import type { MeetingPurpose } from "@/types/domain";

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
type TranscriptCorrectionRule = {
  id: string;
  source: string;
  replacement: string;
  note: string;
};

const transcriptCorrectionRules: TranscriptCorrectionRule[] = [
  {
    id: "neppan",
    source: "熱ぱ",
    replacement: "ねっぱん！",
    note: "予約管理システム名の認識ミス候補",
  },
  {
    id: "toei-hotel",
    source: "東営ホテル",
    replacement: "",
    note: "ホテル名の認識ミスの可能性があります。正しいホテル名を入力して置換できます。",
  },
  {
    id: "template",
    source: "コンプレート",
    replacement: "テンプレート",
    note: "テンプレートの認識ミス候補",
  },
  {
    id: "form",
    source: "フォア",
    replacement: "フォーム",
    note: "フォームの認識ミス候補",
  },
  {
    id: "commo",
    source: "コモコモ",
    replacement: "commo.",
    note: "サービス名の認識ミス候補",
  },
  {
    id: "pl",
    source: "PL",
    replacement: "",
    note: "別の予約システム名として認識された可能性があります。正しい名称を入力して置換できます。",
  },
  {
    id: "selmo-kana",
    source: "セルモ",
    replacement: "selmo.",
    note: "サービス名の表記ゆれ候補",
  },
  {
    id: "commo-kana",
    source: "コモ",
    replacement: "commo.",
    note: "サービス名の表記ゆれ候補",
  },
  {
    id: "sns-reading",
    source: "エスエヌエス",
    replacement: "SNS",
    note: "SNSの読み表記候補",
  },
  {
    id: "sns-daiku",
    source: "SNS運用大工",
    replacement: "SNS運用代行",
    note: "商材名の認識ミス候補",
  },
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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState(searchParams.get("eventId") ?? "");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [salesUsers, setSalesUsers] = useState<AppUserProfile[]>([]);
  const [attendeeUserIds, setAttendeeUserIds] = useState<string[]>([]);
  const [attendeesManuallyEdited, setAttendeesManuallyEdited] = useState(false);
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
  const [correctionOverrides, setCorrectionOverrides] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDurationSec, setDetectedDurationSec] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companyUploadDurationLimitMinutes, setCompanyUploadDurationLimitMinutes] = useState<number | null>(null);
  const salesDomain: SalesDomain = searchParams.get("category") === "teleapo" ? "teleapo" : "meeting";
  const canAccessDomain = isLoading || canUseSalesDomain(profile, salesDomain);
  const currentMonthRange = useMemo(() => getCurrentMonthDateTimeRange(), []);
  const currentMonthMinDateTime = useMemo(() => toDatetimeLocalValue(currentMonthRange.start), [currentMonthRange.start]);
  const currentMonthMaxDateTime = useMemo(() => toDatetimeLocalValue(currentMonthRange.end), [currentMonthRange.end]);

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

    const unsubscribers = [
      subscribeToMeetings(
        { role: profile.role, userId: profile.uid, companyId: profile.companyId, salesDomains: [salesDomain] },
        setMeetings,
        () => setMeetings([]),
      ),
      subscribeToCalendarEvents(
        { companyId: profile.companyId, userId: profile.uid, isAdmin: profile.role === "admin", salesDomains: [salesDomain] },
        setCalendarEvents,
        () => setCalendarEvents([]),
      ),
      subscribeToCustomers(
        { companyId: profile.companyId, userId: profile.uid, isAdmin: profile.role === "admin" },
        setCustomers,
        () => setCustomers([]),
      ),
      subscribeToUserProfiles(
        (profiles) => setSalesUsers(profiles.filter((user) => user.role === "sales" && user.status === "active")),
        () => setSalesUsers([]),
        profile.companyId,
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [profile?.companyId, profile?.role, profile?.uid, salesDomain]);

  useEffect(() => {
    if (!profile?.companyId) return;

    let isActive = true;
    fetchCompanyNotificationSettings(profile.companyId)
      .then((settings) => {
        if (isActive) {
          setCompanyUploadDurationLimitMinutes(settings.uploadDurationLimitMinutes);
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [profile?.companyId]);

  const productOptions = useMemo(() => products.map((product) => product.name), [products]);
  const availableCalendarEvents = useMemo(
    () => calendarEvents.filter((event) => event.salesDomain === salesDomain && isWithinDateRange(event.scheduledAt, currentMonthRange)),
    [calendarEvents, currentMonthRange, salesDomain],
  );
  const selectedCalendarEvent = useMemo(
    () => availableCalendarEvents.find((event) => event.id === selectedCalendarEventId) ?? null,
    [availableCalendarEvents, selectedCalendarEventId],
  );
  const matchedCustomer = useMemo(() => {
    const normalizedName = normalizeCustomerLookupName(customerName);
    if (!normalizedName) return null;
    return customers.find((customer) => normalizeCustomerLookupName(customer.companyName) === normalizedName) ?? null;
  }, [customerName, customers]);
  const attendeeOptions = useMemo(
    () => salesUsers.filter((user) => user.uid !== profile?.uid),
    [profile?.uid, salesUsers],
  );
  const attendeeUserNames = useMemo(
    () => buildSelectedAttendeeNames(attendeeUserIds, salesUsers, matchedCustomer),
    [attendeeUserIds, matchedCustomer, salesUsers],
  );
  const audioRetentionLimit = readSharedAiQuota(
    profile ? profile.monthlyTranscriptionQuota : DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
    profile ? profile.monthlyRoleplayQuota : DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
  );
  const uploadDurationLimitMinutes = companyUploadDurationLimitMinutes ?? profile?.uploadDurationLimitMinutes ?? 60;
  const effectiveUploadDurationLimitSec = useMemo(
    () => getEffectiveUploadDurationLimitSec(uploadDurationLimitMinutes),
    [uploadDurationLimitMinutes],
  );
  const savedAudioCount = useMemo(
    () => meetings.filter((meeting) => meeting.audioFilePath && !meeting.audioDeletedAt).length,
    [meetings],
  );
  const monthlyUploadCount = useMemo(
    () => meetings.filter((meeting) => isCurrentMonth(meeting.createdAt ?? meeting.recordedAt)).length,
    [meetings],
  );
  const monthlyUploadQuota = profile ? profile.monthlyTranscriptionQuota : 10;
  const isUploadQuotaUnavailable = monthlyUploadQuota !== null && monthlyUploadQuota <= 0;
  const detectedTranscriptCorrections = useMemo(
    () => detectTranscriptCorrections(transcriptText, [productType, ...productOptions]),
    [productOptions, productType, transcriptText],
  );

  const applyCalendarEventToForm = useCallback(
    (calendarEvent: CalendarEvent) => {
      setCustomerName(calendarEvent.customerName);
      setProductType(calendarEvent.productName || productType);
      setCustomerType(calendarEvent.customerType);
      setMeetingPurpose(calendarEvent.meetingPurpose);
      setLocation(calendarEvent.location);
      setMemo(buildCalendarEventMemo(calendarEvent));

      if (calendarEvent.scheduledAt) {
        if (!isWithinDateRange(calendarEvent.scheduledAt, currentMonthRange)) {
          setErrorMessage("実施日時は今月内の日付だけ選択できます。");
          setSelectedCalendarEventId("");
          return;
        }

        setRecordedAt(toDatetimeLocalValue(calendarEvent.scheduledAt));
        setTranscriptEndedAtTime(toTimeInputValue(addMinutes(calendarEvent.scheduledAt, 60)));
      }
    },
    [currentMonthRange, productType],
  );

  useEffect(() => {
    if (!selectedCalendarEvent) return;
    applyCalendarEventToForm(selectedCalendarEvent);
  }, [applyCalendarEventToForm, selectedCalendarEvent]);

  useEffect(() => {
    setAttendeesManuallyEdited(false);
  }, [customerName]);

  useEffect(() => {
    if (attendeesManuallyEdited) return;
    setAttendeeUserIds(
      matchedCustomer ? normalizeAttendeeIds(matchedCustomer.collaboratorUserIds, profile?.uid ?? "") : [],
    );
  }, [attendeesManuallyEdited, matchedCustomer, profile?.uid]);

  function handleRecordedAtChange(value: string) {
    if (!value) {
      setRecordedAt("");
      return;
    }

    const nextRecordedAt = new Date(value);
    if (Number.isNaN(nextRecordedAt.getTime())) {
      setErrorMessage("実施日時を正しく入力してください。");
      return;
    }

    if (!isWithinDateRange(nextRecordedAt, currentMonthRange)) {
      setErrorMessage("実施日時は今月内の日付だけ選択できます。");
      return;
    }

    setRecordedAt(value);
    setErrorMessage(null);
    setTranscriptEndedAtTime(toTimeInputValue(addMinutes(nextRecordedAt, 60)));
  }

  function applyTranscriptCorrection(ruleId: string) {
    const rule = transcriptCorrectionRules.find((item) => item.id === ruleId);
    if (!rule) return;

    const replacement = (correctionOverrides[rule.id] ?? rule.replacement).trim();
    if (!replacement) return;

    setTranscriptText((current) => replaceAllLiteral(current, rule.source, replacement));
  }

  function applyAllTranscriptCorrections() {
    setTranscriptText((current) =>
      detectedTranscriptCorrections.reduce((nextText, correction) => {
        const replacement = (correctionOverrides[correction.rule.id] ?? correction.rule.replacement).trim();
        return replacement ? replaceAllLiteral(nextText, correction.rule.source, replacement) : nextText;
      }, current),
    );
  }

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

    if (!recordedAt) {
      setErrorMessage("実施日時を入力してください。");
      return;
    }

    const normalizedRecordedAt = new Date(recordedAt);
    if (Number.isNaN(normalizedRecordedAt.getTime()) || !isWithinDateRange(normalizedRecordedAt, currentMonthRange)) {
      setErrorMessage("実施日時は今月内の日付だけ選択できます。毎月1日に、その月の日付を選べるようになります。");
      return;
    }

    const transcriptDurationSec =
      inputMode === "transcript"
        ? calculateTranscriptDurationSec(normalizedRecordedAt, transcriptEndedAtTime)
        : null;

    if (inputMode === "transcript" && transcriptDurationSec === null) {
      setErrorMessage("終了時間は実施日時より後の時間を入力してください。");
      return;
    }

    if (inputMode === "audio") {
      if (detectedDurationSec === null) {
        setErrorMessage("音声時間を取得できないファイルはアップロードできません。mp3 / m4a に変換してから再度お試しください。");
        return;
      }

      if (detectedDurationSec > effectiveUploadDurationLimitSec) {
        setErrorMessage(buildUploadDurationLimitMessage(uploadDurationLimitMinutes));
        return;
      }
    }

    if (inputMode === "transcript" && transcriptDurationSec !== null && transcriptDurationSec > effectiveUploadDurationLimitSec) {
      setErrorMessage(buildUploadDurationLimitMessage(uploadDurationLimitMinutes));
      return;
    }

    if (monthlyUploadQuota !== null && monthlyUploadCount >= monthlyUploadQuota) {
      setErrorMessage(`今月の商談・テレアポ分析上限（${monthlyUploadQuota}回）に達しました。管理者に上限変更を依頼してください。`);
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
        attendeeUserIds,
        attendeeUserNames,
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

      if (inputMode === "audio" && selectedFile && isWavAudioFile(selectedFile)) {
        try {
          await convertMeetingAudioToMp3(meetingId);
        } catch {
          setSuccessMessage(null);
          setErrorMessage("アップロードは完了しましたが、WAVからmp3への自動変換に失敗しました。時間を置いて再度お試しください。");
          return;
        }
      }

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
              <div
                className={`rounded-[22px] border border-dashed px-6 py-9 text-center transition ${
                  selectedFile
                    ? "border-[#f1dfaa] bg-[#fffdf7]"
                    : "border-[#dfe3ea] bg-[#fafafa]"
                }`}
              >
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
                  mp3 / m4a / wav に対応しています。wavは保存時にmp3へ自動変換されます。
                </div>
                {selectedFile ? (
                  <div className="mx-auto mt-5 flex max-w-full items-center justify-center gap-2 rounded-[14px] border border-[#f1dfaa] bg-white px-4 py-3 text-left shadow-[0_8px_18px_rgba(245,189,7,0.12)] sm:max-w-[420px]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff4d6] text-[#8a6500]">
                      <CheckIcon />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-[#8a6500]">選択済み</div>
                      <div className="mt-0.5 truncate text-[14px] font-semibold text-[#171717]">
                        {selectedFile.name}
                      </div>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadQuotaUnavailable}
                  className={`mt-6 rounded-[14px] px-5 py-3 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:bg-[#9ca3af] disabled:text-white ${
                    selectedFile
                      ? "bg-[#ffd12f] text-[#171717] hover:bg-[#f5bd07]"
                      : "bg-[#171717] text-white hover:bg-[#2a2d33]"
                  }`}
                >
                  {selectedFile ? "別のファイルを選択" : "ファイルを選択"}
                </button>
                <div className="mt-3 text-[12px] font-semibold text-[#7a808c]">
                  {selectedFile
                    ? "このファイルで保存できます。下の詳細も確認できます。"
                    : "選択するとファイル名と再生時間がここに表示されます。"}
                </div>
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
                      event.target.value = "";
                      return;
                    }

                    setSelectedFile(file);

                    try {
                      const durationSec = await readAudioDuration(file);
                      setDetectedDurationSec(durationSec);
                      if (durationSec > effectiveUploadDurationLimitSec) {
                        setErrorMessage(buildUploadDurationLimitMessage(uploadDurationLimitMinutes));
                      }
                    } catch {
                      setSelectedFile(null);
                      event.target.value = "";
                      setErrorMessage(
                        "音声時間を取得できないファイルはアップロードできません。mp3 / m4a に変換してから再度お試しください。",
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

              <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-[#505866]">1ファイル上限</div>
                  <div className="text-[13px] font-bold text-[#8a6500]">{uploadDurationLimitMinutes}分</div>
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                  会社設定により、1ファイルあたり{uploadDurationLimitMinutes}分までアップロードできます。処理誤差として{uploadDurationGraceMinutes}分の猶予があります。
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-[#505866]">今月の分析回数</div>
                  <div className="text-[13px] font-bold text-[#8a6500]">{monthlyUploadCount} / {monthlyUploadQuota ?? "-"}回</div>
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[#7a808c]">
                  商談またはテレアポを保存した時点で、今月の分析回数としてカウントします。
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[22px] border border-[#e6e8ee] bg-[#fafafa] px-5 py-5">
              <div className="text-[18px] font-bold text-[#171717]">文字起こしテキストを貼り付け</div>
              <textarea
                value={transcriptText}
                onChange={(event) => setTranscriptText(event.target.value)}
                onPaste={(event) => {
                  const pastedText = event.clipboardData.getData("text");
                  if (!pastedText) return;
                  const selectionStart = event.currentTarget.selectionStart;
                  const selectionEnd = event.currentTarget.selectionEnd;
                  event.preventDefault();
                  setTranscriptText((current) =>
                    insertTextAtSelection(
                      current,
                      formatPastedTranscriptForEditing(pastedText),
                      selectionStart,
                      selectionEnd,
                    ),
                  );
                }}
                className={`${inputClassName} mt-4 min-h-[260px] resize-y leading-7`}
                placeholder="営業: 本日はありがとうございます。\n顧客: よろしくお願いします。\n..."
              />
              <div className="mt-2 text-right text-[12px] font-semibold text-[#8a909b]">
                {transcriptText.trim().length.toLocaleString()}文字
              </div>
              {detectedTranscriptCorrections.length > 0 ? (
                <div className="mt-4 rounded-[18px] border border-[#f1dfaa] bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-bold text-[#8a6500]">誤認識候補</div>
                      <div className="mt-1 text-[12px] leading-5 text-[#7a808c]">
                        候補を確認して、必要なものだけ本文に反映できます。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={applyAllTranscriptCorrections}
                      className="rounded-[12px] bg-[#171717] px-3 py-2 text-[12px] font-bold text-white transition hover:bg-[#2a2d33]"
                    >
                      置換できる候補を一括反映
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {detectedTranscriptCorrections.map((correction) => {
                      const replacement = correctionOverrides[correction.rule.id] ?? correction.rule.replacement;
                      const canApply = replacement.trim().length > 0;
                      return (
                        <div key={correction.rule.id} className="rounded-[14px] border border-[#eceef4] bg-[#fafafa] px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-[#171717]">
                                {correction.rule.source}
                                <span className="mx-2 text-[#b6bdc8]">→</span>
                                {replacement || "要確認"}
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[#7a808c]">
                                {correction.rule.note} / {correction.count}件
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applyTranscriptCorrection(correction.rule.id)}
                              disabled={!canApply}
                              className="rounded-[12px] bg-[#ffd12f] px-3 py-2 text-[12px] font-bold text-[#171717] transition hover:bg-[#f5bd07] disabled:cursor-not-allowed disabled:bg-[#d1d5db] disabled:text-white"
                            >
                              反映
                            </button>
                          </div>
                          <input
                            type="text"
                            className={`${inputClassName} mt-2 py-2 text-[13px]`}
                            value={replacement}
                            placeholder="正しい表記を入力"
                            onChange={(event) =>
                              setCorrectionOverrides((current) => ({
                                ...current,
                                [correction.rule.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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

          {inputMode === "audio" && detectedDurationSec !== null && detectedDurationSec > effectiveUploadDurationLimitSec ? (
            <AlertBox>
              {buildUploadDurationLimitMessage(uploadDurationLimitMinutes)}
            </AlertBox>
          ) : null}

          {inputMode === "audio" && selectedFile && selectedFile.size > maxOpenAiTranscriptionFileSizeBytes ? (
            <AlertBox>
              この音声は25MBを超えています。文字起こし時に自動で軽量mp3へ分割して処理します。通常より少し時間がかかる場合があります。
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
            {isUploadQuotaUnavailable ? (
              <ErrorBox>この会社の今月の商談・テレアポ分析回数が0回に設定されているため、閲覧のみ可能です。アップロードや保存はできません。</ErrorBox>
            ) : null}

            <Field label="予定から反映">
              <select
                className={inputClassName}
                value={selectedCalendarEventId}
                onChange={(event) => setSelectedCalendarEventId(event.target.value)}
              >
                <option value="">予定を選択しない</option>
                {availableCalendarEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatCalendarEventOption(event)}
                  </option>
                ))}
              </select>
              {selectedCalendarEvent ? (
                <div className="mt-2 rounded-[14px] border border-[#f1dfaa] bg-[#fffdf7] px-4 py-3 text-[12px] leading-5 text-[#6f5500]">
                  予定情報を打ち合わせ情報に反映しました。必要に応じて編集できます。
                </div>
              ) : null}
            </Field>

            <Field label="顧客名 / 会社名">
              <input
                type="text"
                className={inputClassName}
                placeholder="空欄なら自動で仮タイトルを設定"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>

            <Field label="同席者">
              <MeetingAttendeeSelect
                users={attendeeOptions}
                selectedIds={attendeeUserIds}
                selectedNames={attendeeUserNames}
                matchedCustomer={matchedCustomer}
                onChange={(nextIds) => {
                  setAttendeesManuallyEdited(true);
                  setAttendeeUserIds(nextIds);
                }}
              />
            </Field>

            <Field label="実施日時" required>
              <input
                type="datetime-local"
                className={inputClassName}
                min={currentMonthMinDateTime}
                max={currentMonthMaxDateTime}
                value={recordedAt}
                onChange={(event) => handleRecordedAtChange(event.target.value)}
              />
              <p className="mt-2 text-[12px] font-semibold text-[#8a909b]">
                実施日時は今月内のみ選択できます。毎月1日に選択可能な月が切り替わります。
              </p>
            </Field>

            {inputMode === "transcript" ? (
              <Field label="終了時間" required>
                <input
                  type="time"
                  className={inputClassName}
                  value={transcriptEndedAtTime}
                  onChange={(event) => setTranscriptEndedAtTime(event.target.value)}
                />
                <p className="mt-2 text-[12px] font-semibold text-[#8a909b]">
                  実施日時の1時間後を自動入力します。必要に応じて変更できます。
                </p>
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
              <select
                className={inputClassName}
                value={status}
                onChange={(event) => setStatus(event.target.value as "won" | "considering" | "lost")}
              >
                <option value="won">成約</option>
                <option value="considering">検討中</option>
                <option value="lost">失注</option>
              </select>
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
                disabled={isSubmitting || isLoading || isUploadQuotaUnavailable}
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

function MeetingAttendeeSelect({
  users,
  selectedIds,
  selectedNames,
  matchedCustomer,
  onChange,
}: {
  users: AppUserProfile[];
  selectedIds: string[];
  selectedNames: string[];
  matchedCustomer: CustomerRecord | null;
  onChange: (selectedIds: string[]) => void;
}) {
  const toggleUser = (userId: string) => {
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  };
  const sourceLabel = matchedCustomer
    ? matchedCustomer.collaboratorUserNames.length > 0
      ? `顧客カルテの共同担当・同行者を反映中: ${matchedCustomer.collaboratorUserNames.join(" / ")}`
      : "顧客カルテに同席者は未設定です。必要な社内メンバーを選択できます。"
    : "顧客カルテ未登録でも、この打ち合わせだけの同席者を選択できます。";

  return (
    <div className="rounded-[14px] border border-[#e6e8ee] bg-[#fcfcfd] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold leading-5 text-[#7a808c]">{sourceLabel}</p>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#8a6500]">
          {selectedIds.length > 0 ? `${selectedIds.length}名選択中` : "任意"}
        </span>
      </div>
      {selectedNames.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedNames.map((name) => (
            <span key={name} className="rounded-full border border-[#f1dfaa] bg-[#fffdf7] px-3 py-1.5 text-[12px] font-bold text-[#6f5500]">
              {name}
            </span>
          ))}
        </div>
      ) : null}
      {users.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {users.map((user) => {
            const selected = selectedIds.includes(user.uid);
            return (
              <button
                key={user.uid}
                type="button"
                onClick={() => toggleUser(user.uid)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
                  selected
                    ? "border-[#f0c655] bg-[#ffd84d] text-[#171717]"
                    : "border-[#e2e6ee] bg-white text-[#596273] hover:border-[#ead8a8]"
                }`}
              >
                {user.name ?? user.email ?? "名前未設定"}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] font-semibold text-[#8a909b]">選択できる社内メンバーはいません。</p>
      )}
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
  const gridClassName = options.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid ${gridClassName} rounded-[16px] border border-[#e6e8ee] bg-[#f7f8fb] p-1`}>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.4]">
      <path d="m6 12 4 4 8-8" />
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

function isWavAudioFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();

  return lowerType.includes("wav") || lowerName.endsWith(".wav") || lowerName.endsWith(".wave");
}

async function convertMeetingAudioToMp3(meetingId: string) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  if (!token) {
    throw new Error("ログイン情報を確認できませんでした。");
  }

  const response = await fetch(`/api/meetings/${meetingId}/convert-audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("WAV音声のmp3変換に失敗しました。");
  }
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
  return formatPastedTranscriptForEditing(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatPastedTranscriptForEditing(text: string) {
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (!normalizedText) return "";
  if (normalizedText.includes("\n")) {
    return normalizedText.replace(/\n{3,}/g, "\n\n");
  }

  return splitLongPastedTranscript(normalizedText).join("\n");
}

function splitLongPastedTranscript(text: string) {
  const sentences = text
    .replace(/^。+/, "")
    .match(/[^。！？!?]+[。！？!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [text.trim()];

  const blocks: string[] = [];
  let currentBlock = "";

  for (const sentence of sentences) {
    const nextBlock = currentBlock ? `${currentBlock}${sentence}` : sentence;
    const shouldBreakBefore =
      currentBlock.length >= 42 ||
      isLikelyTurnOpening(sentence) ||
      (currentBlock.length >= 18 && isShortResponse(sentence));

    if (currentBlock && shouldBreakBefore) {
      blocks.push(currentBlock);
      currentBlock = sentence;
      continue;
    }

    currentBlock = nextBlock;
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks.length > 0 ? blocks : [text.trim()];
}

function isLikelyTurnOpening(sentence: string) {
  return /^(はい|うん|そうです|なるほど|ありがとうございます|よろしく|すみません|申し訳|お待たせ|では|じゃあ|例えば|ただ|あの|えっと|ちなみに|質問|確認|できます|できますか)/.test(sentence);
}

function isShortResponse(sentence: string) {
  return sentence.length <= 18 && /^(はい|うん|そうです|なるほど|できます|わかりました|ありがとうございます|よろしく)/.test(sentence);
}

function insertTextAtSelection(current: string, inserted: string, selectionStart: number | null, selectionEnd: number | null) {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  const prefix = current.slice(0, start);
  const suffix = current.slice(end);
  const separatorBefore = prefix && !prefix.endsWith("\n") ? "\n" : "";
  const separatorAfter = suffix && !inserted.endsWith("\n") ? "\n" : "";
  return `${prefix}${separatorBefore}${inserted}${separatorAfter}${suffix}`;
}

function detectTranscriptCorrections(text: string, productNames: string[]) {
  const normalizedText = text.trim();
  if (!normalizedText) return [];

  const corrections = transcriptCorrectionRules
    .map((rule) => ({
      rule,
      count: countLiteralOccurrences(normalizedText, rule.source),
    }))
    .filter((correction) => correction.count > 0);

  const existingSources = new Set(corrections.map((correction) => correction.rule.source));
  const productCorrections = detectProductNameCorrections(normalizedText, productNames, existingSources);
  productCorrections.forEach((correction) => existingSources.add(correction.rule.source));

  return [
    ...corrections,
    ...productCorrections,
    ...detectSuspiciousTranscriptTerms(normalizedText, existingSources),
  ].slice(0, 12);
}

function countLiteralOccurrences(text: string, needle: string) {
  if (!needle) return 0;

  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function detectProductNameCorrections(text: string, productNames: string[], ignoredSources: Set<string>) {
  const normalizedProducts = Array.from(new Set(productNames.map((name) => name.trim()).filter(Boolean)));
  if (normalizedProducts.length === 0) return [];

  const terms = extractTranscriptTerms(text);
  const corrections: Array<{ rule: TranscriptCorrectionRule; count: number }> = [];

  for (const term of terms) {
    if (ignoredSources.has(term.value)) continue;

    const normalizedTerm = normalizeCorrectionComparable(term.value);
    if (normalizedTerm.length < 3) continue;

    const matchedProduct = normalizedProducts.find((productName) => {
      const normalizedProduct = normalizeCorrectionComparable(productName);
      if (normalizedProduct.length < 3 || normalizedProduct === normalizedTerm) return false;
      const distance = levenshteinDistance(normalizedTerm, normalizedProduct);
      return distance > 0 && distance <= Math.max(1, Math.floor(normalizedProduct.length * 0.28));
    });

    if (!matchedProduct) continue;

    corrections.push({
      rule: {
        id: `product-${stableCorrectionId(term.value)}-${stableCorrectionId(matchedProduct)}`,
        source: term.value,
        replacement: matchedProduct,
        note: "登録商材名に近い表記ゆれ候補",
      },
      count: term.count,
    });

    if (corrections.length >= 5) break;
  }

  return corrections;
}

function detectSuspiciousTranscriptTerms(text: string, ignoredSources: Set<string>) {
  return extractTranscriptTerms(text)
    .filter((term) => !ignoredSources.has(term.value))
    .filter((term) => isSuspiciousTranscriptTerm(term.value))
    .slice(0, 5)
    .map((term) => ({
      rule: {
        id: `suspicious-${stableCorrectionId(term.value)}`,
        source: term.value,
        replacement: "",
        note: "聞き間違いの可能性がある語です。正しい表記を入力して置換できます。",
      },
      count: term.count,
    }));
}

function extractTranscriptTerms(text: string) {
  const termCounts = new Map<string, number>();
  const termPattern = /[A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龯ぁ-んァ-ヶー]{3,24}/g;
  let match: RegExpExecArray | null;

  while ((match = termPattern.exec(text)) !== null) {
    const value = match[0].trim();
    if (!value || transcriptCorrectionIgnoreTerms.has(value)) continue;
    termCounts.set(value, (termCounts.get(value) ?? 0) + 1);
  }

  return Array.from(termCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || right.value.length - left.value.length);
}

const transcriptCorrectionIgnoreTerms = new Set([
  "ありがとう",
  "ありがとうございます",
  "よろしく",
  "お願いします",
  "ございます",
  "そうですね",
  "という",
  "こちら",
  "そちら",
  "できる",
  "している",
  "について",
  "いただき",
  "いただく",
]);

function isSuspiciousTranscriptTerm(value: string) {
  if (transcriptCorrectionIgnoreTerms.has(value)) return false;
  if (/^[ァ-ヶー]{5,}$/.test(value)) return true;
  if (/([ァ-ヶー]{2,})\1/.test(value)) return true;
  if (/[A-Za-zＡ-Ｚａ-ｚ].*[ァ-ヶー]|[ァ-ヶー].*[A-Za-zＡ-Ｚａ-ｚ]/.test(value)) return true;
  return false;
}

function normalizeCorrectionComparable(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function stableCorrectionId(value: string) {
  return normalizeCorrectionComparable(value).slice(0, 24) || String(value.length);
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function replaceAllLiteral(text: string, source: string, replacement: string) {
  return text.split(source).join(replacement);
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

function formatCalendarEventOption(event: CalendarEvent) {
  const timeLabel = event.scheduledAt ? formatShortDateTime(event.scheduledAt) : "日時未設定";
  const customerLabel = event.customerName || "顧客名未設定";
  const productLabel = event.productName || "商材未設定";
  return `${timeLabel} ${customerLabel} / ${productLabel}`;
}

function formatShortDateTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildCalendarEventMemo(event: CalendarEvent) {
  const sections = [
    ["ターゲット層", event.targetSegment],
    ["話すこと", event.agenda],
    ["想定課題・不安", event.customerIssues],
    ["事前準備メモ", event.preparationMemo],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`);

  return sections.join("\n\n");
}

function normalizeCustomerLookupName(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function normalizeAttendeeIds(value: string[], currentUserId: string) {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))).filter((userId) => userId !== currentUserId);
}

function buildSelectedAttendeeNames(
  selectedIds: string[],
  users: AppUserProfile[],
  matchedCustomer: CustomerRecord | null,
) {
  return selectedIds
    .map((userId) => {
      const user = users.find((profile) => profile.uid === userId);
      if (user) return user.name ?? user.email ?? "名前未設定";
      const customerNameIndex = matchedCustomer?.collaboratorUserIds.indexOf(userId) ?? -1;
      return customerNameIndex >= 0 ? matchedCustomer?.collaboratorUserNames[customerNameIndex] ?? "名前未設定" : "名前未設定";
    })
    .filter(Boolean);
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

function getCurrentMonthDateTimeRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 0, 0);
  return { start, end };
}

function isWithinDateRange(date: Date | null, range: { start: Date; end: Date }) {
  if (!date) return false;
  const time = date.getTime();
  return Number.isFinite(time) && time >= range.start.getTime() && time <= range.end.getTime();
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
  if (endedAt.getTime() <= startedAt.getTime()) {
    endedAt.setDate(endedAt.getDate() + 1);
  }

  const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  return durationSec > 0 ? durationSec : null;
}

function buildUploadDurationLimitMessage(limitMinutes: number) {
  return `この会社でアップロードできる音声は1ファイル${limitMinutes}分までです。短いファイルに分けてアップロードしてください。`;
}

function isCurrentMonth(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function readSharedAiQuota(transcriptionQuota: number | null, roleplayQuota: number | null) {
  if (transcriptionQuota === null || roleplayQuota === null) {
    return null;
  }

  return Math.min(transcriptionQuota, roleplayQuota);
}
