"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { saveSalesActivityEvent } from "@/lib/firebase/activity";
import {
  saveMeetingAiSummary,
  saveMeetingConversationLogs,
  saveMeetingTranscriptionProbe,
  subscribeToMeeting,
  type MeetingRecord,
} from "@/lib/firebase/meetings";
import { updateAudioProcessingJob } from "@/lib/firebase/operations";
import { canUseSalesDomain } from "@/lib/sales-domains";

const transcriptionRequestTimeoutMs = 10 * 60 * 1000;
const transientBannerDurationMs = 5 * 1000;
const monthlyLimitMessage =
  "月間利用上限に達しました。管理者にプラン変更または上限変更を依頼してください。";
type DisplayLog = {
  id: string;
  startSec?: number | null;
  endSec?: number | null;
  speaker: "speaker_1" | "speaker_2" | "unknown";
  label: string;
  text: string;
  confidence: "estimated" | "aligned";
  kind: "speech" | "backchannel" | "unknown";
};

type TranscriptSidebarTab = "keywords" | "focusWords" | "important" | "checkpoints";

type TranscriptFocusWordCategory = {
  id: "issues" | "concerns" | "value" | "actions";
  title: string;
  description: string;
  words: TranscriptFocusWord[];
};

type TranscriptFocusWord = {
  term: string;
  count: number;
  evidence: DisplayLog;
};

type TranscriptReadingBlock = {
  text: string;
  startSec: number | null;
  endSec: number | null;
  ranges: Array<{
    startSec: number | null;
    endSec: number | null;
  }>;
};

type ScrollbarMetrics = {
  thumbHeight: number;
  thumbTop: number;
  isScrollable: boolean;
};

