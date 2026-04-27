/**
 * Shared Free Play “trust” labels for course search hits and approval state.
 * Keep copy aligned with the Free Play Trust Model product spec.
 */

export type FreePlayTrustLabel = "verified" | "society_approved" | "pending_review" | "unverified";

export type FreePlayTrustCopy = {
  badge: string;
  /** Primary explanation shown under the badge. */
  detail: string;
};

const COPY: Record<FreePlayTrustLabel, FreePlayTrustCopy> = {
  verified: {
    badge: "Verified",
    detail: "Trusted course data approved by Golf Society Hub.",
  },
  society_approved: {
    badge: "Society approved",
    detail: "Approved for use by your society, but not yet globally verified.",
  },
  pending_review: {
    badge: "Pending review",
    detail: "Additional course data has been submitted and is awaiting Golf Society Hub review.",
  },
  unverified: {
    badge: "Unverified",
    detail: "Course found by name only. Data may be incomplete until reviewed.",
  },
};

export function getFreePlayTrustCopy(label: FreePlayTrustLabel): FreePlayTrustCopy {
  return COPY[label];
}

/** Same precedence as {@link computeTrustRankForSearchHit} (verified → society → pending → other). */
export function deriveFreePlayTrustLabel(input: {
  globalStatus: string | null | undefined;
  societyApproved: boolean;
  pendingSubmission: boolean;
}): FreePlayTrustLabel {
  if (input.globalStatus === "verified") return "verified";
  if (input.societyApproved) return "society_approved";
  if (input.pendingSubmission) return "pending_review";
  return "unverified";
}

/**
 * Trust sort tier for Free Play search (0 = best).
 * Mirrors `enrichAndSortFreePlayCourseHits` in `courseRepo`.
 */
export function computeTrustRankForSearchHit(input: {
  golfer_data_status?: string | null;
  societyApprovedForSociety?: boolean;
  pendingCourseDataReview?: boolean;
}): number {
  const label = deriveFreePlayTrustLabel({
    globalStatus: input.golfer_data_status ?? null,
    societyApproved: Boolean(input.societyApprovedForSociety),
    pendingSubmission: Boolean(input.pendingCourseDataReview),
  });
  switch (label) {
    case "verified":
      return 0;
    case "society_approved":
      return 1;
    case "pending_review":
      return 2;
    default:
      return 3;
  }
}
