export type UserRole = "admin" | "sales";

export type MeetingOutcome = "considering" | "won" | "lost";

export type CustomerType = "new" | "existing";

export type ManualCheckStatus = "ok" | "needs_improvement" | "ng";

export type ProcessingStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";
