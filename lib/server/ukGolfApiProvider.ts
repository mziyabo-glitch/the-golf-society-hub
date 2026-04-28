import type { NormalizedCourseImport, NormalizedHole, NormalizedTee } from "@/types/course";

export type UkGolfProviderConfig = {
  rapidApiKey: string;
  host: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
};

export type UkGolfClub = {
  id: string;
  name: string;
  postcode: string | null;
  county: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: Record<string, unknown>;
};

export type UkGolfCourse = {
  id: string;
  clubId: string | null;
  name: string;
  raw: Record<string, unknown>;
};

export type UkGolfTeeScorecard = {
  teeId: string;
  providerTeeSetId: string | null;
  teeName: string;
  teeColour: string | null;
  gender: "M" | "F" | null;
  parTotal: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  totalYardage: number | null;
  holes: NormalizedHole[];
  raw: Record<string, unknown>;
};

export type UkGolfCourseScorecard = {
  courseId: string;
  tees: UkGolfTeeScorecard[];
  sourceUpdatedAt: string | null;
  raw: Record<string, unknown>;
};

export type UkGolfCourseDetail = {
  courseId: string;
  tees: UkGolfTeeScorecard[];
  raw: Record<string, unknown>;
};

export type TeeValidationIssueCode =
  | "HOLE_COUNT"
  | "SI_DUPLICATE"
  | "SI_RANGE"
  | "PAR_MISSING"
  | "YARDAGE_MISSING"
  | "PAR_TOTAL_MISMATCH"
  | "YARDAGE_TOTAL_MISMATCH"
  | "SLOPE_RANGE"
  | "COURSE_RATING_INVALID";

export type TeeValidationIssue = {
  code: TeeValidationIssueCode;
  teeName: string;
  message: string;
};

export type TeeValidationResult = {
  teeName: string;
  isComplete18: boolean;
  isValid18: boolean;
  issues: TeeValidationIssue[];
};

export type UkGolfCompletenessSummary = {
  coursesFound: number;
  teesFound: number;
  teesWithRatingSlope: number;
  teesWithCompleteSi: number;
  complete18TeeCount: number;
  valid18TeeCount: number;
  failedValidationCount: number;
  hasAnyPartialTeeSet: boolean;
};

export type ProviderSourceTracking = {
  source_type: "uk_golf_api";
  source_provider_course_id: string;
  source_url: string | null;
  source_updated_at: string | null;
  data_confidence: "high" | "medium" | "low";
  golfer_data_status: "verified" | "partial" | "unverified";
};

export type UkDryRunStatus = "verified_candidate" | "partial" | "unverified";

export type RawShapeSummary = {
  topLevelKeys: string[];
  arrays: Array<{
    field: string;
    length: number;
    firstItemKeys: string[];
  }>;
};

export type DiscoveredUkTeeSet = {
  id: string | null;
  label: string;
};

export type UkScorecardFetchDebug = {
  endpointUsed: string | null;
  attemptedEndpoints: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function firstArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const arr = asArray(obj[key]);
    if (arr.length > 0) return arr;
  }
  return [];
}

function objectValuesArray(obj: Record<string, unknown>): unknown[] {
  return Object.values(obj);
}

function isLikelyHoleRow(row: Record<string, unknown>): boolean {
  const hasHoleNo =
    pickNumber(row, ["hole_number", "holeNumber", "number", "hole", "id"]) != null;
  const hasHoleStats =
    pickNumber(row, ["par", "yardage", "yards", "distance", "length", "stroke_index", "si"]) != null;
  return hasHoleNo && hasHoleStats;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function toGender(raw: unknown): "M" | "F" | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("m")) return "M";
  if (v.startsWith("f") || v.startsWith("l")) return "F";
  return null;
}

function normalizeHoleRow(raw: Record<string, unknown>, fallbackNo: number): NormalizedHole {
  const holeNumber = Math.round(
    pickNumber(raw, ["hole_number", "holeNumber", "number", "hole", "id"]) ?? fallbackNo,
  );
  const par = pickNumber(raw, ["par"]);
  const yardage = pickNumber(raw, ["yardage", "yards", "distance", "length"]);
  const strokeIndex = pickNumber(raw, ["stroke_index", "strokeIndex", "si", "handicap", "hcp"]);
  return {
    holeNumber,
    par: par != null ? Math.round(par) : null,
    yardage: yardage != null ? Math.round(yardage) : null,
    strokeIndex: strokeIndex != null ? Math.round(strokeIndex) : null,
  };
}

function extractHoleRows(raw: Record<string, unknown>): unknown[] {
  const direct = firstArray(raw, ["holes", "scorecard", "hole_rows"]);
  if (direct.length > 0) return direct;

  const holeMap = asRecord(raw.holes_by_number ?? raw.hole_map ?? raw.holesByNumber ?? null);
  if (!holeMap) return [];
  return objectValuesArray(holeMap);
}

