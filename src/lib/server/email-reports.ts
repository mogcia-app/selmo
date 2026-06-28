import { Timestamp, type DocumentData } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_MONTHLY_ROLEPLAY_QUOTA,
  DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA,
} from "@/lib/ai-usage-limit";
import {
  buildAppUrl,
  escapeHtml,
  hasSentEmailEvent,
  saveEmailEvent,
  sendEmail,
} from "@/lib/server/email";

const STANDARD_TRANSCRIPTION_QUOTA = DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA;
const STANDARD_ROLEPLAY_QUOTA = DEFAULT_MONTHLY_ROLEPLAY_QUOTA;
const PRO_AI_QUOTA = 30;
const remainingUsageWarningThreshold = 5;

type UserRecord = {
  id: string;
  email: string | null;
  name: string;
  role: "admin" | "sales" | "owner" | string;
  status: string;
  companyId: string | null;
};

type CompanyRecord = {
  id: string;
  companyName: string;
  plan: "standard" | "pro" | "enterprise";
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
  notificationEmails: string[];
};

type MeetingRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  customerName: string;
  productType: string;
  status: string;
  recordedAt: Date | null;
  createdAt: Date | null;
  aiSummaryOverview: string | null;
};

type RoleplayRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  scenarioTitle: string;
  score: number | null;
  createdAt: Date | null;
};

type RoleplaySessionRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  createdAt: Date | null;
};

type AiUsageRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  feature: string;
  status: string;
  createdAt: Date | null;
};

type EmailRecipient = {
  id: string;
  email: string;
  name: string;
};

export async function sendWeeklyAdminReports() {
  const context = await loadReportContext();
  const { start, end, key } = getPreviousWeekRange();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of context.companies) {
    const admins = context.users.filter((user) => user.companyId === company.id && user.role === "admin" && user.status !== "inactive");
    const recipients = buildAdminEmailRecipients(company, admins);

    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }

    const meetings = context.meetings.filter(
      (meeting) => meeting.companyId === company.id && isInRange(meeting.recordedAt ?? meeting.createdAt, start, end),
    );
    const roleplays = context.roleplays.filter(
      (roleplay) => roleplay.companyId === company.id && isInRange(roleplay.createdAt, start, end),
    );
    const searchEvents = context.searchEvents.filter(
      (event) => event.companyId === company.id && isInRange(event.createdAt, start, end),
    );
    const analyzedMeetings = meetings.filter((meeting) => meeting.aiSummaryOverview);

    for (const recipient of recipients) {
      const eventId = safeEventId(`weekly_admin_report_${company.id}_${recipient.id}_${key}`);
      if (await hasSentEmailEvent(eventId)) {
        skipped += 1;
        continue;
      }

      try {
        const result = await sendEmail({
          to: recipient.email,
          subject: "今週の営業レポートを確認しませんか？",
          html: buildWeeklyAdminHtml({
            recipient,
            company,
            meetings,
            roleplays,
            searchCount: searchEvents.length,
            analyzedMeetings,
            start,
            end,
          }),
          text: [
            `${recipient.name}さん`,
            "先週の営業活動レポートがまとまりました。",
            `商談: ${meetings.length}件`,
            `ロープレ: ${roleplays.length}回`,
            `ナレッジ検索: ${searchEvents.length}回`,
            buildAppUrl("/admin/activity"),
          ].join("\n"),
          tags: [{ name: "kind", value: "weekly_admin_report" }],
        });

        await saveEmailEvent(eventId, {
          companyId: company.id,
          userId: recipient.id,
          recipientEmail: recipient.email,
          kind: "weekly_admin_report",
          status: "sent",
          providerMessageId: result.providerMessageId,
          metadata: {
            weekKey: key,
            meetingCount: meetings.length,
            roleplayCount: roleplays.length,
            searchCount: searchEvents.length,
          },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        await saveEmailEvent(eventId, {
          companyId: company.id,
          userId: recipient.id,
          recipientEmail: recipient.email,
          kind: "weekly_admin_report",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "メール送信に失敗しました。",
          metadata: { weekKey: key },
        }).catch(() => undefined);
      }
    }
  }

  return { sent, skipped, failed, weekKey: key };
}

