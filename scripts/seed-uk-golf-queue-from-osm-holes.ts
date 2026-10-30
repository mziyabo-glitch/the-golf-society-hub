/**
 * Bulk-seeds `uk_golf_api_seed_queue` from the GB course list JSON at `datasets/osm/gb.json`
 * (same tuple shape as repo-root `gb.json`: `[name, lat, lng, area?]`).
 *
 * Nightly `runUkGolfApiSeedQueue()` only adds ~28 curated clubs; this pass enqueues many
 * UK Golf API search strings so `uk-golf-api-process-queue` can pull real course data.
 *
 * Env:
 * - UK_GOLF_API_OSM_SEED_JSON_PATH — optional override path (absolute or relative to cwd); default `datasets/osm/gb.json`
 * - UK_GOLF_API_OSM_SEED_MAX_NEW (default 500) — max new rows to attempt per run
 * - UK_GOLF_API_OSM_SEED_DISABLE=true — skip entirely
 */
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  insertUkGolfApiSeedQueueRows,
  loadUkGolfApiSeedQueueKeySet,
  requireSupabaseConfig,
  territoryOrderBoost,
  type UkGolfApiSeedQueueInsertRow,
  type UkGolfApiSeedQueueTerritory,
} from "./uk-golf-api-seed-queue";

dotenv.config();

/** Same intent as `scripts/seed-gb-course-candidates.ts` — keep non-course noise out of the API queue. */
const NON_CORE_NAME_PATTERNS: RegExp[] = [
  /\bdriving\s+range\b/i,
  /\bpitch\s*(?:and|&)\s*putt\b/i,
  /\bpar\s*-?\s*3\b/i,
  /\bacademy\b/i,
  /\bpractice\s+ground\b/i,
  /\bmini(?:ature)?\s+golf\b/i,
  /\bcrazy\s+golf\b/i,
];

const GENERIC_COURSE_NAMES = new Set(
  [
    "championship course",
    "medal course",
    "championship",
    "medal",
    "blue course",
    "red course",
    "yellow course",
    "white course",
    "black course",
    "green course",
    "orange course",
    "9 hole",
    "9-hole",
    "18 hole",
    "18-hole",
    "front nine",
    "back nine",
    "academy course",
  ].map((s) => s.toLowerCase()),
);

function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function inferTerritoryFromLatLon(lat: number, lon: number): UkGolfApiSeedQueueTerritory {
  if (lon >= -8.2 && lon <= -5.2 && lat >= 54.0 && lat <= 55.45) return "ni";
  if (lat >= 55.05 && lon <= -1.45) return "scotland";
  if (lat >= 51.32 && lat <= 53.55 && lon >= -5.45 && lon <= -2.38) return "wales";
  return "england";
}

function isRoughlyUk(lat: number, lon: number): boolean {
  return lat >= 49.5 && lat <= 60.9 && lon >= -8.65 && lon <= 1.85;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function parseGbTuples(raw: string): UkGolfApiSeedQueueInsertRow[] {
  const doc = JSON.parse(raw) as unknown;
  if (!Array.isArray(doc)) return [];

  const out: UkGolfApiSeedQueueInsertRow[] = [];
  for (const item of doc) {
    if (!Array.isArray(item) || item.length < 3) continue;
    const name = cleanName(String(item[0] ?? ""));
    const lat = Number(item[1]);
    const lon = Number(item[2]);
    if (name.length < 4) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!isRoughlyUk(lat, lon)) continue;
    if (NON_CORE_NAME_PATTERNS.some((re) => re.test(name))) continue;
    const n = name.toLowerCase();
    if (GENERIC_COURSE_NAMES.has(n)) continue;

    const territory = inferTerritoryFromLatLon(lat, lon);
    const basePriority = 42 + territoryOrderBoost(territory);
    out.push({ territory, query: name, priority: basePriority });
  }
  return out;
}

export async function runUkGolfApiOsmHoleGridSeed(): Promise<{
  /** Back-compat: number of GB rows read from JSON */
  clusters: number;
  /** Back-compat: unique (territory, query) candidates after in-file dedupe */
  candidates: number;
  inserted: number;
  skippedExisting: number;
  byTerritory: Record<UkGolfApiSeedQueueTerritory, number>;
}> {
  if (String(process.env.UK_GOLF_API_OSM_SEED_DISABLE ?? "").trim().toLowerCase() === "true") {
    return { clusters: 0, candidates: 0, inserted: 0, skippedExisting: 0, byTerritory: { england: 0, wales: 0, scotland: 0, ni: 0 } };
  }

  const maxNew = Math.max(0, Math.round(Number(process.env.UK_GOLF_API_OSM_SEED_MAX_NEW ?? 500)));
  const rel = String(process.env.UK_GOLF_API_OSM_SEED_JSON_PATH ?? "").trim();
  const gbPath = rel
    ? resolvePath(process.cwd(), rel)
    : resolvePath(process.cwd(), "datasets", "osm", "gb.json");

  const raw = await readFile(gbPath, "utf8");
  const parsed = parseGbTuples(raw);
  const clusters = parsed.length;

  const dedup = new Map<string, UkGolfApiSeedQueueInsertRow>();
  for (const row of parsed) {
    const k = `${row.territory}\t${row.query.toLowerCase()}`;
    const prev = dedup.get(k);
    if (!prev || row.priority > prev.priority) dedup.set(k, row);
  }
  const unique = [...dedup.values()];
  shuffleInPlace(unique);

  const { url, key } = requireSupabaseConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const existingKeys = await loadUkGolfApiSeedQueueKeySet(supabase);
  const toInsert: UkGolfApiSeedQueueInsertRow[] = [];
  for (const row of unique) {
    if (toInsert.length >= maxNew) break;
    const k = `${row.territory}\t${row.query.toLowerCase()}`;
    if (existingKeys.has(k)) continue;
    toInsert.push(row);
  }

  const { inserted, skippedExisting, byTerritory } = await insertUkGolfApiSeedQueueRows(supabase, toInsert, {
    preloadExistingKeys: existingKeys,
  });

  return {
    clusters,
    candidates: unique.length,
    inserted,
    skippedExisting,
    byTerritory,
  };
}

async function main(): Promise<void> {
  const summary = await runUkGolfApiOsmHoleGridSeed();
  console.log("[uk-golf-api:gb-json-seed]", summary);
}

function ranAsCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolvePath(entry)).href;
  } catch {
    return false;
  }
}

if (ranAsCliEntrypoint()) {
  void main().catch((error) => {
    console.error("[uk-golf-api:gb-json-seed] fatal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