function buildSingleTeeFromHoleRows(
  holeRows: Array<Record<string, unknown>>,
  fallbackName: string,
  teeMeta?: Record<string, unknown> | null,
): UkGolfTeeScorecard | null {
  if (holeRows.length === 0) return null;
  const holes = holeRows
    .map((row, idx) => normalizeHoleRow(row, idx + 1))
    .filter((h) => Number.isFinite(h.holeNumber) && h.holeNumber > 0)
    .sort((a, b) => a.holeNumber - b.holeNumber);

  if (holes.length <= 1) return null;

  const parFromHoles = holes.reduce((sum, h) => sum + (h.par ?? 0), 0) || null;
  const yardageFromHoles = holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0) || null;
  const parTotal = teeMeta ? pickNumber(teeMeta, ["par_total", "par", "total_par"]) ?? parFromHoles : parFromHoles;
  const totalYardage = teeMeta
    ? pickNumber(teeMeta, ["total_yardage", "total_yards", "yardage", "yards"]) ?? yardageFromHoles
    : yardageFromHoles;
  return {
    teeId: teeMeta ? pickString(teeMeta, ["id", "tee_id", "marker_id"]) ?? "default" : "default",
    providerTeeSetId: teeMeta ? pickString(teeMeta, ["id", "tee_id", "marker_id", "teeSetId"]) ?? null : null,
    teeName: teeMeta ? pickString(teeMeta, ["tee_name", "name", "marker_name", "markerName", "colour", "color"]) ?? fallbackName : fallbackName,
    teeColour: teeMeta ? pickString(teeMeta, ["tee_colour", "tee_color", "colour", "color"]) : null,
    gender: teeMeta ? toGender(teeMeta.gender ?? teeMeta.sex) : null,
    parTotal,
    courseRating: teeMeta ? pickNumber(teeMeta, ["course_rating", "rating"]) : null,
    slopeRating: teeMeta ? pickNumber(teeMeta, ["slope_rating", "slope"]) : null,
    totalYardage,
    holes,
    raw: teeMeta ?? { source: "hole_rows_fallback" },
  };
}

function isLikelyTeeObject(row: Record<string, unknown>): boolean {
  return (
    row.holes != null ||
    row.scorecard != null ||
    row.hole_rows != null ||
    row.course_rating != null ||
    row.slope_rating != null ||
    row.marker_name != null ||
    row.tee_name != null ||
    row.color != null ||
    row.colour != null
  );
}

