/**
 * Phase 5 — Events module: shared user-facing labels and copy.
 * Import from screens to keep joint badges, payment wording, and status text consistent.
 */

/** Joint event — short label for chips and compact rows */
export const JOINT_EVENT_CHIP_SHORT = "Joint";

/** Joint event — full label for cards and section headers */
export const JOINT_EVENT_CHIP_LONG = "Joint Event";

/** Payment / fee status (compact pills) */
export const PaymentPill = {
  paid: "Paid",
  unpaid: "Due",
} as const;

/** Home / member-facing payment status (sentence case) */
export const PaymentStatus = {
  /** Member has settled the event fee */
  paid: "Paid",
  /** Fee still owed for a confirmed player */
  unpaid: "Payment due",
  /** Legacy uppercase variant for compact pills */
  unpaidUpper: "PAYMENT DUE",
} as const;

/** Registration playing status */
export const RegistrationStatus = {
  confirmedIn: "Confirmed",
  confirmedUpper: "CONFIRMED",
  out: "Out",
  outUpper: "OUT",
  notRegistered: "Not registered",
} as const;

/** Explainer for joint events on Home (member RSVP) */
export const JOINT_HOME_RSVP_NOTE =
  "Joint event: your playing status is shared across societies. Event fees (if any) are managed per society on the event screen.";

/** Explainer on event detail (confirmed list) */
export const JOINT_EVENT_DETAIL_ATTENDANCE_NOTE =
  "Attendance is shared across participating societies. Event fees (if any) are handled per society.";
