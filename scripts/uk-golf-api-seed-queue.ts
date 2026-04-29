import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

type TerritorySeedRow = {
  name?: string;
  country?: string;
  territory?: string;
  priority?: number;
};

type QueueInsertRow = {
  territory: "england" | "wales" | "scotland" | "ni";
  query: string;
  priority: number;
};

function requireSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, key };
}

function normalizeTerritory(row: TerritorySeedRow): QueueInsertRow["territory"] | null {
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

function territoryOrderBoost(territory: QueueInsertRow["territory"]): number {
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

export async function runUkGolfApiSeedQueue(): Promise<{
  inserted: number;
  skippedExisting: number;
  byTerritory: Record<QueueInsertRow["territory"], number>;
}> {
  const { url, key } = requireSupabaseConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const seedPath = resolvePath(process.cwd(), "data", "territory-seed-candidates.uk.json");
  const raw = await readFile(seedPath, "utf8");
  const rows = JSON.parse(raw) as TerritorySeedRow[];
  const mapped: QueueInsertRow[] = [];
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
  const dedup = new Map<string, QueueInsertRow>();
  for (const row of mapped) {
    const key = `${row.territory}\t${row.query.toLowerCase()}`;
    const prev = dedup.get(key);
    if (!prev || row.priority > prev.priority) dedup.set(key, row);
  }
  const payload = [...dedup.values()];

  let inserted = 0;
  let skippedExisting = 0;
  const byTerritory: Record<QueueInsertRow["territory"], number> = {
    england: 0,
    wales: 0,
    scotland: 0,
    ni: 0,
  };

  for (const row of payload) {
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
    const { error: insErr } = await supabase.from("uk_golf_api_seed_queue").insert({
      territory: row.territory,
      query: row.query,
      priority: row.priority,
      status: "pending",
    });
    if (insErr) throw new Error(insErr.message || "Failed inserting queue row");
    inserted += 1;
    byTerritory[row.territory] += 1;
  }

  return { inserted, skippedExisting, byTerritory };
}

async function main(): Promise<void> {
  const summary = await runUkGolfApiSeedQueue();
  console.log("[uk-golf-api:seed-queue]", summary);
}

main().catch((error) => {
  console.error("[uk-golf-api:seed-queue] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