function findLikelyTeeRowsDeep(root: Record<string, unknown>): unknown[] {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let bestRows: unknown[] = [];
  let bestScore = -1;
  const MAX_DEPTH = 6;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { value, depth } = current;
    if (depth > MAX_DEPTH) continue;

    if (Array.isArray(value)) {
      const objectRows = value
        .map((v) => asRecord(v))
        .filter((v): v is Record<string, unknown> => v != null);
      if (objectRows.length > 0) {
        const likelyCount = objectRows.filter((r) => isLikelyTeeObject(r)).length;
        const score = likelyCount * 10 + objectRows.length;
        if (score > bestScore) {
          bestScore = score;
          bestRows = value;
        }
      }
      for (const item of value) {
        queue.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    const obj = asRecord(value);
    if (!obj) continue;
    for (const child of Object.values(obj)) {
      queue.push({ value: child, depth: depth + 1 });
    }
  }

  return bestRows;
}

function normalizeTee(raw: Record<string, unknown>, idx: number): UkGolfTeeScorecard {
  const teeName =
    pickString(raw, ["tee_name", "name", "marker_name", "markerName", "colour", "color"]) ?? `Tee ${idx + 1}`;
  const teeColour = pickString(raw, ["tee_colour", "tee_color", "colour", "color"]);
  const holesRaw = extractHoleRows(raw);
  const holes = holesRaw
    .map((h, i) => normalizeHoleRow(asRecord(h) ?? {}, i + 1))
    .filter((h) => Number.isFinite(h.holeNumber) && h.holeNumber > 0)
    .sort((a, b) => a.holeNumber - b.holeNumber);
  return {
    teeId: pickString(raw, ["id", "tee_id", "marker_id"]) ?? `${idx + 1}`,
    providerTeeSetId: pickString(raw, ["id", "tee_id", "marker_id", "teeSetId"]) ?? null,
    teeName,
    teeColour,
    gender: toGender(raw.gender ?? raw.sex),
    parTotal: pickNumber(raw, ["par_total", "par", "total_par"]) ?? null,
    courseRating: pickNumber(raw, ["course_rating", "rating"]) ?? null,
    slopeRating: pickNumber(raw, ["slope_rating", "slope"]) ?? null,
    totalYardage: pickNumber(raw, ["total_yardage", "total_yards", "yardage", "yards"]) ?? null,
    holes,
    raw,
  };
}

function normalizeTeeSetFromCourseDetail(raw: Record<string, unknown>, idx: number): UkGolfTeeScorecard {
  const holesRaw = extractHoleRows(raw);
  const tee = normalizeTee(raw, idx);
  const normalizedLabel = normalizeUkTeeLabel(
    pickString(raw, ["tee_set", "teeSet", "label", "name", "tee_name", "teeName", "colour", "color"]) ?? tee.teeName,
  );
  return {
    ...tee,
    providerTeeSetId:
      pickString(raw, ["id", "tee_id", "marker_id", "teeSetId"]) ?? tee.providerTeeSetId ?? null,
    teeName: normalizedLabel.teeSet,
    teeColour: normalizedLabel.teeColour ?? tee.teeColour,
    gender: normalizedLabel.gender ?? tee.gender,
    holes:
      holesRaw.length > 0
        ? holesRaw
            .map((h, i) => normalizeHoleRow(asRecord(h) ?? {}, i + 1))
            .filter((h) => Number.isFinite(h.holeNumber) && h.holeNumber > 0)
            .sort((a, b) => a.holeNumber - b.holeNumber)
        : tee.holes,
  };
}

function filterValidTees(tees: UkGolfTeeScorecard[]): UkGolfTeeScorecard[] {
  // Defensive guard: one-hole rows are never valid tee sets.
  return tees.filter((t) => t.holes.length > 1);
}

function teeSetLabel(root: Record<string, unknown>): string {
  const raw = root.tee_set ?? root.teeSet;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const obj = asRecord(raw);
  if (!obj) return "Default";
  return (
    pickString(obj, ["name", "label", "tee_name", "teeName", "colour", "color"]) ??
    "Default"
  );
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeUkTeeLabel(
  label: string | null | undefined,
): { teeSet: string; teeColour: string | null; gender: "M" | "F" | null } {
  const raw = String(label ?? "").trim();
  if (!raw) return { teeSet: "Default", teeColour: null, gender: null };
  const lower = raw.toLowerCase();

  const colorMatch = lower.match(/\b(yellow|white|red|blue|black|championship)\b/);
  const color = colorMatch ? toTitleCase(colorMatch[1]!) : null;
  const gender: "M" | "F" | null =
    /\b(female|ladies|women)\b/.test(lower)
      ? "F"
      : /\b(male|men)\b/.test(lower)
        ? "M"
        : null;

  if (lower === "championship") {
    return { teeSet: "Championship", teeColour: "Championship", gender };
  }

  return {
    teeSet: toTitleCase(raw.replace(/\s+/g, " ")),
    teeColour: color,
    gender,
  };
}

function teePriority(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("yellow")) return 1;
  if (l.includes("white")) return 2;
  if (l.includes("red")) return 3;
  if (l.includes("blue")) return 4;
  if (l.includes("championship") || l.includes("black")) return 99;
  return 50;
}

export function sortUkTeesByPreferredOrder<T extends { teeName: string }>(tees: T[]): T[] {
  return [...tees].sort((a, b) => {
    const pa = teePriority(a.teeName);
    const pb = teePriority(b.teeName);
    if (pa !== pb) return pa - pb;
    return a.teeName.localeCompare(b.teeName);
  });
}

export function summarizeRawShape(raw: Record<string, unknown>): RawShapeSummary {
  const topLevelKeys = Object.keys(raw);
  const arrays = topLevelKeys
    .map((key) => {
      const arr = asArray(raw[key]);
      if (arr.length === 0) return null;
      const first = asRecord(arr[0]);
      return {
        field: key,
        length: arr.length,
        firstItemKeys: first ? Object.keys(first) : [],
      };
    })
    .filter((v): v is { field: string; length: number; firstItemKeys: string[] } => v != null);
  return { topLevelKeys, arrays };
}

async function safeReadJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UkGolfApiProvider {
  readonly config: UkGolfProviderConfig;
  private fallbackDiscoveryCalls = 0;

  constructor(config?: Partial<UkGolfProviderConfig>) {
    const rapidApiKey = (config?.rapidApiKey ?? process.env.RAPIDAPI_KEY ?? "").trim();
    const host = (config?.host ?? process.env.UK_GOLF_API_HOST ?? "").trim();
    const baseUrl = (config?.baseUrl ?? process.env.UK_GOLF_API_BASE_URL ?? "").trim();
    const timeoutMsRaw = Number(config?.timeoutMs ?? process.env.UK_GOLF_API_TIMEOUT_MS ?? 20000);
    const maxRetriesRaw = Number(config?.maxRetries ?? process.env.UK_GOLF_API_MAX_RETRIES ?? 3);
    this.config = {
      rapidApiKey,
      host,
      baseUrl,
      timeoutMs: Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? Math.round(timeoutMsRaw) : 20000,
      maxRetries: Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? Math.round(maxRetriesRaw) : 3,
    };
  }

  assertConfigured(): void {
    if (!this.config.rapidApiKey) throw new Error("Missing RAPIDAPI_KEY");
    if (!this.config.baseUrl) throw new Error("Missing UK_GOLF_API_BASE_URL");
  }

  private async get(path: string): Promise<unknown> {
    this.assertConfigured();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.config.baseUrl}${normalizedPath}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-rapidapi-key": this.config.rapidApiKey,
    };
    if (this.config.host) headers["x-rapidapi-host"] = this.config.host;
    const maxRetryAttempts = Math.min(this.config.maxRetries, 3);
    let dynamicBackoffMs = 10000;
    for (let attempt = 0; attempt <= maxRetryAttempts; attempt += 1) {
      const res = await fetch(url, { method: "GET", headers, signal: withTimeout(this.config.timeoutMs) });
      if (res.ok) {
        return safeReadJson(res);
      }

      if (res.status === 429 && attempt < maxRetryAttempts) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSec = Number(retryAfterHeader);
        const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : Math.round(dynamicBackoffMs);
        console.warn("[uk-golf-api] 429 rate-limit, retrying", {
          path: normalizedPath,
          attempt: attempt + 1,
          maxRetryAttempts,
          waitMs: backoffMs,
        });
        await sleep(backoffMs);
        if (!(Number.isFinite(retryAfterSec) && retryAfterSec > 0)) {
          dynamicBackoffMs *= 1.5;
        }
        continue;
      }

      const body = await res.text().catch(() => "");
      throw new Error(`UK Golf API ${res.status} on ${normalizedPath}: ${body.slice(0, 240)}`);
    }
    throw new Error(`UK Golf API request failed on ${normalizedPath}`);
  }

  async searchClubs(query: string): Promise<UkGolfClub[]> {
    const q = query.trim();
    if (!q) return [];
    const payload = await this.get(`/clubs?search=${encodeURIComponent(q)}`);
    const root = asRecord(payload) ?? {};
    const rows = asArray(payload).length > 0 ? asArray(payload) : firstArray(root, ["clubs", "data", "results", "items"]);
    return rows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null)
      .map((row) => ({
        id: pickString(row, ["id", "club_id", "clubId"]) ?? "",
        name: pickString(row, ["name", "club_name", "clubName"]) ?? "Unknown Club",
        postcode: pickString(row, ["postcode", "post_code", "zip"]),
        county: pickString(row, ["county", "region", "state"]),
        country: pickString(row, ["country"]),
        latitude: pickNumber(row, ["latitude", "lat"]),
        longitude: pickNumber(row, ["longitude", "lng", "lon"]),
        raw: row,
      }))
      .filter((club) => club.id.length > 0);
  }

  async getClub(clubId: string): Promise<UkGolfClub | null> {
    const payload = await this.get(`/clubs/${encodeURIComponent(clubId)}`);
    const row = asRecord((asRecord(payload) ?? {}).club ?? payload);
    if (!row) return null;
    return {
      id: pickString(row, ["id", "club_id", "clubId"]) ?? clubId,
      name: pickString(row, ["name", "club_name", "clubName"]) ?? "Unknown Club",
      postcode: pickString(row, ["postcode", "post_code", "zip"]),
      county: pickString(row, ["county", "region", "state"]),
      country: pickString(row, ["country"]),
      latitude: pickNumber(row, ["latitude", "lat"]),
      longitude: pickNumber(row, ["longitude", "lng", "lon"]),
      raw: row,
    };
  }

  async getClubCourses(clubId: string): Promise<UkGolfCourse[]> {
    const payload = await this.get(`/clubs/${encodeURIComponent(clubId)}/courses`);
    const root = asRecord(payload) ?? {};
    const rows = asArray(payload).length > 0 ? asArray(payload) : firstArray(root, ["courses", "data", "results", "items"]);
    return rows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null)
      .map((row) => ({
        id: pickString(row, ["id", "course_id", "courseId"]) ?? "",
        clubId: pickString(row, ["club_id", "clubId"]) ?? clubId,
        name: pickString(row, ["name", "course_name", "courseName"]) ?? "Unknown Course",
        raw: row,
      }))
      .filter((course) => course.id.length > 0);
  }

  private async fetchScorecardPayload(courseId: string, teeSetId?: string | null): Promise<{
    root: Record<string, unknown>;
    endpointUsed: string | null;
    attemptedEndpoints: string[];
  }> {
    const encoded = encodeURIComponent(courseId);
    const teeParam = teeSetId ? encodeURIComponent(teeSetId) : null;
    const probes: string[] = teeParam
      ? [
          `/courses/${encoded}/scorecard?tee_set_id=${teeParam}`,
          `/courses/${encoded}/scorecard?tee_id=${teeParam}`,
          `/courses/${encoded}/scorecard?teeSetId=${teeParam}`,
          `/courses/${encoded}/scorecard?tee_set=${teeParam}`,
          `/courses/${encoded}/scorecard?tee=${teeParam}`,
          `/courses/${encoded}/scorecard?tee_label=${teeParam}`,
          `/courses/${encoded}/markers?tee_set_id=${teeParam}`,
          `/courses/${encoded}/markers?tee_id=${teeParam}`,
          `/courses/${encoded}/markers?teeSetId=${teeParam}`,
          `/courses/${encoded}/markers?tee_set=${teeParam}`,
          `/courses/${encoded}/markers?tee=${teeParam}`,
          `/courses/${encoded}/markers?tee_label=${teeParam}`,
          `/scorecards/${teeParam}`,
          `/tees/${teeParam}/scorecard`,
        ]
      : [
          `/courses/${encoded}/scorecard`,
          `/courses/${encoded}/markers`,
          `/courses/${encoded}`,
        ];

    const attemptedEndpoints: string[] = [];
    for (const path of probes) {
      attemptedEndpoints.push(path);
      const payload = await this.get(path).catch(() => null);
      const root = asRecord(payload);
      if (!root) continue;
      const hasHoles = extractHoleRows(root).length > 0;
      const hasAnyTeeData =
        hasHoles ||
        asRecord(root.tee_set ?? root.teeSet ?? null) != null ||
        typeof (root.tee_set ?? root.teeSet) === "string" ||
        firstArray(root, ["markers", "tees", "scorecards", "tee_boxes", "teeSets", "data", "results", "items"]).length > 0;
      if (hasAnyTeeData) {
        return { root, endpointUsed: path, attemptedEndpoints };
      }
    }
    return { root: {}, endpointUsed: null, attemptedEndpoints };
  }

  async getCourseScorecard(courseId: string): Promise<UkGolfCourseScorecard> {
    const fetched = await this.fetchScorecardPayload(courseId, null);
    const root = fetched.root;
    const keyedRows = firstArray(root, [
      "markers",
      "tees",
      "scorecards",
      "tee_boxes",
      "teeBoxes",
      "data",
      "results",
      "items",
      "cards",
    ]);
    const markerRows = keyedRows.length > 0 ? keyedRows : findLikelyTeeRowsDeep(root);
    const markerObjects = markerRows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null);

    // UK provider responses are currently one tee-set per scorecard response.
    // Keep exactly one tee in this model; future multi-tee support should query
    // explicit tee-set variants and then merge them upstream.
    let singleTee: UkGolfTeeScorecard | null = null;

    const rootTeeSet = asRecord(root.tee_set ?? root.teeSet ?? null);
    const rootHoles = extractHoleRows(root)
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null);
    singleTee = buildSingleTeeFromHoleRows(rootHoles, teeSetLabel(root), rootTeeSet);

    if (!singleTee) {
      // Fallback for alternative shapes: select the best candidate tee by hole count.
      const candidates = filterValidTees(markerObjects.map((row, idx) => normalizeTee(row, idx)));
      const sorted = [...candidates].sort((a, b) => b.holes.length - a.holes.length);
      singleTee = sorted[0] ?? null;
    }

    if (!singleTee) {
      // If rows were hole-like entries, collapse into one tee.
      const likelyHoleRows =
        markerObjects.length >= 9 &&
        markerObjects.filter((row) => isLikelyHoleRow(row)).length >= Math.ceil(markerObjects.length * 0.7);
      if (likelyHoleRows) {
        singleTee = buildSingleTeeFromHoleRows(markerObjects, teeSetLabel(root), rootTeeSet);
      }
    }

    if (singleTee) {
      const normalizedLabel = normalizeUkTeeLabel(singleTee.teeName);
      singleTee.teeName = normalizedLabel.teeSet;
      singleTee.teeColour = normalizedLabel.teeColour ?? singleTee.teeColour;
      singleTee.gender = normalizedLabel.gender ?? singleTee.gender;
    }
    const tees = singleTee ? [singleTee] : [];

    return {
      courseId,
      tees,
      sourceUpdatedAt: pickString(root, ["updated_at", "source_updated_at", "last_updated"]),
      raw: root,
    };
  }

  async getCourseDetail(courseId: string): Promise<UkGolfCourseDetail> {
    const encoded = encodeURIComponent(courseId);
    const payload = await this.get(`/courses/${encoded}`).catch(() => null);
    const root = asRecord(payload) ?? {};

    const teeRows = firstArray(root, [
      "tee_sets",
      "teeSets",
      "tees",
      "markers",
      "scorecards",
      "data",
      "results",
      "items",
    ]);
    const teeObjects = teeRows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null);

    let tees = filterValidTees(teeObjects.map((row, idx) => normalizeTeeSetFromCourseDetail(row, idx)));

    // Some payloads may include a single top-level tee_set + holes only.
    if (tees.length === 0) {
      const rootTeeSet = asRecord(root.tee_set ?? root.teeSet ?? null);
      const rootHoles = extractHoleRows(root)
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row != null);
      const single = buildSingleTeeFromHoleRows(rootHoles, teeSetLabel(root), rootTeeSet);
      if (single) {
        const normalizedLabel = normalizeUkTeeLabel(single.teeName);
        single.teeName = normalizedLabel.teeSet;
        single.teeColour = normalizedLabel.teeColour ?? single.teeColour;
        single.gender = normalizedLabel.gender ?? single.gender;
        tees = [single];
      }
    }

    return {
      courseId,
      tees: sortUkTeesByPreferredOrder(tees),
      raw: root,
    };
  }

  async getCourseScorecardForTee(courseId: string, teeSetId: string): Promise<UkGolfCourseScorecard> {
    const fetched = await this.fetchScorecardPayload(courseId, teeSetId);
    const root = fetched.root;
    const base = await this.getCourseScorecard(courseId);
    if (!root || Object.keys(root).length === 0) return base;

    const scoped = await (async () => {
      const keyedRows = firstArray(root, [
        "markers",
        "tees",
        "scorecards",
        "tee_boxes",
        "teeBoxes",
        "data",
        "results",
        "items",
        "cards",
      ]);
      const markerRows = keyedRows.length > 0 ? keyedRows : findLikelyTeeRowsDeep(root);
      const markerObjects = markerRows
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row != null);

      let singleTee: UkGolfTeeScorecard | null = null;
      const rootTeeSet = asRecord(root.tee_set ?? root.teeSet ?? null) ?? { id: teeSetId };
      const rootHoles = extractHoleRows(root)
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row != null);
      singleTee = buildSingleTeeFromHoleRows(rootHoles, teeSetLabel(root), rootTeeSet);

      if (!singleTee) {
        const candidates = filterValidTees(markerObjects.map((row, idx) => normalizeTee(row, idx)));
        const sorted = [...candidates].sort((a, b) => b.holes.length - a.holes.length);
        singleTee = sorted[0] ?? null;
      }
      if (singleTee) {
        const normalizedLabel = normalizeUkTeeLabel(singleTee.teeName);
        singleTee.teeName = normalizedLabel.teeSet;
        singleTee.teeColour = normalizedLabel.teeColour ?? singleTee.teeColour;
        singleTee.gender = normalizedLabel.gender ?? singleTee.gender;
        singleTee.providerTeeSetId = teeSetId;
      }
      return singleTee ? [singleTee] : [];
    })();

    return {
      courseId,
      tees: scoped.length > 0 ? scoped : base.tees.map((tee) => ({ ...tee, providerTeeSetId: teeSetId })),
      sourceUpdatedAt: pickString(root, ["updated_at", "source_updated_at", "last_updated"]) ?? base.sourceUpdatedAt,
      raw: Object.keys(root).length > 0 ? root : base.raw,
    };
  }

  async discoverCourseTeeSets(courseId: string): Promise<DiscoveredUkTeeSet[]> {
    const encoded = encodeURIComponent(courseId);
    const primary = await this.get(`/courses/${encoded}`).catch(() => null);
    const primaryRoot = asRecord(primary) ?? {};
    const primaryRows = firstArray(primaryRoot, ["tee_sets", "teeSets"]);

    const out = new Map<string, DiscoveredUkTeeSet>();
    const push = (id: string | null, label: string | null | undefined) => {
      const normalized = normalizeUkTeeLabel(label);
      const key = `${id ?? ""}|${normalized.teeSet}`;
      if (!normalized.teeSet) return;
      if (!out.has(key)) {
        out.set(key, { id, label: normalized.teeSet });
      }
    };

    // Fast-path: course detail already provides tee_sets. Avoid extra probing calls.
    if (primaryRows.length > 0) {
      for (const rowRaw of primaryRows) {
        const row = asRecord(rowRaw);
        if (!row) continue;
        push(
          pickString(row, ["id", "tee_id", "teeSetId", "marker_id"]),
          pickString(row, ["name", "label", "tee_name", "teeSet", "tee_set", "colour", "color"]),
        );
      }
      return [...out.values()].sort((a, b) => teePriority(a.label) - teePriority(b.label));
    }

    // Fallback probing only when /courses/{id} failed or has no tee_sets.
    this.fallbackDiscoveryCalls += 1;
    const payloads = await Promise.all([
      Promise.resolve(primary),
      this.get(`/courses/${encoded}/scorecard`).catch(() => null),
      this.get(`/courses/${encoded}/markers`).catch(() => null),
      this.get(`/courses/${encoded}/tee-sets`).catch(() => null),
      this.get(`/courses/${encoded}/tees`).catch(() => null),
    ]);

    for (const payload of payloads) {
      const root = asRecord(payload);
      if (!root) continue;

      const rootSet = root.tee_set ?? root.teeSet;
      if (typeof rootSet === "string") push(null, rootSet);
      const rootSetObj = asRecord(rootSet);
      if (rootSetObj) {
        push(
          pickString(rootSetObj, ["id", "tee_id", "teeSetId", "marker_id"]),
          pickString(rootSetObj, ["name", "label", "tee_name", "teeName", "colour", "color"]),
        );
      }

      const rows = [
        ...firstArray(root, ["tee_sets", "teeSets", "tees", "markers", "data", "results", "items"]),
      ];
      for (const rowRaw of rows) {
        const row = asRecord(rowRaw);
        if (!row) continue;
        push(
          pickString(row, ["id", "tee_id", "teeSetId", "marker_id"]),
          pickString(row, ["name", "label", "tee_name", "teeSet", "tee_set", "colour", "color"]),
        );
      }
    }

    return [...out.values()].sort((a, b) => teePriority(a.label) - teePriority(b.label));
  }

  getAndResetFallbackDiscoveryCalls(): number {
    const value = this.fallbackDiscoveryCalls;
    this.fallbackDiscoveryCalls = 0;
    return value;
  }

  async getCourseScorecardForTeeWithDebug(
    courseId: string,
    teeSetId: string,
  ): Promise<{ scorecard: UkGolfCourseScorecard; debug: UkScorecardFetchDebug }> {
    const fetched = await this.fetchScorecardPayload(courseId, teeSetId);
    const scorecard = await this.getCourseScorecardForTee(courseId, teeSetId);
    return {
      scorecard,
      debug: {
        endpointUsed: fetched.endpointUsed,
        attemptedEndpoints: fetched.attemptedEndpoints,
      },
    };
  }
}

