export const uploadDurationLimitOptions = [60, 120, 180, 240] as const;
export const defaultUploadDurationLimitMinutes = 60;
export const uploadDurationGraceMinutes = 3;

export type UploadDurationLimitMinutes = (typeof uploadDurationLimitOptions)[number];

export function readUploadDurationLimitMinutes(value: unknown): UploadDurationLimitMinutes {
  return uploadDurationLimitOptions.includes(value as UploadDurationLimitMinutes)
    ? (value as UploadDurationLimitMinutes)
    : defaultUploadDurationLimitMinutes;
}

export function getEffectiveUploadDurationLimitSec(limitMinutes: number) {
  return (limitMinutes + uploadDurationGraceMinutes) * 60;
}
