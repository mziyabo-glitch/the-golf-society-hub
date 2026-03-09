import { createClient } from "@supabase/supabase-js";

const DATASET_URL =
  "https://raw.githubusercontent.com/mziyabo-glitch/fairway-forecast/main/data/courses/gb.json";

type DatasetRow = [string, number, number, string?];

function normalizeCourseName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeKey(normalizedName: string, lat: number, lng: number): string {
  return `${normalizedName}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function importUkCourses(): Promise<{ imported: number; skipped: number }> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(DATASET_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset (${response.status}).`);
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Dataset format invalid: expected array rows.");
  }

  const rows = parsed as unknown[];
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const seedRows: Record<string, unknown>[] = [];
  const normalizedRows: {
    name: string;
    normalizedName: string;
    lat: number;
    lng: number;
    area: string;
    raw: DatasetRow;
    key: string;
  }[] = [];

  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length < 3) continue;

    const name = typeof raw[0] === "string" ? raw[0].trim() : "";
    const lat = parseNumber(raw[1]);
    const lng = parseNumber(raw[2]);
    const area = typeof raw[3] === "string" ? raw[3].trim() : "";
    if (!name || lat === null || lng === null) continue;

    const normalizedName = normalizeCourseName(name);
    if (!normalizedName) continue;

    const key = dedupeKey(normalizedName, lat, lng);
    const sourceKey = `${key}|${normalizeCourseName(area)}`;
    const typedRaw = [name, lat, lng, area] as DatasetRow;

    seedRows.push({
      source: "fairway_forecast",
      source_country_code: "gb",
      source_key: sourceKey,
      name,
      normalized_name: normalizedName,
      lat,
      lng,
      area,
      raw: typedRaw,
      raw_row: typedRaw,
      updated_at: new Date().toISOString(),
    });

    normalizedRows.push({
      name,
      normalizedName,
      lat,
      lng,
      area,
      raw: typedRaw,
      key,
    });
  }

  if (seedRows.length > 0) {
    const { error: seedError } = await supabase.from("courses_seed").upsert(seedRows, {
      onConflict: "source_country_code,source_key",
    });
    if (seedError) {
      throw new Error(seedError.message || "Failed inserting courses_seed rows.");
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("courses")
    .select("normalized_name, lat, lng");
  if (existingError) {
    throw new Error(existingError.message || "Failed loading existing courses.");
  }

  const existingKeys = new Set(
    (existingRows ?? []).map((row: any) =>
      dedupeKey(
        normalizeCourseName(String(row.normalized_name ?? row.name ?? "")),
        Number(row.lat),
        Number(row.lng)
      )
    )
  );

  let imported = 0;
  let skipped = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const row of normalizedRows) {
    if (existingKeys.has(row.key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(row.key);
    imported += 1;

    toInsert.push({
      source: "fairway_forecast",
      source_country_code: "gb",
      dedupe_key: row.key,
      name: row.name,
      normalized_name: row.normalizedName,
      lat: row.lat,
      lng: row.lng,
      area: row.area,
      enrichment_status: "seeded",
      raw_row: row.raw,
      updated_at: new Date().toISOString(),
    });
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("courses").insert(toInsert);
    if (insertError) {
      throw new Error(insertError.message || "Failed inserting normalized courses.");
    }
  }

  return { imported, skipped };
}

export async function POST(): Promise<Response> {
  try {
    const result = await importUkCourses();
    return Response.json(result);
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Import failed." },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  return POST();
}