export function validateUkGolfTee(tee: UkGolfTeeScorecard): TeeValidationResult {
  const issues: TeeValidationIssue[] = [];
  const holeCount = tee.holes.length;
  const isComplete18 = holeCount === 18;
  if (holeCount !== 18) {
    issues.push({
      code: "HOLE_COUNT",
      teeName: tee.teeName,
      message: `Expected 18 holes, got ${holeCount}`,
    });
  }
  const siSet = new Set<number>();
  for (const hole of tee.holes) {
    if (hole.strokeIndex == null) continue;
    if (hole.strokeIndex < 1 || hole.strokeIndex > 18) {
      issues.push({
        code: "SI_RANGE",
        teeName: tee.teeName,
        message: `Stroke index ${hole.strokeIndex} out of range`,
      });
    } else if (siSet.has(hole.strokeIndex)) {
      issues.push({
        code: "SI_DUPLICATE",
        teeName: tee.teeName,
        message: `Stroke index ${hole.strokeIndex} duplicated`,
      });
    } else {
      siSet.add(hole.strokeIndex);
    }
  }
  if (isComplete18 && siSet.size !== 18) {
    issues.push({
      code: "SI_DUPLICATE",
      teeName: tee.teeName,
      message: `Expected unique SI 1-18; got ${siSet.size} unique indexes`,
    });
  }
  for (const hole of tee.holes) {
    if (hole.par == null) {
      issues.push({
        code: "PAR_MISSING",
        teeName: tee.teeName,
        message: `Hole ${hole.holeNumber}: par missing`,
      });
    }
    if (hole.yardage == null) {
      issues.push({
        code: "YARDAGE_MISSING",
        teeName: tee.teeName,
        message: `Hole ${hole.holeNumber}: yardage missing`,
      });
    }
  }
  if (tee.parTotal != null) {
    const parSum = tee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0);
    if (parSum > 0 && Math.abs(parSum - tee.parTotal) > 0) {
      issues.push({
        code: "PAR_TOTAL_MISMATCH",
        teeName: tee.teeName,
        message: `Par total mismatch: tee=${tee.parTotal}, holes=${parSum}`,
      });
    }
  }
  if (tee.totalYardage != null) {
    const yardSum = tee.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0);
    if (yardSum > 0) {
      const delta = Math.abs(yardSum - tee.totalYardage);
      const pct = delta / Math.max(tee.totalYardage, 1);
      if (pct > 0.1) {
        issues.push({
          code: "YARDAGE_TOTAL_MISMATCH",
          teeName: tee.teeName,
          message: `Yardage mismatch >10%: tee=${tee.totalYardage}, holes=${yardSum}`,
        });
      }
    }
  }
  if (tee.slopeRating != null && (tee.slopeRating < 55 || tee.slopeRating > 155)) {
    issues.push({
      code: "SLOPE_RANGE",
      teeName: tee.teeName,
      message: `Slope ${tee.slopeRating} outside 55-155`,
    });
  }
  if (tee.courseRating != null && !Number.isFinite(Number(tee.courseRating))) {
    issues.push({
      code: "COURSE_RATING_INVALID",
      teeName: tee.teeName,
      message: "Course rating must be numeric",
    });
  }
  return {
    teeName: tee.teeName,
    isComplete18,
    isValid18: isComplete18 && issues.length === 0,
    issues,
  };
}

