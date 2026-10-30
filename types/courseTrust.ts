/** Member / photo submission for missing course data (platform review). */
export type CourseDataSubmissionType = "manual_entry" | "scorecard_photo" | "manual_plus_photo";

export type CourseDataSubmissionStatus = "pending_review" | "approved" | "rejected";

export type CourseApprovalState = {
  courseId: string;
  /** From `courses.golfer_data_status` (global; only Golf Society Hub staff may set verified / partial / rejected). */
  globalStatus: string | null;
  /** Local society approval row exists for this course + society. */
  societyApproved: boolean;
  societyApprovedAt: string | null;
  societyApprovalNotes: string | null;
  /** Any `pending_review` submission exists for this course. */
  pendingSubmission: boolean;
};
