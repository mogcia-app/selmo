"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  saveRoleplayResult,
  subscribeToRoleplayAssignments,
  subscribeToRoleplayScenarios,
  type RoleplayAssignment,
  type RoleplayMessage,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";

const monthlyLimitMessage =
  "月間利用上限に達しました。管理者にプラン変更または上限変更を依頼してください。";

export default function SalesRoleplayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userId = profile?.uid;
  const companyId = profile?.companyId;
  const [scenarios, setScenarios] = useState<RoleplayScenario[]>([]);
  const [assignments, setAssignments] = useState<RoleplayAssignment[]>([]);
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [recordedPreview, setRecordedPreview] = useState("");
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spokenInitialScenarioIdRef = useRef<string | null>(null);
  const scenarioId = searchParams.get("scenarioId") ?? "";
  const activeAssignmentScenarioIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.status === "assigned").map((assignment) => assignment.scenarioId)),
    [assignments],
  );
  const visibleScenarios = useMemo(
    () =>
      scenarios.filter(
        (item) =>
          item.visibility === "all" ||
          item.createdBy === userId ||
          activeAssignmentScenarioIds.has(item.id),
      ),
    [activeAssignmentScenarioIds, scenarios, userId],
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
    const firstMessage = {
      role: "customer" as const,
      content: `本日はよろしくお願いします。${scenario.customerRole}として、${scenario.goal || "導入判断に必要なこと"}を確認したいです。まず御社の提案概要を教えてください。`,
      createdAt: new Date().toISOString(),
    };
    setMessages([
      firstMessage,
    ]);
    setRecordedPreview("");
    setRecordingElapsedSec(0);
    if (spokenInitialScenarioIdRef.current !== scenario.id) {
      spokenInitialScenarioIdRef.current = scenario.id;
      window.setTimeout(() => speakText(firstMessage.content, setIsSpeaking), 450);
    }
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

  const handleStartRecording = async () => {
    if (!scenario || isRecording || isThinking || isTranscribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("このブラウザでは音声録音に対応していません。Chromeなどのブラウザでお試しください。");
      return;
    }

    setError(null);
    setRecordedPreview("");
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
      setRecordedPreview(text);
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
      speakText(data.message ?? "もう少し詳しく教えてください。", setIsSpeaking);
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
      const evaluation = evaluateRoleplay(scenario, messages);
      await saveRoleplayResult({
        companyId,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        productName: scenario.productName,
        userId,
        score: evaluation.score,
        summary: evaluation.summary,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        improvementPhrases: evaluation.improvementPhrases,
        messages,
      });
      router.push("/sales/roleplay/results");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "結果の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">
      <div className="mx-auto max-w-[1380px]">
        <RoleplayHeader activeStep="practice" />

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">
            {error}
          </div>
        ) : null}

        {scenario ? (
          <section className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article className="flex min-h-[540px] flex-col rounded-[24px] border border-[#e2e6ee] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <div className="border-b border-[#eef1f5] px-5 py-4">
                <p className="text-[12px] font-bold text-[#8a6500]">{scenario.productName || "商材未設定"}</p>
                <h1 className="mt-1 text-[24px] font-black tracking-[-0.03em] text-[#171717]">{scenario.title}</h1>
              </div>

              <div className="border-b border-[#eef1f5] bg-[#fcfcfd] px-5 py-5">
                <div className="flex flex-col gap-4 rounded-[22px] border border-[#e6eaf0] bg-white px-5 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#b48600]">Voice Roleplay</p>
                    <h2 className="mt-1 text-[22px] font-black text-[#171717]">マイクでAI顧客に返答</h2>
                    <p className="mt-2 text-[13px] leading-6 text-[#707783]">
                      録音停止後に文字起こしし、AI顧客が音声で返答します。
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={isRecording ? handleStopRecording : () => void handleStartRecording()}
                      disabled={isThinking || isTranscribing}
                      className={`inline-flex h-14 min-w-[180px] items-center justify-center gap-2 rounded-[18px] px-6 text-[14px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isRecording ? "bg-[#d92d20] text-white" : "bg-[#171717] text-white"
                      }`}
                    >
                      <MicIcon active={isRecording} />
                      {isRecording ? "録音を停止" : "録音して話す"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const lastCustomer = [...messages].reverse().find((message) => message.role === "customer");
                        if (lastCustomer) speakText(lastCustomer.content, setIsSpeaking);
                      }}
                      disabled={isSpeaking || isRecording}
                      className="inline-flex h-14 min-w-[140px] items-center justify-center rounded-[18px] border border-[#e4e8ef] bg-white px-5 text-[13px] font-black text-[#343b48] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      もう一度聞く
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <StatusCard label="録音時間" value={isRecording ? formatElapsed(recordingElapsedSec) : "--:--"} tone={isRecording ? "danger" : "default"} />
                  <StatusCard label="状態" value={buildVoiceStatus({ isRecording, isTranscribing, isThinking, isSpeaking })} tone="default" />
                  <StatusCard label="営業発話" value={`${messages.filter((message) => message.role === "sales").length}回`} tone="default" />
                </div>
                {recordedPreview ? (
                  <div className="mt-4 rounded-[18px] border border-[#e6eaf0] bg-white px-4 py-3">
                    <div className="text-[12px] font-black text-[#8a909b]">直前の文字起こし</div>
                    <p className="mt-1 text-[13px] leading-6 text-[#343b48]">{recordedPreview}</p>
                  </div>
                ) : null}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {messages.map((message, index) => (
                  <MessageBubble key={`${message.createdAt}-${index}`} message={message} />
                ))}
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

              <div className="border-t border-[#eef1f5] px-5 py-4 text-[12px] font-bold text-[#8a909b]">
                テキスト入力ではなく、録音した音声から会話を進めます。
              </div>
            </article>

            <aside className="space-y-4">
              <section className="rounded-[24px] border border-[#e2e6ee] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
                <h2 className="text-[18px] font-black text-[#171717]">AI顧客情報</h2>
                <div className="mt-4 space-y-3">
                  <InfoBlock label="役職" value={scenario.customerRole} />
                  <InfoBlock label="プロフィール" value={scenario.customerProfile} />
                  <InfoBlock label="ゴール" value={scenario.goal} />
                  <InfoBlock label="想定反論" value={scenario.objections.join(" / ") || "未設定"} />
                </div>
              </section>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={messages.filter((message) => message.role === "sales").length < 2 || isSaving}
                className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[14px] font-black text-[#171717] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "保存中" : "終了して採点"}
              </button>
              <Link href="/sales/roleplay/scenarios" className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[#e2e6ee] bg-white text-[14px] font-bold text-[#3d4350]">
                シナリオを変更
              </Link>
            </aside>
          </section>
        ) : (
          <section className="mt-3 rounded-[24px] border border-[#e2e6ee] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(17,24,39,0.04)] md:px-10 md:py-12">
            <Image src="/mojiokoshi.png" alt="AIロープレ" width={180} height={180} priority className="mx-auto h-[140px] w-[140px] object-contain" />
            <h1 className="mt-5 text-[28px] font-black tracking-[-0.04em] text-[#171717]">シナリオを選択してください</h1>
            <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#596273]">
              商材別の練習テーマを選択すると、AI顧客とのロープレを開始できます。
            </p>
            <Link href="/sales/roleplay/scenarios" className="mt-7 inline-flex h-12 items-center justify-center rounded-[14px] bg-[#ffd12f] px-7 text-[14px] font-black text-[#171717] shadow-[0_10px_22px_rgba(245,189,7,0.22)]">
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

function StatusCard({ label, value, tone }: { label: string; value: string; tone: "default" | "danger" }) {
  return (
    <div className={`rounded-[18px] border px-4 py-3 ${tone === "danger" ? "border-[#ffd0cc] bg-[#fff4f2]" : "border-[#e6eaf0] bg-white"}`}>
      <div className="text-[12px] font-black text-[#8a909b]">{label}</div>
      <div className={`mt-1 text-[18px] font-black ${tone === "danger" ? "text-[#d92d20]" : "text-[#171717]"}`}>{value}</div>
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

function buildVoiceStatus(input: { isRecording: boolean; isTranscribing: boolean; isThinking: boolean; isSpeaking: boolean }) {
  if (input.isRecording) return "録音中";
  if (input.isTranscribing) return "文字起こし中";
  if (input.isThinking) return "AI応答生成中";
  if (input.isSpeaking) return "AI顧客が発話中";
  return "待機中";
}

function speakText(text: string, setIsSpeaking: (value: boolean) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => setIsSpeaking(true);
  utterance.onend = () => setIsSpeaking(false);
  utterance.onerror = () => setIsSpeaking(false);
  window.speechSynthesis.speak(utterance);
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

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function evaluateRoleplay(scenario: RoleplayScenario, messages: RoleplayMessage[]) {
  const salesText = messages.filter((message) => message.role === "sales").map((message) => message.content).join(" ");
  const criteriaHits = scenario.evaluationCriteria.filter((criterion) => salesText.includes(criterion.slice(0, 4))).length;
  const questionCount = (salesText.match(/？|\?/g) ?? []).length;
  const score = Math.min(95, Math.max(55, 62 + criteriaHits * 8 + questionCount * 4 + messages.length * 2));

  return {
    score,
    summary: "ロープレを完了しました。顧客の懸念に対して説明を進められています。",
    strengths: [
      questionCount > 0 ? "顧客に確認質問を投げられています。" : "提案内容を最後まで伝えられています。",
      "会話を継続し、顧客の反応に合わせて回答できています。",
    ],
    improvements: [
      "導入後の具体的な成果や事例をもう少し入れると説得力が上がります。",
      "次回は顧客の予算感や決裁プロセスも確認してみましょう。",
    ],
    improvementPhrases: buildImprovementPhrases(scenario, salesText),
  };
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

function RoleplayHeader({ activeStep }: { activeStep: "scenario" | "practice" | "results" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#e2e6ee] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
      <h1 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">AIロープレ</h1>
      <div className="hidden items-center gap-2 lg:flex">
        <Step number="1" label="シナリオ選択" active={activeStep === "scenario"} href="/sales/roleplay/scenarios" />
        <Step number="2" label="ロープレ中" active={activeStep === "practice"} href="/sales/roleplay" />
        <Step number="3" label="分析結果" active={activeStep === "results"} href="/sales/roleplay/results" />
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
