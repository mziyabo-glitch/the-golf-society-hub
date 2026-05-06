import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type TerritorySeedRow = {
  name?: string;
  country?: string;
  territory?: string;
  priority?: number;
};

export type UkGolfApiSeedQueueTerritory = "england" | "wales" | "scotland" | "ni";

export type UkGolfApiSeedQueueInsertRow = {
  territory: UkGolfApiSeedQueueTerritory;
  query: string;
  priority: number;
};

export function requireSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, key };
}

function normalizeTerritory(row: TerritorySeedRow): UkGolfApiSeedQueueInsertRow["territory"] | null {
  const t = String(row.territory ?? "").trim().toLowerCase();
  const country = String(row.country ?? "").trim().toLowerCase();
  if (t === "scotland" || country === "scotland") return "scotland";
  if (country === "wales") return "wales";
  if (country === "england" || t === "england_wales") return country === "wales" ? "wales" : "england";
  if (t === "ireland" || t === "ni" || t === "northern_ireland" || country.includes("northern ireland") || country === "ireland") {
    return "ni";
  }
  return null;
}

export function territoryOrderBoost(territory: UkGolfApiSeedQueueInsertRow["territory"]): number {
  switch (territory) {
    case "england":
      return 300;
    case "wales":
      return 200;
    case "scotland":
      return 100;
    default:
      return 0;
  }
}

export function ukGolfApiSeedQueueKey(territory: string, query: string): string {
  return `${territory}\t${query.trim().toLowerCase()}`;
}

function isPostgresUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = String(err.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint");
}

/** Load all (territory, query) keys currently in the seed queue (paginated). */
export async function loadUkGolfApiSeedQueueKeySet(supabase: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("uk_golf_api_seed_queue")
      .select("territory,query")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "Failed loading uk_golf_api_seed_queue keys");
    const rows = (data ?? []) as { territory: string; query: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      keys.add(ukGolfApiSeedQueueKey(r.territory, r.query));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

export type InsertUkGolfApiSeedQueueRowsOptions = {
  /**
   * When provided, skips per-row SELECT checks for keys in this set and treats unique violations on INSERT as skips.
   * Used for bulk GB list seeding after one paginated load of existing keys.
   */
  preloadExistingKeys?: Set<string>;
};

/**
 * Inserts rows into `uk_golf_api_seed_queue`, skipping existing (territory, query) pairs.
 * Used by curated territory JSON and GB/OSM-derived bulk seeding.
 */
export async function insertUkGolfApiSeedQueueRows(
  supabase: SupabaseClient,
  payload: UkGolfApiSeedQueueInsertRow[],
  options?: InsertUkGolfApiSeedQueueRowsOptions,
): Promise<{
  inserted: number;
  skippedExisting: number;
  byTerritory: Record<UkGolfApiSeedQueueTerritory, number>;
}> {
  let inserted = 0;
  let skippedExisting = 0;
  const byTerritory: Record<UkGolfApiSeedQueueTerritory, number> = {
    england: 0,
    wales: 0,
    scotland: 0,
    ni: 0,
  };

  const preload = options?.preloadExistingKeys;

  for (const row of payload) {
    const k = ukGolfApiSeedQueueKey(row.territory, row.query);
    if (preload?.has(k)) {
      skippedExisting += 1;
      continue;
    }

    if (!preload) {
      const { data: existing, error: readErr } = await supabase
        .from("uk_golf_api_seed_queue")
        .select("id")
        .eq("territory", row.territory)
        .eq("query", row.query)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message || "Failed checking existing queue row");
      if (existing?.id) {
        skippedExisting += 1;
        continue;
      }
    }

    const { error: insErr } = await supabase.from("uk_golf_api_seed_queue").insert({
      territory: row.territory,
      query: row.query,
      priority: row.priority,
      status: "pending",
    });
    if (insErr) {
      if (preload && isPostgresUniqueViolation(insErr)) {
        skippedExisting += 1;
        preload.add(k);
        continue;
      }
      throw new Error(insErr.message || "Failed inserting queue row");
    }
    inserted += 1;
    byTerritory[row.territory] += 1;
    preload?.add(k);
  }

  return { inserted, skippedExisting, byTerritory };
}

export async function runUkGolfApiSeedQueue(): Promise<{
  inserted: number;
  skippedExisting: number;
  byTerritory: Record<UkGolfApiSeedQueueTerritory, number>;
}> {
  const { url, key } = requireSupabaseConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const seedPath = resolvePath(process.cwd(), "data", "territory-seed-candidates.uk.json");
  const raw = await readFile(seedPath, "utf8");
  const rows = JSON.parse(raw) as TerritorySeedRow[];
  const mapped: UkGolfApiSeedQueueInsertRow[] = [];
  for (const row of rows) {
    const query = String(row.name ?? "").trim();
    if (!query) continue;
    const territory = normalizeTerritory(row);
    if (!territory) continue;
    const basePriority = Number.isFinite(Number(row.priority)) ? Math.round(Number(row.priority)) : 100;
    mapped.push({
      territory,
      query,
      priority: basePriority + territoryOrderBoost(territory),
    });
  }

  // Deduplicate by territory+query before insert.
  const dedup = new Map<string, UkGolfApiSeedQueueInsertRow>();
  for (const row of mapped) {
    const key = `${row.territory}\t${row.query.toLowerCase()}`;
    const prev = dedup.get(key);
    if (!prev || row.priority > prev.priority) dedup.set(key, row);
  }
  const payload = [...dedup.values()];

  return insertUkGolfApiSeedQueueRows(supabase, payload);
}

async function main(): Promise<void> {
  const summary = await runUkGolfApiSeedQueue();
  console.log("[uk-golf-api:seed-queue]", summary);
}

main().catch((error) => {
  console.error("[uk-golf-api:seed-queue] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
