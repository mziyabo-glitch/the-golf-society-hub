import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type SeedPhase = "england_wales" | "scotland" | "ireland";

type GbSeedRow = {
  name: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
  region: string | null;
  county: string | null;
  canonicalApiId: number | null;
  raw: Record<string, unknown>;
};

type RawGbArrayRow = [string?, number?, number?, string?];

type ExistingCandidateRow = {
  normalized_name: string | null;
  canonical_api_id: number | null;
};

type ExistingCourseRow = {
  course_name: string | null;
  club_name: string | null;
  canonical_api_id: number | null;
  api_id: number | null;
};

const TERRITORY = "uk";
const DISCOVERY_SOURCE = "external_dataset:gb.json";
const ROUND_DP_DEFAULT = 4;
const PAGE_SIZE = 1000;

const NON_CORE_PATTERNS: RegExp[] = [
  /\bdriving\s+range\b/i,
  /\bpitch\s*(?:and|&)\s*putt\b/i,
  /\bpar\s*-?\s*3\b/i,
  /\bacademy\b/i,
  /\bpractice\s+ground\b/i,
  /\bmini(?:ature)?\s+golf\b/i,
  /\bcrazy\s+golf\b/i,
];

function parseArg(flag: string): string | undefined {
  const entry = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return entry?.slice(flag.length + 1).trim();
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCanonicalApiId(raw: Record<string, unknown>): number | null {
  const candidates = [raw.canonical_api_id, raw.api_id, raw.golf_api_id];
  for (const item of candidates) {
    const n = asFiniteNumber(item);
    if (n != null && n > 0) return Math.round(n);
  }
  return null;
}

function toGbSeedRow(rawUnknown: unknown): GbSeedRow | null {
  if (Array.isArray(rawUnknown)) {
    const arr = rawUnknown as RawGbArrayRow;
    const name = typeof arr[0] === "string" ? cleanName(arr[0]) : "";
    if (!name) return null;
    const lat = asFiniteNumber(arr[1]);
    const lng = asFiniteNumber(arr[2]);
    const area = typeof arr[3] === "string" ? cleanName(arr[3]) : null;
    return {
      name,
      lat,
      lng,
      country: "UK",
      region: area && area.length > 0 ? area : null,
      county: null,
      canonicalApiId: null,
      raw: { raw_row: arr },
    };
  }

  const raw = (rawUnknown ?? {}) as Record<string, unknown>;
  const nameRaw = raw.name ?? raw.course_name ?? raw.club_name ?? raw.title;
  const name = typeof nameRaw === "string" ? cleanName(nameRaw) : "";
  if (!name) return null;

  const lat = asFiniteNumber(raw.lat ?? raw.latitude);
  const lng = asFiniteNumber(raw.lng ?? raw.lon ?? raw.longitude);
  const country = typeof raw.country === "string" ? cleanName(raw.country) : null;
  const region = typeof raw.region === "string" ? cleanName(raw.region) : null;
  const county = typeof raw.county === "string" ? cleanName(raw.county) : null;

  return {
    name,
    lat,
    lng,
    country,
    region,
    county,
    canonicalApiId: parseCanonicalApiId(raw),
    raw,
  };
}

function classifySeedPhase(row: GbSeedRow): SeedPhase {
  const locationText = [row.country, row.region, row.county].filter(Boolean).join(" ").toLowerCase();
  if (
    /\bnorthern\s+ireland\b/.test(locationText) ||
    /\bireland\b/.test(locationText) ||
    /\bantrim\b|\barmagh\b|\bdown\b|\bfermanagh\b|\btyrone\b|\bderry\b|\blondonderry\b/.test(locationText)
  ) {
    return "ireland";
  }
  if (/\bscotland\b/.test(locationText)) return "scotland";

  if (row.lat != null && row.lng != null) {
    const inNorthernIrelandBox = row.lat >= 54.0 && row.lat <= 55.4 && row.lng >= -8.5 && row.lng <= -5.2;
    if (inNorthernIrelandBox) return "ireland";
    if (row.lat >= 55.85) return "scotland";
  }
  return "england_wales";
}

function shouldExcludeNonCoreVenue(name: string): boolean {
  return NON_CORE_PATTERNS.some((p) => p.test(name));
}

function roundedCoord(value: number | null, dp: number): string {
  if (value == null) return "na";
  return value.toFixed(dp);
}

function buildInputDedupeKey(row: GbSeedRow, roundedDp: number): string {
  return `${normalizeName(row.name)}|${roundedCoord(row.lat, roundedDp)}|${roundedCoord(row.lng, roundedDp)}`;
}

async function fetchAllRows<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client.from(table).select(columns).range(from, to);
    if (error) throw new Error(error.message || `Failed to read ${table}.`);
    const rows = ((data ?? []) as T[]).filter(Boolean);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const inputArg = parseArg("--input");
  const dryRun = hasArg("--dry-run");
  const includeNonCore = hasArg("--include-non-core");
  const roundedDpRaw = Number(parseArg("--coord-round-dp") ?? ROUND_DP_DEFAULT);
  const roundedDp = Number.isFinite(roundedDpRaw) && roundedDpRaw >= 2 && roundedDpRaw <= 6 ? Math.round(roundedDpRaw) : ROUND_DP_DEFAULT;

  const inputPath = inputArg
    ? resolvePath(process.cwd(), inputArg)
    : resolvePath(process.cwd(), "data", "gb.json");

  const payload = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(payload) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Input JSON must be an array of course rows.");

  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const existingCandidates = await fetchAllRows<ExistingCandidateRow>(
    supabase,
    "course_import_candidates",
    "normalized_name, canonical_api_id",
  );
  const existingCourses = await fetchAllRows<ExistingCourseRow>(
    supabase,
    "courses",
    "course_name, club_name, canonical_api_id, api_id",
  );

  const existingCandidateNames = new Set(existingCandidates.map((r) => String(r.normalized_name ?? "").trim()).filter(Boolean));
  const existingCandidateApiIds = new Set(
    existingCandidates.map((r) => (r.canonical_api_id != null ? Math.round(Number(r.canonical_api_id)) : null)).filter((n): n is number => n != null && n > 0),
  );
  const existingCourseNames = new Set<string>();
  const existingCourseApiIds = new Set<number>();
  for (const row of existingCourses) {
    const courseName = cleanName(String(row.course_name ?? ""));
    const clubName = cleanName(String(row.club_name ?? ""));
    if (courseName) existingCourseNames.add(normalizeName(courseName));
    if (clubName) existingCourseNames.add(normalizeName(clubName));
    if (courseName && clubName) existingCourseNames.add(normalizeName(`${clubName} ${courseName}`));
    const canonicalApiId = asFiniteNumber(row.canonical_api_id);
    if (canonicalApiId != null && canonicalApiId > 0) existingCourseApiIds.add(Math.round(canonicalApiId));
    const apiId = asFiniteNumber(row.api_id);
    if (apiId != null && apiId > 0) existingCourseApiIds.add(Math.round(apiId));
  }

  const seenInputKeys = new Set<string>();
  const phaseBreakdownInserted: Record<SeedPhase, number> = {
    england_wales: 0,
    scotland: 0,
    ireland: 0,
  };
  const phaseBreakdownSkippedDup: Record<SeedPhase, number> = {
    england_wales: 0,
    scotland: 0,
    ireland: 0,
  };

  let totalInput = 0;
  let excludedNonCore = 0;
  let skippedMalformed = 0;
  let duplicatesSkipped = 0;
  let inserted = 0;

  for (const rawRow of parsed) {
    totalInput += 1;
    const row = toGbSeedRow(rawRow);
    if (!row) {
      skippedMalformed += 1;
      continue;
    }
    if (!includeNonCore && shouldExcludeNonCoreVenue(row.name)) {
      excludedNonCore += 1;
      continue;
    }

    const phase = classifySeedPhase(row);
    const normalized = normalizeName(row.name);
    const inputKey = buildInputDedupeKey(row, roundedDp);
    if (seenInputKeys.has(inputKey)) {
      duplicatesSkipped += 1;
      phaseBreakdownSkippedDup[phase] += 1;
      continue;
    }
    seenInputKeys.add(inputKey);

    const duplicateByName = existingCandidateNames.has(normalized) || existingCourseNames.has(normalized);
    const duplicateByApiId =
      row.canonicalApiId != null &&
      (existingCandidateApiIds.has(row.canonicalApiId) || existingCourseApiIds.has(row.canonicalApiId));
    if (duplicateByName || duplicateByApiId) {
      duplicatesSkipped += 1;
      phaseBreakdownSkippedDup[phase] += 1;
      continue;
    }

    const payload = {
      candidate_name: row.name,
      normalized_name: normalized,
      country: row.country ?? "UK",
      territory: TERRITORY,
      seed_phase: phase,
      discovery_source: DISCOVERY_SOURCE,
      status: "queued" as const,
      sync_status: "queued" as const,
      canonical_api_id: row.canonicalApiId,
      import_priority: 120,
      metadata: {
        source: DISCOVERY_SOURCE,
        sourceFile: inputPath,
        coordRoundedDp: roundedDp,
        lat: row.lat,
        lng: row.lng,
        region: row.region,
        county: row.county,
      },
    };

    if (!dryRun) {
      const { error } = await supabase.from("course_import_candidates").upsert(payload, {
        onConflict: "territory,normalized_name",
      });
      if (error) throw new Error(error.message || `Failed to upsert candidate: ${row.name}`);
    }

    inserted += 1;
    phaseBreakdownInserted[phase] += 1;
    existingCandidateNames.add(normalized);
    if (row.canonicalApiId != null) existingCandidateApiIds.add(row.canonicalApiId);
  }

  const summary = {
    inputPath,
    dryRun,
    totalInputRows: totalInput,
    skippedMalformed,
    excludedNonCore,
    inserted,
    duplicatesSkipped,
    insertedByPhase: phaseBreakdownInserted,
    duplicatesSkippedByPhase: phaseBreakdownSkippedDup,
  };

  console.log("[gb-seed] complete:", JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[gb-seed] fatal:", message);
  process.exit(1);
});
