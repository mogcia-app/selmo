export const defaultCompanyId = "default";

export function resolveCompanyId(companyId?: string | null) {
  return companyId?.trim() || defaultCompanyId;
}
