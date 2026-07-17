"use client";

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { MeetingAiSummary, MeetingRecord } from "@/lib/firebase/meetings";

export type SalesRepAnalysisProfile = {
  userId: string;
  companyId: string;
  totalAnalyzedCount: number;
  meetingCount: number;
  teleapoCount: number;
  overallAverageScore: number | null;
  skillAverages: Record<string, number>;
  skillCounts: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  frequentMisses: string[];
  improvementPhrases: string[];
  recommendedTrainingThemes: string[];
  recentMeetingIds: string[];
  lastAnalyzedAt: Date | null;
  updatedAt: Date | null;
};

type StoredProfile = Omit<SalesRepAnalysisProfile, "lastAnalyzedAt" | "updatedAt"> & {
  overallScoreCount?: number;
  lastAnalyzedAt?: unknown;
  updatedAt?: unknown;
};

export function subscribeToSalesRepAnalysisProfile(
  input: { userId?: string | null; companyId?: string | null },
  callback: (profile: SalesRepAnalysisProfile | null) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();
  if (!input.userId || !input.companyId) {
    callback(null);
    return () => undefined;
  }

  let isActive = true;
  getDoc(doc(firestore, "salesRepAnalysisProfiles", input.userId))
    .then((snapshot) => {
      if (!isActive) return;
      callback(snapshot.exists() ? mapSalesRepAnalysisProfile(snapshot.data() as Record<string, unknown>) : null);
    })
    .catch((error: FirestoreError) => {
      if (isActive) onError?.(error);
    });

  return () => {
    isActive = false;
  };
}

