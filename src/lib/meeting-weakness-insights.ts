import type { MeetingRecord } from "@/lib/firebase/meetings";

export type ProductWeaknessRow = {
  productName: string;
  weaknessLabel: string;
  count: number;
  meetingCount: number;
  averageScore: number | null;
  trainingTheme: string;
  evidence: string;
};

type ProductWeaknessAccumulator = {
  productName: string;
  weaknessLabel: string;
  count: number;
  meetingIds: Set<string>;
  scoreTotal: number;
  scoreCount: number;
  evidence: string[];
};

export function buildProductWeaknessRows(meetings: MeetingRecord[], limit = 8): ProductWeaknessRow[] {
  const rowsByKey = new Map<string, ProductWeaknessAccumulator>();

  meetings.forEach((meeting) => {
    if (!meeting.aiSummary) return;

    const productName = meeting.productType.trim() || "商材未設定";
    const meetingId = meeting.id;
    const weaknesses = extractMeetingWeaknesses(meeting);

    weaknesses.forEach((weakness) => {
      const key = `${productName}::${weakness.label}`;
      const current = rowsByKey.get(key) ?? {
        productName,
        weaknessLabel: weakness.label,
        count: 0,
        meetingIds: new Set<string>(),
        scoreTotal: 0,
        scoreCount: 0,
        evidence: [],
      };

      current.count += 1;
      current.meetingIds.add(meetingId);
      if (typeof weakness.score === "number") {
        current.scoreTotal += weakness.score;
        current.scoreCount += 1;
      }
      if (weakness.evidence) {
        current.evidence.push(weakness.evidence);
      }
      rowsByKey.set(key, current);
    });
  });

  return Array.from(rowsByKey.values())
    .map((row) => ({
      productName: row.productName,
      weaknessLabel: row.weaknessLabel,
      count: row.count,
      meetingCount: row.meetingIds.size,
      averageScore: row.scoreCount > 0 ? Math.round(row.scoreTotal / row.scoreCount) : null,
      trainingTheme: `${row.productName}の${row.weaknessLabel}を鍛えるロープレ`,
      evidence: row.evidence[0] ?? "AI分析で同じ弱点が複数回出ています。",
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return (left.averageScore ?? 101) - (right.averageScore ?? 101);
    })
    .slice(0, limit);
}

function extractMeetingWeaknesses(meeting: MeetingRecord) {
  const summary = meeting.aiSummary;
  if (!summary) return [];

  const missingCriteria = summary.manualCompliance?.missingCriteria ?? [];
  const missingChecklistItems = summary.manualCompliance?.checklistItems
    ?.filter((item) => item.status === "missing")
    .map((item) => item.label || item.category)
    .filter(Boolean) ?? [];
  const lowEvaluations = summary.diagnosis?.salesEvaluation
    ?.filter((item) => typeof item.score === "number" && item.score <= 70)
    .map((item) => ({
      label: normalizeWeaknessLabel(item.label),
      score: item.score,
      evidence: item.evidence?.[0] ?? item.description ?? "",
    })) ?? [];

  const manualWeaknesses = [...missingCriteria, ...missingChecklistItems]
    .map((label) => ({
      label: normalizeWeaknessLabel(label),
      score: null,
      evidence: label,
    }));

  return uniqueWeaknesses([...manualWeaknesses, ...lowEvaluations])
    .filter((item) => item.label);
}

function normalizeWeaknessLabel(value: string | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  if (normalized.includes("ヒアリング") || normalized.includes("課題") || normalized.includes("深掘")) return "課題ヒアリング";
  if (normalized.includes("決裁") || normalized.includes("担当者")) return "決裁者確認";
  if (normalized.includes("予算") || normalized.includes("費用") || normalized.includes("料金")) return "予算確認";
  if (normalized.includes("時期") || normalized.includes("導入") || normalized.includes("日程")) return "導入時期確認";
  if (normalized.includes("提案") || normalized.includes("価値") || normalized.includes("メリット")) return "価値提案";
  if (normalized.includes("反論") || normalized.includes("不安") || normalized.includes("懸念")) return "反論処理";
  if (normalized.includes("クロージング") || normalized.includes("次回") || normalized.includes("アクション")) return "次回アクション合意";
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
}

function uniqueWeaknesses<T extends { label: string }>(items: T[]) {
  const labels = new Set<string>();
  return items.filter((item) => {
    if (!item.label || labels.has(item.label)) return false;
    labels.add(item.label);
    return true;
  });
}
