/** WHS slope rating valid range when published. */
export const SLOPE_RATING_MIN = 55;
export const SLOPE_RATING_MAX = 155;

/**
 * Normalize slope for storage/display: null when missing, zero, NaN, or out of WHS range.
 * Valid slopes (55–155) are returned rounded.
 */
export function normalizeSlopeRating(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  if (rounded < SLOPE_RATING_MIN || rounded > SLOPE_RATING_MAX) return null;
  return rounded;
}

/** UI label for tee cards and event detail — never shows 0 as a slope. */
export function formatSlopeRatingLabel(value: unknown): string {
  const slope = normalizeSlopeRating(value);
  return slope != null ? `SR ${slope}` : "Slope not available";
}

export function hasValidSlopeRating(value: unknown): boolean {
  return normalizeSlopeRating(value) != null;
}