export function summarizeUkGolfCompleteness(scorecard: UkGolfCourseScorecard): UkGolfCompletenessSummary {
  const validations = scorecard.tees.map((tee) => validateUkGolfTee(tee));
  return {
    coursesFound: 1,
    teesFound: scorecard.tees.length,
    teesWithRatingSlope: scorecard.tees.filter((tee) => tee.courseRating != null && tee.slopeRating != null).length,
    teesWithCompleteSi: validations.filter(
      (v) => v.isComplete18 && v.issues.every((x) => x.code !== "SI_DUPLICATE" && x.code !== "SI_RANGE"),
    ).length,
    complete18TeeCount: validations.filter((v) => v.isComplete18).length,
    valid18TeeCount: validations.filter((v) => v.isValid18).length,
    failedValidationCount: validations.reduce((sum, v) => sum + v.issues.length, 0),
    hasAnyPartialTeeSet: validations.some((v) => !v.isComplete18),
  };
}

export function deriveUkGolfSourceTracking(
  courseId: string,
  scorecard: UkGolfCourseScorecard,
  validations: TeeValidationResult[],
): ProviderSourceTracking {
  const dryRunStatus = classifyUkDryRunStatus(scorecard, validations);
  let data_confidence: "high" | "medium" | "low" = "low";
  let golfer_data_status: "verified" | "partial" | "unverified" = "unverified";
  if (dryRunStatus === "verified_candidate") {
    data_confidence = "high";
    golfer_data_status = "verified";
  } else if (dryRunStatus === "partial") {
    data_confidence = "medium";
    golfer_data_status = "partial";
  }
  return {
    source_type: "uk_golf_api",
    source_provider_course_id: courseId,
    source_url: null,
    source_updated_at: scorecard.sourceUpdatedAt,
    data_confidence,
    golfer_data_status,
  };
}

