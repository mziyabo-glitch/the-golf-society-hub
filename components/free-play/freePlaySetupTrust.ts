import type { FreePlayTrustLabel } from "@/lib/course/freePlayTrustPresentation";

export type FreePlayDataTrustBadge = "verified" | "partial" | "unverified" | "missing_si";

export function deriveFreePlayDataTrustBadge(input: {
  trustLabel: FreePlayTrustLabel;
  /** True when hole rows exist but at least one is missing a real stroke index. */
  strokeIndexIncomplete: boolean;
  /** No hole metadata loaded for the selected context (tee/course). */
  holesUnavailable: boolean;
}): FreePlayDataTrustBadge {
  if (input.strokeIndexIncomplete || input.holesUnavailable) return "missing_si";
  if (input.trustLabel === "verified") return "verified";
  if (input.trustLabel === "society_approved" || input.trustLabel === "pending_review") return "partial";
  return "unverified";
}

export function freePlayDataTrustBadgeLabel(badge: FreePlayDataTrustBadge): string {
  switch (badge) {
    case "verified":
      return "Verified";
    case "partial":
      return "Partial";
    case "unverified":
      return "Unverified";
    case "missing_si":
      return "Missing SI";
    default:
      return "Unverified";
  }
}
