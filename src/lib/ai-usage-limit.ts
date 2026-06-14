export const SALES_MONTHLY_AI_USAGE_LIMIT = 50;

export const SALES_MONTHLY_AI_USAGE_FEATURES = ["summary"] as const;

export function isSalesMonthlyAiUsageFeature(feature: string | null | undefined) {
  return SALES_MONTHLY_AI_USAGE_FEATURES.includes(feature as (typeof SALES_MONTHLY_AI_USAGE_FEATURES)[number]);
}

export const MONTHLY_AI_LIMIT_MESSAGE =
  "月間利用上限に達しました。管理者に上限変更を依頼してください。";