export function MeetingDetailScreen({
  meetingId,
  view = "transcript",
}: {
  meetingId: string;
  view?: "transcript" | "summary";
}) {
  const isTranscriptView = view === "transcript";
  const isSummaryView = view === "summary";
  const { profile } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [transcriptViewMode, setTranscriptViewMode] = useState("all");
  const [transcriptSidebarTab, setTranscriptSidebarTab] = useState<TranscriptSidebarTab>("keywords");
  const [selectedTranscriptBlockIndex, setSelectedTranscriptBlockIndex] = useState<number | null>(null);
  const [transcriptionVisualProgress, setTranscriptionVisualProgress] = useState(12);
  const [transcriptScrollbar, setTranscriptScrollbar] = useState<ScrollbarMetrics>({
    thumbHeight: 0,
    thumbTop: 0,
    isScrollable: false,
  });
  const [editableLogs, setEditableLogs] = useState<DisplayLog[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptBlockRefs = useRef<Array<HTMLElement | null>>([]);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const summaryGenerationRequestedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToMeeting(
      meetingId,
      (nextMeeting) => {
        setMeeting(nextMeeting);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        setErrorMessage(
          error.code === "permission-denied"
            ? "この打ち合わせデータを閲覧する権限がありません。"
            : "打ち合わせデータの読み込みに失敗しました。",
        );
      },
    );

    return unsubscribe;
  }, [meetingId]);

  useEffect(() => {
    summaryGenerationRequestedRef.current = false;
  }, [meetingId]);

  useEffect(() => {
    if (!meeting) {
      return;
    }

    if (!canUseSalesDomain(profile, meeting.salesDomain)) {
      setErrorMessage(meeting.salesDomain === "teleapo" ? "このテレアポデータを閲覧する権限がありません。" : "この商談データを閲覧する権限がありません。");
      return;
    }

  }, [meeting, profile]);

  useEffect(() => {
    if (meeting?.transcriptionProbeStatus === "completed" || meeting?.transcriptionProbeStatus === "failed") {
      setIsTranscribing(false);
    }
  }, [meeting?.transcriptionProbeStatus]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setErrorMessage(null);
    }, transientBannerDurationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [errorMessage]);

  useEffect(() => {
    if (!isTranscribing) {
      setTranscriptionVisualProgress(12);
      return;
    }

    const startedAt = performance.now();
    const predictedSec = estimateTranscriptionRuntimeSec(meeting?.audioDurationSec ?? null);
    const fullGaugeSec = predictedSec * 1.2;

    const intervalId = window.setInterval(() => {
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const nextProgress = calculateTranscriptionGaugeProgress(
        elapsedSec,
        predictedSec,
        fullGaugeSec,
      );
      setTranscriptionVisualProgress(nextProgress);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTranscribing, meeting?.audioDurationSec]);

  const generateAiSummaryInBackground = useCallback(async (transcriptText: string) => {
    try {
      await saveMeetingAiSummary(meetingId, {
        status: "running",
        model: "gpt-4o-mini",
        error: null,
        processingStatus: "uploaded",
      });

      const summaryResponse = await fetchWithTimeout(`/api/meetings/${meetingId}/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: profile?.companyId ?? meeting?.companyId ?? null,
          userId: profile?.uid ?? meeting?.userId ?? null,
          productName: meeting?.productType ?? null,
          meetingPurpose: meeting?.meetingPurpose ?? null,
          customerType: meeting?.customerType ?? null,
          salesDomain: meeting?.salesDomain ?? null,
          transcriptText,
        }),
        timeoutMs: null,
      });

      const summaryPayload = (await parseApiJsonResponse(summaryResponse)) as {
        error?: string;
        detail?: string;
        model?: string;
        summary?: MeetingRecord["aiSummary"];
      };

      if (!summaryResponse.ok) {
        throw new Error(
          [summaryPayload.error, summaryPayload.detail].filter(Boolean).join(" / ") ||
            "AI要約の生成に失敗しました。",
        );
      }

      await saveMeetingAiSummary(meetingId, {
        status: "completed",
        model: summaryPayload.model ?? "gpt-4o-mini",
        summary: summaryPayload.summary ?? null,
        error: null,
        processingStatus: "uploaded",
      });
      await saveSalesActivityEvent({
        companyId: profile?.companyId ?? meeting?.companyId ?? null,
        userId: profile?.uid ?? meeting?.userId ?? "",
        type: "ai_analysis_completed",
        title: "AI分析完了",
        summary: `${meeting?.customerName ?? "商談"}のAI要約を生成しました`,
        detail: summaryPayload.summary?.overview ?? "AI要約を生成しました。",
        href: `/admin/meetings/${meetingId}`,
        metadata: {
          meetingId,
          customerName: meeting?.customerName ?? null,
          productType: meeting?.productType ?? null,
        },
      }).catch(() => undefined);
      await updateAudioProcessingJob(meetingId, {
        status: "completed",
        errorMessage: null,
      }).catch(() => undefined);
    } catch (summaryError) {
      const summaryMessage =
        summaryError instanceof Error ? summaryError.message : "AI要約の生成に失敗しました。";

      try {
        await saveMeetingAiSummary(meetingId, {
          status: "failed",
          model: "gpt-4o-mini",
          error: summaryMessage,
          processingStatus: "uploaded",
        });
        await updateAudioProcessingJob(meetingId, {
          status: "failed",
          errorMessage: summaryMessage,
        });
      } catch {
        // noop
      }
    }
  }, [meeting, meetingId, profile]);

  async function runTranscription({
    model,
  }: {
    model: "gpt-4o-mini-transcribe" | "gpt-4o-transcribe-diarize";
  }) {
    if (!meeting) {
      return;
    }

    if (!profile?.uid || profile.uid !== meeting.userId) {
      setErrorMessage("自分の打ち合わせデータでのみ文字起こしテストを実行できます。");
      return;
    }

    if (!meeting.audioDownloadUrl) {
      setErrorMessage("音声ファイルの保存がまだ完了していません。");
      return;
    }

    setErrorMessage(null);
    setIsTranscribing(true);
    try {
      await saveMeetingTranscriptionProbe(meetingId, {
        status: "running",
        model,
        error: null,
        processingStatus: "transcribing",
      });
      await updateAudioProcessingJob(meetingId, {
        status: "transcribing",
        errorMessage: null,
      }).catch(() => undefined);
      await saveMeetingConversationLogs(meetingId, {
        status: "running",
        model,
        logs: [],
        error: null,
        processingStatus: "transcribing",
      });

      const response = await fetchWithTimeout(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: profile.companyId ?? meeting.companyId,
          userId: profile.uid,
          audioDownloadUrl: meeting.audioDownloadUrl,
          audioFileName: meeting.audioFileName,
          audioMimeType: meeting.audioMimeType,
          audioSizeBytes: meeting.audioSizeBytes,
          audioDurationSec: meeting.audioDurationSec,
          language: "ja",
          model,
        }),
        timeoutMs: null,
      });

      const payload = (await parseApiJsonResponse(response)) as {
        error?: string;
        detail?: string;
        text?: string;
        language?: string | null;
        segmentCount?: number | null;
        segments?: Array<{ startSec: number; endSec: number; text: string; speaker?: string | null }> | null;
        durationSec?: number | null;
        chunkCount?: number | null;
        wasChunked?: boolean;
      };

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(monthlyLimitMessage);
        }

        throw new Error(
          [payload.error, payload.detail].filter(Boolean).join(" / ") ||
            "文字起こしテストに失敗しました。",
        );
      }

      await saveMeetingTranscriptionProbe(meetingId, {
        status: "completed",
        model,
        text: payload.text ?? "",
        language: payload.language ?? "ja",
        error: null,
        segmentCount: payload.segmentCount ?? null,
        segments: payload.segments ?? [],
        durationSec: payload.durationSec ?? null,
        processingStatus: "uploaded",
      });
      await saveMeetingConversationLogs(meetingId, {
        status: "completed",
        model,
        logs: buildConversationLogsFromSegments(payload.segments ?? []),
        error: null,
        processingStatus: "uploaded",
      });

      setTranscriptionVisualProgress(100);

      await updateAudioProcessingJob(meetingId, {
        status: "completed",
        errorMessage: null,
      }).catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof FirebaseError
          ? "Firestore 更新に失敗しました。ルールを確認してください。"
          : error instanceof Error
            ? error.message
            : "文字起こしテストに失敗しました。";

      try {
        await saveMeetingTranscriptionProbe(meetingId, {
          status: "failed",
          model,
          error: message,
          processingStatus: "failed",
        });
        await saveMeetingConversationLogs(meetingId, {
          status: "failed",
          model,
          error: message,
          processingStatus: "failed",
        });
        await updateAudioProcessingJob(meetingId, {
          status: "failed",
          errorMessage: message,
        });
      } catch {
        // noop
      }

      setErrorMessage(message);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleRunTranscription() {
    await runTranscription({
      model: "gpt-4o-mini-transcribe",
    });
  }

  const baseLogs = useMemo(() => {
    if (meeting?.conversationLogs && meeting.conversationLogs.length > 0) {
      return meeting.conversationLogs.map((log) =>
        mapConversationLogToDisplayLog(log, meeting.transcriptionProbeSegments ?? []),
      );
    }

    if (meeting?.transcriptionProbeSegments && meeting.transcriptionProbeSegments.length > 0) {
      return buildTranscriptPreviewLogsFromSegments(meeting.transcriptionProbeSegments);
    }

    return buildTranscriptPreviewLogs(meeting?.transcriptionProbeText);
  }, [
    meeting?.conversationLogs,
    meeting?.transcriptionProbeSegments,
    meeting?.transcriptionProbeText,
  ]);

  useEffect(() => {
    setEditableLogs(baseLogs);
  }, [baseLogs]);

  const aiSummary = useMemo<NonNullable<MeetingRecord["aiSummary"]>>(
    () => meeting?.aiSummary ?? buildAiSummary(meeting?.transcriptionProbeText, editableLogs),
    [editableLogs, meeting?.aiSummary, meeting?.transcriptionProbeText],
  );
  const transcriptMetrics = useMemo(() => buildTranscriptMetrics(editableLogs), [editableLogs]);
  const isManualTranscript = meeting?.transcriptionProbeModel === "manual-paste";
  const shouldShowTranscriptionRetry =
    !isManualTranscript &&
    Boolean(meeting?.audioDownloadUrl) &&
    (meeting?.transcriptionProbeStatus === "failed" || editableLogs.length === 0);
  const analysisPanels = useMemo(
    () => buildAnalysisPanels(aiSummary, editableLogs),
    [aiSummary, editableLogs],
  );
  const aiScorecards = useMemo(
    () => buildAiScorecards(transcriptMetrics, meeting?.status ?? "considering", aiSummary.diagnosis?.salesEvaluation, editableLogs, meeting?.salesDomain ?? "meeting"),
    [aiSummary.diagnosis?.salesEvaluation, editableLogs, meeting?.salesDomain, meeting?.status, transcriptMetrics],
  );
  const considerationSummary = useMemo(
    () => buildConsiderationSummary(meeting?.status ?? "considering", aiSummary.diagnosis?.consideration, editableLogs),
    [aiSummary.diagnosis?.consideration, editableLogs, meeting?.status],
  );
  const meetingStatusSummary = useMemo(
    () => buildMeetingStatusSummary(meeting?.status ?? "considering", aiSummary.diagnosis?.status, editableLogs),
    [aiSummary.diagnosis?.status, editableLogs, meeting?.status],
  );
  const temperatureSummary = useMemo(
    () => buildTemperatureSummary(meeting?.status ?? "considering", aiSummary.diagnosis?.temperature, editableLogs),
    [aiSummary.diagnosis?.temperature, editableLogs, meeting?.status],
  );
  const mentionedNextDate = useMemo(
    () =>
      extractMentionedDate(
        editableLogs.map((log) => log.text).join("\n"),
        meeting?.recordedAt ?? null,
      ),
    [editableLogs, meeting?.recordedAt],
  );

  const exportTranscriptText = useMemo(
    () =>
      editableLogs
        .map((log) => log.text.trim())
        .filter(Boolean)
        .join("\n\n"),
    [editableLogs],
  );

  useEffect(() => {
    if (!isSummaryView || !meeting || summaryGenerationRequestedRef.current) {
      return;
    }

    if (meeting.aiSummary || meeting.aiSummaryStatus === "running") {
      return;
    }

    const transcriptText = exportTranscriptText.trim() || meeting.transcriptionProbeText?.trim() || "";
    if (!transcriptText) {
      return;
    }

    summaryGenerationRequestedRef.current = true;
    void generateAiSummaryInBackground(transcriptText);
  }, [
    exportTranscriptText,
    generateAiSummaryInBackground,
    isSummaryView,
    meeting,
  ]);
  const transcriptImportantLogs = useMemo(
    () => buildImportantTranscriptLogs(editableLogs).slice(0, 3),
    [editableLogs],
  );
  const transcriptFrequentWords = useMemo(() => buildFrequentWords(editableLogs), [editableLogs]);
  const transcriptFocusWords = useMemo(() => buildTranscriptFocusWords(editableLogs), [editableLogs]);
  const transcriptAiExtracts = useMemo(
    () => buildGroundedTranscriptExtractLogs(editableLogs).slice(0, 4),
    [editableLogs],
  );
  const transcriptReadingBlocks = useMemo(() => buildTranscriptReadingBlocks(editableLogs), [editableLogs]);
  const normalizedLogSearch = logSearch.trim().toLowerCase();
  const visibleTranscriptReadingBlocks = useMemo(() => {
    const indexedBlocks = transcriptReadingBlocks.map((block, index) => ({ block, index }));

    if (!normalizedLogSearch) {
      return indexedBlocks;
    }

    return indexedBlocks.filter(({ block }) =>
      block.text.toLowerCase().includes(normalizedLogSearch),
    );
  }, [normalizedLogSearch, transcriptReadingBlocks]);

  function handleJumpToTranscriptLog(log: DisplayLog) {
    const targetIndex = findTranscriptReadingBlockIndexForLog(log, transcriptReadingBlocks);

    if (targetIndex < 0) {
      return;
    }

    setSelectedTranscriptBlockIndex(targetIndex);
    const target = transcriptBlockRefs.current[targetIndex];
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  useEffect(() => {
    function updateScrollbar(
      element: HTMLDivElement | null,
      setter: (metrics: ScrollbarMetrics) => void,
    ) {
      if (!element) {
        setter({ thumbHeight: 0, thumbTop: 0, isScrollable: false });
        return;
      }

      const { clientHeight, scrollHeight, scrollTop } = element;
      const isScrollable = scrollHeight > clientHeight + 1;

      if (!isScrollable) {
        setter({ thumbHeight: 0, thumbTop: 0, isScrollable: false });
        return;
      }

      const thumbHeight = Math.max(52, (clientHeight / scrollHeight) * clientHeight);
      const maxThumbTop = Math.max(0, clientHeight - thumbHeight);
      const thumbTop =
        (scrollTop / Math.max(1, scrollHeight - clientHeight)) * maxThumbTop;

      setter({ thumbHeight, thumbTop, isScrollable: true });
    }

    const updateTranscript = () =>
      updateScrollbar(transcriptScrollRef.current, setTranscriptScrollbar);
    updateTranscript();

    const transcriptElement = transcriptScrollRef.current;

    transcriptElement?.addEventListener("scroll", updateTranscript);
    window.addEventListener("resize", updateTranscript);

    return () => {
      transcriptElement?.removeEventListener("scroll", updateTranscript);
      window.removeEventListener("resize", updateTranscript);
    };
  }, [
    visibleTranscriptReadingBlocks,
  ]);

  async function handleCopyTranscript() {
    if (!exportTranscriptText) {
      setErrorMessage("コピーできる文字起こし本文がありません。");
      return;
    }

    try {
      await navigator.clipboard.writeText(exportTranscriptText);
      setErrorMessage(null);
    } catch {
      setErrorMessage("全文のコピーに失敗しました。");
    }
  }

  function handleDownloadTranscript() {
    if (!exportTranscriptText) {
      setErrorMessage("ダウンロードできる文字起こし本文がありません。");
      return;
    }

    const blob = new Blob([exportTranscriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeBaseName = (meeting?.customerName || "transcript").replace(/[\\/:*?"<>|]/g, "_");

    anchor.href = url;
    anchor.download = `${safeBaseName}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setErrorMessage(null);
  }

  if (isLoading) {
    return (
      <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
        <div className="rounded-[22px] border border-[#eceef4] bg-white p-8 text-[14px] text-[#7a808c] shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          打ち合わせ詳細を読み込み中です。
        </div>
      </main>
    );
  }

  if (!meeting) {
    return (
      <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
        <div className="rounded-[22px] border border-[#ffd8cc] bg-[#fff4ef] p-8 text-[14px] text-[#cf4b39] shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          打ち合わせデータが見つかりませんでした。
        </div>
      </main>
    );
  }

  if (!canUseSalesDomain(profile, meeting.salesDomain)) {
    return (
      <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
        <div className="rounded-[22px] border border-[#ffd8cc] bg-[#fff4ef] p-8 text-[14px] text-[#cf4b39] shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          {meeting.salesDomain === "teleapo" ? "このテレアポデータを閲覧する権限がありません。" : "この商談データを閲覧する権限がありません。"}
        </div>
      </main>
    );
  }

  const meetingTitle = meeting.customerName || "未設定";
  const isTeleapo = meeting.salesDomain === "teleapo";
  const domainCopy = {
    statusTitle: isTeleapo ? "テレアポステータス" : "商談ステータス",
    evaluationTitle: isTeleapo ? "テレアポ評価サマリー" : "商談評価サマリー",
    pointTitle: isTeleapo ? "AIによるテレアポポイント分析" : "AIによる商談ポイント分析",
    metaTitle: isTeleapo ? "テレアポ名" : "商談名",
    manualDescription: isTeleapo
      ? "管理者が登録した成功基準・商品情報をもとに、次のテレアポで直すべきポイントを整理しています。"
      : "管理者が登録した成功基準・商品情報をもとに、次の商談で直すべきポイントを整理しています。",
  };

  return (
    <main className="overflow-x-hidden bg-transparent px-5 pb-0 pt-4 md:px-8 md:pb-0 md:pt-5">
      <div className="mx-auto max-w-[1540px]">
        {errorMessage ? (
          <div className="mb-5">
            <div className="rounded-[18px] border border-[#ffd8cc] bg-[#fff4ef] px-4 py-3 text-[14px] leading-6 text-[#cf4b39]">
              {errorMessage}
            </div>
          </div>
        ) : null}

        {isSummaryView ? (
        <section className="rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Image
                  src="/summary.png"
                  alt="summary"
                  width={52}
                  height={52}
                  className="h-[52px] w-[52px] object-contain"
                />
                <div className="flex flex-wrap items-center gap-2 text-[#171717]">
                  <h2 className="text-[30px] font-bold tracking-[-0.04em]">AIサマリー</h2>
                  <span className="rounded-full bg-[#fff3cd] px-2.5 py-1 text-[12px] font-semibold text-[#9c7600]">
                    分析結果は目安です
                  </span>
                  <span className="rounded-full border border-[#eceef4] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#6c7380]">
                    β版
                  </span>
                </div>
              </div>
            </div>
          </div>

          <article className="mt-4 rounded-[24px] bg-white p-6">
            <div className="grid gap-4 xl:grid-cols-[1.9fr_0.9fr_0.82fr_0.82fr]">
              <SummaryInsightCard
                title="要点サマリー"
                icon={<SummaryFolderGlyph />}
                accent="amber"
                description={aiSummary.overview}
                className="xl:min-h-[188px]"
              />
              <StatusSummaryCard
                title={domainCopy.statusTitle}
                label={meetingStatusSummary.label}
                description={meetingStatusSummary.description}
                tone={meetingStatusSummary.tone}
                evidence={meetingStatusSummary.evidence}
              />
              <TemperatureSummaryCard
                title="温度感"
                stars={temperatureSummary.stars}
                description={temperatureSummary.description}
                evidence={temperatureSummary.evidence}
              />
              <ConsiderationSummaryCard
                title="検討度"
                score={considerationSummary.score}
                description={considerationSummary.description}
                evidence={considerationSummary.evidence}
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1.15fr]">
              <SummaryBulletPanel
                title="現在の運用"
                icon={<InterestGlyph />}
                bullets={analysisPanels.interests}
              />
              <SummaryBulletPanel
                title="抱えている課題"
                icon={<IssueGlyph />}
                bullets={analysisPanels.issues}
              />
              <SummaryBulletPanel
                title="求めていること"
                icon={<ConcernGlyph />}
                bullets={analysisPanels.requests}
              />
              <ActionPanel actions={analysisPanels.actions} mentionedNextDate={mentionedNextDate} />
            </div>
          </article>

          {aiSummary.manualCompliance ? (
            <ManualComplianceInsight compliance={aiSummary.manualCompliance} manualDescription={domainCopy.manualDescription} />
          ) : null}

          <article className="mt-6 rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
            <div className="text-[18px] font-bold text-[#171717]">{domainCopy.evaluationTitle}</div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {aiScorecards.map((score) => (
                <SummaryMetricCard
                  key={score.label}
                  title={score.label}
                  value={`${score.value}`}
                  unit="/100"
                  color={score.color}
                  description={buildScoreDescription(score.label, score.value, score.description)}
                  evidence={score.evidence}
                  variant="ring"
                />
              ))}
            </div>
          </article>

          <article className="mt-5 rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
            <div className="text-[18px] font-bold text-[#171717]">{domainCopy.pointTitle}</div>
            <div className="mt-3 text-[13px] leading-6 text-[#7a808c]">
              顧客視点の要点と、次回の進め方につながるポイントを整理しています。
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <EvidenceInsightCard title="顧客の課題" icon={<IssueGlyph />} bullets={analysisPanels.issues} evidence={buildTranscriptEvidence(editableLogs, 8)} />
              <EvidenceInsightCard title="顧客の要望" icon={<InterestGlyph />} bullets={analysisPanels.requests} evidence={buildTranscriptEvidence(editableLogs, 7)} />
              <EvidenceInsightCard title="顧客の不安・懸念" icon={<ConcernGlyph />} bullets={analysisPanels.concerns} evidence={buildTranscriptEvidence(editableLogs, 6)} />
              <ActionInsightCard actions={analysisPanels.actions} mentionedNextDate={mentionedNextDate} />
            </div>
          </article>

          <article className="mt-5 rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
            <div className="text-[18px] font-bold text-[#171717]">AIからのフィードバック</div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <FeedbackInsightCard
                title="良かった点"
                tone="positive"
                bullets={buildFeedbackBullets(aiScorecards, "positive")}
                footer="根拠となる発話を見る"
                details={buildTranscriptEvidence(editableLogs, 5)}
              />
              <FeedbackInsightCard
                title="改善ポイント"
                tone="warning"
                bullets={buildFeedbackBullets(aiScorecards, "warning")}
                footer="根拠となる発話を見る"
                details={buildTranscriptEvidence(editableLogs, 4)}
              />
              <FeedbackInsightCard
                title="次回意識すること"
                tone="info"
                bullets={buildFeedbackBullets(aiScorecards, "next")}
                footer="詳細なアドバイスを見る"
                details={buildDetailedAdvice(aiScorecards, analysisPanels.actions)}
              />
            </div>
          </article>

          <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-[#fffaf0] px-5 py-4 text-[14px] leading-7 text-[#6f6250]">
            この分析は文字起こしデータをもとにAIが自動で生成しています。誤りが含まれる可能性があるため、重要な判断は必ずご自身でご確認ください。
          </div>
        </section>
        ) : null}

        {isTranscriptView ? (
        <section className="rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/mojiokoshi.png"
                  alt="文字起こし"
                  width={52}
                  height={52}
                  className="h-[52px] w-[52px] object-contain"
                />
                <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#171717]">文字起こし</h2>
              </div>
              <div className="flex flex-wrap gap-3">
              {shouldShowTranscriptionRetry ? (
                <HeaderActionButton
                  icon={<SparkGlyph />}
                  label={isTranscribing ? "文字起こし中..." : "文字起こしを再実行"}
                  onClick={() => {
                    void handleRunTranscription();
                  }}
                  disabled={isTranscribing}
                  variant="warm"
                />
              ) : null}
              <Link
                href={`/meetings/${meetingId}/summary`}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-[12px] border border-[#ead8a8] bg-white px-3 text-[12px] font-semibold text-[#6c5730] shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition hover:border-[#ddc173] hover:bg-[#fffaf0]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff1bf] text-[#b98900] shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]">
                  <SummaryGlyph />
                </span>
                AI分析はコチラ
              </Link>
              <HeaderActionButton
                icon={<DownloadGlyph />}
                label="ダウンロード（.txt）"
                onClick={handleDownloadTranscript}
                disabled={!exportTranscriptText}
                variant="neutral"
              />
              <HeaderActionButton
                icon={<CopyGlyph />}
                label="全文をコピー"
                onClick={handleCopyTranscript}
                disabled={!exportTranscriptText}
                variant="sage"
              />
              </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[20px] border border-[#eceef4] bg-white">
            <div className="grid gap-0 xl:grid-cols-[1fr_1.4fr]">
              <TranscriptMetaItem label={domainCopy.metaTitle} value={meetingTitle} className="xl:border-r xl:border-[#eceef4]" />
              <TranscriptMetaItem
                label="日時"
                value={
                  meeting.recordedAt
                    ? formatMeetingDateTimeRange(meeting.recordedAt, meeting.audioDurationSec ?? null)
                    : "未設定"
                }
              />
            </div>

            <div className="border-t border-[#eceef4] px-5 py-4">
              <div className="min-w-0">
                {meeting.audioDownloadUrl ? (
                  <audio ref={audioRef} controls src={meeting.audioDownloadUrl} className="w-full" />
                ) : isManualTranscript ? (
                  <div className="rounded-[14px] border border-[#e6eaf0] bg-[#fcfcfd] px-4 py-3 text-[13px] leading-6 text-[#7a808c]">
                    文字起こし貼り付けで登録されたため、音声ファイルはありません。
                  </div>
                ) : (
                  <div className="text-[13px] text-[#7a808c]">音声ファイルの保存がまだ完了していません。</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.72fr_0.98fr] xl:items-stretch">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative min-w-[250px] flex-1">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7c8593]">
                    <SearchGlyph />
                  </span>
                  <input
                    type="search"
                    value={logSearch}
                    onChange={(event) => setLogSearch(event.target.value)}
                    placeholder="キーワードを検索"
                    className="h-[44px] w-full rounded-[12px] border border-[#d8dde6] bg-white py-3 pl-[46px] pr-4 text-[14px] text-[#171717] outline-none"
                  />
                </label>

                <div className="relative min-w-[164px]">
                  <select
                    value={transcriptViewMode}
                    onChange={(event) => setTranscriptViewMode(event.target.value)}
                    className="h-[44px] w-full appearance-none rounded-[12px] border border-[#d8dde6] bg-white px-4 pr-12 text-[14px] text-[#171717] outline-none"
                  >
                    <option value="all">フィルター</option>
                  </select>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#4b5563]">
                    <ChevronDownGlyph />
                  </span>
                </div>

              </div>

              <div className="mt-4 flex h-[760px] flex-col rounded-[22px] bg-white px-6 py-5">
                {isTranscribing ? (
                  <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-[#eceef4] bg-[#fffdf9] px-8 py-10 text-center shadow-[0_10px_30px_rgba(17,24,39,0.04)]">
                    <Image
                      src="/mojiokoshi.png"
                      alt="文字起こし中"
                      width={420}
                      height={320}
                      className="h-auto w-full max-w-[420px] object-contain"
                    />
                    <h3 className="mt-6 text-[15px] font-bold tracking-[-0.03em] text-[#171717]">
                      文字起こしを実装中です...
                    </h3>
                    <p className="mt-3 text-[8px] font-medium text-[#8a909b]">
                      音声を解析し、テキストに変換しています
                    </p>
                    <div className="mt-8 flex w-full max-w-[760px] items-center gap-5">
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#eef1f5]">
                        <div
                          className="transcription-bar-active relative h-full rounded-full bg-[linear-gradient(90deg,#ffc400_0%,#f5bd07_100%)] transition-[width] duration-700 ease-out"
                          style={{ width: `${transcriptionVisualProgress}%` }}
                        />
                      </div>
                      <div className="min-w-[50px] text-left text-[10px] font-bold text-[#171717]">
                        {transcriptionVisualProgress}%
                      </div>
                    </div>
                    <p className="mt-5 text-[8px] font-medium text-[#8a909b]">しばらくお待ちください</p>
                  </div>
                ) : transcriptReadingBlocks.length > 0 ? (
                  <>
                    <div className="relative min-h-0 flex-1">
                    <div
                      ref={transcriptScrollRef}
                      className="always-visible-scrollbar min-h-0 h-full space-y-4 overflow-y-scroll pr-6"
                    >
                      {visibleTranscriptReadingBlocks.length > 0 ? (
                        visibleTranscriptReadingBlocks.map(({ block, index }) => (
                        <article
                          key={`reading_block_${index}`}
                          ref={(node) => {
                            transcriptBlockRefs.current[index] = node;
                          }}
                          className={`max-w-[94%] rounded-[18px] border px-5 py-4 shadow-[0_3px_10px_rgba(17,24,39,0.03)] transition ${
                            selectedTranscriptBlockIndex === index
                              ? "border-[#171717] bg-[#f8fafc] shadow-[0_8px_22px_rgba(17,24,39,0.08)]"
                              : "border-[#eceef4] bg-white"
                          }`}
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                selectedTranscriptBlockIndex === index ? "bg-[#171717]" : "bg-[#ffd54a]"
                              }`}
                            />
                            <span
                              className={`text-[12px] font-semibold tracking-[0.12em] ${
                                selectedTranscriptBlockIndex === index ? "text-[#171717]" : "text-[#9aa1ac]"
                              }`}
                            >
                              {String(index + 1).padStart(3, "0")}
                            </span>
                          </div>
                          <p className="max-w-[95%] text-[16px] leading-[2.15] text-[#171717]">
                            {renderHighlightedText(block.text, logSearch)}
                          </p>
                        </article>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-[#d9dee7] bg-[#fcfcfd] px-5 py-10 text-[14px] leading-7 text-[#7a808c]">
                          該当する文字起こしブロックがありません。
                        </div>
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-3 rounded-full bg-[#fff4d6]">
                      {transcriptScrollbar.isScrollable ? (
                        <span
                          className="absolute left-0.5 right-0.5 rounded-full bg-[#ffcf33]"
                          style={{
                            height: `${transcriptScrollbar.thumbHeight}px`,
                            top: `${transcriptScrollbar.thumbTop}px`,
                          }}
                        />
                      ) : null}
                    </div>
                    </div>

                  </>
                ) : (
                  <div className="px-4 py-16 text-[16px] leading-8 text-[#7a808c]">
                    まだ表示できる文字起こし本文がありません。まずは `本文を生成` を実行してください。
                  </div>
                )}
              </div>
            </div>

            <aside className="flex h-[760px] flex-col gap-4">
              <div className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-[#eceef4] bg-white p-4">
                <div className="grid grid-cols-4 gap-1.5 rounded-[16px] bg-[#faf7ef] p-2 text-[12px] font-semibold text-[#7a808c]">
                  <button
                    type="button"
                    onClick={() => setTranscriptSidebarTab("keywords")}
                    className={`rounded-[12px] px-2 py-2.5 text-center transition ${transcriptSidebarTab === "keywords" ? "bg-[#ffcf33] text-[#5f4700] shadow-[0_4px_10px_rgba(240,180,0,0.18)]" : "text-[#7a808c] hover:bg-white hover:text-[#5f4700]"}`}
                  >
                    頻出ワード
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscriptSidebarTab("focusWords")}
                    className={`rounded-[12px] px-2 py-2.5 text-center transition ${transcriptSidebarTab === "focusWords" ? "bg-[#ffcf33] text-[#5f4700] shadow-[0_4px_10px_rgba(240,180,0,0.18)]" : "text-[#7a808c] hover:bg-white hover:text-[#5f4700]"}`}
                  >
                    注目ワード
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscriptSidebarTab("important")}
                    className={`rounded-[12px] px-2 py-2.5 text-center transition ${transcriptSidebarTab === "important" ? "bg-[#ffcf33] text-[#5f4700] shadow-[0_4px_10px_rgba(240,180,0,0.18)]" : "text-[#7a808c] hover:bg-white hover:text-[#5f4700]"}`}
                  >
                    注目発言
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscriptSidebarTab("checkpoints")}
                    className={`rounded-[12px] px-2 py-2.5 text-center transition ${transcriptSidebarTab === "checkpoints" ? "bg-[#ffcf33] text-[#5f4700] shadow-[0_4px_10px_rgba(240,180,0,0.18)]" : "text-[#7a808c] hover:bg-white hover:text-[#5f4700]"}`}
                  >
                    確認ポイント
                  </button>
                </div>

                {transcriptSidebarTab === "keywords" ? (
                  <div className="flex min-h-0 flex-1 flex-col pt-4">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {transcriptFrequentWords.length > 0 ? (
                        transcriptFrequentWords.map((word, index) => (
                          <div
                            key={word.term}
                            className="flex items-center justify-between rounded-[18px] border border-[#efe5cd] bg-[#fffdfa] px-4 py-4 shadow-[0_3px_10px_rgba(17,24,39,0.03)]"
                          >
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#ffe9a3] px-2 text-[12px] font-semibold text-[#8d6800]">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="text-[14px] font-medium text-[#171717]">{word.term}</span>
                            </div>
                            <span className="rounded-full border border-[#f0dfb0] bg-[#fff6dc] px-3 py-1 text-[12px] font-medium text-[#7a6330]">
                              {word.count}回
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[#d9dee7] px-4 py-8 text-[14px] leading-7 text-[#7a808c]">
                          文字起こし生成後に、よく使われた単語をここに表示します。
                        </div>
                      )}
                    </div>
                  </div>
                ) : transcriptSidebarTab === "focusWords" ? (
                  <div className="flex min-h-0 flex-1 flex-col pt-4">
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                      {transcriptFocusWords.some((category) => category.words.length > 0) ? (
                        transcriptFocusWords.map((category) => (
                          <section key={category.id} className="rounded-[18px] border border-[#efe5cd] bg-[#fffdfa] p-4 shadow-[0_3px_10px_rgba(17,24,39,0.03)]">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-[13px] font-bold text-[#5f4700]">{category.title}</h3>
                                <p className="mt-1 text-[11px] leading-5 text-[#8a7a58]">{category.description}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-[#f0dfb0] bg-[#fff6dc] px-2.5 py-1 text-[11px] font-semibold text-[#7a6330]">
                                {category.words.length}件
                              </span>
                            </div>
                            {category.words.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {category.words.map((word) => (
                                  <button
                                    key={`${category.id}-${word.term}-${word.evidence.id}`}
                                    type="button"
                                    onClick={() => handleJumpToTranscriptLog(word.evidence)}
                                    className="block w-full rounded-[14px] border border-[#f4ead0] bg-white px-3 py-3 text-left transition hover:border-[#e3d39a] hover:bg-[#fffdf7]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-[14px] font-semibold text-[#171717]">{word.term}</span>
                                      <span className="rounded-full bg-[#f7f1df] px-2.5 py-1 text-[11px] font-semibold text-[#7a6330]">{word.count}回</span>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-[12px] leading-6 text-[#596273]">
                                      {word.evidence.label}: {word.evidence.text}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 rounded-[14px] border border-dashed border-[#eadfbe] px-3 py-4 text-[12px] leading-6 text-[#8a7a58]">
                                該当するワードはまだありません。
                              </p>
                            )}
                          </section>
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[#d9dee7] px-4 py-8 text-[14px] leading-7 text-[#7a808c]">
                          文字起こし本文から、顧客課題・反論/不安・商材/価値・次回アクションに関わるワードを表示します。
                        </div>
                      )}
                    </div>
                  </div>
                ) : transcriptSidebarTab === "important" ? (
                  <div className="flex min-h-0 flex-1 flex-col pt-4">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {transcriptImportantLogs.map((item) => (
                      <SearchResultCard
                        key={item.id}
                        text={item.text}
                        onClick={() => handleJumpToTranscriptLog(item)}
                      />
                    ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col pt-4">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {transcriptAiExtracts.length > 0 ? (
                        transcriptAiExtracts.map((item, index) => (
                          <div key={item.id} className="rounded-[18px] border border-[#efe5cd] bg-[#fffdfa] px-4 py-4 shadow-[0_3px_10px_rgba(17,24,39,0.03)]">
                            <div className="text-[12px] font-semibold text-[#9c7600]">ポイント{index + 1}</div>
                            <button
                              type="button"
                              onClick={() => handleJumpToTranscriptLog(item)}
                              className="mt-2 block w-full text-left text-[14px] leading-7 text-[#171717] transition hover:text-[#8a6500]"
                            >
                              {renderHighlightedText(item.text, logSearch)}
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[#d9dee7] px-4 py-8 text-[14px] leading-7 text-[#7a808c]">
                          文字起こし本文から抽出できる発言がまだありません。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[18px] border border-[#f4e2a4] bg-[#fff7db] px-4 py-4 text-[14px] leading-7 text-[#7b6740]">
                AIによる文字起こしのため、一部誤りが含まれる可能性があります。重要な内容は必ずご確認ください。
              </div>
            </aside>
          </div>
        </section>
        ) : null}
      </div>
    </main>
  );
}

function mapConversationLogToDisplayLog(
  log: NonNullable<MeetingRecord["conversationLogs"]>[number],
  segments: NonNullable<MeetingRecord["transcriptionProbeSegments"]>,
): DisplayLog {
  const firstSegmentIndex = log.sourceSegmentIndexes[0];
  const lastSegmentIndex = log.sourceSegmentIndexes[log.sourceSegmentIndexes.length - 1];
  const startSec =
    typeof firstSegmentIndex === "number" && segments[firstSegmentIndex]
      ? segments[firstSegmentIndex].startSec
      : null;
  const endSec =
    typeof lastSegmentIndex === "number" && segments[lastSegmentIndex]
      ? segments[lastSegmentIndex].endSec
      : null;

  return {
    id: log.id,
    startSec,
    endSec,
    speaker: log.speaker,
    label: log.label,
    text: log.text,
    confidence: log.confidence,
    kind: log.kind ?? (log.speaker === "unknown" ? "unknown" : "speech"),
  };
}

function buildConversationLogsFromSegments(
  segments: Array<{ startSec: number; endSec: number; text: string; speaker?: string | null }>,
): NonNullable<MeetingRecord["conversationLogs"]> {
  const speakerMap = new Map<string, "speaker_1" | "speaker_2">();
  let speakerCount = 0;

  return segments.map((segment, index) => {
    const speaker = normalizeTranscriptSpeaker(segment.speaker ?? null, speakerMap, () => {
      speakerCount += 1;
      return speakerCount;
    });

    return {
      id: `log_${index + 1}`,
      speaker,
      label: buildSpeakerLabel(speaker),
      text: segment.text.trim(),
      sourceSegmentIndexes: [index],
      confidence: "aligned",
      kind: speaker === "unknown" ? "unknown" : "speech",
    };
  });
}

function normalizeTranscriptSpeaker(
  rawSpeaker: string | null,
  speakerMap?: Map<string, "speaker_1" | "speaker_2">,
  nextSpeakerIndex?: () => number,
): "speaker_1" | "speaker_2" | "unknown" {
  if (rawSpeaker === "speaker_1" || rawSpeaker === "speaker_2") {
    return rawSpeaker;
  }

  if (!rawSpeaker || !speakerMap || !nextSpeakerIndex) {
    return "unknown";
  }

  const normalizedKey = rawSpeaker.trim();

  if (!normalizedKey) {
    return "unknown";
  }

  const existing = speakerMap.get(normalizedKey);
  if (existing) {
    return existing;
  }

  const index = nextSpeakerIndex();
  if (index === 1) {
    speakerMap.set(normalizedKey, "speaker_1");
    return "speaker_1";
  }

  if (index === 2) {
    speakerMap.set(normalizedKey, "speaker_2");
    return "speaker_2";
  }

  return "unknown";
}

function buildSpeakerLabel(speaker: "speaker_1" | "speaker_2" | "unknown") {
  if (speaker === "speaker_1") {
    return "話者1";
  }

  if (speaker === "speaker_2") {
    return "話者2";
  }

  return "未設定";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number | null },
) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? transcriptionRequestTimeoutMs;
  const timeoutId =
    timeoutMs === null
      ? null
      : window.setTimeout(() => {
          controller.abort();
        }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: timeoutId === null ? init?.signal : controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("文字起こし処理がタイムアウトしました。時間をおいて再度お試しください。");
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function parseApiJsonResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    if (responseText.trimStart().startsWith("<!DOCTYPE") || responseText.trimStart().startsWith("<html")) {
      throw new Error("サーバー側で予期しないエラーが発生しました。開発サーバーのログを確認してください。");
    }

    throw new Error("APIレスポンスの解析に失敗しました。");
  }
}

function HeaderActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "warm" | "neutral" | "sage" | "outline";
}) {
  const toneClassName =
    variant === "warm"
      ? "border-[#efcf68] bg-[linear-gradient(180deg,#fff3bf_0%,#ffe184_100%)] text-[#6b5200] hover:border-[#e4c04a] hover:bg-[linear-gradient(180deg,#ffefad_0%,#ffd96b_100%)]"
      : variant === "outline"
        ? "border-[#ead8a8] bg-white text-[#665430] hover:border-[#ddc173] hover:bg-[#fffaf0]"
      : variant === "neutral"
        ? "border-[#e9dfd1] bg-[#faf7f0] text-[#544c40] hover:border-[#d9cfbe] hover:bg-[#f4f0e7]"
        : variant === "sage"
          ? "border-[#ebe4d4] bg-[#fffdf8] text-[#6a6048] hover:border-[#ddd1ba] hover:bg-[#fbf6ec]"
          : "border-[#e3e7ee] bg-white text-[#171717] hover:border-[#d7dde8] hover:bg-[#fafbfc]";
  const iconToneClassName =
    variant === "warm"
      ? "bg-white text-[#b98900] border border-[#f1dd98]"
      : variant === "outline"
        ? "bg-[#fff1bf] text-[#b98900]"
        : variant === "neutral"
          ? "bg-white text-[#6d6250] border border-[#e8dfcf]"
          : variant === "sage"
            ? "bg-[#fff3cf] text-[#8b6c00]"
            : "bg-[#f5f7fa] text-[#667085]";
  const iconSizeClassName = variant === "warm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-[12px] border px-3 text-[12px] font-semibold shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition disabled:cursor-not-allowed disabled:border-[#e5e7eb] disabled:bg-[#f5f6f7] disabled:text-[#a0a7b1] ${toneClassName}`}
    >
      <span className={`inline-flex items-center justify-center rounded-full shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)] ${iconSizeClassName} ${iconToneClassName}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function TranscriptMetaItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`px-5 py-5 ${className}`}>
      <div className="text-[13px] font-medium text-[#8a909b]">{label}</div>
      <div className="mt-2 text-[16px] font-semibold leading-8 text-[#171717]">{value}</div>
    </div>
  );
}

function SummaryInsightCard({
  title,
  icon,
  accent,
  description,
  className = "",
  actionLabel,
  actionIcon,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "amber" | "blue";
  description: string;
  className?: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
}) {
  return (
    <article className={`rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
              accent === "amber" ? "bg-[#fff4d6] text-[#f0b400]" : "bg-[#f7f7fa] text-[#6c7380]"
            }`}
          >
            {icon}
          </span>
          {title}
        </div>
        {actionLabel ? (
          <button
            type="button"
            className="inline-flex h-[32px] items-center gap-2 rounded-[10px] border border-[#eceef4] bg-white px-3 text-[12px] font-medium text-[#4f5663]"
          >
            {actionIcon}
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-4 text-[14px] leading-8 text-[#3f4856]">{description}</div>
    </article>
  );
}

function StatusSummaryCard({
  title,
  label,
  description,
  tone,
  evidence,
}: {
  title: string;
  label: string;
  description: string;
  tone: "positive" | "warning" | "neutral";
  evidence: string[];
}) {
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const toneStyles =
    tone === "positive"
      ? "bg-[#eff9ef] text-[#2f8f56]"
      : tone === "warning"
        ? "bg-[#fff7e6] text-[#f59e0b]"
        : "bg-[#f7f7fa] text-[#6c7380]";

  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="text-[14px] font-semibold text-[#171717]">{title}</div>
      <div className={`mt-5 inline-flex items-center gap-3 rounded-full px-4 py-2 text-[12px] font-semibold ${toneStyles}`}>
        <MoodGlyph />
        {label}
      </div>
      <div className="mt-5 text-[14px] leading-7 text-[#667085]">{description}</div>
      <EvidenceToggle evidence={evidence} isOpen={isEvidenceOpen} onToggle={() => setIsEvidenceOpen((current) => !current)} />
    </article>
  );
}

function TemperatureSummaryCard({
  title,
  stars,
  description,
  evidence,
}: {
  title: string;
  stars: number;
  description: string;
  evidence: string[];
}) {
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="text-[14px] font-semibold text-[#171717]">{title}</div>
      <div className="mt-6 flex items-center gap-1 text-[28px] text-[#f6bf24]">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={index < stars ? "text-[#f6bf24]" : "text-[#d7dce5]"}>
            ★
          </span>
        ))}
      </div>
      <div className="mt-5 text-[14px] leading-7 text-[#667085]">{description}</div>
      <EvidenceToggle evidence={evidence} isOpen={isEvidenceOpen} onToggle={() => setIsEvidenceOpen((current) => !current)} />
    </article>
  );
}

function ConsiderationSummaryCard({
  title,
  score,
  description,
  evidence,
}: {
  title: string;
  score: number;
  description: string;
  evidence: string[];
}) {
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="text-[14px] font-semibold text-[#171717]">{title}</div>
      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-[4px] border-[#f6bf24] text-[22px] font-bold text-[#171717]">
          {score}
        </div>
        <div className="text-[36px] font-bold leading-none text-[#171717]">
          {score}%
        </div>
      </div>
      <div className="mt-5 text-[14px] leading-7 text-[#667085]">{description}</div>
      <EvidenceToggle evidence={evidence} isOpen={isEvidenceOpen} onToggle={() => setIsEvidenceOpen((current) => !current)} />
    </article>
  );
}

function ActionPanel({
  actions,
  mentionedNextDate,
}: {
  actions: string[];
  mentionedNextDate: string | null;
}) {
  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
        <ActionGlyph />
        次回アクション
      </div>
      <ol className="mt-4 space-y-2 text-[14px] leading-7 text-[#171717]">
        {actions.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="w-4 text-[#667085]">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
      {mentionedNextDate ? (
        <div className="mt-5 border-t border-[#eef1f5] pt-4">
          <div className="text-[12px] text-[#98a2b3]">次回予定日</div>
          <div className="mt-2 text-[16px] font-semibold text-[#171717]">{mentionedNextDate}</div>
        </div>
      ) : null}
    </article>
  );
}

function SummaryBulletPanel({
  title,
  icon,
  bullets,
}: {
  title: string;
  icon: React.ReactNode;
  bullets: string[];
}) {
  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
        {icon}
        {title}
      </div>
      <ul className="mt-4 space-y-3 text-[14px] leading-7 text-[#171717]">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="text-[#6b7280]">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ManualComplianceInsight({
  compliance,
  manualDescription,
}: {
  compliance: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["manualCompliance"]>;
  manualDescription: string;
}) {
  const isManual = compliance.mode === "manual";

  return (
    <article className="mt-5 rounded-[24px] border border-[#f0e3c1] bg-[#fffaf0] p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-bold text-[#171717]">
              {isManual ? "会社基準に沿った改善ポイント" : "AI汎用分析"}
            </h3>
            <span className="rounded-full border border-[#f0d992] bg-white px-3 py-1 text-[12px] font-bold text-[#8a6500]">
              {isManual ? "会社基準: 適用済み" : "会社基準: 未適用"}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[#6f6250]">
            {isManual
              ? manualDescription
              : "会社基準が未登録のため、AIの一般的な営業観点で改善ポイントを整理しています。"}
          </p>
        </div>
        <div className="rounded-[18px] border border-[#f0d992] bg-white px-5 py-4 text-center">
          <div className="text-[12px] font-bold text-[#8a909b]">準拠スコア</div>
          <div className="mt-1 text-[28px] font-black text-[#171717]">
            {compliance.score === null ? "-" : compliance.score}
            {compliance.score === null ? null : <span className="ml-1 text-[14px] font-bold text-[#8a909b]">点</span>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ManualComplianceList title="できていた基準" items={compliance.matchedCriteria} />
        <ManualComplianceList title="次に直す基準" items={compliance.missingCriteria} />
        <ManualComplianceList title="商品・競合観点" items={compliance.productNotes} />
        <ManualComplianceList title="次回使うフレーズ" items={compliance.improvementPhrases} />
      </div>
    </article>
  );
}

function ManualComplianceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[18px] border border-[#f0e3c1] bg-white p-4">
      <div className="text-[13px] font-bold text-[#8a6500]">{title}</div>
      <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#343b48]">
        {(items.length > 0 ? items : ["未検出"]).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-[#c4991b]">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryMetricCard({
  title,
  value,
  unit,
  color,
  description,
  evidence = [],
  variant,
}: {
  title: string;
  value: string;
  unit?: string;
  color: string;
  description: string;
  evidence?: string[];
  variant: "ring" | "stars" | "gauge" | "heat";
}) {
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  return (
    <article className="rounded-[18px] bg-[#fcfcfd] px-4 py-4 xl:min-h-[220px] xl:border-r xl:border-[#eceef4] xl:rounded-none xl:bg-transparent last:border-r-0">
      <div className="text-center text-[15px] font-semibold text-[#171717]">{title}</div>
      <div className="mt-5 flex min-h-[96px] items-center justify-center">
        {variant === "stars" ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[28px] text-[#f6bf24]">
              {renderStars(Number(value))}
            </div>
            <div className="mt-4 text-[42px] font-bold leading-none text-[#171717]">
              {value}
              <span className="ml-2 text-[22px] font-medium text-[#6b7280]">{unit}</span>
            </div>
          </div>
        ) : variant === "heat" ? (
          <div className="text-center">
            <div className="text-[46px] leading-none">🔥</div>
            <div className="mt-3 text-[22px] font-bold text-[#f59e0b]">{value}</div>
          </div>
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border-[5px] text-center"
            style={{ borderColor: color }}
          >
            <div>
              <div className="text-[20px] font-bold leading-none text-[#171717]">{value}</div>
              {unit ? <div className="mt-1 text-[12px] text-[#7a808c]">{unit}</div> : null}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 text-center text-[13px] leading-6 text-[#667085]">{description}</div>
      <EvidenceToggle evidence={evidence} isOpen={isEvidenceOpen} onToggle={() => setIsEvidenceOpen((current) => !current)} />
    </article>
  );
}

function EvidenceToggle({
  evidence,
  isOpen,
  onToggle,
}: {
  evidence: string[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const visibleEvidence = evidence.filter(Boolean);

  if (visibleEvidence.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-[#eef1f5] pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-[12px] font-semibold text-[#8a6500] transition hover:text-[#5f4700]"
      >
        根拠を見る{isOpen ? "を閉じる" : `（${visibleEvidence.length}件）`}
      </button>
      {isOpen ? (
        <ul className="mt-3 space-y-2 text-left text-[12px] leading-6 text-[#667085]">
          {visibleEvidence.map((item, index) => (
            <li key={`${item}_${index}`} className="rounded-[10px] bg-[#fffaf0] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EvidenceInsightCard({
  title,
  icon,
  bullets,
  evidence,
}: {
  title: string;
  icon: React.ReactNode;
  bullets: string[];
  evidence: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
        {icon}
        {title}（検出）
      </div>
      <ul className="mt-4 space-y-3 text-[14px] leading-7 text-[#171717]">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3">
            <span className="mt-1 text-[#111827]">✓</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-[#4f5663]"
      >
        根拠となる発話{isOpen ? "を閉じる" : `を見る（${evidence.length}件）`}
        <span aria-hidden="true">{isOpen ? "⌃" : "›"}</span>
      </button>
      {isOpen ? (
        <div className="mt-4 space-y-2 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] p-3">
          {evidence.map((item) => (
            <p key={item} className="text-[12px] leading-6 text-[#505866]">
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ActionInsightCard({
  actions,
  mentionedNextDate,
}: {
  actions: string[];
  mentionedNextDate: string | null;
}) {
  return (
    <article className="rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
        <ActionGlyph />
        次回アクション（検出）
      </div>
      <ol className="mt-4 space-y-3 text-[14px] leading-7 text-[#171717]">
        {actions.map((action, index) => (
          <li key={action} className="flex gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff4d6] text-[12px] font-semibold text-[#8a6a00]">
              {index + 1}
            </span>
            <span>{action}</span>
          </li>
        ))}
      </ol>
      {mentionedNextDate ? (
        <div className="mt-6 rounded-[14px] border border-[#f3e3b6] bg-[#fffaf0] p-3">
          <div className="text-[12px] text-[#98a2b3]">次回予定日</div>
          <div className="mt-2 text-[16px] font-semibold text-[#171717]">{mentionedNextDate}</div>
        </div>
      ) : null}
    </article>
  );
}

function FeedbackInsightCard({
  title,
  tone,
  bullets,
  footer,
  details,
}: {
  title: string;
  tone: "positive" | "warning" | "info";
  bullets: string[];
  footer: string;
  details: string[];
}) {
  const icon = tone === "positive" ? "👍" : tone === "warning" ? "⚠️" : "💡";
  const [isOpen, setIsOpen] = useState(false);

  return (
    <article className="flex h-full flex-col rounded-[18px] border border-[#eceef4] bg-white p-5 shadow-[0_4px_12px_rgba(17,24,39,0.04)]">
      <div className="flex items-center gap-3 text-[14px] font-semibold text-[#171717]">
        <span className="text-[18px]">{icon}</span>
        {title}
      </div>
      <ul className="mt-4 space-y-3 text-[14px] leading-7 text-[#171717]">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="text-[#6b7280]">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="mt-auto pt-6 text-left text-[13px] font-medium text-[#4f5663]"
      >
        {footer}
        {tone === "info" ? "" : `（${details.length}件）`}
        <span className="ml-1" aria-hidden="true">{isOpen ? "⌃" : "›"}</span>
      </button>
      {isOpen ? (
        <div className="mt-4 space-y-2 rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] p-3">
          {details.map((item) => (
            <p key={item} className="text-[12px] leading-6 text-[#505866]">
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SearchResultCard({
  text,
  timestamp,
  keyword = "",
  onClick,
}: {
  text: string;
  timestamp?: string;
  keyword?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[16px] border border-[#eceef4] bg-white px-4 py-4 text-left shadow-[0_2px_8px_rgba(17,24,39,0.03)] transition hover:border-[#e3d39a] hover:bg-[#fffdf7]"
    >
      <div className="text-[14px] leading-7 text-[#171717]">{renderHighlightedText(text, keyword)}</div>
      {timestamp ? <div className="mt-3 text-[13px] text-[#98a2b3]">{timestamp}</div> : null}
    </button>
  );
}

function SummaryFolderGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="M3.5 8.5h17v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M3.5 8.5V6.8a2 2 0 0 1 2-2h4l1.6 1.7h7.4a2 2 0 0 1 2 2" />
    </svg>
  );
}

function MoodGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-[#22c55e] stroke-[1.8]">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.8 14.2a4.4 4.4 0 0 0 6.4 0M9.2 9.5h.01M14.8 9.5h.01" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="m12 3 1.9 4.8L19 9.7l-4 2.7L16.4 18 12 14.9 7.6 18 9 12.4 5 9.7l5.1-1.9Z" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ChevronDownGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.2]">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <rect x="9" y="7" width="11" height="13" rx="2.5" />
      <path d="M15 7V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H9" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.9]">
      <path d="M12 4.5v10.2" />
      <path d="m7.8 11.6 4.2 4.3 4.2-4.3" />
      <path d="M5 19.5h14" />
    </svg>
  );
}

function SummaryGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function IssueGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-[#ef4444] stroke-[1.8]">
      <path d="M12 4.5 4.5 8v4.8c0 4 2.7 6.5 7.5 6.7 4.8-.2 7.5-2.7 7.5-6.7V8Z" />
      <path d="M12 8.5v4.5M12 16.5h.01" />
    </svg>
  );
}

function InterestGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-[#22c55e] stroke-[1.8]">
      <circle cx="12" cy="12" r="8" />
      <path d="m9.2 12.3 1.8 1.8 3.8-4.4" />
    </svg>
  );
}

function ConcernGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-[#8b5cf6] stroke-[1.8]">
      <path d="M12 3.8 5.5 6.5v5.3c0 4.2 2.8 6.9 6.5 8.4 3.7-1.5 6.5-4.2 6.5-8.4V6.5Z" />
      <path d="M12 8.2v4.1M12 15.6h.01" />
    </svg>
  );
}

function ActionGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-[#3b82f6] stroke-[1.8]">
      <circle cx="12" cy="12" r="8" />
      <path d="m9.2 12.2 1.7 1.7 4-4.4" />
    </svg>
  );
}

function formatMeetingDateTimeRange(date: Date, durationSec: number | null) {
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const endDate =
    typeof durationSec === "number" && Number.isFinite(durationSec)
      ? new Date(date.getTime() + durationSec * 1000)
      : null;
  const endLabel = endDate
    ? new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(endDate)
    : null;

  return endLabel ? `${dateLabel} ${timeLabel} - ${endLabel}` : `${dateLabel} ${timeLabel}`;
}

function renderHighlightedText(text: string, keyword: string) {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return text;
  }

  const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedKeyword})`, "gi"));

  return parts.map((part, index) =>
    part.toLowerCase() === normalizedKeyword.toLowerCase() ? (
      <mark key={`${part}_${index}`} className="rounded-[4px] bg-[#ffe79a] px-1 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={`${part}_${index}`}>{part}</span>
    ),
  );
}

function buildImportantTranscriptLogs(logs: DisplayLog[]) {
  return logs
    .map((log, index) => ({
      log,
      index,
      score: scoreImportantTranscriptLog(log.text),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ log }) => log);
}

function buildGroundedTranscriptExtractLogs(logs: DisplayLog[]) {
  const extracted = logs.flatMap((log, logIndex) =>
    splitIntoSentences(log.text)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence, sentenceIndex) => ({
        log: {
          ...log,
          id: `${log.id}_extract_${sentenceIndex}`,
          text: sentence,
        },
        logIndex,
        sentenceIndex,
        score: scoreGroundedTranscriptExtract(sentence),
      })),
  );
  const scored = extracted
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.logIndex - right.logIndex || left.sentenceIndex - right.sentenceIndex);

  if (scored.length > 0) {
    return dedupeTranscriptExtracts(scored.map(({ log }) => log));
  }

  return dedupeTranscriptExtracts(
    extracted
      .filter(({ log }) => cleanTranscriptSentence(log.text).length >= 16)
      .sort((left, right) => left.logIndex - right.logIndex || left.sentenceIndex - right.sentenceIndex)
      .map(({ log }) => log),
  );
}

function scoreGroundedTranscriptExtract(text: string) {
  const normalized = cleanTranscriptSentence(text);

  if (!normalized || normalized.length < 8) {
    return 0;
  }

  let score = 0;
  const rules: Array<{ pattern: RegExp; weight: number }> = [
    { pattern: /課題|問題|困って|悩んで|ネック|ボトルネック|負担|時間がかかる/, weight: 5 },
    { pattern: /要望|希望|したい|ほしい|欲しい|必要|求めて|楽に|効率化/, weight: 5 },
    { pattern: /不安|懸念|心配|リスク|止まる|故障|属人|共有|更新/, weight: 4 },
    { pattern: /見積|見積もり|費用|コスト|金額|価格|予算|月額|リース/, weight: 4 },
    { pattern: /次回|宿題|送付|提出|確認|共有|資料|事例|スケジュール/, weight: 4 },
    { pattern: /決裁|承認|稟議|社内|比較|検討|導入/, weight: 3 },
    { pattern: /[?？]$|できますか|でしょうか|ありますか|可能ですか|いかが/, weight: 2 },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      score += rule.weight;
    }
  }

  if (normalized.length >= 24) {
    score += 1;
  }

  if (/^(はい|ええ|なるほど|了解|承知しました|ありがとうございます)[。！! ]*$/.test(normalized)) {
    score -= 4;
  }

  return Math.max(score, 0);
}

function dedupeTranscriptExtracts(logs: DisplayLog[]) {
  const seen = new Set<string>();
  const deduped: DisplayLog[] = [];

  for (const log of logs) {
    const key = normalizeTranscriptMatchText(log.text);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(log);
  }

  return deduped;
}

function findTranscriptReadingBlockIndexForLog(log: DisplayLog, blocks: TranscriptReadingBlock[]) {
  const normalizedLogText = normalizeTranscriptMatchText(log.text);
  const textIndex = normalizedLogText
    ? blocks.findIndex((block) => normalizeTranscriptMatchText(block.text).includes(normalizedLogText))
    : -1;

  if (textIndex >= 0) {
    return textIndex;
  }

  const { startSec, endSec } = log;

  if (typeof startSec === "number" && typeof endSec === "number") {
    const rangedIndex = blocks.findIndex((block) =>
      block.ranges.some(
        (range) =>
          typeof range.startSec === "number" &&
          typeof range.endSec === "number" &&
          startSec >= range.startSec &&
          endSec <= range.endSec,
      ),
    );

    if (rangedIndex >= 0) {
      return rangedIndex;
    }
  }

  return -1;
}

function normalizeTranscriptMatchText(text: string) {
  return text.replace(/[（）]/g, "").replace(/\s+/g, " ").trim();
}

function cleanTranscriptSentence(text: string) {
  return text
    .replace(/^(えっと|あのー|あの|その|まー|まあ|ま|それこそ|要は|基本的には|ちょっと)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreImportantTranscriptLog(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  let score = 0;

  const highSignalRules = [
    /課題|問題|困って|悩んで|ネック|ボトルネック|懸念|不安/,
    /要望|希望|したい|ほしい|欲しい|必要|求めて/,
    /見積|見積もり|提案|導入|予算|費用|コスト|金額|価格/,
    /次回|宿題|対応|送付|提出|確認|共有|進め方|スケジュール/,
    /決裁|承認|稟議|社内|比較|検討/,
  ];

  for (const rule of highSignalRules) {
    if (rule.test(normalized)) {
      score += 3;
    }
  }

  if (/[?？]$/.test(normalized) || /できますか|でしょうか|いかが|ありますか|可能ですか/.test(normalized)) {
    score += 2;
  }

  if (/\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d+円|\d+万|\d+千/.test(normalized)) {
    score += 2;
  }

  if (/お願いします|いただきたい|ご確認|共有します|送ります|提出します/.test(normalized)) {
    score += 2;
  }

  if (normalized.length >= 28) {
    score += 1;
  }

  if (/^(はい|ええ|なるほど|了解|承知しました|ありがとうございます)[。！! ]*$/.test(normalized)) {
    score -= 3;
  }

  if (/^(失礼します|こんにちは|よろしくお願いします)[。！! ]*$/.test(normalized)) {
    score -= 2;
  }

  return Math.max(score, 0);
}

function buildTranscriptReadingBlocks(logs: DisplayLog[]) {
  const blocks: TranscriptReadingBlock[] = [];
  let currentBlock = "";
  let currentStartSec: number | null = null;
  let currentEndSec: number | null = null;
  let currentRanges: TranscriptReadingBlock["ranges"] = [];

  for (const log of logs) {
    const nextText = log.kind === "backchannel" ? `（${log.text}）` : log.text;
    const normalizedText = nextText.trim();

    if (!normalizedText) {
      continue;
    }

    const candidate = currentBlock ? `${currentBlock} ${normalizedText}` : normalizedText;

    if (currentBlock && candidate.length > 140) {
      blocks.push({
        text: currentBlock.trim(),
        startSec: currentStartSec,
        endSec: currentEndSec,
        ranges: currentRanges,
      });
      currentBlock = normalizedText;
      currentStartSec = log.startSec ?? null;
      currentEndSec = log.endSec ?? log.startSec ?? null;
      currentRanges = [
        {
          startSec: log.startSec ?? null,
          endSec: log.endSec ?? log.startSec ?? null,
        },
      ];
      continue;
    }

    currentBlock = candidate;
    if (currentStartSec === null) {
      currentStartSec = log.startSec ?? null;
    }
    currentEndSec = log.endSec ?? log.startSec ?? currentEndSec;
    currentRanges.push({
      startSec: log.startSec ?? null,
      endSec: log.endSec ?? log.startSec ?? null,
    });
  }

  if (currentBlock.trim()) {
    blocks.push({
      text: currentBlock.trim(),
      startSec: currentStartSec,
      endSec: currentEndSec,
      ranges: currentRanges,
    });
  }

  return blocks;
}

function buildMeetingStatusSummary(
  status: MeetingRecord["status"],
  diagnosisStatus?: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["diagnosis"]>["status"],
  logs: DisplayLog[] = [],
) {
  if (diagnosisStatus) {
    return {
      label: diagnosisStatus.label,
      description: diagnosisStatus.description,
      tone: diagnosisStatus.tone,
      evidence: diagnosisStatus.evidence,
    };
  }

  const evidence = buildTranscriptEvidence(logs, 3);

  if (status === "won") {
    return {
      label: "導入に向けて前進中",
      description: "導入条件や次の進め方まで話が進み、意思決定に向けた具体検討に入っている状態です。",
      tone: "positive" as const,
      evidence,
    };
  }

  if (status === "lost") {
    return {
      label: "慎重に見極め中",
      description: "優先度や条件面のハードルが残っており、再提案や整理が必要な状態です。",
      tone: "warning" as const,
      evidence,
    };
  }

  return {
    label: "前向きに検討中",
    description: "導入意欲はありつつ、課題整理と比較検討を進めているフェーズです。",
    tone: "neutral" as const,
    evidence,
  };
}

function buildTemperatureSummary(
  status: MeetingRecord["status"],
  diagnosisTemperature?: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["diagnosis"]>["temperature"],
  logs: DisplayLog[] = [],
) {
  if (diagnosisTemperature) {
    return {
      stars: diagnosisTemperature.stars,
      shortLabel: diagnosisTemperature.label,
      description: diagnosisTemperature.description,
      evidence: diagnosisTemperature.evidence,
    };
  }

  const evidence = buildTranscriptEvidence(logs, 3);

  if (status === "won") {
    return {
      stars: 5,
      shortLabel: "導入確度が高い状態",
      description: "比較検討よりも具体条件の確認が中心で、温度感はかなり高めです。",
      evidence,
    };
  }

  if (status === "lost") {
    return {
      stars: 2,
      shortLabel: "慎重な見極め段階",
      description: "懸念や優先順位の確認が多く、前進には追加の材料が必要です。",
      evidence,
    };
  }

  return {
    stars: 4,
    shortLabel: "導入への関心が高い",
    description: "課題認識は明確で、導入メリットに前向きな反応が見られます。",
    evidence,
  };
}

function buildTranscriptPreviewLogs(
  text: string | null | undefined,
): DisplayLog[] {
  if (!text) {
    return [];
  }

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks = normalized
    .split(/\n{2,}/)
    .flatMap((block) => splitParagraphIntoLogUnits(block))
    .map((block) => block.trim())
    .filter(Boolean);

  return mergeShortNeighborLogs(
    chunks.map((chunk, index) => ({
      id: `preview_${index + 1}`,
      startSec: index * 5,
      endSec: index * 5 + 5,
      speaker: "unknown",
      label: "未設定",
      text: chunk,
      confidence: "estimated",
      kind: "speech",
    })),
  );
}

function buildTranscriptPreviewLogsFromSegments(
  segments: NonNullable<MeetingRecord["transcriptionProbeSegments"]>,
): DisplayLog[] {
  const speakerMap = new Map<string, "speaker_1" | "speaker_2">();
  let speakerCount = 0;

  return mergeShortNeighborLogs(
    segments.map((segment, index) => {
      const speaker = normalizeTranscriptSpeaker(segment.speaker ?? null, speakerMap, () => {
        speakerCount += 1;
        return speakerCount;
      });

      return {
        id: `segment_${index + 1}`,
        startSec: segment.startSec,
        endSec: segment.endSec,
        speaker,
        label: buildSpeakerLabel(speaker),
        text: segment.text.trim(),
        confidence: "aligned" as const,
        kind: speaker === "unknown" ? ("unknown" as const) : ("speech" as const),
      };
    }),
  );
}

function splitParagraphIntoLogUnits(text: string) {
  const sentences = splitIntoSentences(text);

  if (sentences.length > 0) {
    return sentences;
  }

  const normalized = text.trim();
  return normalized ? [normalized] : [];
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[。！？?])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function mergeShortNeighborLogs(logs: DisplayLog[]) {
  const merged: DisplayLog[] = [];

  for (const log of logs) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      canMergeNeighborLogs(previous, log)
    ) {
      previous.text = `${previous.text}\n${log.text}`.trim();
      previous.endSec = log.endSec ?? previous.endSec;
      continue;
    }

    merged.push({
      ...log,
      id: `merged_${merged.length + 1}`,
    });
  }

  return merged;
}

function canMergeNeighborLogs(previous: DisplayLog, next: DisplayLog) {
  if (previous.kind !== "speech" || next.kind !== "speech") {
    return false;
  }

  if (previous.speaker !== next.speaker || previous.label !== next.label) {
    return false;
  }

  const previousLineCount = countLogLines(previous.text);
  const nextLineCount = countLogLines(next.text);

  if (previousLineCount >= 2 || nextLineCount >= 2) {
    return false;
  }

  return isShortSpeech(previous.text) && isShortSpeech(next.text);
}

function countLogLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function isShortSpeech(text: string) {
  const normalized = text.replace(/\s+/g, "");
  return normalized.length <= 38;
}

function buildFrequentWords(logs: DisplayLog[]) {
  const stopWords = new Set([
    "です",
    "ます",
    "した",
    "して",
    "ある",
    "いる",
    "こと",
    "これ",
    "それ",
    "ため",
    "よう",
    "はい",
    "では",
    "ので",
    "から",
    "ですか",
    "ください",
    "ありがとう",
    "ございます",
  ]);

  const counts = new Map<string, number>();

  for (const log of logs) {
    const matches = log.text.match(/[一-龠ぁ-んァ-ヶA-Za-z0-9ー]{2,}/g) ?? [];

    for (const rawWord of matches) {
      const word = rawWord.toLowerCase();

      if (stopWords.has(word)) {
        continue;
      }

      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([term, count]) => ({ term, count }))
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term))
    .slice(0, 12);
}

function buildTranscriptFocusWords(logs: DisplayLog[]): TranscriptFocusWordCategory[] {
  return transcriptFocusWordRules.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    words: buildFocusWordsForCategory(logs, category).slice(0, 5),
  }));
}

function buildFocusWordsForCategory(
  logs: DisplayLog[],
  category: (typeof transcriptFocusWordRules)[number],
): TranscriptFocusWord[] {
  const rows = new Map<string, TranscriptFocusWord>();
  const preferredLogs = logs.filter((log) => shouldUseLogForFocusCategory(log, category.preferredSpeaker));
  const sourceLogs = preferredLogs.length > 0 ? preferredLogs : logs;

  for (const log of sourceLogs) {
    const normalizedText = normalizeSearchText(log.text);

    for (const rule of category.rules) {
      const count = rule.keywords.reduce((sum, keyword) => sum + countTextOccurrences(normalizedText, normalizeSearchText(keyword)), 0);
      if (count <= 0) {
        continue;
      }

      const current = rows.get(rule.label);
      if (current) {
        rows.set(rule.label, {
          ...current,
          count: current.count + count,
        });
      } else {
        rows.set(rule.label, {
          term: rule.label,
          count,
          evidence: log,
        });
      }
    }
  }

  return Array.from(rows.values())
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term));
}

function shouldUseLogForFocusCategory(log: DisplayLog, preferredSpeaker: "customer" | "sales" | "any") {
  if (preferredSpeaker === "any") {
    return true;
  }

  const side = inferConversationSide(log);
  if (side === "unknown") {
    return true;
  }

  return side === preferredSpeaker;
}

function inferConversationSide(log: DisplayLog): "sales" | "customer" | "unknown" {
  const label = `${log.label} ${log.text.slice(0, 16)}`;

  if (/営業|担当|弊社|当社|私ども/.test(label)) {
    return "sales";
  }

  if (/顧客|お客様|先方|AI顧客|クライアント/.test(label)) {
    return "customer";
  }

  if (log.speaker === "speaker_1") {
    return "sales";
  }

  if (log.speaker === "speaker_2") {
    return "customer";
  }

  return "unknown";
}

function normalizeSearchText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function countTextOccurrences(text: string, keyword: string) {
  if (!text || !keyword) {
    return 0;
  }

  let count = 0;
  let index = text.indexOf(keyword);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(keyword, index + keyword.length);
  }

  return count;
}

const transcriptFocusWordRules = [
  {
    id: "issues",
    title: "顧客課題",
    description: "困りごと、現状の負担、解決したい問題",
    preferredSpeaker: "customer",
    rules: [
      { label: "集客", keywords: ["集客", "来店", "問い合わせ", "反響", "リード"] },
      { label: "更新できない", keywords: ["更新できない", "更新が止ま", "投稿でき", "運用でき", "手が回ら"] },
      { label: "人手不足", keywords: ["人手不足", "担当者がいない", "担当者不在", "リソース不足", "忙しい"] },
      { label: "管理負担", keywords: ["管理が大変", "管理負担", "負担", "手間", "時間がかか"] },
      { label: "属人化", keywords: ["属人化", "属人", "引き継ぎ", "担当者しか"] },
      { label: "成果不足", keywords: ["効果が出", "成果が出", "伸びない", "つながらない", "失敗"] },
      { label: "採用", keywords: ["採用", "応募", "求人", "人材"] },
    ],
  },
  {
    id: "concerns",
    title: "反論/不安",
    description: "導入前の懸念、比較、予算、慎重な反応",
    preferredSpeaker: "customer",
    rules: [
      { label: "費用/予算", keywords: ["高い", "費用", "予算", "金額", "価格", "コスト"] },
      { label: "効果不安", keywords: ["効果が不安", "不安", "本当に", "成果", "実感", "慎重"] },
      { label: "比較検討", keywords: ["他社", "比較", "相見積", "別の会社", "競合"] },
      { label: "社内確認", keywords: ["社内", "上司", "決裁", "確認", "稟議"] },
      { label: "時期未定", keywords: ["今すぐ", "まだ", "時期", "タイミング", "検討します"] },
      { label: "運用不安", keywords: ["使えるか", "難しい", "定着", "運用できる", "続けられる"] },
    ],
  },
  {
    id: "value",
    title: "商材/価値",
    description: "提案した機能、価値、解決策、差別化",
    preferredSpeaker: "any",
    rules: [
      { label: "AI", keywords: ["ai", "人工知能"] },
      { label: "分析", keywords: ["分析", "解析", "データ"] },
      { label: "改善", keywords: ["改善", "pdca", "見直し"] },
      { label: "自動化", keywords: ["自動", "効率化", "省力化"] },
      { label: "レポート", keywords: ["レポート", "報告", "可視化"] },
      { label: "サポート", keywords: ["サポート", "支援", "伴走"] },
      { label: "事例", keywords: ["事例", "実績", "成功例"] },
      { label: "料金", keywords: ["料金", "月額", "プラン", "見積"] },
    ],
  },
  {
    id: "actions",
    title: "次回アクション",
    description: "次に進めるための合意、宿題、送付物",
    preferredSpeaker: "sales",
    rules: [
      { label: "次回日程", keywords: ["次回", "日程", "打ち合わせ", "アポイント", "アポ"] },
      { label: "資料送付", keywords: ["資料", "送付", "お送りします", "共有します"] },
      { label: "見積提出", keywords: ["見積", "お見積", "提出"] },
      { label: "社内確認", keywords: ["社内確認", "上司に確認", "確認します", "決裁者"] },
      { label: "導入時期確認", keywords: ["導入時期", "開始時期", "いつから", "スケジュール"] },
      { label: "宿題整理", keywords: ["宿題", "整理", "確認事項", "次まで"] },
    ],
  },
] as const;

function buildTranscriptMetrics(logs: DisplayLog[]) {
  const entryCount = logs.length;
  const characterCount = logs.reduce(
    (sum, log) => sum + log.text.replace(/\s+/g, "").length,
    0,
  );
  const averageCharactersPerEntry =
    entryCount > 0 ? Math.round(characterCount / entryCount) : 0;

  return {
    entryCount,
    characterCount,
    averageCharactersPerEntry,
  };
}

function buildAnalysisPanels(
  aiSummary: { overview: string; bullets: string[] },
  logs: DisplayLog[],
) {
  const sourceSentences = logs
    .flatMap((log) => splitIntoSentences(log.text))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const normalizedText = sourceSentences.join(" ");
  const fallback = aiSummary.bullets.length > 0 ? aiSummary.bullets : [aiSummary.overview];
  const customerSentences = sourceSentences.filter(isCustomerSideSentence);

  return {
    summary: fallback.slice(0, 3),
    issues: buildCategoryHighlights(
      customerSentences,
      normalizedText,
      [
        { label: "設備の老朽化による故障リスク", any: ["経年劣化", "老朽", "壊", "故障", "ダメ"] },
        { label: "部品終息で保守継続が難しい", any: ["部品終息", "部品がない", "終息", "保守"] },
        { label: "障害時の復旧や入れ替えに時間がかかる", any: ["1,2週間", "時間をいただ", "止まったまま", "取り付けまで"] },
        { label: "運用が属人化し、担当不在時の対応が止まりやすい", any: ["属人", "担当者が不在", "止まってしまう"] },
        { label: "情報共有や更新作業の負担が大きい", any: ["共有", "更新", "負担", "時間がかかる"] },
      ],
      fallback,
    ),
    interests: buildCategoryHighlights(
      customerSentences,
      normalizedText,
      [
        { label: "情報共有の効率化", any: ["情報共有", "共有", "スムーズ"] },
        { label: "業務や管理の効率化", any: ["効率化", "効率", "管理", "集計", "レポート"] },
        { label: "安定運用とトラブル予防", any: ["止まる", "故障", "交換", "予防"] },
      ],
      fallback,
    ),
    concerns: buildCategoryHighlights(
      sourceSentences,
      normalizedText,
      [
        { label: "導入や切替時に業務が止まることへの不安", any: ["止まったまま", "取り付けまで", "時間をいただ"] },
        { label: "導入コストや契約条件への懸念", any: ["リース", "連帯保証", "コスト", "規定"] },
        { label: "社内定着や継続運用への不安", any: ["使って", "活用", "運用", "定着"] },
      ],
      fallback,
    ),
    requests: buildCategoryHighlights(
      customerSentences,
      normalizedText,
      [
        { label: "止まる前に計画的に入れ替えたい", any: ["交換", "入れ替え", "何もないうち", "今の段階で"] },
        { label: "情報共有をもっと早くしたい", any: ["情報共有", "早く", "スムーズ"] },
        { label: "集計やレポート作成を効率化したい", any: ["レポート", "集計", "効率化", "もっと効率化"] },
        { label: "管理をもっと楽にしたい", any: ["管理", "楽", "手間"] },
      ],
      fallback,
    ),
    actions: buildCategoryHighlights(
      sourceSentences,
      normalizedText,
      [
        { label: "現行設備の更新時期を整理する", any: ["交換", "更新", "終息", "部品"] },
        { label: "導入パターンと見積条件を確認する", any: ["見積", "リース", "規定", "連帯保証"] },
        { label: "切替スケジュールと停止影響を確認する", any: ["取り付け", "時間をいただ", "止まったまま"] },
      ],
      [
        "導入事例の送付",
        "お見積りの提出",
        "運用フローのご提案",
      ],
    ).slice(0, 3),
  };
}

function buildCategoryHighlights(
  sentences: string[],
  normalizedText: string,
  rules: Array<{ label: string; any: string[] }>,
  fallback: string[],
) {
  const labels: string[] = [];

  for (const rule of rules) {
    const matchedBySentence = sentences.some((sentence) =>
      rule.any.some((keyword) => sentence.includes(keyword)),
    );
    const matchedByText = rule.any.some((keyword) => normalizedText.includes(keyword));

    if (matchedBySentence || matchedByText) {
      labels.push(rule.label);
    }
  }

  if (labels.length > 0) {
    return labels.slice(0, 3);
  }

  return fallback.slice(0, 3);
}

function isCustomerSideSentence(sentence: string) {
  const salesLikePatterns = [
    "ご了承ください",
    "よろしくお願いします",
    "申し訳ございません",
    "ご記入",
    "直筆",
    "送付",
    "ご提案",
    "お見積り",
    "導入事例",
    "本来は",
    "要は",
    "なので",
    "ご利用いただく",
    "取り付け",
    "ご案内",
  ];
  const customerLikePatterns = [
    "困って",
    "時間がかか",
    "負担",
    "不安",
    "懸念",
    "止ま",
    "属人",
    "共有",
    "更新",
    "効率化",
    "楽に",
    "したい",
    "考えて",
    "課題",
  ];

  const looksSalesLike = salesLikePatterns.some((pattern) => sentence.includes(pattern));
  const looksCustomerLike = customerLikePatterns.some((pattern) => sentence.includes(pattern));

  return looksCustomerLike || !looksSalesLike;
}

function buildAiScorecards(
  metrics: { entryCount: number; characterCount: number; averageCharactersPerEntry: number },
  status: MeetingRecord["status"],
  evaluation?: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["diagnosis"]>["salesEvaluation"],
  logs: DisplayLog[] = [],
  salesDomain: MeetingRecord["salesDomain"] = "meeting",
) {
  const closingLabel = salesDomain === "teleapo" ? "アポ打診" : "クロージング";
  const colors: Record<string, string> = {
    "ヒアリング": "#4ade80",
    "課題深掘り": "#facc15",
    "提案接続": "#fbbf24",
    "反論対応": "#60a5fa",
    "クロージング": "#f87171",
    "アポ打診": "#f87171",
  };

  if (evaluation && evaluation.length > 0) {
    return evaluation.map((item) => ({
      label: salesDomain === "teleapo" && item.label === "クロージング" ? "アポ打診" : item.label,
      value: item.score,
      color: colors[item.label] ?? "#fbbf24",
      description: item.description,
      evidence: item.evidence,
    }));
  }

  const hearing = clampScore(55 + Math.min(35, metrics.entryCount * 4));
  const discovery = clampScore(45 + Math.min(30, Math.round(metrics.averageCharactersPerEntry / 8)));
  const proposal = clampScore(status === "won" ? 82 : status === "considering" ? 68 : 52);
  const objection = clampScore(status === "lost" ? 42 : status === "considering" ? 58 : 74);
  const closing = clampScore(status === "won" ? 78 : status === "considering" ? 46 : 32);
  const evidence = buildTranscriptEvidence(logs, 3);

  return [
    { label: "ヒアリング", value: hearing, color: "#4ade80", description: undefined, evidence },
    { label: "課題深掘り", value: discovery, color: "#facc15", description: undefined, evidence },
    { label: "提案接続", value: proposal, color: "#fbbf24", description: undefined, evidence },
    { label: "反論対応", value: objection, color: "#60a5fa", description: undefined, evidence },
    { label: closingLabel, value: closing, color: "#f87171", description: undefined, evidence },
  ];
}

function buildScoreDescription(label: string, value: number, description?: string) {
  if (description) {
    return description;
  }

  if (label === "ヒアリング") {
    return value >= 80 ? "深掘り質問が多く、ニーズの把握ができています" : "ヒアリングは進んでいますが、追加確認の余地があります";
  }

  if (label === "課題深掘り") {
    return value >= 70 ? "課題の背景まで確認できています" : "課題の深掘りがやや浅い印象です";
  }

  if (label === "提案接続") {
    return value >= 70 ? "提案の方向性は伝わっています" : "比較優位や具体性の補強があるとより良いです";
  }

  if (label === "反論対応") {
    return value >= 70 ? "懸念に対して確認や切り返しができています" : "不安や反論を掘り下げる余地があります";
  }

  if (label === "アポ打診") {
    return value >= 60 ? "次回接点やアポイントにつながっています" : "アポ打診や次回接点化の強化余地があります";
  }

  return value >= 60 ? "次回アクションまでつながっています" : "クロージングトークの強化余地があります";
}

function buildFeedbackBullets(
  scores: Array<{ label: string; value: number }>,
  tone: "positive" | "warning" | "next",
) {
  const hearing = scores.find((score) => score.label === "ヒアリング")?.value ?? 0;
  const proposal = scores.find((score) => score.label === "提案接続")?.value ?? 0;
  const closing = scores.find((score) => score.label === "クロージング" || score.label === "アポ打診")?.value ?? 0;

  if (tone === "positive") {
    return [
      hearing >= 80 ? "相手の課題に対して共感を示せている" : "会話の入り方が自然で関係構築ができている",
      proposal >= 60 ? "具体例を交えて説明できている" : "提案の方向性は相手に伝わっている",
      "質問のキャッチボールができている",
    ];
  }

  if (tone === "warning") {
    return [
      proposal >= 70 ? "比較検討ポイントの明示を増やしたい" : "価格や費用の説明がやや曖昧だった",
      "比較検討している他社との差分確認が少ない",
      closing >= 50 ? "次回アクションの明文化を強めたい" : "次回アクションの説明が曖昧だった",
    ];
  }

  return [
    "導入後のイメージを具体的に共有する",
    "決裁プロセスやスケジュールを確認する",
    "ROIや定量的な効果を提示する",
  ];
}

function buildTranscriptEvidence(logs: DisplayLog[], limit: number) {
  const evidence = logs
    .filter((log) => log.text.trim().length >= 8)
    .map((log, index) => ({
      text: `${log.label}: ${truncateText(log.text.trim(), 120)}`,
      score: scoreImportantTranscriptLog(log.text),
      index,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.text);

  return (evidence.length > 0 ? evidence : ["根拠となる発話はまだ抽出できていません。"]).slice(0, limit);
}

function buildDetailedAdvice(scores: Array<{ label: string; value: number }>, actions: string[]) {
  const lowestScore = [...scores].sort((left, right) => left.value - right.value)[0];
  const primaryAction = actions[0] ?? "次回アクションを商談の最後に明確に合意する";

  return [
    lowestScore
      ? `${lowestScore.label}が相対的に弱いので、次回はこの観点を重点的に改善してください。`
      : "次回は商談の目的と着地を冒頭で揃えてから進めてください。",
    `商談終盤では「${primaryAction}」まで具体的に確認すると、次の動きにつながりやすくなります。`,
    "顧客の発言を言い換えて確認し、課題・不安・判断条件を相手の言葉で残してください。",
  ];
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function estimateTranscriptionRuntimeSec(audioDurationSec: number | null) {
  if (typeof audioDurationSec !== "number" || !Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
    return 104;
  }

  // 60分音声で約104秒、以降30分ごとに約52秒増える前提
  return (audioDurationSec / 60) * (104 / 60);
}

function calculateTranscriptionGaugeProgress(
  elapsedSec: number,
  predictedSec: number,
  fullGaugeSec: number,
) {
  if (elapsedSec <= 0) {
    return 12;
  }

  const fastPhaseSec = predictedSec * 0.65;
  const slowPhaseSec = Math.max(fastPhaseSec + 1, fullGaugeSec * 0.92);

  if (elapsedSec <= fastPhaseSec) {
    const ratio = elapsedSec / Math.max(1, fastPhaseSec);
    return Math.round(12 + ratio * (70 - 12));
  }

  if (elapsedSec <= slowPhaseSec) {
    const ratio = (elapsedSec - fastPhaseSec) / Math.max(1, slowPhaseSec - fastPhaseSec);
    return Math.round(70 + ratio * 25);
  }

  return 95;
}

function buildConsiderationSummary(
  status: MeetingRecord["status"],
  diagnosisConsideration?: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["diagnosis"]>["consideration"],
  logs: DisplayLog[] = [],
) {
  if (diagnosisConsideration) {
    return {
      score: diagnosisConsideration.score,
      description: diagnosisConsideration.description,
      evidence: diagnosisConsideration.evidence,
    };
  }

  const evidence = buildTranscriptEvidence(logs, 4);

  if (status === "won") {
    return {
      score: 92,
      description: "導入条件や次回アクションが具体的で、検討の具体度が高い状態です。",
      evidence,
    };
  }

  if (status === "lost") {
    return {
      score: 48,
      description: "優先度や条件面のハードルが残っており、再整理が必要です。",
      evidence,
    };
  }

  return {
    score: 80,
    description: "興味は見えていますが、予算・時期・決裁者・次回アクションの具体化で精度が上がります。",
    evidence,
  };
}

function renderStars(score: number) {
  const rounded = Math.round(score);

  return Array.from({ length: 5 }, (_, index) => (
    <span key={index}>{index < rounded ? "★" : "☆"}</span>
  ));
}

function extractMentionedDate(text: string, baseDate: Date | null) {
  const normalized = text.replace(/\s+/g, " ");
  const yearMonthDayMatch = normalized.match(
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
  );

  if (yearMonthDayMatch) {
    const [, year, month, day] = yearMonthDayMatch;
    return formatDetectedDate(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  const monthDayMatch = normalized.match(/(\d{1,2})[\/\-月](\d{1,2})日?/);

  if (monthDayMatch) {
    const [, month, day] = monthDayMatch;
    const fallbackYear = baseDate?.getFullYear() ?? new Date().getFullYear();
    return formatDetectedDate(new Date(fallbackYear, Number(month) - 1, Number(day)));
  }

  return null;
}

function formatDetectedDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function buildAiSummary(
  text: string | null | undefined,
  logs: DisplayLog[],
) {
  const sourceLogs = logs.filter((log) => log.kind !== "backchannel");
  const source = sourceLogs.length > 0 ? sourceLogs.map((log) => log.text).join(" ") : text ?? "";
  const normalized = source.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return {
      overview: "文字起こし本文が生成されると、この欄に打ち合わせの要約を表示できます。",
      bullets: [
        "主要論点の整理",
        "商談の温度感の確認",
        "次回アクションの明文化",
        "導入検討状況の把握",
      ],
    };
  }

  const sentences = normalized
    .split(/(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const overview = sentences.slice(0, 2).join(" ") || normalized.slice(0, 140);
  const bullets = sentences.slice(0, 4).map((sentence) => sentence.replace(/\s+/g, " "));

  while (bullets.length < 4) {
    bullets.push("打ち合わせ内容の詳細は文字起こし本文で確認できます。");
  }

  return {
    overview,
    bullets,
  };
}
