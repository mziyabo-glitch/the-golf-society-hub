export function normalizeCourseText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeNormalized(input: string): string[] {
  const normalized = normalizeCourseText(input);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);

  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) intersection += 1;
  });
  const union = new Set([...aSet, ...bSet]).size;
  if (union === 0) return 0;
  return intersection / union;
}

export function boundedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function normalizeGender(input: string | null | undefined): string {
  const n = normalizeCourseText(input);
  if (!n) return "mixed";
  if (n.startsWith("m") || n.includes("men")) return "male";
  if (n.startsWith("f") || n.includes("ladies") || n.includes("women")) return "female";
  return "mixed";
}

export function normalizeTeeColor(input: string | null | undefined): string {
  const n = normalizeCourseText(input);
  if (!n) return "";
  if (n.includes("yellow")) return "yellow";
  if (n.includes("white")) return "white";
  if (n.includes("red")) return "red";
  if (n.includes("blue")) return "blue";
  if (n.includes("black")) return "black";
  if (n.includes("green")) return "green";
  return n;
}
