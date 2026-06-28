"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { subscribeToUserProfiles, type AdminReviewStatus, type AppUserProfile } from "@/lib/firebase/auth";
import {
  subscribeToAllKnowledgeItems,
  subscribeToKnowledgeCategories,
  subscribeToKnowledgeProducts,
  type KnowledgeCategory,
  type KnowledgeItem,
  type KnowledgeProduct,
} from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  subscribeToRoleplayResults,
  subscribeToRoleplayScenarios,
  type RoleplayResult,
  type RoleplayScenario,
} from "@/lib/firebase/roleplay";
import type { MeetingOutcome } from "@/types/domain";

export type AdminMemberRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: "active" | "inactive";
  workExperienceTotalMonths: number | null;
  workExperienceLabel: string;
  meetingCount: number;
  lostCount: number;
  unanalyzedCount: number;
  winRate: number | null;
  averageScore: number | null;
  roleplayCount: number;
  lowRoleplayCount: number;
  lastActivity: string;
  tone: "good" | "normal" | "risk";
  guidance: string;
  needsCoaching: boolean;
  coachingPriority: "high" | "medium" | "low";
  coachingReasons: string[];
  nextAction: string;
  adminReviewStatus: AdminReviewStatus;
  adminLastReviewedAt: Date | null;
  adminNextReviewDate: Date | null;
  adminReviewMemo: string;
};

export function useAdminInsights() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayScenarios, setRoleplayScenarios] = useState<RoleplayScenario[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToUserProfiles(setUsers, handleError, profile.companyId),
      subscribeToMeetings({ role: "admin", userId: "admin", companyId: profile.companyId }, setMeetings, handleError),
      subscribeToKnowledgeProducts(profile.companyId, setProducts, handleError),
      subscribeToKnowledgeCategories(profile.companyId, setCategories, handleError),
      subscribeToAllKnowledgeItems(profile.companyId, setKnowledgeItems, handleError),
      subscribeToRoleplayScenarios(profile.companyId, setRoleplayScenarios, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.uid || !profile.companyId) return;
    return subscribeToRoleplayResults(
      { userId: profile.uid, companyId: profile.companyId, isAdmin: true },
      setRoleplayResults,
      (nextError: FirebaseError) => setError(nextError.message),
    );
  }, [profile?.companyId, profile?.uid]);

  const salesUsers = useMemo(() => users.filter((user) => user.role === "sales"), [users]);
  const memberRows = useMemo(
    () => buildMemberRows(salesUsers, meetings, roleplayResults),
    [meetings, roleplayResults, salesUsers],
  );

  return {
    users,
    salesUsers,
    meetings,
    products,
    categories,
    knowledgeItems,
    roleplayScenarios,
    roleplayResults,
    memberRows,
    error,
  };
}

