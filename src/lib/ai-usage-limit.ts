export const DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA = 10;
export const DEFAULT_MONTHLY_ROLEPLAY_QUOTA = 15;
export const SALES_MONTHLY_AI_USAGE_LIMIT = DEFAULT_MONTHLY_TRANSCRIPTION_QUOTA + DEFAULT_MONTHLY_ROLEPLAY_QUOTA;

export const SALES_MONTHLY_AI_USAGE_FEATURES = ["summary"] as const;

export function isSalesMonthlyAiUsageFeature(feature: string | null | undefined) {
  return SALES_MONTHLY_AI_USAGE_FEATURES.includes(feature as (typeof SALES_MONTHLY_AI_USAGE_FEATURES)[number]);
}

export function resolveSharedMonthlyAiQuota(transcriptionQuota: number | null, roleplayQuota: number | null) {
  if (transcriptionQuota === null || roleplayQuota === null) return null;
  return transcriptionQuota + roleplayQuota;
}

export function isMonthlyAiUsageUnavailable(transcriptionQuota: number | null, roleplayQuota: number | null) {
  const quota = resolveSharedMonthlyAiQuota(transcriptionQuota, roleplayQuota);
  return quota !== null && quota <= 0;
}

export const MONTHLY_AI_LIMIT_MESSAGE =
  "月間利用上限に達しました。管理者に上限変更を依頼してください。";
