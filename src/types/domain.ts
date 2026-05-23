export type UserRole = "admin" | "sales";

export type CallOutcome = "considering" | "won" | "lost";

export type CustomerType = "new" | "existing";

export type ManualCheckStatus = "ok" | "needs_improvement" | "ng";

export type ProcessingStatus =
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";