export async function sendAiUsageWarningEmails() {
  const context = await loadReportContext();
  const { start, end, key } = getCurrentMonthRange();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of context.companies) {
    const quota = readSharedQuota(company);

    if (quota === null || quota <= 0) {
      skipped += 1;
      continue;
    }

    const admins = context.users.filter((user) => user.companyId === company.id && user.role === "admin" && user.status !== "inactive");
    const adminRecipients = buildAdminEmailRecipients(company, admins);
    const salesUsers = context.users.filter(
      (user) => user.companyId === company.id && user.role === "sales" && user.status !== "inactive" && user.email,
    );

    for (const salesUser of salesUsers) {
      if (!salesUser.email) {
        skipped += 1;
        continue;
      }

      const meetingCount = context.meetings.filter(
        (meeting) =>
          meeting.companyId === company.id &&
          meeting.userId === salesUser.id &&
          isInRange(meeting.createdAt ?? meeting.recordedAt, start, end),
      ).length;
      const roleplayCount = context.roleplaySessions.filter(
        (session) =>
          session.companyId === company.id &&
          session.userId === salesUser.id &&
          isInRange(session.createdAt, start, end),
      ).length;
      const used = meetingCount + roleplayCount;
      const remaining = quota - used;

      if (remaining > remainingUsageWarningThreshold || remaining < 0) {
        skipped += 1;
        continue;
      }

      const recipients = [
        { user: salesUser, email: salesUser.email },
        ...adminRecipients
          .filter((recipient) => recipient.email !== salesUser.email)
          .map((recipient) => ({ user: recipient, email: recipient.email })),
      ];

      for (const recipient of recipients) {
        const eventId = safeEventId(
          `ai_usage_remaining_warning_${company.id}_${salesUser.id}_${recipient.user.id}_${key}`,
        );
        if (await hasSentEmailEvent(eventId)) {
          skipped += 1;
          continue;
        }

        try {
          const result = await sendEmail({
            to: recipient.email,
            subject: `AI利用回数が残り${remaining}回になりました`,
            html: buildUsageWarningHtml({
              recipientName: recipient.user.name,
              salesName: salesUser.name,
              company,
              quota,
              used,
              remaining,
              meetingCount,
              roleplayCount,
            }),
            text: [
              `${recipient.user.name}さん`,
              `${salesUser.name}さんのAI利用回数が残り${remaining}回になりました。`,
              `使用 ${used}回 / 月${quota}回`,
              buildAppUrl("/sales/account"),
            ].join("\n"),
            tags: [{ name: "kind", value: "ai_usage_warning" }],
          });

          await saveEmailEvent(eventId, {
            companyId: company.id,
            userId: salesUser.id,
            recipientEmail: recipient.email,
            kind: "ai_usage_remaining_warning",
            status: "sent",
            providerMessageId: result.providerMessageId,
            metadata: {
              monthKey: key,
              quota,
              used,
              remaining,
              meetingCount,
              roleplayCount,
            },
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          await saveEmailEvent(eventId, {
            companyId: company.id,
            userId: salesUser.id,
            recipientEmail: recipient.email,
            kind: "ai_usage_remaining_warning",
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "メール送信に失敗しました。",
            metadata: { monthKey: key, quota, used, remaining },
          }).catch(() => undefined);
        }
      }
    }
  }

  return { sent, skipped, failed, monthKey: key };
}

async function loadReportContext() {
  const db = getFirebaseAdminDb();
  if (!db) {
    throw new Error("Firebase Admin が設定されていません。");
  }

  const [
    companiesSnapshot,
    usersSnapshot,
    meetingsSnapshot,
    roleplaysSnapshot,
    roleplaySessionsSnapshot,
    searchSnapshot,
    aiUsageSnapshot,
  ] =
    await Promise.all([
      db.collection("companies").get(),
      db.collection("users").get(),
      db.collection("meetings").get(),
      db.collection("roleplayResults").get(),
      db.collection("roleplaySessions").get(),
      db.collection("knowledgeSearchEvents").get(),
      db.collection("aiUsageLogs").get(),
    ]);

  return {
    companies: companiesSnapshot.docs.map((doc) => mapCompany(doc.id, doc.data())),
    users: usersSnapshot.docs.map((doc) => mapUser(doc.id, doc.data())),
    meetings: meetingsSnapshot.docs.map((doc) => mapMeeting(doc.id, doc.data())),
    roleplays: roleplaysSnapshot.docs.map((doc) => mapRoleplay(doc.id, doc.data())),
    roleplaySessions: roleplaySessionsSnapshot.docs.map((doc) => mapRoleplaySession(doc.id, doc.data())),
    aiUsageLogs: aiUsageSnapshot.docs.map((doc) => mapAiUsage(doc.id, doc.data())),
    searchEvents: searchSnapshot.docs.map((doc) => ({
      id: doc.id,
      companyId: readNullableString(doc.data().companyId),
      createdAt: readDate(doc.data().createdAt),
    })),
  };
}

function buildWeeklyAdminHtml(input: {
  recipient: EmailRecipient;
  company: CompanyRecord;
  meetings: MeetingRecord[];
  roleplays: RoleplayRecord[];
  searchCount: number;
  analyzedMeetings: MeetingRecord[];
  start: Date;
  end: Date;
}) {
  const topMeetings = input.analyzedMeetings.slice(0, 3);

  return buildEmailShell({
    preheader: "先週の営業活動レポートがまとまりました。",
    title: "今週の営業レポートを確認しませんか？",
    body: `
      <p>${escapeHtml(input.recipient.name)}さん、先週の営業活動レポートがまとまりました。</p>
      <p class="muted">${escapeHtml(formatDate(input.start))} - ${escapeHtml(formatDate(input.end))}</p>
      <div class="metrics">
        <div><strong>${input.meetings.length}</strong><span>商談</span></div>
        <div><strong>${input.roleplays.length}</strong><span>ロープレ</span></div>
        <div><strong>${input.searchCount}</strong><span>検索</span></div>
      </div>
      ${
        topMeetings.length > 0
          ? `<h2>最近のAI分析</h2>${topMeetings
              .map(
                (meeting) => `
                  <div class="item">
                    <strong>${escapeHtml(meeting.customerName || "未設定の商談")}</strong>
                    <p>${escapeHtml(meeting.aiSummaryOverview ?? "")}</p>
                  </div>
                `,
              )
              .join("")}`
          : `<div class="item"><strong>AI分析はまだありません</strong><p>商談分析が完了すると要約が表示されます。</p></div>`
      }
      <a class="button" href="${escapeHtml(buildAppUrl("/admin/activity"))}">営業活動ログを見る</a>
    `,
  });
}

function buildUsageWarningHtml(input: {
  recipientName: string;
  salesName: string;
  company: CompanyRecord;
  quota: number;
  used: number;
  remaining: number;
  meetingCount: number;
  roleplayCount: number;
}) {
  return buildEmailShell({
    preheader: `AI利用回数が残り${input.remaining}回になりました。`,
    title: `AI利用回数が残り${input.remaining}回になりました`,
    body: `
      <p>${escapeHtml(input.recipientName)}さん、${escapeHtml(input.salesName)}さんのAI利用回数が上限に近づいています。</p>
      <div class="usage">
        <div class="usage-line"><span>使用</span><strong>${input.used}回 / 月${input.quota}回</strong></div>
        <div class="bar"><span style="width:${Math.min(100, Math.round((input.used / input.quota) * 100))}%"></span></div>
        <p class="muted">残り ${input.remaining}回</p>
      </div>
      <div class="metrics">
        <div><strong>${input.meetingCount}</strong><span>商談分析</span></div>
        <div><strong>${input.roleplayCount}</strong><span>ロープレ</span></div>
      </div>
      <a class="button" href="${escapeHtml(buildAppUrl("/sales/account"))}">利用状況を確認する</a>
    `,
  });
}

function buildEmailShell(input: { preheader: string; title: string; body: string }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { margin:0; background:#f7f8fb; color:#171717; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
          .preheader { display:none; opacity:0; overflow:hidden; height:0; width:0; }
          .wrap { max-width:640px; margin:0 auto; padding:32px 18px; }
          .card { background:#ffffff; border:1px solid #e8ebf0; border-radius:18px; padding:28px; }
          .brand { font-size:13px; font-weight:800; letter-spacing:.2em; color:#8a6500; text-transform:uppercase; }
          h1 { margin:10px 0 16px; font-size:26px; line-height:1.35; }
          h2 { margin:24px 0 10px; font-size:16px; }
          p { color:#343b48; font-size:14px; line-height:1.8; }
          .muted { color:#7a808c; font-size:13px; }
          .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:22px 0; }
          .metrics div { background:#fff8e4; border:1px solid #f2df9b; border-radius:14px; padding:14px; }
          .metrics strong { display:block; font-size:24px; color:#171717; }
          .metrics span { display:block; margin-top:4px; font-size:12px; color:#8a6500; font-weight:700; }
          .item { border:1px solid #eef1f5; border-radius:14px; padding:14px; margin-top:10px; background:#fcfcfd; }
          .item strong { font-size:14px; }
          .item p { margin:6px 0 0; font-size:13px; }
          .button { display:inline-block; margin-top:22px; background:#ffd84d; color:#171717; text-decoration:none; border-radius:12px; padding:12px 18px; font-size:14px; font-weight:800; }
          .usage { margin:20px 0; border:1px solid #eef1f5; border-radius:14px; padding:16px; }
          .usage-line { display:flex; justify-content:space-between; gap:12px; font-size:14px; }
          .bar { height:10px; border-radius:999px; background:#e5e7eb; overflow:hidden; margin-top:12px; }
          .bar span { display:block; height:100%; background:#ffd84d; border-radius:999px; }
        </style>
      </head>
      <body>
        <div class="preheader">${escapeHtml(input.preheader)}</div>
        <div class="wrap">
          <div class="card">
            <div class="brand">selmo</div>
            <h1>${escapeHtml(input.title)}</h1>
            ${input.body}
          </div>
        </div>
      </body>
    </html>
  `;
}

function mapCompany(id: string, data: DocumentData): CompanyRecord {
  const plan = readPlan(data.plan);

  return {
    id,
    companyName: readString(data.companyName ?? data.name, "未設定の会社"),
    plan,
    monthlyTranscriptionQuota: readQuota(data.monthlyTranscriptionQuota, plan, STANDARD_TRANSCRIPTION_QUOTA),
    monthlyRoleplayQuota: readQuota(data.monthlyRoleplayQuota, plan, STANDARD_ROLEPLAY_QUOTA),
    notificationEmails: readEmailArray(data.notificationEmails).slice(0, 3),
  };
}

function mapUser(id: string, data: DocumentData): UserRecord {
  return {
    id,
    email: readNullableString(data.email),
    name: readString(data.name ?? data.email, "未設定"),
    role: readString(data.role),
    status: readString(data.status, "active"),
    companyId: readNullableString(data.companyId),
  };
}

function mapMeeting(id: string, data: DocumentData): MeetingRecord {
  return {
    id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    customerName: readString(data.customerName, "未設定の商談"),
    productType: readString(data.productType),
    status: readString(data.status, "considering"),
    recordedAt: readDate(data.recordedAt),
    createdAt: readDate(data.createdAt),
    aiSummaryOverview:
      data.aiSummary && typeof data.aiSummary === "object"
        ? readNullableString((data.aiSummary as { overview?: unknown }).overview)
        : null,
  };
}

function mapRoleplay(id: string, data: DocumentData): RoleplayRecord {
  return {
    id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    scenarioTitle: readString(data.scenarioTitle, "ロープレ"),
    score: typeof data.score === "number" ? data.score : null,
    createdAt: readDate(data.createdAt),
  };
}

function mapRoleplaySession(id: string, data: DocumentData): RoleplaySessionRecord {
  return {
    id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    createdAt: readDate(data.createdAt),
  };
}

function mapAiUsage(id: string, data: DocumentData): AiUsageRecord {
  return {
    id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    feature: readString(data.feature),
    status: readString(data.status),
    createdAt: readDate(data.createdAt),
  };
}

function buildAdminEmailRecipients(company: CompanyRecord, admins: UserRecord[]): EmailRecipient[] {
  if (company.notificationEmails.length > 0) {
    return uniqueRecipients(
      company.notificationEmails.map((email, index) => ({
        id: `notification_${index}_${email}`,
        email,
        name: `管理者${index + 1}`,
      })),
    );
  }

  return uniqueRecipients(
    admins
      .filter((admin) => admin.email)
      .map((admin) => ({
        id: admin.id,
        email: admin.email as string,
        name: admin.name,
      })),
  );
}

function uniqueRecipients(recipients: EmailRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    recipient.email = email;
    return true;
  });
}

function readSharedQuota(company: CompanyRecord) {
  if (company.monthlyTranscriptionQuota === null || company.monthlyRoleplayQuota === null) {
    return null;
  }

  return company.monthlyTranscriptionQuota + company.monthlyRoleplayQuota;
}

function readPlan(value: unknown): CompanyRecord["plan"] {
  if (value === "pro" || value === "enterprise") {
    return value;
  }

  return "standard";
}

function readQuota(value: unknown, plan: CompanyRecord["plan"], standardFallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (plan === "pro") {
    return PRO_AI_QUOTA;
  }

  if (plan === "enterprise") {
    return null;
  }

  return standardFallback;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readEmailArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function readDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

function isInRange(date: Date | null, start: Date, end: Date) {
  if (!date) {
    return false;
  }

  return date >= start && date < end;
}

function getPreviousWeekRange() {
  const now = new Date();
  const todayJst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const day = todayJst.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const thisMondayJst = new Date(todayJst);
  thisMondayJst.setHours(0, 0, 0, 0);
  thisMondayJst.setDate(thisMondayJst.getDate() - daysSinceMonday);
  const previousMondayJst = new Date(thisMondayJst);
  previousMondayJst.setDate(previousMondayJst.getDate() - 7);

  return {
    start: jstDateToUtc(previousMondayJst),
    end: jstDateToUtc(thisMondayJst),
    key: formatDateKey(previousMondayJst),
  };
}

function getCurrentMonthRange() {
  const now = new Date();
  const todayJst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const startJst = new Date(todayJst.getFullYear(), todayJst.getMonth(), 1);
  const nextMonthJst = new Date(todayJst.getFullYear(), todayJst.getMonth() + 1, 1);

  return {
    start: jstDateToUtc(startJst),
    end: jstDateToUtc(nextMonthJst),
    key: `${todayJst.getFullYear()}-${String(todayJst.getMonth() + 1).padStart(2, "0")}`,
  };
}

function jstDateToUtc(date: Date) {
  return new Date(date.getTime() - 9 * 60 * 60 * 1000);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeEventId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
