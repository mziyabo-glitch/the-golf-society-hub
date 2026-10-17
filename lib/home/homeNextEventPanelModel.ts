import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";

export type HomePlayingStatus = {
  label: "Playing" | "Not playing" | "No response";
  tone: "success" | "neutral" | "warning";
};

/** Display-only: whether the event advertises a non-zero entry fee. */
export function hasBillableEventFee(feeDisplay: string | null | undefined): boolean {
  const fee = feeDisplay?.trim();
  if (!fee) return false;
  const lower = fee.toLowerCase();
  if (lower === "not set" || lower === "free" || lower === "n/a" || lower === "none" || lower === "tbc") {
    return false;
  }
  if (/^(£|\$|€)?\s*0(\.0+)?(\s|$)/.test(lower)) return false;
  if (lower === "£0" || lower === "$0" || lower === "€0" || lower === "0") return false;
  return true;
}

export function resolveHomePlayingStatus(myReg: EventRegistration | null): HomePlayingStatus {
  if (myReg?.status === "in") return { label: "Playing", tone: "success" };
  if (myReg?.status === "out") return { label: "Not playing", tone: "neutral" };
  return { label: "No response", tone: "warning" };
}

/** Fee + paid/outstanding row: only when member is playing and a billable fee exists. */
export function shouldShowHomePaymentRow(
  myReg: EventRegistration | null,
  feeDisplay: string | null | undefined,
): boolean {
  if (myReg?.status !== "in") return false;
  return hasBillableEventFee(feeDisplay);
}

export function homeEventPrimaryCtaLabel(canManage: boolean): string {
  return canManage ? "Manage event" : "View event";
}