export async function updateSalesRepAnalysisProfileFromMeeting(input: {
  meeting: MeetingRecord;
  summary: MeetingAiSummary;
}) {
  const { firestore } = assertFirebaseClient();
  const companyId = input.meeting.companyId;
  const userId = input.meeting.userId;
  if (!companyId || !userId) return;

  const ref = doc(firestore, "salesRepAnalysisProfiles", userId);
  const summarySignals = extractSummarySignals(input.summary, input.meeting.salesDomain);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? mapStoredProfile(snapshot.data() as Record<string, unknown>, companyId, userId)
      : createEmptyStoredProfile(companyId, userId);
    const alreadyCounted = current.recentMeetingIds.includes(input.meeting.id);
    const nextRecentMeetingIds = unique([input.meeting.id, ...current.recentMeetingIds]).slice(0, 50);
    const nextSkillAverages = { ...current.skillAverages };
    const nextSkillCounts = { ...current.skillCounts };

    for (const evaluation of input.summary.diagnosis?.salesEvaluation ?? []) {
      const label = evaluation.label?.trim();
      if (!label || typeof evaluation.score !== "number") continue;
      const previousCount = alreadyCounted ? 0 : current.skillCounts[label] ?? 0;
      const previousAverage = current.skillAverages[label] ?? evaluation.score;
      const nextCount = previousCount + 1;
      nextSkillCounts[label] = alreadyCounted ? current.skillCounts[label] ?? 1 : nextCount;
      nextSkillAverages[label] = alreadyCounted
        ? previousAverage
        : Math.round(((previousAverage * previousCount + evaluation.score) / nextCount) * 10) / 10;
    }

    const overallScore = readOverallScore(input.summary);
    const previousOverallCount = alreadyCounted ? 0 : current.overallScoreCount ?? 0;
    const previousOverallAverage = current.overallAverageScore ?? overallScore ?? 0;
    const nextOverallScoreCount = alreadyCounted || overallScore === null ? (current.overallScoreCount ?? 0) : previousOverallCount + 1;
    const nextOverallAverageScore = alreadyCounted || overallScore === null
      ? current.overallAverageScore
      : Math.round(((previousOverallAverage * previousOverallCount + overallScore) / nextOverallScoreCount) * 10) / 10;

    transaction.set(
      ref,
      {
        companyId,
        userId,
        totalAnalyzedCount: alreadyCounted ? current.totalAnalyzedCount : current.totalAnalyzedCount + 1,
        meetingCount: alreadyCounted || input.meeting.salesDomain === "teleapo" ? current.meetingCount : current.meetingCount + 1,
        teleapoCount: alreadyCounted || input.meeting.salesDomain !== "teleapo" ? current.teleapoCount : current.teleapoCount + 1,
        overallAverageScore: nextOverallAverageScore,
        overallScoreCount: nextOverallScoreCount,
        skillAverages: nextSkillAverages,
        skillCounts: nextSkillCounts,
        strengths: unique([...summarySignals.strengths, ...current.strengths]).slice(0, 12),
        weaknesses: unique([...summarySignals.weaknesses, ...current.weaknesses]).slice(0, 12),
        frequentMisses: unique([...summarySignals.frequentMisses, ...current.frequentMisses]).slice(0, 16),
        improvementPhrases: unique([...summarySignals.improvementPhrases, ...current.improvementPhrases]).slice(0, 16),
        recommendedTrainingThemes: unique([...summarySignals.recommendedTrainingThemes, ...current.recommendedTrainingThemes]).slice(0, 12),
        recentMeetingIds: nextRecentMeetingIds,
        lastAnalyzedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

function extractSummarySignals(summary: MeetingAiSummary, salesDomain: MeetingRecord["salesDomain"]) {
  const lowEvaluations = (summary.diagnosis?.salesEvaluation ?? [])
    .filter((item) => typeof item.score === "number" && item.score <= 68)
    .sort((left, right) => left.score - right.score);
  const highEvaluations = (summary.diagnosis?.salesEvaluation ?? [])
    .filter((item) => typeof item.score === "number" && item.score >= 76)
    .sort((left, right) => right.score - left.score);
  const frequentMisses = summary.manualCompliance?.missingCriteria ?? [];
  const improvementPhrases = summary.manualCompliance?.improvementPhrases ?? [];
  const weaknesses = unique([
    ...lowEvaluations.map((item) => `${item.label} ${Math.round(item.score)}点`),
    ...frequentMisses,
  ]).slice(0, 8);
  const strengths = unique([
    ...highEvaluations.map((item) => `${item.label} ${Math.round(item.score)}点`),
    ...(summary.manualCompliance?.matchedCriteria ?? []),
  ]).slice(0, 8);
  const recommendedTrainingThemes = unique([
    ...frequentMisses.map((item) => `${item}を重点練習`),
    ...lowEvaluations.map((item) => `${item.label}を鍛えるロープレ`),
    ...improvementPhrases.slice(0, 3),
    salesDomain === "teleapo" ? "アポ打診まで自然につなげる" : "次回アクションを合意する",
  ]).slice(0, 8);

  return {
    strengths,
    weaknesses,
    frequentMisses: frequentMisses.slice(0, 10),
    improvementPhrases: improvementPhrases.slice(0, 10),
    recommendedTrainingThemes,
  };
}

function readOverallScore(summary: MeetingAiSummary) {
  if (typeof summary.manualCompliance?.score === "number") {
    return summary.manualCompliance.score;
  }

  const scores = summary.diagnosis?.salesEvaluation?.map((item) => item.score).filter((score) => typeof score === "number") ?? [];
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function mapStoredProfile(data: Record<string, unknown>, companyId: string, userId: string): StoredProfile {
  return {
    companyId: readString(data.companyId) || companyId,
    userId: readString(data.userId) || userId,
    totalAnalyzedCount: readNumber(data.totalAnalyzedCount),
    meetingCount: readNumber(data.meetingCount),
    teleapoCount: readNumber(data.teleapoCount),
    overallAverageScore: readNullableNumber(data.overallAverageScore),
    overallScoreCount: readNumber(data.overallScoreCount),
    skillAverages: readNumberRecord(data.skillAverages),
    skillCounts: readNumberRecord(data.skillCounts),
    strengths: readStringArray(data.strengths),
    weaknesses: readStringArray(data.weaknesses),
    frequentMisses: readStringArray(data.frequentMisses),
    improvementPhrases: readStringArray(data.improvementPhrases),
    recommendedTrainingThemes: readStringArray(data.recommendedTrainingThemes),
    recentMeetingIds: readStringArray(data.recentMeetingIds),
    lastAnalyzedAt: data.lastAnalyzedAt,
    updatedAt: data.updatedAt,
  };
}

function createEmptyStoredProfile(companyId: string, userId: string): StoredProfile {
  return {
    companyId,
    userId,
    totalAnalyzedCount: 0,
    meetingCount: 0,
    teleapoCount: 0,
    overallAverageScore: null,
    overallScoreCount: 0,
    skillAverages: {},
    skillCounts: {},
    strengths: [],
    weaknesses: [],
    frequentMisses: [],
    improvementPhrases: [],
    recommendedTrainingThemes: [],
    recentMeetingIds: [],
    lastAnalyzedAt: null,
    updatedAt: null,
  };
}

function mapSalesRepAnalysisProfile(data: Record<string, unknown>): SalesRepAnalysisProfile {
  return {
    companyId: readString(data.companyId),
    userId: readString(data.userId),
    totalAnalyzedCount: readNumber(data.totalAnalyzedCount),
    meetingCount: readNumber(data.meetingCount),
    teleapoCount: readNumber(data.teleapoCount),
    overallAverageScore: readNullableNumber(data.overallAverageScore),
    skillAverages: readNumberRecord(data.skillAverages),
    skillCounts: readNumberRecord(data.skillCounts),
    strengths: readStringArray(data.strengths),
    weaknesses: readStringArray(data.weaknesses),
    frequentMisses: readStringArray(data.frequentMisses),
    improvementPhrases: readStringArray(data.improvementPhrases),
    recommendedTrainingThemes: readStringArray(data.recommendedTrainingThemes),
    recentMeetingIds: readStringArray(data.recentMeetingIds),
    lastAnalyzedAt: toDate(data.lastAnalyzedAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function readNumberRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
  );
}

function toDate(value: unknown) {
  return typeof (value as { toDate?: unknown } | null)?.toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