export function classifyUkDryRunStatus(
  scorecard: UkGolfCourseScorecard,
  validations?: TeeValidationResult[],
): UkDryRunStatus {
  const runs = validations ?? scorecard.tees.map((tee) => validateUkGolfTee(tee));
  if (scorecard.tees.length === 0) return "unverified";

  const hasUsableTee = runs.some((r) => r.isComplete18);
  if (!hasUsableTee) return "unverified";

  const hasVerifiedCandidate = scorecard.tees.some((tee, idx) => {
    const run = runs[idx];
    if (!run?.isValid18) return false;
    const hasRatingSlope = tee.courseRating != null && tee.slopeRating != null;
    if (!hasRatingSlope) return false;
    return tee.holes.every((h) => h.par != null && h.yardage != null && h.strokeIndex != null);
  });
  if (hasVerifiedCandidate) return "verified_candidate";

  return "partial";
}

export function toNormalizedCourseImportFromUkGolf(params: {
  club: UkGolfClub;
  course: UkGolfCourse;
  scorecard: UkGolfCourseScorecard;
}): NormalizedCourseImport {
  const sourceTee = params.scorecard.tees.find((tee) => tee.holes.length > 1) ?? null;
  const tees: Array<{ tee: NormalizedTee; holes: NormalizedHole[] }> = [];
  if (sourceTee) {
    const tee: NormalizedTee = {
      teeName: sourceTee.teeName,
      gender: sourceTee.gender,
      apiSourceGroup: sourceTee.gender === "F" ? "female" : sourceTee.gender === "M" ? "male" : "unisex",
      courseRating: sourceTee.courseRating,
      bogeyRating: null,
      slopeRating: sourceTee.slopeRating,
      parTotal: sourceTee.parTotal ?? sourceTee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0),
      totalYards: sourceTee.totalYardage ?? sourceTee.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0),
      totalMeters: null,
      teeColor: sourceTee.teeColour,
      isDefault: true,
      displayOrder: 0,
      holes: sourceTee.holes,
    };
    tees.push({ tee, holes: sourceTee.holes });
  }
  return {
    course: {
      apiId: Number(params.course.id) || 0,
      clubName: params.club.name,
      courseName: params.course.name,
      fullName:
        params.club.name && params.course.name && params.club.name !== params.course.name
          ? `${params.club.name} — ${params.course.name}`
          : params.course.name,
      address: params.club.postcode,
      city: params.club.county,
      country: params.club.country,
      latitude: params.club.latitude,
      longitude: params.club.longitude,
      dedupeKey: `uk_golf_api:${params.course.id}`,
      normalizedNameKey: `${params.club.name.toLowerCase()}|${params.course.name.toLowerCase()}`,
      source: "golfcourseapi",
    },
    tees,
  };
}
