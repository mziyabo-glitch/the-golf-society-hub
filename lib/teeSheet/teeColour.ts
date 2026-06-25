/** Shared tee colour resolution for poster rows, editor chips, and course setup. */

const TEE_COLOUR_HEX: Record<string, string> = {
  white: "#FFFFFF",
  yellow: "#E0B100",
  gold: "#C6A663",
  blue: "#2563EB",
  red: "#C1121F",
  black: "#111827",
  green: "#16A34A",
  orange: "#EA580C",
};

const TEE_EMOJI: Record<string, string> = {
  white: "⚪",
  yellow: "🟡",
  gold: "🟡",
  blue: "🔵",
  red: "🔴",
  black: "⚫",
  green: "🟢",
  orange: "🟠",
};

export type ResolvedTeeColour = {
  color: string;
  /** True when fill is white/light and needs a visible border in PNG/UI. */
  outline?: boolean;
  outlineColor?: string;
};

function cleanTeeName(value: string | null | undefined): string {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : "";
}

/** Normalize tee name to a colour key (white, yellow, red, …). */
export function teeColourKeyFromName(teeName: string | null | undefined): string {
  const raw = cleanTeeName(teeName).toLowerCase();
  if (!raw) return "white";
  const compact = raw.replace(/\s+/g, "");
  if (TEE_COLOUR_HEX[compact]) return compact;
  for (const key of Object.keys(TEE_COLOUR_HEX)) {
    if (raw.includes(key)) return key;
  }
  return "white";
}

export function teeColourFromName(teeName: string | null | undefined): ResolvedTeeColour {
  const key = teeColourKeyFromName(teeName);
  const color = TEE_COLOUR_HEX[key] ?? TEE_COLOUR_HEX.white;
  const outline = key === "white" || color === "#FFFFFF";
  return {
    color,
    outline: outline || undefined,
    outlineColor: outline ? "#94A3B8" : undefined,
  };
}

function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Compact row label — uses resolved tee name, not men/ladies defaults. */
export function formatTeeRowLabel(teeName: string | null | undefined): string {
  const cleaned = cleanTeeName(teeName);
  const key = teeColourKeyFromName(cleaned);
  const emoji = TEE_EMOJI[key] ?? "⛳";
  const label = cleaned ? capitalizeWords(cleaned) : capitalizeWords(key);
  return `${emoji} ${label}`;
}

export function teeLegendLine(menTeeName: string | null | undefined, ladiesTeeName: string | null | undefined): string {
  const men = cleanTeeName(menTeeName) || "Men";
  const ladies = cleanTeeName(ladiesTeeName) || "Ladies";
  return `Tee colours: ${men} = Men, ${ladies} = Ladies`;
}
