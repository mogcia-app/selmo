export type UserRole = "owner" | "admin" | "sales";

export type MeetingOutcome = "considering" | "won" | "lost";

export type CustomerType = "new" | "existing";

export type MeetingPurpose =
  | "new_proposal"
  | "closing"
  | "existing_followup"
  | "relationship_building"
  | "check_in"
  | "upsell_cross_sell"
  | "onboarding"
  | "retention";

export type ManualCheckStatus = "ok" | "needs_improvement" | "ng";

export type ProcessingStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";
