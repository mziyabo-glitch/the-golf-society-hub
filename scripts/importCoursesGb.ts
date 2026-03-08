import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type ImportArgs = {
  filePath?: string;
  countryCode: string;
  source: string;
  dryRun: boolean;
};

type ParsedCourseRow = {
  source: string;
  source_country_code: string;
  source_key: string;
  dedupe_key: string;
  name: string;
  normalized_name: string;
  lat: number;
  lng: number;
  area: string;
  raw_row: unknown[];
  imported_at: string;
  updated_at: string;
  seed_source_key: string;
};

const DEFAULT_COUNTRY_CODE = "gb";
const DEFAULT_SOURCE = "fairway_forecast";
const BATCH_SIZE = 500;

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {
    countryCode: DEFAULT_COUNTRY_CODE,
    source: DEFAULT_SOURCE,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") args.filePath = argv[i + 1];
    if (token === "--country") args.countryCode = (argv[i + 1] || DEFAULT_COUNTRY_CODE).toLowerCase();
    if (token === "--source") args.source = argv[i + 1] || DEFAULT_SOURCE;
    if (token === "--dry-run") args.dryRun = true;
  }

  return args;
}

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveArea(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLatitude(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseLongitude(value: unknown): number | null {
  return parseLatitude(value);
}

function createSourceKey(row: unknown[]): string {
  return createHash("sha1").update(JSON.stringify(row)).digest("hex");
}

function createDedupeKey(name: string, area: string, lat: number, lng: number): string {
  const roundedLat = lat.toFixed(5);
  const roundedLng = lng.toFixed(5);
  return `${normalizeName(name)}|${normalizeName(area)}|${roundedLat}|${roundedLng}`;
}

async function fileExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveInputPath(explicitPath?: string): Promise<string> {
  const candidates = [
    explicitPath,
    process.env.FAIRWAY_FORECAST_GB_PATH,
    path.resolve(process.cwd(), "fairway-forecast/data/courses/gb.json"),
    path.resolve(process.cwd(), "../fairway-forecast/data/courses/gb.json"),
    path.resolve(process.cwd(), "data/courses/gb.json"),
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (await fileExists(absolute)) return absolute;
  }

  throw new Error(
    "Could not find gb.json. Pass --file <path> or set FAIRWAY_FORECAST_GB_PATH."
  );
}

async function readRows(filePath: string): Promise<unknown[]> {
  const json = await fs.readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected gb.json to be an array of rows.");
  }
  return parsed;
}

function parseRows(rawRows: unknown[], args: ImportArgs): {
  parsed: ParsedCourseRow[];
  invalidCount: number;
} {
  const parsed: ParsedCourseRow[] = [];
  let invalidCount = 0;
  const nowIso = new Date().toISOString();

  rawRows.forEach((raw, idx) => {
    if (!Array.isArray(raw)) {
      invalidCount += 1;
      return;
    }

    const nameRaw = raw[0];
    const latRaw = raw[1];
    const lngRaw = raw[2];
    const areaRaw = raw[3];

    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const lat = parseLatitude(latRaw);
    const lng = parseLongitude(lngRaw);
    const area = resolveArea(areaRaw);

    if (!name || lat === null || lng === null) {
      invalidCount += 1;
      return;
    }

    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      invalidCount += 1;
      return;
    }

    const sourceKey = createSourceKey(raw);
    const dedupeKey = createDedupeKey(name, area, lat, lng);
    if (!dedupeKey) {
      invalidCount += 1;
      return;
    }

    parsed.push({
      source: args.source,
      source_country_code: args.countryCode,
      source_key: sourceKey,
      dedupe_key: dedupeKey,
      name,
      normalized_name: normalizedName,
      lat,
      lng,
      area,
      raw_row: raw,
      imported_at: nowIso,
      updated_at: nowIso,
      seed_source_key: sourceKey,
    });

    if ((idx + 1) % 10000 === 0) {
      console.log(`[import-courses] Parsed ${idx + 1} rows...`);
    }
  });

  return { parsed, invalidCount };
}

async function upsertInBatches(
  operationName: string,
  run: (batch: Record<string, unknown>[]) => Promise<void>,
  rows: Record<string, unknown>[]
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await run(batch);
    console.log(
      `[import-courses] ${operationName}: ${Math.min(i + batch.length, rows.length)}/${rows.length}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL).");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).");
  }

  const inputPath = await resolveInputPath(args.filePath);
  console.log("[import-courses] Using source file:", inputPath);

  const rawRows = await readRows(inputPath);
  const { parsed, invalidCount } = parseRows(rawRows, args);
  const dedupedCourses = Array.from(
    new Map(parsed.map((row) => [row.dedupe_key, row])).values()
  );

  console.log("[import-courses] Rows read:", rawRows.length);
  console.log("[import-courses] Valid seed rows:", parsed.length);
  console.log("[import-courses] Invalid rows skipped:", invalidCount);
  console.log("[import-courses] Normalized unique courses:", dedupedCourses.length);

  if (args.dryRun) {
    console.log("[import-courses] Dry run complete (no database writes).");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await upsertInBatches(
    "Upserting courses_seed",
    async (batch) => {
      const { error } = await supabase.from("courses_seed").upsert(batch, {
        onConflict: "source_country_code,source_key",
      });
      if (error) throw new Error(`courses_seed upsert failed: ${error.message}`);
    },
    parsed.map((row) => ({
      source: row.source,
      source_country_code: row.source_country_code,
      source_key: row.source_key,
      name: row.name,
      normalized_name: row.normalized_name,
      lat: row.lat,
      lng: row.lng,
      area: row.area,
      raw_row: row.raw_row,
      imported_at: row.imported_at,
      updated_at: row.updated_at,
    }))
  );

  await upsertInBatches(
    "Upserting courses",
    async (batch) => {
      const { error } = await supabase.from("courses").upsert(batch, {
        onConflict: "source_country_code,dedupe_key",
      });
      if (error) throw new Error(`courses upsert failed: ${error.message}`);
    },
    dedupedCourses.map((row) => ({
      source: row.source,
      source_country_code: row.source_country_code,
      dedupe_key: row.dedupe_key,
      seed_source_key: row.seed_source_key,
      name: row.name,
      normalized_name: row.normalized_name,
      lat: row.lat,
      lng: row.lng,
      area: row.area,
      raw_row: row.raw_row,
      updated_at: row.updated_at,
    }))
  );

  console.log("[import-courses] Import complete.");
}

main().catch((error) => {
  console.error("[import-courses] Failed:", error?.message || error);
  process.exit(1);
});
