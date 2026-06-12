import type { AppUserProfile } from "@/lib/firebase/auth";

export type SalesDomain = "meeting" | "teleapo";

export type EnabledSalesDomains = Record<SalesDomain, boolean>;

export const defaultEnabledSalesDomains: EnabledSalesDomains = {
  meeting: true,
  teleapo: true,
};

export function readEnabledSalesDomains(value: unknown): EnabledSalesDomains {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultEnabledSalesDomains;
  }

  const record = value as Partial<Record<SalesDomain, unknown>>;

  return {
    meeting: typeof record.meeting === "boolean" ? record.meeting : true,
    teleapo: typeof record.teleapo === "boolean" ? record.teleapo : true,
  };
}

export function canUseSalesDomain(profile: AppUserProfile | null | undefined, domain: SalesDomain) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return profile.enabledSalesDomains[domain] === true;
}

export function getMeetingSalesDomain(value: unknown): SalesDomain {
  return value === "teleapo" ? "teleapo" : "meeting";
}
