/**
 * `uk_golf_api_seed_queue.status` values (must stay in sync with DB CHECK on that column).
 * Classified failures replace a single generic `failed` where we can infer the root cause.
 */

export const UK_GOLF_API_SEED_QUEUE_SUCCESS_STATUSES = ["pending", "processing", "staged", "partial", "skipped"] as const;

export const UK_GOLF_API_SEED_QUEUE_CLASSIFIED_FAILURE_STATUSES = [
  "missing_scorecard",
  "missing_tees",
  "invalid_si",
  "invalid_pars",
  "api_timeout",
  "rate_limited",
  "incomplete_holes",
  "duplicate_course",
  "invalid_ratings",
  /** Legacy / unclassified catch-all */
  "failed",
] as const;

export type UkGolfApiSeedQueueClassifiedFailureStatus =
  (typeof UK_GOLF_API_SEED_QUEUE_CLASSIFIED_FAILURE_STATUSES)[number];

export const UK_GOLF_API_SEED_QUEUE_ALL_STATUSES = [
  ...UK_GOLF_API_SEED_QUEUE_SUCCESS_STATUSES,
  ...UK_GOLF_API_SEED_QUEUE_CLASSIFIED_FAILURE_STATUSES,
] as const;

export type UkGolfApiSeedQueueStatus = (typeof UK_GOLF_API_SEED_QUEUE_ALL_STATUSES)[number];

/** Status values eligible for another processing attempt (excludes permanent duplicates). */
export const UK_GOLF_API_SEED_QUEUE_RETRY_STATUSES: readonly UkGolfApiSeedQueueStatus[] = [
  "pending",
  "rate_limited",
  "failed",
  "missing_scorecard",
  "missing_tees",
  "invalid_si",
  "invalid_pars",
  "api_timeout",
  "incomplete_holes",
  "invalid_ratings",
];

export function isClassifiedFailureStatus(status: string): status is UkGolfApiSeedQueueClassifiedFailureStatus {
  return (UK_GOLF_API_SEED_QUEUE_CLASSIFIED_FAILURE_STATUSES as readonly string[]).includes(status);
}

/**
 * Map thrown error / Supabase messages to a queue `status` for observability.
 */
export function classifyUkGolfApiSeedQueueFailure(message: string): UkGolfApiSeedQueueClassifiedFailureStatus {
  const m = message.toLowerCase();

  if (/duplicate|unique constraint|unique violation|already exists|\b23505\b/.test(m)) {
    return "duplicate_course";
  }
  if (/timeout|timed out|\betimedout\b|\beconnreset\b|abort|socket hang|fetch failed|network error/.test(m)) {
    return "api_timeout";
  }
  if (/\bsi_duplicate\b|\bsi_range\b|stroke index|stroke_index/.test(m)) {
    return "invalid_si";
  }
  if (/\bpar_missing\b|\bpar_total\b|par mismatch|par total/.test(m)) {
    return "invalid_pars";
  }
  if (/\bhole_count\b|incomplete.*hole|expected\s*18|!=\s*18|\b18\s*holes\b/.test(m)) {
    return "incomplete_holes";
  }
  if (/\bslope_range\b|course_rating|slope_rating|invalid.*rating|rating.*invalid/.test(m)) {
    return "invalid_ratings";
  }
  if (/no_tee_data|no tee sets|no tee data|\btees\b.*\bempty\b|empty.*\btees\b/.test(m)) {
    return "missing_tees";
  }
  if (/scorecard|getcoursescorecard|course detail/.test(m)) {
    return "missing_scorecard";
  }

  return "failed";
}
