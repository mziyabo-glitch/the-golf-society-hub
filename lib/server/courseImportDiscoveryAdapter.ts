import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import type { TerritorySeedPhase } from "@/lib/server/courseImportEngine";

export type TerritoryDiscoveryCandidate = {
  name: string;
  country: string | null;
  territory: TerritorySeedPhase;
  priority: number;
  source: string;
};

type RawDiscoveryCandidate = {
  name?: unknown;
  country?: unknown;
  territory?: unknown;
  priority?: unknown;
};

function toPhase(value: unknown): TerritorySeedPhase | null {
  if (value === "england_wales" || value === "scotland" || value === "ireland") return value;
  return null;
}

function asCandidate(raw: RawDiscoveryCandidate): TerritoryDiscoveryCandidate | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const phase = toPhase(raw.territory);
  if (!name || !phase) return null;
  const country = typeof raw.country === "string" ? raw.country.trim() : null;
  const priority = Number.isFinite(Number(raw.priority)) ? Math.round(Number(raw.priority)) : 100;
  return {
    name,
    country: country && country.length > 0 ? country : null,
    territory: phase,
    priority,
    source: "external_dataset:territory-seed-candidates.uk.json",
  };
}

export async function loadTerritoryDiscoveryDataset(phase: TerritorySeedPhase): Promise<TerritoryDiscoveryCandidate[]> {
  const path = resolvePath(process.cwd(), "data", "territory-seed-candidates.uk.json");
  const payload = await readFile(path, "utf8");
  const json = JSON.parse(payload) as unknown;
  if (!Array.isArray(json)) return [];
  const all = json
    .map((row) => asCandidate((row ?? {}) as RawDiscoveryCandidate))
    .filter((row): row is TerritoryDiscoveryCandidate => row != null);
  return all.filter((row) => row.territory === phase);
}
