import { formatHoleNumbers } from "@/lib/teeSheetGrouping";
import { type TeeSheetData } from "@/lib/teeSheetPdf";
import { DEFAULT_ALLOWANCE } from "@/lib/whs";

function cleanText(value: string | null | undefined): string | null {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : null;
}

export function formatEventDate(eventDate: string | null): string {
  if (!eventDate) return "Date TBC";
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) return "Date TBC";
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatLabel(raw: string | null): string {
  if (!raw) return "Format TBC";
  const value = raw.replace(/_/g, " ").trim();
  if (!value) return "Format TBC";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function normalizeCompetitionHoles(value: unknown): number[] {
  const coerceNumber = (entry: unknown): number | null => {
    const n = typeof entry === "number" ? entry : Number(String(entry ?? "").trim());
    if (!Number.isFinite(n)) return null;
    const hole = Math.trunc(n);
    if (hole < 1 || hole > 18) return null;
    return hole;
  };

  const toArray = (raw: unknown): unknown[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") return raw.split(/[,\s/|;-]+/g).filter(Boolean);
    if (raw && typeof raw === "object" && "holes" in (raw as Record<string, unknown>)) {
      return toArray((raw as Record<string, unknown>).holes);
    }
    return [];
  };

  const parsed = toArray(value)
    .map(coerceNumber)
    .filter((hole): hole is number => hole !== null);

  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

export function formatCompetitionLine(rawHoles: unknown): string {
  const holes = normalizeCompetitionHoles(rawHoles);
  if (!holes.length) return "Not set";
  return `Hole${holes.length > 1 ? "s" : ""} ${formatHoleNumbers(holes)}`;
}

/** Strip legacy RTS branding from display titles (poster/PDF header). */
export function stripRtsBranding(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned
    .replace(/\s*\(\s*RTS[^)]*\)\s*/gi, " ")
    .replace(/\s*[-–|/]\s*RTS\b[^|]*/gi, "")
    .replace(/\bRTS\s*[-–|/]\s*/gi, "")
    .replace(/\s*\(RTS\)\s*/gi, " ")
    .replace(/\bRTS\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildPosterHeader(data: TeeSheetData): { title: string; badge: string } {
  return {
    title: stripRtsBranding(data.eventName) ?? "Event TBC",
    badge: formatLabel(data.format),
  };
}

export function buildInfoCards(data: TeeSheetData): { label: string; value: string }[] {
  const allowance = data.handicapAllowance ?? DEFAULT_ALLOWANCE;
  const menTeeLabel = cleanText(data.teeName) ?? "White";
  const ladiesTeeLabel = cleanText(data.ladiesTeeName) ?? "Red";
  const menSegment = data.teeSettings
    ? `M ${menTeeLabel} / SR ${data.teeSettings.slopeRating} / CR ${data.teeSettings.courseRating}`
    : `M ${menTeeLabel} / SR - / CR -`;
  const ladiesSegment = data.ladiesTeeSettings
    ? `L ${ladiesTeeLabel} / SR ${data.ladiesTeeSettings.slopeRating} / CR ${data.ladiesTeeSettings.courseRating}`
    : `L ${ladiesTeeLabel} / SR - / CR -`;
  const course = cleanText(data.courseName) ?? "Course TBC";
  const eventFormat = formatLabel(data.format);

  return [
    { label: "Date", value: formatEventDate(data.eventDate) },
    { label: "Course & Format", value: `${course} / ${eventFormat}` },
    { label: "Tee • Slope • Rating", value: `${menSegment} | ${ladiesSegment} | ALW ${Math.round(allowance * 100)}%` },
  ];
}
