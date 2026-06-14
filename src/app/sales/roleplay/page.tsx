"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import {
  saveRoleplayResult,
  subscribeToRoleplayAssignments,
  subscribeToRoleplayScenarios,
  type RoleplayAssignment,
  type RoleplayMessage,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

const monthlyLimitMessage = MONTHLY_AI_LIMIT_MESSAGE;

type VoicePreference = "female" | "male" | "default";
type SpeechSpeed = "slow" | "normal" | "fast";

export default function SalesRoleplayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const [scenarios, setScenarios] = useState<RoleplayScenario[]>([]);
  const [assignments, setAssignments] = useState<RoleplayAssignment[]>([]);
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voicePreference, setVoicePreference] = useState<VoicePreference>("female");
  const [speechSpeed, setSpeechSpeed] = useState<SpeechSpeed>("normal");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeModal, setActiveModal] = useState<"customer" | "voice" | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scenarioId = searchParams.get("scenarioId") ?? "";
  const roleplayType = readRoleplayType(searchParams.get("category"));
  const activeAssignmentScenarioIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.status === "assigned").map((assignment) => assignment.scenarioId)),
    [assignments],
  );
  const visibleScenarios = useMemo(
    () =>
      scenarios.filter((item) => {
        if (item.roleplayType !== roleplayType) return false;
        return item.visibility === "all" || item.createdBy === userId || activeAssignmentScenarioIds.has(item.id);
      }),
    [activeAssignmentScenarioIds, roleplayType, scenarios, userId],
  );
  const scenario = useMemo(
    () => visibleScenarios.find((item) => item.id === scenarioId) ?? null,
    [scenarioId, visibleScenarios],
  );

  useEffect(() => {
    if (!companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToRoleplayScenarios(companyId, setScenarios, handleError),
      subscribeToRoleplayAssignments({ companyId, userId, isAdmin: false }, setAssignments, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [companyId, userId]);

  useEffect(() => {
    if (!scenario) return;
    setMessages([]);
    setRecordingElapsedSec(0);
  }, [scenario]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      if (!recordingStartedAtRef.current) return;
      setRecordingElapsedSec(Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)));
    }, 300);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const handleStartRecording = async () => {
    if (!scenario || isRecording || isThinking || isTranscribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("このブラウザでは音声録音に対応していません。Chromeなどのブラウザでお試しください。");
      return;
    }

    setError(null);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingElapsedSec(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const durationSec = recordingStartedAtRef.current
          ? Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
          : recordingElapsedSec;
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        recordingStartedAtRef.current = null;
        setIsRecording(false);
        setRecordingElapsedSec(durationSec);
        if (audioBlob.size > 0) {
          void transcribeAndSend(audioBlob, durationSec);
        } else {
          setError("録音データが取得できませんでした。もう一度お試しください。");
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("マイクの利用が許可されていません。ブラウザのマイク権限を確認してください。");
    }
  };

  const handleStopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const transcribeAndSend = async (audioBlob: Blob, durationSec: number) => {
    if (!scenario) return;
    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `roleplay-${Date.now()}.${getAudioExtension(audioBlob.type)}`);
      formData.append("companyId", profile?.companyId ?? "");
      formData.append("userId", userId ?? "");
      formData.append("durationSec", String(durationSec));

      const response = await fetch("/api/roleplay/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "音声の文字起こしに失敗しました。");
      }

      const text = data.text?.trim() ?? "";
      if (!text) {
        throw new Error("発話を認識できませんでした。もう少しはっきり話して再録音してください。");
      }
      await sendSalesMessage(text);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "音声ロープレの送信に失敗しました。");
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendSalesMessage = async (content: string) => {
    if (!content.trim() || !scenario) return;

    const nextMessages: RoleplayMessage[] = [
      ...messages,
      {
        role: "sales",
        content: content.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    setMessages(nextMessages);
    setIsThinking(true);
    setError(null);

    try {
      const response = await fetch("/api/roleplay/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: profile?.companyId ?? null,
          userId,
          scenario,
          messages: nextMessages,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(monthlyLimitMessage);
        }

        throw new Error(data.error ?? "AI顧客の応答に失敗しました。");
      }
      setMessages([
        ...nextMessages,
        {
          role: "customer",
          content: data.message ?? "もう少し詳しく教えてください。",
          createdAt: new Date().toISOString(),
        },
      ]);
      speakText(data.message ?? "もう少し詳しく教えてください。", setIsSpeaking, {
        voicePreference,
        speechSpeed,
        voices: availableVoices,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI顧客の応答に失敗しました。");
    } finally {
      setIsThinking(false);
    }
  };

  const handleFinish = async () => {
    if (!scenario || !userId || !companyId || messages.length < 2) return;

    setIsSaving(true);
    setError(null);
    try {
      const evaluation = await evaluateRoleplayWithAi({
        companyId,
        userId,
        scenario,
        messages,
      }).catch((nextError) => {
        if (nextError instanceof Error && nextError.message === monthlyLimitMessage) {
          throw nextError;
        }
        return evaluateRoleplay(scenario, messages);
      });
      await saveRoleplayResult({
        companyId,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        roleplayType,
        productName: scenario.productName,
        userId,
        score: evaluation.score,
        summary: evaluation.summary,
        evaluationCriteria: scenario.evaluationCriteria,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        improvementPhrases: evaluation.improvementPhrases,
        manualChecklistItems: evaluation.manualChecklistItems,
        messages,
      });
      router.push(`/sales/roleplay/results?category=${roleplayType}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "結果の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="overflow-x-hidden bg-transparent px-4 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1500px]">
        <RoleplayHeader activeStep="practice" roleplayType={roleplayType} />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {scenario ? (
          <section className="mt-3">
            <article className="flex flex-col rounded-[24px] border border-[#e2e6ee] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <div className="border-b border-[#eef1f5] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-[#8a6500]">{scenario.productName || "商材未設定"}</p>
                    <h1 className="mt-1 text-[24px] font-black tracking-[-0.03em] text-[#171717]">{scenario.title}</h1>
                    <p className="mt-2 text-[13px] leading-6 text-[#707783]">
                      下の操作バーからいつでも録音できます。録音停止後に文字起こしし、AI顧客が音声で返答します。
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <IconButton label="AI顧客情報" onClick={() => setActiveModal("customer")}>
                      <CustomerIcon />
                    </IconButton>
                    <IconButton label="AI音声設定" onClick={() => setActiveModal("voice")}>
                      <VoiceSettingsIcon />
                    </IconButton>
                    <Link href={`/sales/roleplay/scenarios?category=${roleplayType}`} className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white px-4 text-[13px] font-bold text-[#3d4350]">
                      シナリオ変更
                    </Link>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-4 py-5 sm:px-5">
                {messages.length > 0 ? (
                  messages.map((message, index) => (
                    <MessageBubble key={`${message.createdAt}-${index}`} message={message} />
                  ))
                ) : (
                  <div className="rounded-[20px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-8 text-center">
                    <h3 className="text-[18px] font-black text-[#171717]">営業側から開始</h3>
                    <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-[#7a808c]">
                      下の録音ボタンを押して、いつものテレアポ・商談のように最初の挨拶から話してください。AIは顧客役として返答します。
                    </p>
                  </div>
                )}
                {isTranscribing ? (
                  <div className="max-w-[76%] rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 text-[13px] font-semibold text-[#7a808c]">
                    音声を文字起こししています...
                  </div>
                ) : null}
                {isThinking ? (
                  <div className="max-w-[76%] rounded-[18px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 text-[13px] font-semibold text-[#7a808c]">
                    AI顧客が考えています...
                  </div>
                ) : null}
              </div>

              <div className="sticky bottom-0 z-10 border-t border-[#eef1f5] bg-white/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="grid min-w-0 grid-cols-3 gap-2 xl:flex-1">
                    <CompactStatus label="録音" value={isRecording ? formatElapsed(recordingElapsedSec) : "--:--"} active={isRecording} />
                    <CompactStatus label="状態" value={buildVoiceStatus({ isRecording, isTranscribing, isThinking, isSpeaking })} />
                    <CompactStatus label="発話" value={`${messages.filter((message) => message.role === "sales").length}回`} />
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[380px] xl:shrink-0">
                    <button
                      type="button"
                      onClick={isRecording ? handleStopRecording : () => void handleStartRecording()}
                      disabled={isThinking || isTranscribing}
                      className={`inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-[16px] px-4 text-[13px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 ${
                        isRecording ? "bg-[#d92d20] text-white shadow-[0_10px_24px_rgba(217,45,32,0.22)]" : "bg-[#171717] text-white shadow-[0_10px_24px_rgba(17,24,39,0.16)]"
                      }`}
                    >
                      <MicIcon active={isRecording} />
                      {isRecording ? "録音を停止" : "録音して話す"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFinish()}
                      disabled={messages.filter((message) => message.role === "sales").length < 2 || isSaving || isRecording || isTranscribing || isThinking}
                      className="inline-flex h-12 min-w-0 items-center justify-center rounded-[16px] border border-[#f0c655] bg-[#ffd84d] px-4 text-[13px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.18)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                    >
                      {isSaving ? "保存中" : "終了して採点"}
                    </button>
                  </div>
                </div>
              </div>
            </article>
            <RoleplaySettingsModal
              activeModal={activeModal}
              onClose={() => setActiveModal(null)}
              scenario={scenario}
              voicePreference={voicePreference}
              speechSpeed={speechSpeed}
              onVoicePreferenceChange={setVoicePreference}
              onSpeechSpeedChange={setSpeechSpeed}
            />
          </section>
        ) : (
          <section className="mt-3 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-10 md:py-12">
            <Image src="/mojiokoshi.png" alt="AIロープレ" width={180} height={180} priority className="mx-auto h-[140px] w-[140px] object-contain" />
            <h1 className="mt-5 text-[28px] font-black tracking-[-0.04em] text-[#171717]">シナリオを選択してください</h1>
            <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
              商材別の練習テーマを選択すると、AI顧客とのロープレを開始できます。
            </p>
            <Link href={`/sales/roleplay/scenarios?category=${roleplayType}`} className="mt-7 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]">
              シナリオを選択
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: RoleplayMessage }) {
  const isSales = message.role === "sales";
  return (
    <div className={`flex ${isSales ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[18px] px-4 py-3 text-[14px] leading-7 ${
          isSales ? "bg-[#171717] text-white" : "border border-[#e6eaf0] bg-[#fcfcfd] text-[#343b48]"
        }`}
      >
        <div className={`mb-1 text-[11px] font-bold ${isSales ? "text-white/70" : "text-[#8a909b]"}`}>
          {isSales ? "営業" : "AI顧客"}
        </div>
        {message.content}
      </div>
    </div>
  );
}

function CompactStatus({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`rounded-[14px] border px-3 py-2 ${active ? "border-[#ffd0cc] bg-[#fff4f2]" : "border-[#e6eaf0] bg-[#fcfcfd]"}`}>
      <div className="text-[10px] font-black text-[#8a909b]">{label}</div>
      <div className={`mt-0.5 truncate text-[12px] font-black ${active ? "text-[#d92d20]" : "text-[#171717]"}`}>{value}</div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white text-[#343b48] transition hover:border-[#f0c655] hover:bg-[#fff8df] hover:text-[#171717]"
    >
      {children}
    </button>
  );
}

function RoleplaySettingsModal({
  activeModal,
  onClose,
  scenario,
  voicePreference,
  speechSpeed,
  onVoicePreferenceChange,
  onSpeechSpeedChange,
}: {
  activeModal: "customer" | "voice" | null;
  onClose: () => void;
  scenario: RoleplayScenario;
  voicePreference: VoicePreference;
  speechSpeed: SpeechSpeed;
  onVoicePreferenceChange: (value: VoicePreference) => void;
  onSpeechSpeedChange: (value: SpeechSpeed) => void;
}) {
  if (!activeModal) return null;

  const title = activeModal === "customer" ? "AI顧客情報" : "AI音声設定";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[560px] rounded-[24px] border border-[#e2e6ee] bg-white shadow-[0_24px_70px_rgba(17,24,39,0.22)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
          <h2 className="text-[18px] font-black text-[#171717]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e2e6ee] bg-white text-[#596273] transition hover:bg-[#f7f7fa] hover:text-[#171717]"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {activeModal === "customer" ? (
            <div className="space-y-3">
              <InfoBlock label="役職" value={scenario.customerRole} />
              <InfoBlock label="プロフィール" value={scenario.customerProfile} />
              <InfoBlock label="ゴール" value={scenario.goal} />
              <InfoBlock label="想定反論" value={scenario.objections.join(" / ") || "未設定"} />
              {scenario.customFields.map((field) => (
                <InfoBlock key={field.id} label={field.label} value={field.value} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[12px] font-bold text-[#8a909b]">声</span>
                <select
                  value={voicePreference}
                  onChange={(event) => onVoicePreferenceChange(event.target.value as VoicePreference)}
                  className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[14px] font-bold text-[#343b48] outline-none"
                >
                  <option value="female">女性</option>
                  <option value="male">男性</option>
                  <option value="default">標準</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-[12px] font-bold text-[#8a909b]">話す速さ</span>
                <select
                  value={speechSpeed}
                  onChange={(event) => onSpeechSpeedChange(event.target.value as SpeechSpeed)}
                  className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[14px] font-bold text-[#343b48] outline-none"
                >
                  <option value="slow">ゆっくり</option>
                  <option value="normal">普通</option>
                  <option value="fast">速め</option>
                </select>
              </label>
              <p className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[12px] leading-6 text-[#7a808c]">
                端末やブラウザに入っている日本語音声から近い声を選びます。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-5 w-5 fill-none stroke-current stroke-[2] ${active ? "animate-pulse" : ""}`}>
      <path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

function CustomerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      <path d="M18.7 6.2h1.8v4.6h-1.8" />
    </svg>
  );
}

function VoiceSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.9]">
      <path d="M5 9v6h3.2l4.3 3.3V5.7L8.2 9H5Z" />
      <path d="M16.2 8.2a5.2 5.2 0 0 1 0 7.6" />
      <path d="M18.8 5.8a8.8 8.8 0 0 1 0 12.4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[2]">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function buildVoiceStatus(input: { isRecording: boolean; isTranscribing: boolean; isThinking: boolean; isSpeaking: boolean }) {
  if (input.isRecording) return "録音中";
  if (input.isTranscribing) return "文字起こし中";
  if (input.isThinking) return "AI応答生成中";
  if (input.isSpeaking) return "AI顧客が発話中";
  return "待機中";
}

function speakText(
  text: string,
  setIsSpeaking: (value: boolean) => void,
  options: {
    voicePreference: VoicePreference;
    speechSpeed: SpeechSpeed;
    voices: SpeechSynthesisVoice[];
  },
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = getSpeechRate(options.speechSpeed);
  utterance.pitch = 1;
  const selectedVoice = selectJapaneseVoice(options.voices, options.voicePreference);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }
  utterance.onstart = () => setIsSpeaking(true);
  utterance.onend = () => setIsSpeaking(false);
  utterance.onerror = () => setIsSpeaking(false);
  window.speechSynthesis.speak(utterance);
}

function getSpeechRate(speed: SpeechSpeed) {
  if (speed === "slow") return 0.85;
  if (speed === "fast") return 1.15;
  return 1;
}

function selectJapaneseVoice(voices: SpeechSynthesisVoice[], preference: VoicePreference) {
  const japaneseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (japaneseVoices.length === 0) return null;
  if (preference === "default") return japaneseVoices[0] ?? null;

  const femaleHints = ["kyoko", "nanami", "haruka", "ichigo", "sayaka", "female", "女性"];
  const maleHints = ["otoya", "ichiro", "keita", "male", "男性"];
  const hints = preference === "female" ? femaleHints : maleHints;
  const matchedVoice = japaneseVoices.find((voice) =>
    hints.some((hint) => `${voice.name} ${voice.voiceURI}`.toLowerCase().includes(hint.toLowerCase())),
  );

  return matchedVoice ?? japaneseVoices[0] ?? null;
}

function getSupportedAudioMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function getAudioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

type RoleplayType = "meeting" | "teleapo";

function readRoleplayType(value: string | null): RoleplayType {
  return value === "teleapo" ? "teleapo" : "meeting";
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function evaluateRoleplay(scenario: RoleplayScenario, messages: RoleplayMessage[]) {
  const salesMessages = messages.filter((message) => message.role === "sales");
  const salesText = salesMessages.map((message) => message.content).join(" ");
  const criteriaHits = scenario.evaluationCriteria.filter((criterion) => {
    const keyword = criterion.replace(/[：:+\-0-9点\s]/g, "").slice(0, 5);
    return keyword.length >= 3 && salesText.includes(keyword);
  }).length;
  const questionCount = (salesText.match(/？|\?/g) ?? []).length;
  const hasBudget = includesAny(salesText, ["予算", "費用", "金額", "価格", "月額"]);
  const hasDecision = includesAny(salesText, ["決裁", "上司", "社内", "判断", "稟議"]);
  const hasTiming = includesAny(salesText, ["時期", "いつ", "導入", "開始", "スケジュール"]);
  const hasNextAction = includesAny(salesText, ["次回", "日程", "資料", "見積", "送付", "打ち合わせ"]);
  const hasIssueDepth = includesAny(salesText, ["課題", "困", "悩", "背景", "原因", "現状"]);
  const hasValueConnection = includesAny(salesText, ["効果", "改善", "成果", "価値", "事例", "解決"]);
  const hasEvidence = includesAny(salesText, ["事例", "実績", "データ", "根拠", "比較", "数字", "具体"]);
  const hasCustomerCheck = includesAny(salesText, ["いかが", "どうですか", "合っていますか", "認識", "確認", "教えて"]);
  const vagueCount = (salesText.match(/たぶん|だと思います|思っております|いい感じ|大丈夫|おそらく|多分|みたいな|というところ/g) ?? []).length;
  const fillerCount = (salesText.match(/えー|あの|まあ|まー|そのー|なんか|ちょっと/g) ?? []).length;
  const metaTalkCount = (salesText.match(/もう一回|できない|難しいわ|やめたい|録音|ロープレ/g) ?? []).length;
  const maxSalesTurnLength = Math.max(0, ...salesMessages.map((message) => message.content.length));
  const missingCoreCount = [hasBudget, hasDecision, hasTiming, hasNextAction].filter((value) => !value).length;
  const rawScore =
    8 +
    Math.min(questionCount, 5) * 2 +
    Math.min(criteriaHits, 4) * 3 +
    (hasIssueDepth ? 10 : -12) +
    (hasValueConnection ? 8 : -10) +
    (hasEvidence ? 6 : -8) +
    (hasCustomerCheck ? 5 : -6) +
    (hasBudget ? 8 : -10) +
    (hasDecision ? 8 : -10) +
    (hasTiming ? 8 : -10) +
    (hasNextAction ? 10 : -12) -
    Math.min(fillerCount, 10) * 2 -
    Math.min(vagueCount, 8) * 3 -
    Math.min(metaTalkCount, 3) * 8 -
    (maxSalesTurnLength >= 700 ? 14 : maxSalesTurnLength >= 450 ? 9 : 0);
  const scoreCap = salesMessages.length < 2
    ? 35
    : metaTalkCount > 0
      ? 32
      : missingCoreCount >= 4
        ? 34
        : missingCoreCount >= 3
          ? 42
          : missingCoreCount >= 2
            ? 50
            : !hasIssueDepth || !hasValueConnection
              ? 46
              : !hasEvidence || !hasCustomerCheck
                ? 54
    : hasBudget && hasDecision && hasTiming && hasNextAction && hasIssueDepth && hasValueConnection && hasEvidence && hasCustomerCheck
      ? 76
      : hasNextAction && hasIssueDepth
        ? 58
        : 48;
  const score = Math.min(scoreCap, Math.max(5, Math.round(rawScore)));

  const improvements = [
    ...(!hasIssueDepth ? ["顧客の課題・背景・現状をもう一段深掘りしましょう。"] : []),
    ...(!hasBudget ? ["予算感や費用対効果の判断基準を確認しましょう。"] : []),
    ...(!hasDecision ? ["決裁者や社内の意思決定フローを確認しましょう。"] : []),
    ...(!hasTiming ? ["導入時期や検討スケジュールを確認しましょう。"] : []),
    ...(!hasNextAction ? ["商談の最後に次回日程・資料送付・見積提出などの次アクションを確定しましょう。"] : []),
    ...(!hasEvidence ? ["効果説明には、事例・数字・比較などの根拠を添えましょう。"] : []),
    ...(!hasCustomerCheck ? ["説明の途中で、顧客の認識や理解度を確認しましょう。"] : []),
    ...(vagueCount >= 2 ? ["曖昧な表現を減らし、根拠や条件を明確に言い切りましょう。"] : []),
    ...(fillerCount >= 3 ? ["えー、あの、まあ等のフィラー語を減らし、短く言い切る練習をしましょう。"] : []),
    ...(metaTalkCount > 0 ? ["ロープレ中の独り言や操作に関する発話は、顧客には聞かせない前提で言い直しましょう。"] : []),
    ...(maxSalesTurnLength >= 450 ? ["提案説明が長くなっています。30秒ほどで区切り、顧客の理解や懸念を確認しましょう。"] : []),
  ];

  return {
    score,
    summary: score >= 80
      ? "ロープレを完了しました。課題確認から次回アクションまで進められています。"
      : score >= 65
        ? "ロープレを完了しました。会話は進められていますが、検討条件や次回アクションの確認に改善余地があります。"
        : "ロープレを完了しました。提案説明だけでなく、課題・予算・決裁・時期を確認する練習が必要です。",
    strengths: [
      questionCount > 0 ? "顧客に確認質問を投げられています。" : "提案内容を最後まで伝えられています。",
      hasValueConnection ? "商材価値を顧客の課題に結びつけようとしています。" : "会話を継続し、顧客の反応に合わせて回答できています。",
    ],
    improvements: improvements.length > 0 ? improvements : ["反論対応の根拠や成功事例をもう少し具体的に伝えると、さらに説得力が上がります。"],
    improvementPhrases: buildImprovementPhrases(scenario, salesText),
    manualChecklistItems: [],
  };
}

async function evaluateRoleplayWithAi(input: {
  companyId: string;
  userId: string;
  scenario: RoleplayScenario;
  messages: RoleplayMessage[];
}) {
  const response = await fetch("/api/roleplay/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as {
    score?: number;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    improvementPhrases?: string[];
    manualChecklistItems?: Array<{
      category: string;
      label: string;
      status: "done" | "missing";
      reason: string;
      scoreImpact: number | null;
    }>;
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(monthlyLimitMessage);
    }
    throw new Error(data.error ?? "AI評価に失敗しました。");
  }

  return {
    score: typeof data.score === "number" ? data.score : 40,
    summary: data.summary ?? "ロープレ評価を生成しました。",
    strengths: data.strengths ?? [],
    improvements: data.improvements ?? [],
    improvementPhrases: data.improvementPhrases ?? [],
    manualChecklistItems: data.manualChecklistItems ?? [],
  };
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildImprovementPhrases(scenario: RoleplayScenario, salesText: string) {
  const phrases = [
    `「${scenario.productName || "このご提案"}で、今いちばん解決したい課題はどこですか？」`,
    "「費用だけでなく、止まった時の損失や対応時間も含めて一緒に比較させてください。」",
    "「次回までに、判断に必要な条件を3つに絞って整理してお持ちします。」",
  ];

  if (!salesText.includes("予算") && !salesText.includes("費用") && !salesText.includes("金額")) {
    phrases.unshift("「ご予算感として、月額でどの範囲なら検討しやすいでしょうか？」");
  }

  return phrases.slice(0, 3);
}

function RoleplayHeader({ activeStep, roleplayType }: { activeStep: "scenario" | "practice" | "results"; roleplayType: RoleplayType }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <span className="sr-only">ロープレナビゲーション</span>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href={`/sales/roleplay/scenarios?category=${roleplayType}`} />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href={`/sales/roleplay?category=${roleplayType}`} />
        <Step number="3" label="分析結果" active={activeStep === "results"} href={`/sales/roleplay/results?category=${roleplayType}`} />
      </div>
    </header>
  );
}

function Step({ number, label, active = false, href }: { number: string; label: string; active?: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 min-w-[170px] items-center justify-center gap-3 rounded-[12px] border px-4 text-[13px] font-bold ${
        active ? "border-[#f0c655] bg-[#fff3c8] text-[#171717]" : "border-[#dce1ea] bg-white text-[#596273]"
      }`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${active ? "bg-[#ffd12f] text-[#171717]" : "border border-[#9aa1ac]"}`}>
        {number}
      </span>
      {label}
    </Link>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
      <div className="text-[12px] font-bold text-[#8a909b]">{label}</div>
      <div className="mt-1 text-[13px] leading-6 text-[#343b48]">{value || "未設定"}</div>
    </div>
  );
}
