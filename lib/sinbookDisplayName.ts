const PLACEHOLDER_NAME_PATTERN = /^(player|unknown|rival|member)(\s*\d+)?$/i;

export type SinbookNameUserSource = {
  email?: string | null;
  user_metadata?: {
    full_name?: unknown;
    name?: unknown;
  } | null;
};

function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function nameFromEmail(email: string | null | undefined): string {
  const normalizedEmail = normalizeName(email);
  if (!normalizedEmail.includes("@")) return "";
  const localPart = normalizedEmail.split("@")[0] ?? "";
  const words = localPart.replace(/[._-]+/g, " ");
  return normalizeName(toTitleCase(words));
}

function nameFromUser(user: SinbookNameUserSource | null | undefined): string {
  if (!user) return "";
  const metadataName = normalizeName(
    user.user_metadata?.full_name ?? user.user_metadata?.name
  );
  if (metadataName && !isPlaceholderDisplayName(metadataName)) return metadataName;
  return nameFromEmail(user.email);
}

export function isPlaceholderDisplayName(value: unknown): boolean {
  const normalized = normalizeName(value);
  if (!normalized) return true;
  return PLACEHOLDER_NAME_PATTERN.test(normalized);
}

export function resolveSinbookDisplayName({
  explicitName,
  user,
  fallback = "Player",
}: {
  explicitName?: unknown;
  user?: SinbookNameUserSource | null;
  fallback?: string;
}): string {
  const explicit = normalizeName(explicitName);
  if (explicit && !isPlaceholderDisplayName(explicit)) return explicit;

  const fromUser = nameFromUser(user);
  if (fromUser && !isPlaceholderDisplayName(fromUser)) return fromUser;

  const normalizedFallback = normalizeName(fallback);
  return normalizedFallback || "Player";
}

export function extractVsNames(title: string | null | undefined): [string, string] | null {
  const normalizedTitle = normalizeName(title);
  if (!normalizedTitle) return null;

  const match = normalizedTitle.match(/^(.+?)\s+v(?:s)?\.?\s+(.+)$/i);
  if (!match) return null;

  const first = normalizeName(match[1]);
  const second = normalizeName(match[2]);
  if (!first || !second) return null;

  return [first, second];
}
