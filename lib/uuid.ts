/**
 * UUID validation helper.
 * Treat "" and blank strings as invalid.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  if (s === "") return false;
  return UUID_REGEX.test(s);
}