export function buildMemberRows(users: AppUserProfile[], meetings: MeetingRecord[], results: RoleplayResult[]): AdminMemberRow[] {
  return users.map((user) => {
    const userMeetings = meetings.filter((meeting) => meeting.userId === user.uid);
    const wonCount = userMeetings.filter((meeting) => meeting.status === "won").length;
    const lostCount = userMeetings.filter((meeting) => meeting.status === "lost").length;
    const unanalyzedCount = userMeetings.filter((meeting) => !meeting.aiSummary).length;
    const userResults = results.filter((result) => result.userId === user.uid);
    const lowRoleplayCount = userResults.filter((result) => result.score < 70).length;
    const latestActivityAt = [
      ...userMeetings.map((meeting) => meeting.recordedAt),
      ...userResults.map((result) => result.createdAt),
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const winRate = userMeetings.length > 0 ? Math.round((wonCount / userMeetings.length) * 1000) / 10 : null;
    const averageScore = userResults.length > 0 ? Math.round(userResults.reduce((sum, result) => sum + result.score, 0) / userResults.length) : null;
    const coachingReasons = user.adminCoachingReason ? [user.adminCoachingReason] : [];
    const needsCoaching = user.adminCoachingStatus === "needs_coaching";
    const coachingPriority: AdminMemberRow["coachingPriority"] =
      user.adminCoachingStatus === "none" ? "low" : user.adminCoachingPriority;
    const tone: "good" | "normal" | "risk" =
      coachingPriority === "high"
        ? "risk"
        : averageScore !== null && averageScore >= 80 && lostCount === 0
          ? "good"
          : "normal";
    const nextAction = user.adminNextActionTitle || "管理者アクション未設定";

    return {
      id: user.uid,
      name: user.name ?? "未設定",
      email: user.email ?? "",
      avatarUrl: user.avatarUrl,
      status: user.status,
      workExperienceTotalMonths: getWorkExperienceTotalMonths(user),
      workExperienceLabel: formatWorkExperience(user),
      meetingCount: userMeetings.length,
      lostCount,
      unanalyzedCount,
      winRate,
      averageScore,
      roleplayCount: userResults.length,
      lowRoleplayCount,
      lastActivity: formatDate(latestActivityAt),
      tone,
      guidance: user.adminCoachingStatus === "needs_coaching"
        ? coachingReasons[0] || "指導必要"
        : user.adminCoachingStatus === "watch"
          ? coachingReasons[0] || "要確認"
          : "通常",
      needsCoaching,
      coachingPriority,
      coachingReasons,
      nextAction,
      adminReviewStatus: user.adminReviewStatus,
      adminLastReviewedAt: user.adminLastReviewedAt,
      adminNextReviewDate: user.adminNextReviewDate,
      adminReviewMemo: user.adminReviewMemo,
    };
  }).sort((left, right) => {
    const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
    if (left.needsCoaching !== right.needsCoaching) {
      return left.needsCoaching ? -1 : 1;
    }
    if (priorityWeight[left.coachingPriority] !== priorityWeight[right.coachingPriority]) {
      return priorityWeight[left.coachingPriority] - priorityWeight[right.coachingPriority];
    }
    if (right.lostCount !== left.lostCount) return right.lostCount - left.lostCount;
    if (right.lowRoleplayCount !== left.lowRoleplayCount) return right.lowRoleplayCount - left.lowRoleplayCount;
    return right.meetingCount - left.meetingCount;
  });
}

export function getWorkExperienceTotalMonths(user: Pick<AppUserProfile, "workExperienceYears" | "workExperienceMonths">) {
  if (user.workExperienceYears === null && user.workExperienceMonths === null) return null;
  return (user.workExperienceYears ?? 0) * 12 + (user.workExperienceMonths ?? 0);
}

export function formatWorkExperience(user: Pick<AppUserProfile, "workExperienceYears" | "workExperienceMonths">) {
  const totalMonths = getWorkExperienceTotalMonths(user);
  if (totalMonths === null) return "未設定";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}ヶ月`;
  if (months === 0) return `${years}年`;
  return `${years}年${months}ヶ月`;
}

export function getWorkExperienceBucket(totalMonths: number | null) {
  if (totalMonths === null) return "未設定";
  if (totalMonths < 12) return "新卒・1年未満";
  if (totalMonths < 36) return "1〜2年";
  if (totalMonths < 72) return "3〜5年";
  return "6年以上";
}

export function getMeetingScore(meeting: MeetingRecord) {
  const manualScore = meeting.aiSummary?.manualCompliance?.score;
  if (typeof manualScore === "number") return `${manualScore}点`;
  if (meeting.aiSummaryStatus === "completed" || meeting.aiSummary) return "分析済み";
  if (meeting.transcriptBlockStatus === "completed" || meeting.conversationLogStatus === "completed") return "要約待ち";
  if (meeting.processingStatus === "uploaded") return "処理待ち";
  return "未分析";
}

export function getMeetingOutcomeLabel(status: MeetingOutcome | string) {
  if (status === "won") return "成約";
  if (status === "lost") return "失注";
  if (status === "considering") return "検討中";
  return "未設定";
}

export function getOutcomeTone(status: MeetingOutcome | string) {
  if (status === "won") return "good";
  if (status === "lost") return "risk";
  return "normal";
}

export function formatDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatDateTime(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function calcWinRate(meetings: MeetingRecord[]) {
  if (meetings.length === 0) return null;
  return Math.round((meetings.filter((meeting) => meeting.status === "won").length / meetings.length) * 1000) / 10;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="overflow-x-hidden bg-transparent px-5 pb-3 pt-4 md:px-8 md:pb-4 md:pt-5">{children}</main>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#8a6500]">{eyebrow}</p>
        <h1 className="mt-1 text-[32px] font-black tracking-[-0.04em] text-[#171717] md:text-[34px]">{title}</h1>
        <p className="mt-2 max-w-[760px] text-[14px] leading-7 text-[#596273]">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Panel({
  title,
  actionLabel,
  href,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  actionLabel?: string;
  href?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-[24px] border border-[#eceef4] bg-white shadow-[0_10px_28px_rgba(17,24,39,0.05)] ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-[18px] font-black text-[#171717]">{title}</h2>
        {actionLabel && href ? (
          <Link href={href} className="rounded-full border border-[#ead8a8] bg-[#fffaf0] px-3 py-1.5 text-[12px] font-black text-[#8a6500] transition hover:bg-[#fff3cd]">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-[22px] border border-[#eceef4] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(17,24,39,0.05)]">
      <div className="text-[13px] font-bold text-[#343b48]">{label}</div>
      <div className="mt-2 text-[30px] font-black tracking-[-0.04em] text-[#171717]">{value}</div>
      <div className="mt-1 text-[12px] text-[#7a808c]">{note}</div>
    </article>
  );
}

export function StatusBadge({ tone, label }: { tone: "good" | "normal" | "risk"; label: string }) {
  const className =
    tone === "good"
      ? "bg-[#eaf8ef] text-[#16834f]"
      : tone === "risk"
        ? "bg-[#fff0ed] text-[#d63c2f]"
        : "bg-[#f1f2f5] text-[#596273]";
  return <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>{label}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#dfe4ec] bg-[#fcfcfd] px-5 py-10 text-center">
      <h3 className="text-[17px] font-black text-[#171717]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-6 text-[#7a808c]">{body}</p>
    </div>
  );
}

export function Placeholder({ children = "データなし" }: { children?: React.ReactNode }) {
  return <span className="text-[13px] font-bold text-[#8a909b]">{children}</span>;
}
