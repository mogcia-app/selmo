"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { MONTHLY_AI_LIMIT_MESSAGE } from "@/lib/ai-usage-limit";
import { getApiAuthHeaders } from "@/lib/client/api-auth";
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
const transientBannerDurationMs = 15 * 1000;
const aiSummaryRunningFreshMs = 10 * 60 * 1000;
const monthlyLimitMessage = MONTHLY_AI_LIMIT_MESSAGE;
type ConversationSpeaker = "sales" | "customer" | "participant" | "unknown";
type SpeakerPreset = {
  speaker1: ConversationSpeaker;
  speaker2: ConversationSpeaker;
};
type FlowStepStatus = "completed" | "current" | "pending" | "failed";
type MeetingFlowStep = {
  label: string;
  description: string;
  status: FlowStepStatus;
};

type DisplayLog = {
  id: string;
  startSec?: number | null;
  endSec?: number | null;
  speaker: ConversationSpeaker;
  label: string;
  text: string;
  confidence: "estimated" | "aligned";
  kind: "speech" | "backchannel" | "unknown";
};

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
  const router = useRouter();
  const { profile } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [summaryStatusNowMs, setSummaryStatusNowMs] = useState(() => Date.now());
  const [logSearch, setLogSearch] = useState("");
  const [transcriptViewMode, setTranscriptViewMode] = useState("all");
  const [selectedTranscriptBlockIndex, setSelectedTranscriptBlockIndex] = useState<number | null>(null);
  const [transcriptionVisualProgress, setTranscriptionVisualProgress] = useState(12);
  const [transcriptScrollbar, setTranscriptScrollbar] = useState<ScrollbarMetrics>({
    thumbHeight: 0,
    thumbTop: 0,
    isScrollable: false,
  });
  const [editableLogs, setEditableLogs] = useState<DisplayLog[]>([]);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [isTranscriptEditMode, setIsTranscriptEditMode] = useState(false);
  const [manualSplitIndexes, setManualSplitIndexes] = useState<Record<string, number>>({});
  const [speakerNames, setSpeakerNames] = useState<Record<ConversationSpeaker, string>>({
    sales: "営業",
    customer: "顧客",
    participant: "同席者",
    unknown: "不明",
  });
  const [isSavingConversationLogs, setIsSavingConversationLogs] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptBlockRefs = useRef<Array<HTMLElement | null>>([]);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const logTextAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
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

  const salesSpeakerName = useMemo(() => {
    if (profile?.uid && meeting?.userId && profile.uid === meeting.userId) {
      return buildSalesSpeakerName(profile.name);
    }

    return null;
  }, [meeting?.userId, profile?.name, profile?.uid]);

  useEffect(() => {
    if (meeting?.transcriptionProbeStatus === "completed" || meeting?.transcriptionProbeStatus === "failed") {
      setIsTranscribing(false);
    }
  }, [meeting?.transcriptionProbeStatus]);

  useEffect(() => {
    if (meeting?.aiSummaryStatus !== "running") {
      return;
    }

    setSummaryStatusNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setSummaryStatusNowMs(Date.now());
    }, 30 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [meeting?.aiSummaryStatus]);

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

  const generateAiSummaryInBackground = useCallback(async (transcriptText: string, logs: DisplayLog[]) => {
    try {
      await saveMeetingAiSummary(meetingId, {
        status: "running",
        model: "gpt-4o-mini",
        summary: null,
        error: null,
        processingStatus: "uploaded",
      });

      const summaryResponse = await fetchWithTimeout(`/api/meetings/${meetingId}/summary`, {
        method: "POST",
        headers: await getApiAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          productName: meeting?.productType ?? null,
          meetingPurpose: meeting?.meetingPurpose ?? null,
          customerType: meeting?.customerType ?? null,
          salesDomain: meeting?.salesDomain ?? null,
          transcriptText,
          conversationLogs: logs
            .map((log) => ({
              speaker: log.speaker,
              label: log.label || defaultSpeakerName(log.speaker),
              text: log.text.trim(),
            }))
            .filter((log) => log.text),
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
      setErrorMessage(null);
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
      setErrorMessage(summaryMessage);

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
    model: "gpt-4o-mini-transcribe";
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
    let keepTranscribingAfterRequest = false;
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
        headers: await getApiAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
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
        queued?: boolean;
        dispatched?: boolean;
      };

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(monthlyLimitMessage);
        }

        throw new Error(
          [payload.detail, payload.error].filter(Boolean).join(" / ") ||
            "文字起こしテストに失敗しました。",
        );
      }

      if (payload.queued) {
        keepTranscribingAfterRequest = true;
        setTranscriptionVisualProgress((current) => Math.max(current, 18));
        return;
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
      if (!keepTranscribingAfterRequest) {
        setIsTranscribing(false);
      }
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
    const derivedNames = deriveSpeakerNamesFromLogs(baseLogs);
    const salesLabel = salesSpeakerName ?? derivedNames.sales ?? defaultSpeakerName("sales");
    setEditableLogs(baseLogs.map((log) => (log.speaker === "sales" ? { ...log, label: salesLabel } : log)));
    setSelectedLogIds([]);
    setIsTranscriptEditMode(false);
    setSpeakerNames((current) => ({
      ...current,
      ...derivedNames,
      sales: salesLabel,
    }));
  }, [baseLogs, salesSpeakerName]);

  const aiSummary = useMemo<NonNullable<MeetingRecord["aiSummary"]>>(
    () => meeting?.aiSummary ?? buildAiSummary(meeting?.transcriptionProbeText, editableLogs),
    [editableLogs, meeting?.aiSummary, meeting?.transcriptionProbeText],
  );
  const transcriptMetrics = useMemo(() => buildTranscriptMetrics(editableLogs), [editableLogs]);
  const isManualTranscript = meeting?.transcriptionProbeModel === "manual-paste";
  const hasAttemptedTranscription =
    meeting?.transcriptionProbeStatus === "failed" ||
    meeting?.transcriptionProbeStatus === "completed" ||
    meeting?.transcriptionProbeStatus === "running";
  const shouldShowTranscriptionRetry =
    !isManualTranscript &&
    Boolean(meeting?.audioDownloadUrl) &&
    (meeting?.transcriptionProbeStatus === "failed" || editableLogs.length === 0);
  const transcriptionActionLabel = hasAttemptedTranscription ? "文字起こしを再実行" : "文字起こしを開始";
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
        .map((log) => {
          const text = log.text.trim();
          if (!text) return "";
          return `${log.label || defaultSpeakerName(log.speaker)}: ${text}`;
        })
        .filter(Boolean)
        .join("\n\n"),
    [editableLogs],
  );
  const isAiSummaryRunning = isFreshAiSummaryRunning(meeting, summaryStatusNowMs);

  useEffect(() => {
    if (!isSummaryView || !meeting || summaryGenerationRequestedRef.current) {
      return;
    }

    if (meeting.aiSummary || isAiSummaryRunning || meeting.aiSummaryStatus === "failed") {
      return;
    }

    const transcriptText = exportTranscriptText.trim() || meeting.transcriptionProbeText?.trim() || "";
    if (!transcriptText) {
      return;
    }

    summaryGenerationRequestedRef.current = true;
    void generateAiSummaryInBackground(transcriptText, editableLogs);
  }, [
    editableLogs,
    exportTranscriptText,
    generateAiSummaryInBackground,
    isAiSummaryRunning,
    isSummaryView,
    meeting,
  ]);
  const transcriptFrequentWords = useMemo(() => buildFrequentWords(editableLogs), [editableLogs]);
  const customerFrequentWords = useMemo(
    () => buildFrequentWords(editableLogs.filter((log) => inferConversationSide(log) === "customer")),
    [editableLogs],
  );
  const transcriptFocusWords = useMemo(() => buildTranscriptFocusWords(editableLogs), [editableLogs]);
  const canRunAiSummary = exportTranscriptText.trim().length > 0 || Boolean(meeting?.transcriptionProbeText?.trim());
  const hasStoredAiSummary = Boolean(meeting?.aiSummary);
  const shouldShowAiSummaryLoading =
    isSummaryView &&
    !hasStoredAiSummary &&
    canRunAiSummary &&
    (isAiSummaryRunning || meeting?.aiSummaryStatus !== "failed");
  const shouldShowAiSummaryFailed =
    isSummaryView &&
    !hasStoredAiSummary &&
    meeting?.aiSummaryStatus === "failed" &&
    !shouldShowAiSummaryLoading;
  const shouldShowAiSummaryActions =
    process.env.NODE_ENV !== "production" || shouldShowAiSummaryFailed;
  const meetingFlowSteps = useMemo(
    () =>
      buildMeetingFlowSteps({
        hasTranscript: editableLogs.length > 0,
        hasSummary: hasStoredAiSummary,
        isSummaryView,
        isTranscriptionRunning:
          isTranscribing ||
          meeting?.transcriptionProbeStatus === "running" ||
          meeting?.conversationLogStatus === "running",
        isAiSummaryRunning: shouldShowAiSummaryLoading,
        aiSummaryFailed: shouldShowAiSummaryFailed,
      }),
    [
      editableLogs.length,
      hasStoredAiSummary,
      isSummaryView,
      isTranscribing,
      meeting?.conversationLogStatus,
      meeting?.transcriptionProbeStatus,
      shouldShowAiSummaryFailed,
      shouldShowAiSummaryLoading,
    ],
  );
  const normalizedLogSearch = logSearch.trim().toLowerCase();
  const visibleEditableLogs = useMemo(() => {
    const indexedLogs = editableLogs.map((log, index) => ({ log, index }));
    const speakerFilteredLogs =
      transcriptViewMode === "all"
        ? indexedLogs
        : indexedLogs.filter(({ log }) => log.speaker === transcriptViewMode);

    if (!normalizedLogSearch) {
      return speakerFilteredLogs;
    }

    return speakerFilteredLogs.filter(({ log }) =>
      `${log.label} ${log.text}`.toLowerCase().includes(normalizedLogSearch),
    );
  }, [editableLogs, normalizedLogSearch, transcriptViewMode]);

  function handleJumpToTranscriptLog(log: DisplayLog) {
    const targetIndex = editableLogs.findIndex((item) => item.id === log.id);

    if (targetIndex < 0) {
      return;
    }

    setSelectedTranscriptBlockIndex(targetIndex);
    const target = transcriptBlockRefs.current[targetIndex];
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function handleRegenerateAiSummary() {
    const transcriptText = exportTranscriptText.trim() || meeting?.transcriptionProbeText?.trim() || "";
    if (!transcriptText) {
      setErrorMessage("再分析できる文字起こし本文がありません。");
      return;
    }

    summaryGenerationRequestedRef.current = true;
    void generateAiSummaryInBackground(transcriptText, editableLogs);
  }

  function handleUpdateLogSpeaker(logId: string, speaker: ConversationSpeaker) {
    setEditableLogs((current) =>
      current.map((log) => (log.id === logId ? { ...log, speaker, label: speakerNames[speaker], kind: speaker === "unknown" ? "unknown" : "speech" } : log)),
    );
  }

  function handleToggleLogSelection(logId: string, checked: boolean) {
    setSelectedLogIds((current) => checked ? Array.from(new Set([...current, logId])) : current.filter((id) => id !== logId));
  }

  function handleApplySpeakerToSelected(speaker: ConversationSpeaker) {
    setEditableLogs((current) =>
      current.map((log) =>
        selectedLogIds.includes(log.id)
          ? { ...log, speaker, label: speakerNames[speaker], kind: speaker === "unknown" ? "unknown" : "speech" }
          : log,
      ),
    );
  }

  function handleApplySpeakerPreset(preset: SpeakerPreset) {
    const nextNames: Record<ConversationSpeaker, string> = {
      sales: defaultSpeakerName("sales"),
      customer: defaultSpeakerName("customer"),
      participant: speakerNames.participant || defaultSpeakerName("participant"),
      unknown: speakerNames.unknown || defaultSpeakerName("unknown"),
    };

    setSpeakerNames(nextNames);
    setEditableLogs((current) =>
      current.map((log) => {
        const speakerSlot = detectSpeakerSlot(log);
        const nextSpeaker =
          speakerSlot === "speaker_1"
            ? preset.speaker1
            : speakerSlot === "speaker_2"
              ? preset.speaker2
              : log.speaker;

        return {
          ...log,
          speaker: nextSpeaker,
          label: nextNames[nextSpeaker],
          kind: nextSpeaker === "unknown" ? "unknown" : "speech",
          confidence: "estimated",
        };
      }),
    );
    setErrorMessage("話者1/2を営業/顧客に一括変換しました。保存すると反映されます。");
  }

  function handleSplitLogAtIndex(logId: string, splitIndex: number) {
    setEditableLogs((current) => {
      const index = current.findIndex((log) => log.id === logId);
      const log = current[index];
      if (!log || splitIndex <= 0 || splitIndex >= log.text.length) {
        setErrorMessage("分割できる位置を選択してください。");
        return current;
      }

      const before = log.text.slice(0, splitIndex).trim();
      const after = log.text.slice(splitIndex).trim();
      if (!before || !after) {
        setErrorMessage("分割後のブロックが空にならない位置を選択してください。");
        return current;
      }

      const nextLogs = [
        ...current.slice(0, index),
        { ...log, id: `${log.id}_a_${Date.now()}`, text: before, confidence: "estimated" as const },
        { ...log, id: `${log.id}_b_${Date.now()}`, text: after, confidence: "estimated" as const },
        ...current.slice(index + 1),
      ];
      setManualSplitIndexes((indexes) => {
        const nextIndexes = { ...indexes };
        delete nextIndexes[logId];
        return nextIndexes;
      });
      setErrorMessage("ブロックを分割しました。保存すると反映されます。");
      return nextLogs;
    });
  }

  function handleSelectManualSplitIndex(logId: string) {
    const textarea = logTextAreaRefs.current[logId];
    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const splitIndex = selectionStart === selectionEnd ? selectionStart : selectionEnd;

    setManualSplitIndexes((current) => ({
      ...current,
      [logId]: splitIndex,
    }));
  }

  function handleMergeSelectedLogs() {
    setEditableLogs((current) => {
      const indexes = selectedLogIds
        .map((id) => current.findIndex((log) => log.id === id))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right);

      if (indexes.length < 2 || !areConsecutiveNumbers(indexes)) {
        setErrorMessage("結合する連続ブロックを2件以上選択してください。");
        return current;
      }

      const firstIndex = indexes[0];
      const selectedSet = new Set(indexes);
      const selectedLogs = indexes.map((index) => current[index]);
      const merged: DisplayLog = {
        ...selectedLogs[0],
        id: `merged_${Date.now()}`,
        text: selectedLogs.map((log) => log.text.trim()).filter(Boolean).join("\n"),
        endSec: selectedLogs[selectedLogs.length - 1].endSec ?? selectedLogs[0].endSec ?? null,
        confidence: "estimated",
      };

      setSelectedLogIds([]);
      setErrorMessage("ブロックを結合しました。保存すると反映されます。");
      return current.flatMap((log, index) => {
        if (index === firstIndex) return [merged];
        return selectedSet.has(index) ? [] : [log];
      });
    });
  }

  async function handleSaveConversationEdits() {
    if (!meeting) return;
    const cleanedLogs = editableLogs
      .map((log, index) => mapDisplayLogToConversationLog(log, index, speakerNames))
      .filter((log) => log.text.trim());
    const transcriptText = cleanedLogs
      .map((log) => `${log.label || defaultSpeakerName(normalizeEditableSpeaker(log.speaker))}: ${log.text.trim()}`)
      .filter(Boolean)
      .join("\n\n");

    setIsSavingConversationLogs(true);
    setErrorMessage(null);
    try {
      await saveMeetingConversationLogs(meetingId, {
        status: "completed",
        model: "manual-edit",
        logs: cleanedLogs,
        error: null,
        processingStatus: "uploaded",
      });
      summaryGenerationRequestedRef.current = true;
      void generateAiSummaryInBackground(transcriptText || exportTranscriptText.trim() || meeting.transcriptionProbeText?.trim() || "", editableLogs);
      router.push(`/meetings/${meetingId}/summary`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "会話ブロックの保存に失敗しました。");
    } finally {
      setIsSavingConversationLogs(false);
    }
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
    visibleEditableLogs,
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

        <MeetingFlowProgress steps={meetingFlowSteps} />

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
            {shouldShowAiSummaryActions ? (
              <button
                type="button"
                onClick={handleRegenerateAiSummary}
                disabled={!canRunAiSummary || isAiSummaryRunning}
                className={`relative inline-flex h-11 items-center justify-center overflow-hidden rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 text-[13px] font-black text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#ffcf33] disabled:cursor-not-allowed ${isAiSummaryRunning ? "ai-summary-regenerate-active" : "disabled:opacity-50"}`}
              >
                <span className="relative z-10">{isAiSummaryRunning ? "分析中..." : "再分析実行"}</span>
              </button>
            ) : null}
          </div>

          {shouldShowAiSummaryLoading ? (
            <AiSummaryLoadingState />
          ) : shouldShowAiSummaryFailed ? (
            <AiSummaryFailedState message={meeting.aiSummaryError ?? "AIサマリーの生成に失敗しました。"} />
          ) : hasStoredAiSummary ? (
          <>
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
              />
              <TemperatureSummaryCard
                title="温度感"
                stars={temperatureSummary.stars}
                description={temperatureSummary.description}
              />
              <ConsiderationSummaryCard
                title="検討度"
                score={considerationSummary.score}
                description={considerationSummary.description}
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

          {aiSummary.manualCompliance?.mode === "manual" ? (
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
              <EvidenceInsightCard title="顧客の課題" icon={<IssueGlyph />} bullets={analysisPanels.issues} />
              <EvidenceInsightCard title="顧客の要望" icon={<InterestGlyph />} bullets={analysisPanels.requests} />
              <EvidenceInsightCard title="顧客の不安・懸念" icon={<ConcernGlyph />} bullets={analysisPanels.concerns} />
              <ActionInsightCard actions={analysisPanels.actions} mentionedNextDate={mentionedNextDate} />
            </div>
          </article>

          <TranscriptAnalysisInsightSection
            frequentWords={transcriptFrequentWords}
            customerFrequentWords={customerFrequentWords}
            focusWords={transcriptFocusWords}
            onJumpToLog={handleJumpToTranscriptLog}
          />

          <article className="mt-5 rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
            <div className="text-[18px] font-bold text-[#171717]">AIからのフィードバック</div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <FeedbackInsightCard
                title="良かった点"
                tone="positive"
                bullets={buildFeedbackBullets(aiScorecards, "positive")}
              />
              <FeedbackInsightCard
                title="改善ポイント"
                tone="warning"
                bullets={buildFeedbackBullets(aiScorecards, "warning")}
              />
              <FeedbackInsightCard
                title="次回意識すること"
                tone="info"
                bullets={buildFeedbackBullets(aiScorecards, "next")}
              />
            </div>
          </article>

          <div className="mt-5 rounded-[18px] border border-[#eceef4] bg-[#fffaf0] px-5 py-4 text-[14px] leading-7 text-[#6f6250]">
            この分析は文字起こしデータをもとにAIが自動で生成しています。誤りが含まれる可能性があるため、重要な判断は必ずご自身でご確認ください。
          </div>
          </>
          ) : (
            <AiSummaryEmptyState />
          )}
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
                  label={isTranscribing ? "文字起こし中..." : transcriptionActionLabel}
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
                    <option value="all">すべての話者</option>
                    <option value="sales">営業のみ</option>
                    <option value="customer">顧客のみ</option>
                    <option value="participant">同席者のみ</option>
                    <option value="unknown">不明のみ</option>
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
                ) : editableLogs.length > 0 ? (
                  <>
                    <div className="mb-3 rounded-[18px] border border-[#eceef4] bg-[#fcfcfd] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-black text-[#171717]">
                            {isTranscriptEditMode ? "会話ブロック修正" : "文字起こし"}
                          </div>
                          <div className="mt-1 text-[12px] font-medium text-[#8a909b]">
                          {isTranscriptEditMode
                              ? "文字起こし本文は編集できません。話者変更・分割・結合だけ修正できます。"
                              : "AIが分割した会話ブロックと話者を確認できます。"}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isTranscriptEditMode ? (
                            <>
                              <button type="button" onClick={() => setIsTranscriptEditMode(false)} className="rounded-[12px] border border-[#e4e8ef] bg-white px-4 py-2.5 text-[13px] font-black text-[#596273]">
                                キャンセル
                              </button>
                              <button type="button" onClick={() => void handleSaveConversationEdits()} disabled={isSavingConversationLogs} className="rounded-[12px] border border-[#171717] bg-[#171717] px-4 py-2.5 text-[13px] font-black text-white disabled:opacity-60">
                                {isSavingConversationLogs ? "保存中..." : "保存してAI分析へ"}
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setIsTranscriptEditMode(true)} className="rounded-[12px] border border-[#f0c655] bg-[#ffd84d] px-4 py-2.5 text-[13px] font-black text-[#171717]">
                              修正する
                            </button>
                          )}
                        </div>
                      </div>

                      {isTranscriptEditMode && selectedLogIds.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#f0e3c1] bg-[#fffaf0] px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#171717] px-3 py-1 text-[12px] font-black text-white">{selectedLogIds.length}件選択中</span>
                            <button type="button" onClick={handleMergeSelectedLogs} disabled={selectedLogIds.length < 2} className="rounded-[10px] border border-[#171717] bg-white px-3 py-1.5 text-[12px] font-black text-[#171717] disabled:opacity-40">結合</button>
                            <button type="button" onClick={() => setSelectedLogIds([])} className="rounded-[10px] border border-[#e4e8ef] bg-white px-3 py-1.5 text-[12px] font-bold text-[#596273]">解除</button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {conversationSpeakerOptions.map((option) => (
                              <button
                                key={`bulk-${option.value}`}
                                type="button"
                                onClick={() => handleApplySpeakerToSelected(option.value)}
                                className="rounded-[10px] border border-[#ead8a8] bg-white px-3 py-1.5 text-[12px] font-black text-[#6f5500]"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : isTranscriptEditMode ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-bold text-[#8a909b]">
                          <button type="button" onClick={() => setSelectedLogIds(visibleEditableLogs.map(({ log }) => log.id))} className="rounded-[10px] border border-[#e4e8ef] bg-white px-3 py-1.5 text-[12px] font-bold text-[#596273]">
                            表示中を選択
                          </button>
                          <span>複数選択すると、話者変更と結合ができます。</span>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {conversationSpeakerOptions.map((option) => {
                            const count = editableLogs.filter((log) => log.speaker === option.value).length;
                            if (count === 0) return null;
                            return (
                              <span key={`summary-${option.value}`} className="rounded-full border border-[#e4e8ef] bg-white px-3 py-1 text-[12px] font-bold text-[#596273]">
                                {speakerNames[option.value]} {count}件
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="relative min-h-0 flex-1">
                    <div
                      ref={transcriptScrollRef}
                      className="always-visible-scrollbar min-h-0 h-full space-y-3 overflow-y-scroll pr-6"
                    >
                      {visibleEditableLogs.length > 0 ? (
                        visibleEditableLogs.map(({ log, index }) => (
                        <article
                          key={log.id}
                          ref={(node) => {
                            transcriptBlockRefs.current[index] = node;
                          }}
                          className={`rounded-[18px] border p-3 shadow-[0_3px_10px_rgba(17,24,39,0.03)] transition ${
                            isTranscriptEditMode ? "grid gap-3 md:grid-cols-[132px_1fr]" : ""
                          } ${
                            selectedLogIds.includes(log.id)
                              ? "border-[#f0c655] bg-[#fffaf0]"
                              : selectedTranscriptBlockIndex === index
                                ? "border-[#171717] bg-[#f8fafc] shadow-[0_8px_22px_rgba(17,24,39,0.08)]"
                                : "border-[#eceef4] bg-white"
                          }`}
                        >
                          {isTranscriptEditMode ? (
                            <div className="flex flex-col gap-3 rounded-[14px] bg-[#fcfcfd] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-black tracking-[0.12em] text-[#8a909b]">{String(index + 1).padStart(3, "0")}</span>
                                <input
                                  type="checkbox"
                                  checked={selectedLogIds.includes(log.id)}
                                  onChange={(event) => handleToggleLogSelection(log.id, event.target.checked)}
                                  className="h-4 w-4 accent-[#ffcf33]"
                                />
                              </div>
                              <select
                                value={log.speaker}
                                onChange={(event) => handleUpdateLogSpeaker(log.id, event.target.value as ConversationSpeaker)}
                                className="h-10 w-full appearance-none rounded-[12px] border border-[#ead8a8] bg-[#fff7db] px-3 text-[13px] font-black text-[#6f5500] outline-none"
                              >
                                {conversationSpeakerOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{speakerNames[option.value]}</option>
                                ))}
                              </select>
                              <div className="text-[11px] font-bold leading-5 text-[#9aa1ac]">
                                {log.confidence === "aligned" ? "話者分離あり" : "推定/編集"}
                              </div>
                            </div>
                          ) : null}
                          <div className="min-w-0">
                            {isTranscriptEditMode ? (
                              <>
                                <textarea
                                  ref={(node) => {
                                    logTextAreaRefs.current[log.id] = node;
                                  }}
                                  value={log.text}
                                  readOnly
                                  onClick={() => handleSelectManualSplitIndex(log.id)}
                                  onKeyUp={() => handleSelectManualSplitIndex(log.id)}
                                  onSelect={() => handleSelectManualSplitIndex(log.id)}
                                  className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-[15px] font-medium leading-8 text-[#171717] outline-none focus:border-[#e0bd4b] focus:bg-white"
                                  spellCheck={false}
                                  aria-label="編集不可の文字起こし本文"
                                />
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {conversationSpeakerOptions.map((option) => (
                                      <button
                                        key={`${log.id}-${option.value}`}
                                        type="button"
                                        onClick={() => handleUpdateLogSpeaker(log.id, option.value)}
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${
                                          log.speaker === option.value
                                            ? "bg-[#ffcf33] text-[#5f4700]"
                                            : "bg-[#f4f6f9] text-[#8a909b] hover:bg-[#fff4d6] hover:text-[#6f5500]"
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <SplitCandidateButtons
                                  log={log}
                                  manualSplitIndex={manualSplitIndexes[log.id] ?? null}
                                  onSplit={(splitIndex) => handleSplitLogAtIndex(log.id, splitIndex)}
                                />
                              </>
                            ) : (
                              <div className="rounded-[14px] bg-white px-4 py-3">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-black tracking-[0.12em] text-[#b4bac5]">{String(index + 1).padStart(3, "0")}</span>
                                  <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[12px] font-black text-[#7a5a00]">
                                    {log.label || speakerNames[log.speaker]}
                                  </span>
                                </div>
                                <p className="text-[15px] font-medium leading-8 text-[#171717]">
                                  {renderHighlightedText(log.text, logSearch)}
                                </p>
                              </div>
                            )}
                          </div>
                        </article>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-[#d9dee7] bg-[#fcfcfd] px-5 py-10 text-[14px] leading-7 text-[#7a808c]">
                          該当する会話ブロックがありません。
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
                  <div className="flex h-full flex-col items-center justify-center rounded-[22px] border border-dashed border-[#d9dee7] bg-[#fcfcfd] px-6 py-16 text-center">
                    <div className="text-[16px] font-bold text-[#171717]">
                      まだ表示できる文字起こし本文がありません
                    </div>
                    <p className="mt-3 max-w-[520px] text-[14px] leading-7 text-[#7a808c]">
                      音声ファイルの保存は完了しています。文字起こしを開始すると、本文とAI分析の準備が進みます。
                    </p>
                    {shouldShowTranscriptionRetry ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleRunTranscription();
                        }}
                        disabled={isTranscribing}
                        className="mt-6 inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#ffc400] px-5 text-[14px] font-black text-[#171717] shadow-[0_10px_20px_rgba(255,196,0,0.22)] transition hover:bg-[#f5bd07] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <SparkGlyph />
                        {transcriptionActionLabel}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <aside className="flex h-[760px] flex-col gap-4">
              <SpeakerManagementPanel
                logs={editableLogs}
                speakerNames={speakerNames}
                onApplySpeakerPreset={handleApplySpeakerPreset}
                onChangeSpeakerName={(speaker, name) => {
                  const nextName = name.trim() || defaultSpeakerName(speaker);
                  setSpeakerNames((current) => ({ ...current, [speaker]: nextName }));
                  setEditableLogs((current) => current.map((log) => (log.speaker === speaker ? { ...log, label: nextName } : log)));
                }}
              />

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
    speaker: normalizeEditableSpeaker(log.speaker),
    label: log.label || defaultSpeakerName(normalizeEditableSpeaker(log.speaker)),
    text: log.text,
    confidence: log.confidence,
    kind: log.kind ?? (log.speaker === "unknown" ? "unknown" : "speech"),
  };
}

const conversationSpeakerOptions: Array<{ value: ConversationSpeaker; label: string }> = [
  { value: "sales", label: "営業" },
  { value: "customer", label: "顧客" },
  { value: "participant", label: "同席者" },
  { value: "unknown", label: "不明" },
];

function SpeakerManagementPanel({
  logs,
  speakerNames,
  onApplySpeakerPreset,
  onChangeSpeakerName,
}: {
  logs: DisplayLog[];
  speakerNames: Record<ConversationSpeaker, string>;
  onApplySpeakerPreset: (preset: SpeakerPreset) => void;
  onChangeSpeakerName: (speaker: ConversationSpeaker, name: string) => void;
}) {
  return (
    <section className="rounded-[20px] border border-[#eceef4] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-black text-[#171717]">話者管理</h3>
        <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-[11px] font-black text-[#8a6500]">{logs.length}ブロック</span>
      </div>
      <div className="mt-3 rounded-[14px] border border-[#f4e2a4] bg-[#fffaf0] px-3 py-3">
        <div className="text-[12px] font-black text-[#7a5a00]">話者1/2を一括変換</div>
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={() => onApplySpeakerPreset({ speaker1: "sales", speaker2: "customer" })}
            className="rounded-[10px] border border-[#ead8a8] bg-white px-3 py-2 text-left text-[12px] font-black text-[#5f4700] transition hover:border-[#e0bd4b] hover:bg-[#fff4d6]"
          >
            話者1 = 営業 / 話者2 = 顧客
          </button>
          <button
            type="button"
            onClick={() => onApplySpeakerPreset({ speaker1: "customer", speaker2: "sales" })}
            className="rounded-[10px] border border-[#ead8a8] bg-white px-3 py-2 text-left text-[12px] font-black text-[#5f4700] transition hover:border-[#e0bd4b] hover:bg-[#fff4d6]"
          >
            話者1 = 顧客 / 話者2 = 営業
          </button>
        </div>
        <p className="mt-2 text-[11px] font-bold leading-5 text-[#9a7a1f]">変換後、保存するとAI分析にも反映されます。</p>
      </div>
      <div className="mt-3 space-y-3">
        {conversationSpeakerOptions.map((option) => {
          const count = logs.filter((log) => log.speaker === option.value).length;
          return (
            <div key={option.value} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <input
                  value={speakerNames[option.value]}
                  onChange={(event) => onChangeSpeakerName(option.value, event.target.value)}
                  className="min-w-0 flex-1 rounded-[10px] border border-[#e4e8ef] bg-white px-3 py-2 text-[13px] font-black text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  aria-label={`${option.label}の表示名`}
                />
                <span className="shrink-0 text-[12px] font-bold text-[#8a909b]">発言数: {count}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AiSummaryLoadingState() {
  return (
    <div className="mt-4 flex min-h-[560px] items-center justify-center rounded-[24px] border border-[#f4e2a4] bg-[#fffaf0] px-6 py-16 text-center">
      <div className="max-w-[520px]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ffd84d] shadow-[0_14px_30px_rgba(245,189,7,0.22)]">
          <SparkGlyph />
        </div>
        <h3 className="mt-6 text-[20px] font-black text-[#171717]">AIサマリーを分析中です</h3>
        <p className="mt-3 text-[14px] font-medium leading-7 text-[#7a6a35]">
          文字起こし本文と話者別ログをもとに、要点・温度感・改善ポイントを整理しています。
        </p>
        <div className="mx-auto mt-7 h-2 max-w-[360px] overflow-hidden rounded-full bg-white">
          <div className="ai-summary-regenerate-active h-full w-2/3 rounded-full bg-[#ffd84d]" />
        </div>
      </div>
    </div>
  );
}

function AiSummaryFailedState({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-[24px] border border-[#ffd8cc] bg-[#fff4ef] px-6 py-12 text-center">
      <h3 className="text-[18px] font-black text-[#171717]">AIサマリーを生成できませんでした</h3>
      <p className="mx-auto mt-3 max-w-[620px] text-[14px] font-medium leading-7 text-[#b54a35]">{message}</p>
    </div>
  );
}

function AiSummaryEmptyState() {
  return (
    <div className="mt-4 rounded-[24px] border border-dashed border-[#d9dee7] bg-[#fcfcfd] px-6 py-12 text-center">
      <h3 className="text-[18px] font-black text-[#171717]">分析できる文字起こし本文がありません</h3>
      <p className="mx-auto mt-3 max-w-[620px] text-[14px] font-medium leading-7 text-[#7a808c]">
        文字起こし本文が生成されると、AIサマリーを分析できます。
      </p>
    </div>
  );
}

function MeetingFlowProgress({ steps }: { steps: MeetingFlowStep[] }) {
  return (
    <section className="mb-5 rounded-[22px] border border-[#eceef4] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(17,24,39,0.04)] md:px-5">
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isFailed = step.status === "failed";
          return (
            <div
              key={step.label}
              className={`relative rounded-[16px] border px-4 py-3 ${
                isFailed
                  ? "border-[#ffd8cc] bg-[#fff4ef]"
                  : isCurrent
                    ? "border-[#f0c655] bg-[#fffaf0]"
                    : isCompleted
                      ? "border-[#dbeee2] bg-[#f4fbf6]"
                      : "border-[#eef1f5] bg-[#fcfcfd]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
                    isFailed
                      ? "bg-[#d94832] text-white"
                      : isCompleted
                        ? "bg-[#24a15a] text-white"
                        : isCurrent
                          ? "bg-[#ffd84d] text-[#5f4700]"
                          : "bg-[#e9edf3] text-[#8a909b]"
                  }`}
                >
                  {isCompleted ? "✓" : isFailed ? "!" : index + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-[#171717]">{step.label}</div>
                  <div className="mt-1 text-[11px] font-bold leading-5 text-[#7a808c]">{step.description}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SplitCandidateButtons({
  log,
  manualSplitIndex,
  onSplit,
}: {
  log: DisplayLog;
  manualSplitIndex: number | null;
  onSplit: (splitIndex: number) => void;
}) {
  const candidates = buildSplitCandidates(log.text).slice(0, 8);
  const canSplitManually =
    typeof manualSplitIndex === "number" &&
    manualSplitIndex > 0 &&
    manualSplitIndex < log.text.length &&
    Boolean(log.text.slice(0, manualSplitIndex).trim()) &&
    Boolean(log.text.slice(manualSplitIndex).trim());
  const manualPreview = canSplitManually
    ? buildSplitPreview(log.text, manualSplitIndex)
    : "本文内の区切りたい位置をクリックしてから押してください。";

  return (
    <div className="mt-2 rounded-[12px] border border-[#eef1f5] bg-[#fcfcfd] px-3 py-2">
      <div className="text-[11px] font-black text-[#8a909b]">分割位置</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (typeof manualSplitIndex === "number") {
              onSplit(manualSplitIndex);
            }
          }}
          disabled={!canSplitManually}
          className="rounded-full border border-[#171717] bg-[#171717] px-3 py-1.5 text-[12px] font-black text-white transition hover:bg-[#2a2d33] disabled:cursor-not-allowed disabled:border-[#d8dde6] disabled:bg-[#eef1f5] disabled:text-[#9aa1ac]"
          title={manualPreview}
        >
          選択位置で分割
        </button>
        {candidates.map((candidate, index) => (
          <button
            key={`${log.id}_${candidate.index}`}
            type="button"
            onClick={() => onSplit(candidate.index)}
            className="rounded-full border border-[#ead8a8] bg-white px-3 py-1.5 text-[12px] font-black text-[#6f5500] transition hover:border-[#e0bd4b] hover:bg-[#fff7db]"
            title={candidate.preview}
          >
            自動候補 {index + 1}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] font-bold leading-5 text-[#9aa1ac]">
        {canSplitManually
          ? `選択位置: ${manualPreview}`
          : candidates.length === 0
            ? "自動候補はありません。本文内の区切りたい位置をクリックすると手動分割できます。"
            : "本文内をクリックすると、任意の位置でも分割できます。"}
      </div>
    </div>
  );
}

function buildSplitPreview(text: string, splitIndex: number) {
  const before = text.slice(0, splitIndex).trim();
  const after = text.slice(splitIndex).trim();

  return `${before.slice(-24)} / ${after.slice(0, 24)}`;
}

function mapDisplayLogToConversationLog(
  log: DisplayLog,
  index: number,
  speakerNames: Record<ConversationSpeaker, string>,
): NonNullable<MeetingRecord["conversationLogs"]>[number] {
  return {
    id: `log_${String(index + 1).padStart(3, "0")}`,
    speaker: log.speaker,
    label: speakerNames[log.speaker] || defaultSpeakerName(log.speaker),
    text: log.text.trim(),
    sourceSegmentIndexes: [],
    confidence: log.confidence,
    kind: log.kind,
  };
}

function normalizeEditableSpeaker(value: unknown): ConversationSpeaker {
  if (value === "sales" || value === "speaker_1") return "sales";
  if (value === "customer" || value === "speaker_2") return "customer";
  if (value === "participant") return "participant";
  return "unknown";
}

function detectSpeakerSlot(log: DisplayLog): "speaker_1" | "speaker_2" | null {
  const normalizedLabel = normalizeSpeakerSlotText(log.label);
  if (normalizedLabel === "speaker1" || normalizedLabel === "話者1") return "speaker_1";
  if (normalizedLabel === "speaker2" || normalizedLabel === "話者2") return "speaker_2";
  if (log.speaker === "sales") return "speaker_1";
  if (log.speaker === "customer") return "speaker_2";
  return null;
}

function normalizeSpeakerSlotText(value: string) {
  return value.trim().toLowerCase().replace(/[\s＿_\-ー:：]/g, "");
}

function defaultSpeakerName(speaker: ConversationSpeaker) {
  if (speaker === "sales") return "営業";
  if (speaker === "customer") return "顧客";
  if (speaker === "participant") return "同席者";
  return "不明";
}

function buildSalesSpeakerName(name: string | null | undefined) {
  const normalizedName = (name ?? "").trim().replace(/\s+/g, " ");
  if (!normalizedName) {
    return defaultSpeakerName("sales");
  }

  return normalizedName.split(" ")[0] || defaultSpeakerName("sales");
}

function buildSplitCandidates(text: string) {
  const candidates: Array<{ index: number; preview: string }> = [];
  const seenIndexes = new Set<number>();
  const normalizedText = text.trim();

  if (normalizedText.length < 12) {
    return candidates;
  }

  const boundaryPattern = /[。！？!?]\s*|\n+/g;
  let match: RegExpExecArray | null;

  while ((match = boundaryPattern.exec(text)) !== null) {
    const index = match.index + match[0].length;
    const before = text.slice(0, index).trim();
    const after = text.slice(index).trim();

    if (before.length < 4 || after.length < 4 || seenIndexes.has(index)) {
      continue;
    }

    seenIndexes.add(index);
    candidates.push({
      index,
      preview: `${before.slice(-24)} / ${after.slice(0, 24)}`,
    });
  }

  return candidates;
}

function deriveSpeakerNamesFromLogs(logs: DisplayLog[]) {
  const names: Partial<Record<ConversationSpeaker, string>> = {};
  for (const log of logs) {
    if (!names[log.speaker] && log.label && log.label !== defaultSpeakerName(log.speaker)) {
      names[log.speaker] = log.label;
    }
  }
  return names;
}

function areConsecutiveNumbers(values: number[]) {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function buildConversationLogsFromSegments(
  segments: Array<{ startSec: number; endSec: number; text: string; speaker?: string | null }>,
): NonNullable<MeetingRecord["conversationLogs"]> {
  const speakerMap = new Map<string, ConversationSpeaker>();
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
  speakerMap?: Map<string, ConversationSpeaker>,
  nextSpeakerIndex?: () => number,
): ConversationSpeaker {
  if (rawSpeaker === "sales" || rawSpeaker === "customer" || rawSpeaker === "participant" || rawSpeaker === "unknown") {
    return rawSpeaker;
  }

  if (rawSpeaker === "speaker_1") {
    return "sales";
  }

  if (rawSpeaker === "speaker_2") {
    return "customer";
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
    speakerMap.set(normalizedKey, "sales");
    return "sales";
  }

  if (index === 2) {
    speakerMap.set(normalizedKey, "customer");
    return "customer";
  }

  return "unknown";
}

function buildSpeakerLabel(speaker: ConversationSpeaker) {
  return defaultSpeakerName(speaker);
}

function buildMeetingFlowSteps({
  hasTranscript,
  hasSummary,
  isSummaryView,
  isTranscriptionRunning,
  isAiSummaryRunning,
  aiSummaryFailed,
}: {
  hasTranscript: boolean;
  hasSummary: boolean;
  isSummaryView: boolean;
  isTranscriptionRunning: boolean;
  isAiSummaryRunning: boolean;
  aiSummaryFailed: boolean;
}): MeetingFlowStep[] {
  const transcriptionStatus: FlowStepStatus = hasTranscript
    ? "completed"
    : isTranscriptionRunning
      ? "current"
      : "pending";
  const speakerStatus: FlowStepStatus = hasSummary || isAiSummaryRunning || isSummaryView
    ? "completed"
    : hasTranscript
      ? "current"
      : "pending";
  const analysisStatus: FlowStepStatus = hasSummary
    ? "completed"
    : aiSummaryFailed
      ? "failed"
      : isAiSummaryRunning
        ? "current"
        : "pending";

  return [
    {
      label: "アップロード",
      description: "音声または本文の保存完了",
      status: "completed",
    },
    {
      label: "文字起こし",
      description: hasTranscript ? "本文を確認できます" : isTranscriptionRunning ? "音声を解析中です" : "処理開始を待っています",
      status: transcriptionStatus,
    },
    {
      label: "話者確認",
      description: speakerStatus === "current" ? "営業/顧客を確認して保存" : speakerStatus === "completed" ? "確認済み" : "文字起こし後に確認",
      status: speakerStatus,
    },
    {
      label: "AI分析",
      description: hasSummary ? "分析結果を表示中" : aiSummaryFailed ? "再分析できます" : isAiSummaryRunning ? "サマリーを生成中です" : "話者保存後に開始",
      status: analysisStatus,
    },
  ];
}

function isFreshAiSummaryRunning(meeting: MeetingRecord | null | undefined, nowMs: number) {
  if (meeting?.aiSummaryStatus !== "running") {
    return false;
  }

  if (!meeting.aiSummaryTestedAt) {
    return false;
  }

  return nowMs - meeting.aiSummaryTestedAt.getTime() < aiSummaryRunningFreshMs;
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
}: {
  title: string;
  label: string;
  description: string;
  tone: "positive" | "warning" | "neutral";
}) {
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
    </article>
  );
}

function TemperatureSummaryCard({
  title,
  stars,
  description,
}: {
  title: string;
  stars: number;
  description: string;
}) {
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
    </article>
  );
}

function ConsiderationSummaryCard({
  title,
  score,
  description,
}: {
  title: string;
  score: number;
  description: string;
}) {
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
  const visibleScore = getVisibleManualComplianceScore(compliance);

  return (
    <article className="mt-5 rounded-[24px] border border-[#f0e3c1] bg-[#fffaf0] p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-bold text-[#171717]">
              会社基準に沿った改善ポイント
            </h3>
            <span className="rounded-full border border-[#f0d992] bg-white px-3 py-1 text-[12px] font-bold text-[#8a6500]">
              会社基準: 適用済み
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[#6f6250]">
            {manualDescription}
          </p>
        </div>
        <div className="rounded-[18px] border border-[#f0d992] bg-white px-5 py-4 text-center">
          <div className="text-[12px] font-bold text-[#8a909b]">準拠スコア</div>
          <div className="mt-1 text-[28px] font-black text-[#171717]">
            {visibleScore === null ? "-" : visibleScore}
            {visibleScore === null ? null : <span className="ml-1 text-[14px] font-bold text-[#8a909b]">点</span>}
          </div>
          {compliance.checklistItems && compliance.checklistItems.length > 0 ? (
            <ManualScoreBreakdown items={compliance.checklistItems} />
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        {compliance.checklistItems && compliance.checklistItems.length > 0 ? (
          <ManualChecklistPanel items={compliance.checklistItems} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <ManualComplianceList title="できていた基準" items={compliance.matchedCriteria} tone="passed" />
            <ManualComplianceList title="次に直す基準" items={compliance.missingCriteria} tone="missing" />
          </div>
        )}
      </div>
    </article>
  );
}

function getVisibleManualComplianceScore(
  compliance: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["manualCompliance"]>,
) {
  const impactScore = calculateScoreFromImpacts(compliance.checklistItems);
  if (impactScore !== null) {
    return impactScore;
  }

  if (typeof compliance.score === "number" && Number.isFinite(compliance.score)) {
    return compliance.score;
  }

  const matchedCount = compliance.matchedCriteria.length;
  const missingCount = compliance.missingCriteria.length;
  const total = matchedCount + missingCount;
  if (total <= 0) return null;

  return Math.round((matchedCount / total) * 100);
}

function calculateScoreFromImpacts(
  items: NonNullable<NonNullable<MeetingRecord["aiSummary"]>["manualCompliance"]>["checklistItems"] | undefined,
) {
  if (!items || items.length === 0) return null;

  const positive = items.reduce((sum, item) => sum + Math.max(item.scoreImpact ?? 0, 0), 0);
  const negative = items.reduce((sum, item) => sum + Math.min(item.scoreImpact ?? 0, 0), 0);
  if (positive <= 0) return null;

  return Math.min(100, Math.max(0, Math.round(((positive + negative) / positive) * 100)));
}

function ManualChecklistPanel({
  items,
}: {
  items: NonNullable<NonNullable<NonNullable<MeetingRecord["aiSummary"]>["manualCompliance"]>["checklistItems"]>;
}) {
  return (
    <div className="rounded-[18px] border border-[#f0e3c1] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-black text-[#171717]">マニュアルチェック</div>
          <div className="mt-1 text-[12px] font-bold text-[#8a909b]">登録項目ごとに、文字起こし内容を当てはめています。</div>
        </div>
        <div className="text-[12px] font-bold text-[#8a909b]">
          {items.filter((item) => item.status === "done").length} / {items.length}
        </div>
      </div>
      <div className="mt-4 max-h-[460px] overflow-y-auto pr-1">
        <div className="divide-y divide-[#f3ead4]">
          {items.map((item) => {
            const isDone = item.status === "done";
            return (
              <div key={`${item.category}-${item.label}`} className="grid gap-3 py-3 md:grid-cols-[140px_1fr_72px_96px] md:items-start">
                <span className="w-fit rounded-full border border-[#f0e3c1] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-black text-[#8a6500]">
                  {item.category}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold leading-5 text-[#171717]">{item.label}</div>
                  {item.reason ? <div className="mt-1 text-[12px] leading-5 text-[#7a808c]">{item.reason}</div> : null}
                </div>
                <span className={`text-[12px] font-black ${typeof item.scoreImpact === "number" ? item.scoreImpact >= 0 ? "text-[#15803d]" : "text-[#d63c2f]" : "text-[#a1a7b3]"}`}>
                  {formatScoreImpact(item.scoreImpact)}
                </span>
                <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[11px] font-black ${isDone ? "bg-[#eaf8ef] text-[#15803d]" : "bg-[#fff0ed] text-[#d63c2f]"}`}>
                  {isDone ? "できている" : "要改善"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ManualScoreBreakdown({
  items,
}: {
  items: NonNullable<NonNullable<NonNullable<MeetingRecord["aiSummary"]>["manualCompliance"]>["checklistItems"]>;
}) {
  const doneCount = items.filter((item) => item.status === "done").length;
  const positive = items.reduce((sum, item) => sum + Math.max(item.scoreImpact ?? 0, 0), 0);
  const negative = items.reduce((sum, item) => sum + Math.min(item.scoreImpact ?? 0, 0), 0);
  const hasImpacts = items.some((item) => typeof item.scoreImpact === "number" && item.scoreImpact !== 0);

  return (
    <div className="mt-3 border-t border-[#f0e3c1] pt-3 text-left">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] font-bold text-[#8a909b]">達成</div>
          <div className="mt-0.5 text-[12px] font-black text-[#171717]">{doneCount}/{items.length}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-[#8a909b]">加点</div>
          <div className="mt-0.5 text-[12px] font-black text-[#15803d]">{hasImpacts ? `+${positive}` : "-"}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-[#8a909b]">減点</div>
          <div className="mt-0.5 text-[12px] font-black text-[#d63c2f]">{hasImpacts ? negative : "-"}</div>
        </div>
      </div>
    </div>
  );
}

function formatScoreImpact(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "-";
  return value > 0 ? `+${value}` : `${value}`;
}

function ManualComplianceList({ title, items, tone = "normal" }: { title: string; items: string[]; tone?: "passed" | "missing" | "normal" }) {
  const marker = tone === "passed" ? "✓" : tone === "missing" ? "!" : "•";
  const markerClass = tone === "passed" ? "bg-[#17a34a] text-white" : tone === "missing" ? "bg-[#fff0ed] text-[#d63c2f]" : "bg-[#fff3cf] text-[#8a6500]";
  return (
    <div className="rounded-[18px] border border-[#f0e3c1] bg-white p-4">
      <div className="text-[13px] font-bold text-[#8a6500]">{title}</div>
      <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[#343b48]">
        {(items.length > 0 ? items : ["未検出"]).map((item) => (
          <li key={item} className="flex gap-2">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${markerClass}`}>{marker}</span>
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
  variant,
}: {
  title: string;
  value: string;
  unit?: string;
  color: string;
  description: string;
  variant: "ring" | "stars" | "gauge" | "heat";
}) {
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
    </article>
  );
}

function EvidenceInsightCard({
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

function TranscriptAnalysisInsightSection({
  frequentWords,
  customerFrequentWords,
  focusWords,
  onJumpToLog,
}: {
  frequentWords: Array<{ term: string; count: number }>;
  customerFrequentWords: Array<{ term: string; count: number }>;
  focusWords: TranscriptFocusWordCategory[];
  onJumpToLog: (log: DisplayLog) => void;
}) {
  const flatFocusWords = focusWords.flatMap((category) =>
    category.words.map((word) => ({
      ...word,
      categoryTitle: category.title,
    })),
  );

  return (
    <article className="mt-5 rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[18px] font-bold text-[#171717]">文字起こしインサイト</div>
          <div className="mt-2 text-[13px] leading-6 text-[#7a808c]">
            確定した会話ブロックから、分析時に確認したい言葉をまとめています。
          </div>
        </div>
        <span className="rounded-full border border-[#f0dfb0] bg-[#fff6dc] px-3 py-1 text-[12px] font-bold text-[#7a6330]">
          AI分析ページ
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <section className="rounded-[18px] border border-[#eceef4] bg-[#fcfcfd] p-4">
          <div className="text-[14px] font-bold text-[#171717]">頻出ワード</div>
          <div className="mt-4 space-y-2">
            {frequentWords.length > 0 ? (
              frequentWords.slice(0, 8).map((word, index) => (
                <div key={word.term} className="flex items-center justify-between gap-3 rounded-[12px] bg-white px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-[11px] font-bold text-[#b08a00]">{index + 1}</span>
                    <span className="truncate text-[13px] font-semibold text-[#343b48]">{word.term}</span>
                  </div>
                  <span className="shrink-0 text-[12px] font-bold text-[#8a909b]">{word.count}回</span>
                </div>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#d9dee7] px-3 py-5 text-[13px] leading-6 text-[#7a808c]">
                文字起こし生成後に表示します。
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[18px] border border-[#eceef4] bg-[#fcfcfd] p-4">
          <div className="text-[14px] font-bold text-[#171717]">顧客側の頻出ワード</div>
          <div className="mt-4 space-y-2">
            {customerFrequentWords.length > 0 ? (
              customerFrequentWords.slice(0, 8).map((word, index) => (
                <div key={word.term} className="flex items-center justify-between gap-3 rounded-[12px] bg-white px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-[11px] font-bold text-[#b08a00]">{index + 1}</span>
                    <span className="truncate text-[13px] font-semibold text-[#343b48]">{word.term}</span>
                  </div>
                  <span className="shrink-0 text-[12px] font-bold text-[#8a909b]">{word.count}回</span>
                </div>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#d9dee7] px-3 py-5 text-[13px] leading-6 text-[#7a808c]">
                顧客発話から頻出ワードを表示します。
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[18px] border border-[#eceef4] bg-[#fcfcfd] p-4">
          <div className="text-[14px] font-bold text-[#171717]">注目ワード</div>
          <div className="mt-4 space-y-2">
            {flatFocusWords.length > 0 ? (
              flatFocusWords.slice(0, 8).map((word) => (
                <button
                  key={`${word.categoryTitle}-${word.term}-${word.evidence.id}`}
                  type="button"
                  onClick={() => onJumpToLog(word.evidence)}
                  className="block w-full rounded-[12px] bg-white px-3 py-2.5 text-left transition hover:bg-[#fffaf0]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-semibold text-[#343b48]">{word.term}</span>
                    <span className="shrink-0 text-[12px] font-bold text-[#8a909b]">{word.count}回</span>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-[#b08a00]">{word.categoryTitle}</div>
                </button>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#d9dee7] px-3 py-5 text-[13px] leading-6 text-[#7a808c]">
                課題・不安・価値・次回アクションに関わる言葉を表示します。
              </p>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

function FeedbackInsightCard({
  title,
  tone,
  bullets,
}: {
  title: string;
  tone: "positive" | "warning" | "info";
  bullets: string[];
}) {
  const icon = tone === "positive" ? "👍" : tone === "warning" ? "⚠️" : "💡";

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
    </article>
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
  const speakerMap = new Map<string, ConversationSpeaker>();
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

  if (log.speaker === "sales") {
    return "sales";
  }

  if (log.speaker === "customer") {
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

  const hearing = clampScore(42 + Math.min(28, metrics.entryCount * 3));
  const discovery = clampScore(36 + Math.min(24, Math.round(metrics.averageCharactersPerEntry / 10)));
  const proposal = clampScore(status === "won" ? 70 : status === "considering" ? 56 : 42);
  const objection = clampScore(status === "lost" ? 34 : status === "considering" ? 46 : 62);
  const closing = clampScore(status === "won" ? 66 : status === "considering" ? 38 : 28);
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
    return value >= 80 ? "深掘り質問が多く、ニーズの把握ができています" : "質問量や確認の深さに改善余地があります";
  }

  if (label === "課題深掘り") {
    return value >= 80 ? "課題の背景まで確認できています" : "課題の背景・原因・影響の確認が不足しています";
  }

  if (label === "提案接続") {
    return value >= 80 ? "顧客課題と提案価値を具体的に接続できています" : "顧客課題と提案価値の接続に補強が必要です";
  }

  if (label === "反論対応") {
    return value >= 80 ? "懸念に対して確認や切り返しができています" : "不安や反論への確認・切り返しが不足しています";
  }

  if (label === "アポ打診") {
    return value >= 80 ? "次回接点やアポイントが明確です" : "アポ打診や次回接点化の強化余地があります";
  }

  return value >= 80 ? "次回アクションまで明確につながっています" : "クロージングトークと次回合意の強化余地があります";
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
