const BLOCKED_METADATA_KEYS = new Set([
  "email",
  "name",
  "displayname",
  "display_name",
  "member_name",
  "phone",
  "password",
  "token",
  "invite",
]);

/** Strip keys that may carry PII; keep ids, counts, enums, and short codes. */
export function sanitizeAnalyticsMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || BLOCKED_METADATA_KEYS.has(normalized)) continue;
    if (value == null) continue;
    if (typeof value === "string" && value.length > 200) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeAnalyticsMetadata(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 20) continue;
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}
