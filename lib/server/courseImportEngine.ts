import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import type { GolfCourseApiCourse, NormalizedCourseImport } from "@/types/course";
import { loadTerritoryDiscoveryDataset } from "@/lib/server/courseImportDiscoveryAdapter";
import { applyOfficialScorecardFallback } from "@/lib/course/officialScorecardFallback";
import {
  evaluateIdentitySanity,
  isPriorityCourseName,
  loadPriorityCourseEntriesFromConfig,
  normalizeCourseKey,
  resolvePriorityOfficialSource,
  type IdentitySanityResult,
  type PriorityCourseEntry,
  type ValidationBasis,
} from "@/lib/server/priorityOfficialSources";
import {
  evaluateCourseCatalogFreshness,
  fetchStaleCatalogCoursesForSweep,
  getCourseCatalogFreshnessThresholdsFromEnv,
  type CourseCatalogFreshnessReport,
  type CourseCatalogFreshnessThresholds,
  type StaleCatalogCourseRow,
} from "@/lib/server/courseCatalogFreshness";

export type ImportSourceType =
  | "golfcourseapi"
  | "club_official"
  | "manual_seed"
  | "official_pdf"
  | "official_html"
  | "official_embedded"
  | "manual_dataset";
export type ImportSyncStatus = "ok" | "partial" | "failed" | "skipped";

export type CourseSeed = {
  name: string;
  preferredApiId?: number;
  sourceUrl?: string;
  sourceType?: ImportSourceType;
};

export type ValidationIssue = {
  code: "HOLE_COUNT" | "SI_DUPLICATE" | "SI_OUT_OF_RANGE" | "NUMERIC_INVALID";
  message: string;
  teeName?: string;
  holeNumber?: number;
};

export type CourseDataConfidence = "high" | "medium" | "low";
export type CourseGolferDataStatus = "verified" | "partial" | "unverified" | "rejected";
export type UnverifiedClassification =
  | "unverified_needs_official_confirmation"
  | "unverified_incomplete_hole_data"
  | "unverified_ambiguous_match"
  | "unverified_ambiguous_course_mapping"
  | "unverified_parse_failed";

type MultiSourceSourceId = "official_scorecard" | "golf_api";

type HoleSourceRow = {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
  yardage: number | null;
};

type TeeSourceRows = {
  teeName: string;
  holes: HoleSourceRow[];
};

export type MultiSourceValidationResult = {
  confidence: CourseDataConfidence;
  reasons: string[];
  comparison: {
    sourceCount: number;
    officialSourceUsed: boolean;
    primarySource: MultiSourceSourceId | "unavailable";
    secondarySource: MultiSourceSourceId;
    teesCompared: number;
    holesCompared: number;
    parMismatches: number;
    strokeIndexMismatches: number;
    missingStrokeIndex: number;
    yardageOutsideTolerance: number;
    yardageWithinToleranceVariance: number;
  };
};

export type GolferDataCompleteness = {
  completeTeeCount: number;
  missingSI: number;
  missingYardage: number;
  promotedTeeMissingSI: number;
};

export type GolferDataPromotionDecision = {
  status: CourseGolferDataStatus;
  promotionDecision: "insert" | "stage_partial" | "stage_unverified" | "reject";
  reasons: string[];
  confidence: CourseDataConfidence;
  metrics: {
    sourceCount: number;
    officialSourceUsed: boolean;
    validatedHoleCount: number;
    completeTeeCount: number;
    missingSI: number;
    missingYardage: number;
    parMismatchCount: number;
    yardageMismatchCount: number;
    siMismatchCount: number;
    promotionDecision: "insert" | "stage_partial" | "stage_unverified" | "reject";
  };
};

export type NightlyImportOptions = {
  dryRun?: boolean;
  overwriteManualOverrides?: boolean;
  includeSocietySeeds?: boolean;
  triggerType?: "manual" | "nightly" | "territory_nightly";
};

/** How a GolfCourseAPI id was selected before `runCourseDetailImportFromApi` (or unresolved). */
export type ApiIdResolutionPath = "preferred_api" | "db_name_match" | "db_loose" | "api_search" | "unresolved";

export type GrowthSkipReason = "ambiguous_api_match" | "no_catalog_match" | "below_threshold";

/**
 * Set on `NightlyImportCourseResult` for territory `importCandidateCourse` (growth/refresh) attempts,
 * to explain insert yield and candidate waste.
 */
export type NightlyImportGrowthConversion = {
  resolutionPath: ApiIdResolutionPath;
  skipReason?: GrowthSkipReason;
  newCourseInserted: boolean;
  existingCourseUpdated: boolean;
};

export type NightlyImportCourseResult = {
  courseName: string;
  apiId: number | null;
  status: ImportSyncStatus;
  validationIssues: ValidationIssue[];
  error?: string;
  courseId?: string;
  /** Present when `importCandidateCourse` ran (territory pipeline). */
  growthConversion?: NightlyImportGrowthConversion;
  golferDataStatus?: CourseGolferDataStatus;
  golferDataMetrics?: GolferDataPromotionDecision["metrics"];
  unverifiedClassification?: UnverifiedClassification;
  priorityPromotionAudit?: {
    isPriority: boolean;
    apiCourseIdentityName?: string;
    officialSourceFound: boolean;
    parseSuccess: boolean;
    subCourseMappingRequired?: boolean;
    selectedOfficialCandidateUrl?: string | null;
    selectedOfficialSubCourseName?: string | null;
    completeTeeCount: number;
    missingSI: number;
    missingYardage: number;
    finalStatus: CourseGolferDataStatus | ImportSyncStatus;
    unverifiedClassification?: UnverifiedClassification;
    identitySanity?: {
      ok: boolean;
      reason: string;
      matchedTerms: string[];
      missingTerms: string[];
      excludedTermHit: string | null;
      expectedIdentityTerms: string[];
      excludedIdentityTerms: string[];
      expectedCountry: string | null;
      expectedRegion: string | null;
    };
    officialOnlyPromotedCourses?: Array<{
      courseName: string;
      teeCount: number;
      holeCountsByTee: Array<{ teeName: string; holeCount: number }>;
      sourceUrl: string | null;
      golferDataStatus: CourseGolferDataStatus;
    }>;
  };
};

/** Aggregates how growth attempts break down: skips by search class, and non-net-new by resolution path. */
export type NewCourseGrowthWasteReport = {
  attempted: number;
  netNewInserts: number;
  existingCourseRowsRefreshed: number;
  okOrPartial: number;
  skipped: {
    total: number;
    ambiguousApiMatch: number;
    noCatalogMatch: number;
    belowThreshold: number;
  };
  /** Count of ok|partial by how api_id was resolved. */
  byResolutionOnSuccess: {
    preferredApi: number;
    dbNameMatch: number;
    dbLooseMatch: number;
    apiSearch: number;
  };
  /**
   * Attempts that succeeded on import but only refreshed a course row already in `courses` (no new row):
   * local DB/alias to api_id, vs search that still deduped to an existing `courses` row.
   */
  notNetNew: {
    fromDbOrPreferredPath: number;
    fromApiSearchPath: number;
  };
  /** Unresolved / fuzzy spotlight names (e.g. known tricky venues). */
  spotlightUnresolved: Array<{ name: string; reason: string }>;
};

const UNRESOLVED_SPOTLIGHT = /(woodhall\s+spa|york\s+golf|yeovil\s+golf|yarrow\s+valley)/i;

export type TerritorySeedPhase = "england_wales" | "scotland" | "ireland";

export type TerritoryImportMode = "nightly" | "manual";

/**
 * `seeding` — grow queued candidates fast: high growth API budget, tiny refresh, catalog sweep off unless `--force-catalog-full-refresh`.
 * `maintenance` — conservative nightly behaviour (default). Controlled by `COURSE_IMPORT_RUN_MODE` or `runTerritoryScaleNightlyImport({ runMode })`.
 */
export type CourseImportRunMode = "seeding" | "maintenance";

export type TerritoryImportCaps = {
  maxPriorityCourses: number;
  maxNewSeeds: number;
  maxRetries: number;
  /** Sub-cap for how many imported refresh-due rows to fetch into the refresh bucket (refresh phase only). */
  maxRefreshes: number;
  maxDiscoveryPerRun: number;
  /**
   * Max GolfCourseAPI imports in the growth phase (high-priority + retries + queued new seeds only).
   * Does not include imported refresh or catalog stale sweep.
   */
  maxNewCourseImportAttempts: number;
  /** Max imports for candidates already imported but due for refresh. Separate API budget from growth. */
  maxStaleCandidateRefreshAttempts: number;
  /** Small reserved pass for high-priority imported candidates, even when growth backlog exists. */
  maxPriorityMaintenanceCourses: number;
  /** Max rows processed in the optional catalog stale sweep (separate from candidate budgets). */
  maxStaleCatalogSweepCourses: number;
  /**
   * @deprecated Legacy single ceiling; when set via env/CLI partial caps, seeds maxNewCourseImportAttempts if the new field is omitted.
   */
  maxTotalAttempts?: number;
};

export type TerritoryNightlyImportOptions = {
  dryRun?: boolean;
  overwriteManualOverrides?: boolean;
  includeSocietySeeds?: boolean;
  triggerType?: TerritoryImportMode;
  phaseOverride?: TerritorySeedPhase;
  territoryOverride?: string;
  caps?: Partial<TerritoryImportCaps>;
  /** Overrides `COURSE_IMPORT_RUN_MODE` for this run only. */
  runMode?: CourseImportRunMode;
  /** Overrides env-based defaults from `getCourseCatalogFreshnessThresholdsFromEnv`. */
  catalogFreshnessThresholds?: Partial<CourseCatalogFreshnessThresholds>;
  /** When true, always run the post-batch stale-catalog sweep (for tests / ops). */
  forceCatalogFullRefresh?: boolean;
};

export type TerritoryCandidateStatus = "queued" | "resolved" | "imported" | "rejected" | "failed" | "skipped";

export type StaleCatalogSweepSummary = {
  attempted: number;
  skippedDuplicateApiInBatch: number;
  ok: number;
  partial: number;
  failed: number;
  results: NightlyImportCourseResult[];
};

export type CandidateImportPhaseSummary = {
  attempted: number;
  inserted: number;
  updated: number;
  ok: number;
  partial: number;
  failed: number;
  skipped: number;
};

/** Growth vs refresh vs catalog sweep — distinct API budgets within a single batch. */
export type TerritoryImportWorkPhaseId = "newCourseGrowth" | "staleCandidateRefresh" | "staleCatalogSweep";

export type ImportYieldWorkPhaseMetrics = {
  attempted: number;
  inserted: number;
  updated: number;
  /** Skipped because API id could not be resolved (ambiguous / below threshold / no match). */
  unresolved: number;
  skipped: number;
  /** `inserted / attempted` as a percentage; null when `attempted` is 0. */
  importYieldPct: number | null;
};

export type QueueCompositionPhaseSnapshot = {
  byStatus: Record<TerritoryCandidateStatus, number>;
  totalRows: number;
};

const UNRESOLVED_CANDIDATE_MARKER = "Unresolved candidate";

/** Pure helper for nightly JSON/MD — counts unresolved API matches separately from other skips. */
export function buildImportYieldWorkPhaseMetrics(
  attempted: number,
  inserted: number,
  updated: number,
  results: NightlyImportCourseResult[],
): ImportYieldWorkPhaseMetrics {
  const skipped = results.filter((r) => r.status === "skipped").length;
  const unresolved = results.filter(
    (r) => r.status === "skipped" && (r.error ?? "").includes(UNRESOLVED_CANDIDATE_MARKER),
  ).length;
  const importYieldPct =
    attempted > 0 ? Math.round((inserted / attempted) * 10000) / 100 : null;
  return { attempted, inserted, updated, unresolved, skipped, importYieldPct };
}

/**
 * For territory growth: explains low insert % vs `attempts` (updates vs true inserts, and skip reasons from API search).
 */
export function buildNewCourseGrowthWasteFromGrowthResults(results: NightlyImportCourseResult[]): NewCourseGrowthWasteReport {
  const report: NewCourseGrowthWasteReport = {
    attempted: results.length,
    netNewInserts: 0,
    existingCourseRowsRefreshed: 0,
    okOrPartial: 0,
    skipped: { total: 0, ambiguousApiMatch: 0, noCatalogMatch: 0, belowThreshold: 0 },
    byResolutionOnSuccess: { preferredApi: 0, dbNameMatch: 0, dbLooseMatch: 0, apiSearch: 0 },
    notNetNew: { fromDbOrPreferredPath: 0, fromApiSearchPath: 0 },
    spotlightUnresolved: [],
  };
  const spotlightSeen = new Set<string>();
  const pushSpotlight = (name: string, err: string): void => {
    if (!UNRESOLVED_SPOTLIGHT.test(name) || !err || spotlightSeen.has(name)) return;
    spotlightSeen.add(name);
    report.spotlightUnresolved.push({ name, reason: err.slice(0, 200) });
  };
  for (const r of results) {
    const g = r.growthConversion;
    if (r.status === "ok" || r.status === "partial") {
      report.okOrPartial += 1;
      if (g) {
        if (g.resolutionPath === "preferred_api") report.byResolutionOnSuccess.preferredApi += 1;
        else if (g.resolutionPath === "db_name_match") report.byResolutionOnSuccess.dbNameMatch += 1;
        else if (g.resolutionPath === "db_loose") report.byResolutionOnSuccess.dbLooseMatch += 1;
        else if (g.resolutionPath === "api_search") report.byResolutionOnSuccess.apiSearch += 1;
        if (g.newCourseInserted) report.netNewInserts += 1;
        if (g.existingCourseUpdated) {
          report.existingCourseRowsRefreshed += 1;
          if (!g.newCourseInserted) {
            if (g.resolutionPath === "preferred_api" || g.resolutionPath === "db_name_match" || g.resolutionPath === "db_loose") {
              report.notNetNew.fromDbOrPreferredPath += 1;
            } else if (g.resolutionPath === "api_search") {
              report.notNetNew.fromApiSearchPath += 1;
            }
          }
        }
      }
    } else if (r.status === "skipped" && (r.error?.includes("Unresolved candidate") || g?.skipReason)) {
      report.skipped.total += 1;
      const tag =
        g?.skipReason ??
        (r.error?.includes("ambiguous_api_match")
          ? "ambiguous_api_match"
          : r.error?.includes("no_catalog_match")
            ? "no_catalog_match"
            : "below_threshold");
      if (tag === "ambiguous_api_match") report.skipped.ambiguousApiMatch += 1;
      else if (tag === "no_catalog_match") report.skipped.noCatalogMatch += 1;
      else report.skipped.belowThreshold += 1;
      pushSpotlight(r.courseName ?? "", r.error ?? "");
    }
  }
  return report;
}

/** Nightly / CI exit policy derived from import results (see scripts/nightly-course-import.ts). */
export type NightlyImportRunExitSummary = {
  exitCode: 0 | 1;
  exitReason: string;
  hardFailureCount: number;
  unresolvedCandidateCount: number;
  unresolvedCandidateNames: string[];
  /** True when the run exited 0 but had bounded unresolved API matches (would fail legacy strict CI). */
  exitDowngradedToSuccess: boolean;
  maxUnresolvedOk: number;
};

export type TerritoryImportOutcome = {
  batchId: string;
  batchRunId: string;
  phase: TerritorySeedPhase;
  territory: string;
  results: NightlyImportCourseResult[];
  discoveredCandidates: number;
  attemptedCandidates: number;
  insertedCourses: number;
  updatedCourses: number;
  missingSiCount: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  manualReviewItems: Array<{ courseName: string; status: ImportSyncStatus; reason: string }>;
  report: Record<string, unknown>;
  catalogFreshness: CourseCatalogFreshnessReport;
  staleCatalogSweep?: StaleCatalogSweepSummary;
  newCourseGrowthSummary: CandidateImportPhaseSummary;
  staleCandidateRefreshSummary: CandidateImportPhaseSummary;
  /** When non-null, catalog stale sweep did not run (or not fully) for this reason. */
  skippedStaleCatalogSweepReason: string | null;
  /** Queued candidates remaining after growth + refresh phases (same phase/territory). */
  queuedCandidatesAfterCandidatePhases: number;
  /** Post-run counts in `course_import_candidates` by `seed_phase` (territory-wide snapshot). */
  queueCompositionBySeedPhase: Record<TerritorySeedPhase, QueueCompositionPhaseSnapshot>;
  /** Insert yield and unresolved skips per work phase (this batch only). */
  importYieldByWorkPhase: Record<TerritoryImportWorkPhaseId, ImportYieldWorkPhaseMetrics | null>;
  /** Growth-phase conversion: where attempts went (net-new vs updates vs search skips by class). */
  newCourseGrowthWaste: NewCourseGrowthWasteReport;
  nightlyRunExit: NightlyImportRunExitSummary;
  importRunMode: CourseImportRunMode;
};

const GOLF_API_BASE = "https://api.golfcourseapi.com/v1";
const DEFAULT_PRIORITY_SEEDS: CourseSeed[] = [
  {
    name: "Upavon Golf Club",
    preferredApiId: 12241,
    sourceType: "club_official",
    sourceUrl: "https://upavongolfclub.co.uk",
  },
  {
    name: "Shrivenham Park Golf Club",
    sourceType: "club_official",
    sourceUrl: "https://www.shrivenhampark.co.uk",
  },
  {
    name: "Wycombe Heights Golf Centre",
    sourceType: "club_official",
    sourceUrl: "https://www.wycombeheightsgc.co.uk",
  },
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[course-import-nightly] Missing required env: ${name}`);
  return value;
}

function asFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toConfidence(issues: ValidationIssue[]): number {
  const weighted = issues.reduce((sum, issue) => {
    if (issue.code === "HOLE_COUNT") return sum + 20;
    if (issue.code === "SI_DUPLICATE") return sum + 20;
    if (issue.code === "SI_OUT_OF_RANGE") return sum + 15;
    return sum + 10;
  }, 0);
  return Math.max(0, Math.min(100, 100 - weighted));
}

async function golfApiGet(path: string): Promise<unknown> {
  const key = process.env.GOLFCOURSE_API_KEY || process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY || process.env.NEXT_PUBLIC_GOLF_API_KEY;
  if (!key) throw new Error("Missing GOLFCOURSE_API_KEY");
  const maxRetriesRaw = Number(process.env.COURSE_IMPORT_HTTP_MAX_RETRIES ?? "4");
  const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? Math.round(maxRetriesRaw) : 4;
  const baseDelayRaw = Number(process.env.COURSE_IMPORT_HTTP_BASE_DELAY_MS ?? "1200");
  const baseDelayMs = Number.isFinite(baseDelayRaw) && baseDelayRaw > 0 ? Math.round(baseDelayRaw) : 1200;

  let attempt = 0;
  for (;;) {
    const res = await fetch(`${GOLF_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Key ${key}`,
      },
    });
    if (res.ok) {
      return (await res.json()) as unknown;
    }

    const body = await res.text().catch(() => "");
    const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!retriable || attempt >= maxRetries) {
      throw new Error(`GolfCourseAPI ${res.status}: ${body.slice(0, 240)}`);
    }

    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : NaN;
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.round(retryAfterSeconds * 1000)
        : baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 300);
    await sleep(retryAfterMs + jitter);
    attempt += 1;
  }
}

function extractCourseRow(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const row = payload as Record<string, unknown>;
  const nested = (Array.isArray(row.courses) ? row.courses[0] : null) ?? row.course ?? row.data ?? payload;
  return typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : {};
}

function coerceCourse(row: Record<string, unknown>): GolfCourseApiCourse {
  return {
    id: Number(row.id),
    name: typeof row.name === "string" ? row.name : undefined,
    course_name: typeof row.course_name === "string" ? row.course_name : undefined,
    club_name: typeof row.club_name === "string" ? row.club_name : undefined,
    club: typeof row.club === "string" ? row.club : undefined,
    lat: asFinite(row.lat ?? row.latitude) ?? undefined,
    lng: asFinite(row.lng ?? row.longitude) ?? undefined,
    latitude: asFinite(row.latitude ?? row.lat) ?? undefined,
    longitude: asFinite(row.longitude ?? row.lng) ?? undefined,
    address: row.address as string | Record<string, unknown> | undefined,
    city: typeof row.city === "string" ? row.city : undefined,
    country: typeof row.country === "string" ? row.country : undefined,
    location: row.location as string | Record<string, unknown> | undefined,
    tees: row.tees as GolfCourseApiCourse["tees"],
  };
}

function escapeForILikeFragment(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Exported for unit tests — builds search_query variants for GolfCourseAPI /v1/search. */
export function buildSearchQueryVariantsForImport(candidateName: string, normalizedName: string): string[] {
  const humanNorm = normalizedName.trim().replace(/\s+/g, " ");
  const seeds = [candidateName.trim(), humanNorm].filter((s) => s.length >= 3);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const t = q.trim();
    if (t.length < 3 || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };
  for (const s of seeds) add(s);
  /** GolfCourseAPI lists Woodhall Spa under "The National Golf Centre (…)" — bare "Woodhall Spa …" returns 0 hits. */
  if (/\bwoodhall\b/i.test(candidateName) && /\bspa\b/i.test(candidateName)) {
    add("Hotchkin");
    add("National Golf Centre");
    add("The National Golf Centre");
  }
  for (const s of [...out]) {
    add(s.replace(/\s+Resort\s*$/i, "").trim());
    add(s.replace(/\s+Golf Club\s*$/i, "").trim());
    add(s.replace(/\s+Golf Centre\s*$/i, "").trim());
    add(s.replace(/\s+Golf Course\s*$/i, "").trim());
  }
  const tokens = normalizeCandidateName(candidateName).split(" ").filter((t) => t.length > 1);
  if (tokens.length >= 3) add(tokens.slice(0, 2).join(" "));
  if (tokens.length >= 4) add(tokens.slice(0, 3).join(" "));
  return out.slice(0, 8);
}

function extractCoursesFromSearchPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.courses)) return p.courses as Record<string, unknown>[];
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (Array.isArray(p.data)) return p.data as Record<string, unknown>[];
  const inner = p.data;
  if (inner && typeof inner === "object" && Array.isArray((inner as Record<string, unknown>).courses)) {
    return (inner as Record<string, unknown>).courses as Record<string, unknown>[];
  }
  return [];
}

function searchRowDisplayName(row: Record<string, unknown>): string {
  const club = typeof row.club_name === "string" ? row.club_name.trim() : "";
  const course = typeof row.course_name === "string" ? row.course_name.trim() : "";
  const combined = `${club} ${course}`.trim();
  if (combined) return combined;
  if (typeof row.name === "string") return String(row.name).trim();
  return "";
}

/** Exported for unit tests — scores how well a search row matches the candidate display name. */
export function scoreGolfApiSearchRowAgainstTarget(targetDisplayName: string, apiRow: Record<string, unknown>): number {
  const apiText = searchRowDisplayName(apiRow);
  if (!apiText) return 0;
  const tgtTokens = new Set(
    normalizeCandidateName(targetDisplayName)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  const apiTokens = new Set(
    normalizeCandidateName(apiText)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  if (tgtTokens.size === 0) return 0;
  let inter = 0;
  for (const t of tgtTokens) if (apiTokens.has(t)) inter += 1;
  const recall = inter / tgtTokens.size;
  const tgtN = normalizeCandidateName(targetDisplayName);
  const apiN = normalizeCandidateName(apiText);
  let substringBoost = 0;
  if (tgtN.length >= 6 && apiN.includes(tgtN)) substringBoost = 0.22;
  else if (tgtN.length >= 6) {
    for (const t of tgtTokens) {
      if (t.length >= 6 && apiN.includes(t)) substringBoost = Math.max(substringBoost, 0.08);
    }
  }
  return Math.min(1, recall + substringBoost);
}

type RankedCourseSearchHit = { id: number; score: number; row: Record<string, unknown> };

type CandidateSearchResolutionClass =
  | "matched"
  | "no_catalog_match"
  | "below_threshold"
  | "ambiguous_api_match"
  | "no_sane_api_candidate";

type RejectedApiCandidate = {
  id: number;
  score: number;
  displayName: string;
  reason: string;
};

/** GolfCourseAPI loop ids for Celtic Manor — club_name is "Celtic Manor"; course_name Roman Road / Montgomerie / "2010" (Twenty Ten). */
const CELTIC_MANOR_GOLF_API_LOOP_IDS = new Set([10110, 15579, 15594]);
/** Default loop when discovery name is generic "Celtic Manor Resort" (Ryder Cup / headline layout in API as course "2010"). */
const CELTIC_MANOR_RESORT_DEFAULT_API_ID = 15594;

function applyVenueAliasScoreBoost(displayName: string, row: Record<string, unknown>, baseScore: number): number {
  const t = normalizeCandidateName(displayName);
  const club = normalizeCandidateName(String(row.club_name ?? ""));
  const loc = row.location && typeof row.location === "object" ? (row.location as Record<string, unknown>) : null;
  const city = loc && typeof loc.city === "string" ? normalizeCandidateName(String(loc.city)) : "";

  if (t.includes("woodhall") && t.includes("spa")) {
    if (club.includes("national") && club.includes("golf") && club.includes("centre") && city.includes("woodhall") && city.includes("spa")) {
      const course = normalizeCandidateName(String(row.course_name ?? ""));
      if (course.includes("hotchkin")) return Math.max(baseScore, 0.78);
      if (course.includes("bracken")) return Math.max(baseScore, 0.71);
      return Math.max(baseScore, 0.74);
    }
  }
  if (t.includes("celtic") && t.includes("manor")) {
    if (club.includes("celtic") && club.includes("manor")) {
      return Math.max(baseScore, 0.62);
    }
  }
  return baseScore;
}

function compareWoodhallNationalGcfTieBreak(displayName: string, a: RankedCourseSearchHit, b: RankedCourseSearchHit): number {
  const t = normalizeCandidateName(displayName);
  if (!t.includes("woodhall") || !t.includes("spa")) return 0;
  const rank = (row: Record<string, unknown>): number => {
    const club = normalizeCandidateName(String(row.club_name ?? ""));
    if (!club.includes("national") || !club.includes("golf") || !club.includes("centre")) return 99;
    const c = String(row.course_name ?? "").toLowerCase();
    if (c === "hotchkin") return 0;
    if (c === "bracken") return 1;
    return 5;
  };
  return rank(a.row) - rank(b.row);
}

function tryCelticManorResortMultiLoopDefault(displayName: string, ranked: RankedCourseSearchHit[]): number | null {
  const t = normalizeCandidateName(displayName);
  if (!t.includes("celtic") || !t.includes("manor")) return null;
  if (t.includes("roman") || t.includes("montgomerie") || t.includes("twenty") || t.includes("2010")) return null;

  const top = ranked.slice(0, 6);
  const celticHits = top.filter((h) => CELTIC_MANOR_GOLF_API_LOOP_IDS.has(h.id));
  if (celticHits.length < 2) return null;
  for (const h of celticHits) {
    const c = normalizeCandidateName(String(h.row.club_name ?? ""));
    if (!(c.includes("celtic") && c.includes("manor"))) return null;
  }
  if (t.includes("resort") || (t.includes("celtic") && t.includes("manor"))) {
    return CELTIC_MANOR_RESORT_DEFAULT_API_ID;
  }
  return null;
}

function formatTopSearchHitDiagnostics(ranked: RankedCourseSearchHit[], limit: number): string {
  return ranked
    .slice(0, limit)
    .map((h) => {
      const label = searchRowDisplayName(h.row).replace(/\|/g, "/") || "(no name)";
      return `${h.id}:"${label}"(${h.score.toFixed(2)})`;
    })
    .join(" | ");
}

function extractSearchRowCountry(row: Record<string, unknown>): string | null {
  if (typeof row.country === "string" && row.country.trim().length > 0) return row.country.trim();
  const loc = row.location;
  if (loc && typeof loc === "object" && typeof (loc as Record<string, unknown>).country === "string") {
    const v = String((loc as Record<string, unknown>).country).trim();
    return v.length > 0 ? v : null;
  }
  return null;
}

function extractSearchRowRegion(row: Record<string, unknown>): string | null {
  if (typeof row.region === "string" && row.region.trim().length > 0) return row.region.trim();
  if (typeof row.city === "string" && row.city.trim().length > 0) return row.city.trim();
  const loc = row.location;
  if (loc && typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    if (typeof o.region === "string" && o.region.trim().length > 0) return o.region.trim();
    if (typeof o.city === "string" && o.city.trim().length > 0) return o.city.trim();
    if (typeof o.state === "string" && o.state.trim().length > 0) return o.state.trim();
  }
  return null;
}

function identityBoostForPriorityMatch(matchedTermsCount: number): number {
  if (matchedTermsCount <= 0) return 0;
  return Math.min(0.12, 0.03 + matchedTermsCount * 0.01);
}

function formatRejectedApiCandidateDiagnostics(rejected: RejectedApiCandidate[], limit: number): string {
  if (rejected.length === 0) return "";
  return rejected
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => `${r.id}:"${r.displayName.replace(/\|/g, "/")}"(${r.score.toFixed(2)}):${r.reason}`)
    .join(" | ");
}

function pickBestCourseSearchHit(
  displayName: string,
  rankedInput: RankedCourseSearchHit[],
  minScore: number,
  ambiguityGap: number,
  totalSearchRows: number,
): { apiId: number | null; reason: string; resolutionClass: CandidateSearchResolutionClass } {
  if (rankedInput.length === 0) {
    return {
      apiId: null,
      reason: totalSearchRows === 0 ? "no_search_rows" : "no_scored_hits",
      resolutionClass: totalSearchRows === 0 ? "no_catalog_match" : "below_threshold",
    };
  }
  const ranked = [...rankedInput].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-5) return b.score - a.score;
    return compareWoodhallNationalGcfTieBreak(displayName, a, b);
  });
  const [top, second] = ranked;
  if (top.score < minScore) {
    return {
      apiId: null,
      reason: `best_score_below_min(${top.score.toFixed(3)}<${minScore})`,
      resolutionClass: top.score <= 0 ? "no_catalog_match" : "below_threshold",
    };
  }
  if (second && second.score > 0 && top.score - second.score < ambiguityGap) {
    const celticPick = tryCelticManorResortMultiLoopDefault(displayName, ranked);
    if (celticPick != null) {
      return {
        apiId: celticPick,
        reason: `celtic_manor_resort_default_api_id=${celticPick}`,
        resolutionClass: "matched",
      };
    }
    return {
      apiId: null,
      reason: `ambiguous_top_scores(${top.score.toFixed(3)}vs${second.score.toFixed(3)})`,
      resolutionClass: "ambiguous_api_match",
    };
  }
  return { apiId: top.id, reason: `match_score=${top.score.toFixed(3)}`, resolutionClass: "matched" };
}

function getSearchMatchThresholdsFromEnv(): { minScore: number; ambiguityGap: number; maxQueries: number } {
  const minRaw = Number(process.env.COURSE_IMPORT_SEARCH_MIN_MATCH_SCORE ?? "0.48");
  const gapRaw = Number(process.env.COURSE_IMPORT_SEARCH_AMBIGUITY_GAP ?? "0.11");
  const qRaw = Number(process.env.COURSE_IMPORT_SEARCH_MAX_QUERIES ?? "6");
  const minScore = Number.isFinite(minRaw) && minRaw > 0 && minRaw < 1 ? minRaw : 0.48;
  const ambiguityGap = Number.isFinite(gapRaw) && gapRaw > 0 && gapRaw < 0.5 ? gapRaw : 0.11;
  const maxQueries = Number.isFinite(qRaw) && qRaw >= 1 && qRaw <= 12 ? Math.round(qRaw) : 6;
  return { minScore, ambiguityGap, maxQueries };
}

async function searchCourseApiIdFromVariants(
  displayName: string,
  normalizedName: string,
  opts?: { priorityCourseName?: string; priorityEntries?: PriorityCourseEntry[] },
): Promise<{ apiId: number | null; diagnostic: string; resolutionClass: CandidateSearchResolutionClass }> {
  const { minScore, ambiguityGap, maxQueries } = getSearchMatchThresholdsFromEnv();
  const queries = buildSearchQueryVariantsForImport(displayName, normalizedName).slice(0, maxQueries);
  const hitById = new Map<number, RankedCourseSearchHit>();
  const diag: string[] = [];
  const rejectedByIdentity: RejectedApiCandidate[] = [];
  const priorityCourseName = opts?.priorityCourseName;
  const priorityEntries = opts?.priorityEntries ?? [];
  const shouldApplyPriorityIdentity = !!priorityCourseName && isPriorityCourseName(priorityCourseName, priorityEntries);
  let totalSearchRows = 0;
  for (const q of queries) {
    const payload = (await golfApiGet(`/search?search_query=${encodeURIComponent(q)}`)) as unknown;
    const rows = extractCoursesFromSearchPayload(payload);
    totalSearchRows += rows.length;
    diag.push(`${q}→${rows.length}`);
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const base = scoreGolfApiSearchRowAgainstTarget(displayName, row);
      let s = applyVenueAliasScoreBoost(displayName, row, base);
      if (shouldApplyPriorityIdentity) {
        const sanity = evaluateIdentitySanity({
          courseName: priorityCourseName,
          entries: priorityEntries,
          apiCourseIdentityName: searchRowDisplayName(row),
          apiCountry: extractSearchRowCountry(row),
          apiRegion: extractSearchRowRegion(row),
        });
        if (!sanity.ok) {
          rejectedByIdentity.push({
            id,
            score: s,
            displayName: searchRowDisplayName(row) || "(no name)",
            reason:
              sanity.reason === "identity_excluded_term_hit"
                ? `excluded_term:${sanity.excludedTermHit ?? "unknown"}`
                : sanity.missingTerms.length > 0
                  ? `missing_terms:${sanity.missingTerms.join(",")}`
                  : sanity.reason,
          });
          continue;
        }
        if (sanity.reason !== "no_constraints") {
          s = Math.min(1, s + identityBoostForPriorityMatch(sanity.matchedTerms.length));
        }
      }
      const prev = hitById.get(id);
      if (!prev || s > prev.score) hitById.set(id, { id, score: s, row });
    }
  }
  if (shouldApplyPriorityIdentity && hitById.size === 0 && rejectedByIdentity.length > 0) {
    const rejectedDiag = formatRejectedApiCandidateDiagnostics(rejectedByIdentity, 6);
    const diagnostic = `no_sane_api_candidate | class=no_sane_api_candidate | queries:[${diag.join("; ")}] | rejected:${rejectedDiag}`;
    return { apiId: null, diagnostic, resolutionClass: "no_sane_api_candidate" };
  }
  const ranked = [...hitById.values()].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-5) return b.score - a.score;
    return compareWoodhallNationalGcfTieBreak(displayName, a, b);
  });
  const picked = pickBestCourseSearchHit(displayName, ranked, minScore, ambiguityGap, totalSearchRows);
  const topDiag = formatTopSearchHitDiagnostics(ranked, 6);
  const rejectedDiag = formatRejectedApiCandidateDiagnostics(rejectedByIdentity, 4);
  const diagnostic = `${picked.reason} | class=${picked.resolutionClass} | queries:[${diag.join("; ")}] | topHits:${topDiag}${rejectedDiag ? ` | rejected:${rejectedDiag}` : ""}`;
  return { apiId: picked.apiId, diagnostic, resolutionClass: picked.resolutionClass };
}

async function findExistingCourseApiIdByLooseDbName(
  supabase: SupabaseClient,
  displayName: string,
  normalizedName: string,
): Promise<number | null> {
  const { minScore } = getSearchMatchThresholdsFromEnv();
  const patterns = [...new Set([displayName.trim(), normalizedName.trim().replace(/\s+/g, " ")].filter((p) => p.length >= 3))];
  let best: { id: number; score: number } | null = null;
  for (const p of patterns) {
    const pat = `%${escapeForILikeFragment(p)}%`;
    const { data, error } = await supabase
      .from("courses")
      .select("api_id, course_name")
      .ilike("course_name", pat)
      .not("api_id", "is", null)
      .limit(8);
    if (error) continue;
    for (const row of (data ?? []) as { api_id?: unknown; course_name?: unknown }[]) {
      const api = Number(row.api_id);
      if (!Number.isFinite(api) || api <= 0) continue;
      const cn = String(row.course_name ?? "");
      const sc = scoreGolfApiSearchRowAgainstTarget(displayName, { course_name: cn, club_name: "" });
      if (!best || sc > best.score) best = { id: api, score: sc };
    }
  }
  if (best && best.score >= minScore) return best.id;
  return null;
}

async function searchCourseApiIdByName(query: string): Promise<number | null> {
  const nm = normalizeCandidateName(query);
  const { apiId } = await searchCourseApiIdFromVariants(query, nm);
  return apiId;
}

async function fetchCourseByApiId(apiId: number): Promise<{ raw: Record<string, unknown>; course: GolfCourseApiCourse }> {
  const payload = await golfApiGet(`/courses/${apiId}`);
  const row = extractCourseRow(payload);
  return { raw: row, course: coerceCourse(row) };
}

export function validateNormalizedImport(normalized: NormalizedCourseImport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const teeBundle of normalized.tees) {
    const tee = teeBundle.tee;
    const holes = teeBundle.holes;
    if (holes.length !== 9 && holes.length !== 18) {
      issues.push({
        code: "HOLE_COUNT",
        teeName: tee.teeName,
        message: `Expected 9 or 18 holes, got ${holes.length}`,
      });
    }

    if (tee.courseRating != null && tee.courseRating <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "course_rating must be positive when present" });
    }
    if (tee.slopeRating != null && tee.slopeRating <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "slope_rating must be positive when present" });
    }
    if (tee.parTotal != null && tee.parTotal <= 0) {
      issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, message: "par_total must be positive when present" });
    }

    const siSeen = new Set<number>();
    for (const hole of holes) {
      if (hole.par != null && hole.par <= 0) {
        issues.push({ code: "NUMERIC_INVALID", teeName: tee.teeName, holeNumber: hole.holeNumber, message: "par must be positive when present" });
      }
      if (hole.yardage != null && hole.yardage <= 0) {
        issues.push({
          code: "NUMERIC_INVALID",
          teeName: tee.teeName,
          holeNumber: hole.holeNumber,
          message: "yardage must be positive when present",
        });
      }
      if (hole.strokeIndex != null) {
        if (hole.strokeIndex < 1 || hole.strokeIndex > 18) {
          issues.push({
            code: "SI_OUT_OF_RANGE",
            teeName: tee.teeName,
            holeNumber: hole.holeNumber,
            message: `stroke_index ${hole.strokeIndex} is outside 1-18`,
          });
        }
        if (siSeen.has(hole.strokeIndex)) {
          issues.push({
            code: "SI_DUPLICATE",
            teeName: tee.teeName,
            holeNumber: hole.holeNumber,
            message: `stroke_index ${hole.strokeIndex} duplicated`,
          });
        } else {
          siSeen.add(hole.strokeIndex);
        }
      }
    }
  }
  return issues;
}

async function insertJobStart(
  supabase: SupabaseClient,
  payload: {
    batchId: string;
    triggerType: "manual" | "nightly" | "territory_nightly";
    courseName: string;
    apiId: number | null;
    sourceType: ImportSourceType;
    sourceUrl: string | null;
    batchRunId?: string | null;
    candidateId?: string | null;
    seedPhase?: TerritorySeedPhase | null;
    territory?: string | null;
    mode?: "legacy_nightly" | "territory_nightly" | "manual";
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("course_import_jobs")
    .insert({
      batch_id: payload.batchId,
      trigger_type: payload.triggerType,
      target_course_name: payload.courseName,
      target_api_id: payload.apiId,
      source_type: payload.sourceType,
      source_url: payload.sourceUrl,
      sync_status: "running",
      started_at: new Date().toISOString(),
      batch_run_id: payload.batchRunId ?? null,
      candidate_id: payload.candidateId ?? null,
      seed_phase: payload.seedPhase ?? null,
      territory: payload.territory ?? null,
      mode: payload.mode ?? (payload.triggerType === "territory_nightly" ? "territory_nightly" : "legacy_nightly"),
    })
    .select("id")
    .single();
  if (error) return null;
  return String((data as { id: string }).id);
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  await supabase.from("course_import_jobs").update(payload).eq("id", jobId);
}

async function upsertNormalizedImport(
  supabase: SupabaseClient,
  normalized: NormalizedCourseImport,
  metadata: {
    sourceType: ImportSourceType;
    sourceUrl: string | null;
    syncStatus: "ok" | "partial";
    confidence: number;
    importedAtIso: string;
    rawRow: Record<string, unknown>;
    territory?: string | null;
    seedPhase?: TerritorySeedPhase | null;
    discoverySource?: string | null;
    importPriority?: number | null;
    refreshDueAt?: string | null;
    firstDiscoveredAt?: string | null;
    lastDiscoveredAt?: string | null;
    canonicalApiId?: number | null;
    seededStatus?: "unseeded" | "seeded" | "refresh_due" | "retired";
    discoveryStatus?: "unknown" | "discovered" | "queued" | "resolved" | "rejected";
    dataConfidence?: CourseDataConfidence;
    golferDataStatus?: CourseGolferDataStatus;
    validationBasis?: ValidationBasis;
  },
): Promise<{ courseId: string }> {
  const coursePayload: Record<string, unknown> = {
    dedupe_key: normalized.course.dedupeKey,
    api_id: normalized.course.apiId,
    club_name: normalized.course.clubName,
    course_name: normalized.course.courseName,
    full_name: normalized.course.fullName,
    address: normalized.course.address,
    city: normalized.course.city,
    country: normalized.course.country,
    lat: normalized.course.latitude,
    lng: normalized.course.longitude,
    normalized_name: normalized.course.normalizedNameKey,
    source: normalized.course.source,
    source_type: metadata.sourceType,
    source_url: metadata.sourceUrl,
    sync_status: metadata.syncStatus,
    confidence_score: metadata.confidence,
    imported_at: metadata.importedAtIso,
    last_synced_at: metadata.importedAtIso,
    enrichment_status: metadata.syncStatus === "ok" ? "imported" : "partial",
    raw_row: metadata.rawRow,
    territory: metadata.territory ?? null,
    seed_phase: metadata.seedPhase ?? null,
    discovery_source: metadata.discoverySource ?? null,
    import_priority: metadata.importPriority ?? 0,
    refresh_due_at: metadata.refreshDueAt ?? null,
    first_discovered_at: metadata.firstDiscoveredAt ?? null,
    last_discovered_at: metadata.lastDiscoveredAt ?? null,
    canonical_api_id: metadata.canonicalApiId ?? normalized.course.apiId,
    seeded_status: metadata.seededStatus ?? "seeded",
    discovery_status: metadata.discoveryStatus ?? "resolved",
    data_confidence: metadata.dataConfidence ?? "high",
    golfer_data_status: metadata.golferDataStatus ?? "verified",
    validation_basis: metadata.validationBasis ?? "secondary_only",
  };

  const { data: savedCourse, error: courseError } = await supabase
    .from("courses")
    .upsert(coursePayload, { onConflict: "dedupe_key" })
    .select("id")
    .single();

  if (courseError || !savedCourse) {
    throw new Error(courseError?.message || "Failed to upsert course");
  }

  const courseId = String((savedCourse as { id: string }).id);
  const teeRows = normalized.tees.map((bundle) => ({
    course_id: courseId,
    tee_name: bundle.tee.teeName,
    course_rating: bundle.tee.courseRating,
    bogey_rating: bundle.tee.bogeyRating,
    slope_rating: bundle.tee.slopeRating,
    par_total: bundle.tee.parTotal,
    yards: bundle.tee.totalYards,
    total_meters: bundle.tee.totalMeters,
    gender: bundle.tee.gender,
    tee_color: bundle.tee.teeColor,
    is_default: bundle.tee.isDefault,
    display_order: bundle.tee.displayOrder,
    is_active: true,
    source_type: metadata.sourceType,
    source_url: metadata.sourceUrl,
    sync_status: metadata.syncStatus,
    confidence_score: metadata.confidence,
    imported_at: metadata.importedAtIso,
    last_synced_at: metadata.importedAtIso,
  }));

  const teeIdsByName = new Map<string, string>();
  for (const teeRow of teeRows) {
    const { data: savedTee, error: teeError } = await supabase
      .from("course_tees")
      .upsert(teeRow, { onConflict: "course_id,tee_name" })
      .select("id, tee_name")
      .single();
    if (teeError || !savedTee) throw new Error(teeError?.message || `Failed to upsert tee ${teeRow.tee_name}`);
    teeIdsByName.set(String((savedTee as { tee_name: string }).tee_name), String((savedTee as { id: string }).id));
  }

  await supabase.from("course_holes").delete().eq("course_id", courseId);

  for (const bundle of normalized.tees) {
    const teeId = teeIdsByName.get(bundle.tee.teeName);
    if (!teeId) continue;
    if (bundle.holes.length === 0) continue;
    const holeRows = bundle.holes.map((hole) => ({
      course_id: courseId,
      tee_id: teeId,
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
      stroke_index: hole.strokeIndex,
      source_type: metadata.sourceType,
      source_url: metadata.sourceUrl,
      sync_status: metadata.syncStatus,
      confidence_score: metadata.confidence,
      imported_at: metadata.importedAtIso,
      last_synced_at: metadata.importedAtIso,
    }));
    const { error } = await supabase.from("course_holes").upsert(holeRows, { onConflict: "tee_id,hole_number" });
    if (error) throw new Error(error.message || `Failed to upsert holes for tee ${bundle.tee.teeName}`);
  }

  return { courseId };
}

async function applyManualOverrides(
  supabase: SupabaseClient,
  courseId: string,
  overwriteManualOverrides: boolean,
): Promise<void> {
  if (overwriteManualOverrides) return;
  const { data: overrides, error } = await supabase
    .from("course_manual_overrides")
    .select("id, tee_id, hole_number, field_name, override_value")
    .eq("course_id", courseId)
    .eq("is_active", true)
    .eq("preserve_on_import", true);
  if (error || !overrides || overrides.length === 0) return;

  for (const row of overrides as Array<{
    tee_id: string | null;
    hole_number: number | null;
    field_name: string;
    override_value: unknown;
  }>) {
    const field = row.field_name;
    const raw = row.override_value;
    let value: unknown = raw;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as Record<string, unknown>)) {
      value = (raw as Record<string, unknown>).value;
    }
    if (row.tee_id && row.hole_number != null) {
      await supabase
        .from("course_holes")
        .update({ [field]: value })
        .eq("course_id", courseId)
        .eq("tee_id", row.tee_id)
        .eq("hole_number", row.hole_number);
      continue;
    }
    if (row.tee_id && row.hole_number == null) {
      await supabase.from("course_tees").update({ [field]: value }).eq("id", row.tee_id).eq("course_id", courseId);
      continue;
    }
    if (!row.tee_id && row.hole_number == null) {
      await supabase.from("courses").update({ [field]: value }).eq("id", courseId);
    }
  }
}

async function discoverSocietyCourseSeeds(supabase: SupabaseClient): Promise<CourseSeed[]> {
  const seeds: CourseSeed[] = [];
  const { data: societies } = await supabase
    .from("societies")
    .select("id, name")
    .or("name.ilike.%M4%,name.ilike.%ZGS%")
    .limit(50);
  if (!societies || societies.length === 0) return seeds;
  const ids = societies.map((s: { id: string }) => s.id);
  const { data: events } = await supabase
    .from("events")
    .select("course_name, course_id")
    .in("society_id", ids)
    .not("course_name", "is", null)
    .limit(500);
  const seen = new Set<string>();
  for (const eventRow of (events ?? []) as Array<{ course_name: string | null }>) {
    const courseName = eventRow.course_name?.trim();
    if (!courseName) continue;
    const key = courseName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ name: courseName, sourceType: "golfcourseapi" });
  }
  return seeds;
}

function mergeSeeds(priority: CourseSeed[], additional: CourseSeed[]): CourseSeed[] {
  const out: CourseSeed[] = [];
  const seen = new Set<string>();
  for (const seed of [...priority, ...additional]) {
    const key = seed.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(seed);
  }
  return out;
}

function deriveValidationBasis(params: {
  officialSourceUsed: boolean;
  sourceCount: number;
}): ValidationBasis {
  if (params.officialSourceUsed && params.sourceCount <= 1) return "official_only";
  if (params.officialSourceUsed) return "official_plus_secondary";
  if (params.sourceCount >= 2) return "dual_secondary_match";
  return "secondary_only";
}

export function classifyUnverifiedStage(params: {
  completeTeeCount: number;
  missingSI: number;
  missingYardage: number;
  officialSourceFound: boolean;
  officialParseSuccess: boolean;
  ambiguousMatch: boolean;
  subCourseMappingRequired?: boolean;
}): UnverifiedClassification {
  if (params.subCourseMappingRequired) return "unverified_ambiguous_course_mapping";
  if (params.ambiguousMatch) return "unverified_ambiguous_match";
  if (params.officialSourceFound && !params.officialParseSuccess) return "unverified_parse_failed";
  if (
    params.completeTeeCount > 0 &&
    params.missingSI === 0 &&
    params.missingYardage === 0 &&
    !params.officialSourceFound
  ) {
    return "unverified_needs_official_confirmation";
  }
  return "unverified_incomplete_hole_data";
}

function priorityEntriesForCourse(courseName: string, entries: PriorityCourseEntry[]): PriorityCourseEntry[] {
  const key = normalizeCourseKey(courseName);
  return entries.filter((e) => normalizeCourseKey(e.name) === key);
}

function allowsOfficialOnlyPromotion(courseName: string, entries: PriorityCourseEntry[]): boolean {
  return priorityEntriesForCourse(courseName, entries).some((e) => e.allowOfficialOnlyPromotion === true);
}

function hasConfiguredOfficialSource(courseName: string, entries: PriorityCourseEntry[]): boolean {
  return priorityEntriesForCourse(courseName, entries).some(
    (e) =>
      (typeof e.officialScorecardUrl === "string" && e.officialScorecardUrl.trim().length > 0) ||
      (Array.isArray(e.officialUrls) && e.officialUrls.length > 0),
  );
}

function officialOnlyTargetCourseName(seedName: string, entry: PriorityCourseEntry): string {
  const sub = entry.subCourseName?.trim();
  if (!sub) return seedName;
  return `${seedName} - ${sub}`;
}

function evaluateOfficialRowsCompleteness(rows: TeeSourceRows[]): {
  completeTeeCount: number;
  missingSI: number;
  missingYardage: number;
  completeTees: TeeSourceRows[];
} {
  let missingSI = 0;
  let missingYardage = 0;
  const completeTees: TeeSourceRows[] = [];
  for (const tee of rows) {
    const holes = tee.holes ?? [];
    for (const h of holes) {
      if (h.stroke_index == null) missingSI += 1;
      if (h.yardage == null) missingYardage += 1;
    }
    const isComplete =
      holes.length === 18 &&
      holes.every((h) => h.par != null && h.yardage != null && h.stroke_index != null);
    if (isComplete) completeTees.push(tee);
  }
  return { completeTeeCount: completeTees.length, missingSI, missingYardage, completeTees };
}

function toOfficialOnlyDedupeKey(courseName: string, territory: string): string {
  return `official_only:${territory.toLowerCase()}:${normalizeCandidateName(courseName)}`;
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function upsertOfficialOnlyPriorityImport(
  supabase: SupabaseClient,
  params: {
    courseName: string;
    territory: string;
    seedPhase: TerritorySeedPhase;
    country: string | null;
    sourceType: ImportSourceType;
    sourceUrl: string | null;
    importedAtIso: string;
    rawRow: Record<string, unknown>;
    rows: TeeSourceRows[];
    importPriority?: number | null;
    discoverySource?: string | null;
    firstDiscoveredAt?: string | null;
    lastDiscoveredAt?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ courseId: string; teeCount: number; holeCount: number; existedBefore: boolean }> {
  const dedupeKey = toOfficialOnlyDedupeKey(params.courseName, params.territory);
  const normalizedName = normalizeCandidateName(params.courseName);
  const lat =
    toNumberOrNull(params.metadata?.latitude) ??
    toNumberOrNull(params.metadata?.lat) ??
    toNumberOrNull(params.metadata?.y) ??
    null;
  const lng =
    toNumberOrNull(params.metadata?.longitude) ??
    toNumberOrNull(params.metadata?.lng) ??
    toNumberOrNull(params.metadata?.x) ??
    null;

  const { data: existing } = await supabase.from("courses").select("id").eq("dedupe_key", dedupeKey).maybeSingle();
  const existedBefore = !!existing;

  const coursePayload: Record<string, unknown> = {
    dedupe_key: dedupeKey,
    api_id: null,
    canonical_api_id: null,
    club_name: params.courseName,
    course_name: params.courseName,
    full_name: params.courseName,
    address: null,
    city: null,
    country: params.country,
    lat,
    lng,
    normalized_name: `|${normalizedName}`,
    source: "priority_official_only",
    source_type: params.sourceType,
    source_url: params.sourceUrl,
    sync_status: "ok",
    confidence_score: 1,
    imported_at: params.importedAtIso,
    last_synced_at: params.importedAtIso,
    enrichment_status: "imported",
    raw_row: params.rawRow,
    territory: params.territory,
    seed_phase: params.seedPhase,
    discovery_source: params.discoverySource ?? null,
    import_priority: params.importPriority ?? 0,
    first_discovered_at: params.firstDiscoveredAt ?? null,
    last_discovered_at: params.lastDiscoveredAt ?? null,
    seeded_status: "seeded",
    discovery_status: "resolved",
    data_confidence: "high",
    golfer_data_status: "verified",
    validation_basis: "official_only",
  };
  const { data: savedCourse, error: courseError } = await supabase
    .from("courses")
    .upsert(coursePayload, { onConflict: "dedupe_key" })
    .select("id")
    .single();
  if (courseError || !savedCourse) throw new Error(courseError?.message || "Failed to upsert official-only course");
  const courseId = String((savedCourse as { id: string }).id);

  const teeRows = params.rows.map((tee, idx) => {
    const totalYards = tee.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0);
    const totalPar = tee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0);
    return {
      course_id: courseId,
      tee_name: tee.teeName,
      course_rating: null,
      bogey_rating: null,
      slope_rating: null,
      par_total: totalPar > 0 ? totalPar : null,
      yards: totalYards > 0 ? totalYards : null,
      total_meters: null,
      gender: null,
      tee_color: null,
      is_default: idx === 0,
      display_order: idx + 1,
      is_active: true,
      source_type: params.sourceType,
      source_url: params.sourceUrl,
      sync_status: "ok",
      confidence_score: 1,
      imported_at: params.importedAtIso,
      last_synced_at: params.importedAtIso,
    };
  });

  const teeIdsByName = new Map<string, string>();
  for (const teeRow of teeRows) {
    const { data: savedTee, error: teeError } = await supabase
      .from("course_tees")
      .upsert(teeRow, { onConflict: "course_id,tee_name" })
      .select("id, tee_name")
      .single();
    if (teeError || !savedTee) throw new Error(teeError?.message || `Failed to upsert tee ${teeRow.tee_name}`);
    teeIdsByName.set(String((savedTee as { tee_name: string }).tee_name), String((savedTee as { id: string }).id));
  }

  await supabase.from("course_holes").delete().eq("course_id", courseId);
  let holeCount = 0;
  for (const tee of params.rows) {
    const teeId = teeIdsByName.get(tee.teeName);
    if (!teeId) continue;
    const holeRows = tee.holes.map((hole) => ({
      course_id: courseId,
      tee_id: teeId,
      hole_number: hole.hole_number,
      par: hole.par,
      yardage: hole.yardage,
      stroke_index: hole.stroke_index,
      source_type: params.sourceType,
      source_url: params.sourceUrl,
      sync_status: "ok",
      confidence_score: 1,
      imported_at: params.importedAtIso,
      last_synced_at: params.importedAtIso,
    }));
    if (holeRows.length > 0) {
      const byHole = new Map<number, (typeof holeRows)[number]>();
      for (const row of holeRows) {
        const holeNumber = Number(row.hole_number);
        if (!Number.isFinite(holeNumber) || holeNumber <= 0) continue;
        const existing = byHole.get(holeNumber);
        if (!existing) {
          byHole.set(holeNumber, row);
          continue;
        }
        const existingScore =
          (existing.par != null ? 1 : 0) + (existing.yardage != null ? 1 : 0) + (existing.stroke_index != null ? 1 : 0);
        const nextScore = (row.par != null ? 1 : 0) + (row.yardage != null ? 1 : 0) + (row.stroke_index != null ? 1 : 0);
        if (nextScore >= existingScore) byHole.set(holeNumber, row);
      }
      const uniqueHoleRows = [...byHole.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => row);
      const { error } = await supabase.from("course_holes").upsert(uniqueHoleRows, { onConflict: "tee_id,hole_number" });
      if (error) throw new Error(error.message || `Failed to upsert official-only holes for tee ${tee.teeName}`);
      holeCount += uniqueHoleRows.length;
    }
  }

  return { courseId, teeCount: teeRows.length, holeCount, existedBefore };
}

async function resolveApiIdDetail(
  supabase: SupabaseClient,
  seed: CourseSeed,
  opts?: { normalizedName?: string; priorityEntries?: PriorityCourseEntry[] },
): Promise<{
  apiId: number | null;
  diagnostic?: string;
  resolutionClass?: CandidateSearchResolutionClass;
  resolutionPath: ApiIdResolutionPath;
}> {
  const priorityEntries = opts?.priorityEntries ?? [];
  const enforcePriorityIdentitySanity = isPriorityCourseName(seed.name, priorityEntries);
  const sanityRejects: string[] = [];
  const isApiIdSaneForPriority = async (apiId: number): Promise<boolean> => {
    if (!enforcePriorityIdentitySanity) return true;
    try {
      const fetched = await fetchCourseByApiId(apiId);
      const sanity = evaluateIdentitySanity({
        courseName: seed.name,
        entries: priorityEntries,
        apiCourseIdentityName: fetched.course.course_name,
        apiCountry: fetched.course.country,
        apiRegion: fetched.course.city,
      });
      if (sanity.ok) return true;
      const why =
        sanity.reason === "identity_excluded_term_hit"
          ? `excluded_term:${sanity.excludedTermHit ?? "unknown"}`
          : sanity.missingTerms.length > 0
            ? `missing_terms:${sanity.missingTerms.join(",")}`
            : sanity.reason;
      sanityRejects.push(`${apiId}:${fetched.course.course_name}:${why}`);
      return false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      sanityRejects.push(`${apiId}:fetch_error:${msg}`);
      return false;
    }
  };

  if (seed.preferredApiId && seed.preferredApiId > 0) {
    if (await isApiIdSaneForPriority(seed.preferredApiId)) {
      return {
        apiId: seed.preferredApiId,
        diagnostic: "preferred_api_id",
        resolutionClass: "matched",
        resolutionPath: "preferred_api",
      };
    }
  }
  const normalized = opts?.normalizedName?.trim() || normalizeCandidateName(seed.name);
  const { data: existing } = await supabase
    .from("courses")
    .select("api_id")
    .ilike("course_name", seed.name)
    .not("api_id", "is", null)
    .limit(1)
    .maybeSingle();
  const existingApi = existing ? Number((existing as { api_id?: number }).api_id) : null;
  if (existingApi != null && Number.isFinite(existingApi) && existingApi > 0) {
    if (await isApiIdSaneForPriority(existingApi)) {
      return {
        apiId: existingApi,
        diagnostic: "db_case_insensitive_name_match",
        resolutionClass: "matched",
        resolutionPath: "db_name_match",
      };
    }
  }
  const loose = await findExistingCourseApiIdByLooseDbName(supabase, seed.name, normalized);
  if (loose != null) {
    if (await isApiIdSaneForPriority(loose)) {
      return {
        apiId: loose,
        diagnostic: "db_substring_ilike_scored",
        resolutionClass: "matched",
        resolutionPath: "db_loose",
      };
    }
  }
  const searched = await searchCourseApiIdFromVariants(seed.name, normalized, {
    priorityCourseName: seed.name,
    priorityEntries,
  });
  const rejectSuffix = sanityRejects.length > 0 ? ` | rejected_presearch:${sanityRejects.join(" | ")}` : "";
  if (searched.apiId == null) {
    return {
      apiId: null,
      diagnostic: `${searched.diagnostic ?? ""}${rejectSuffix}`.trim(),
      resolutionClass: searched.resolutionClass,
      resolutionPath: "api_search",
    };
  }
  if (!(await isApiIdSaneForPriority(searched.apiId))) {
    return {
      apiId: null,
      diagnostic: `no_sane_api_candidate | class=no_sane_api_candidate | search:${searched.diagnostic}${rejectSuffix}`,
      resolutionClass: "no_sane_api_candidate",
      resolutionPath: "api_search",
    };
  }
  return {
    apiId: searched.apiId,
    diagnostic: `${searched.diagnostic ?? ""}${rejectSuffix}`.trim(),
    resolutionClass: searched.apiId != null ? "matched" : searched.resolutionClass,
    resolutionPath: "api_search",
  };
}

async function resolveApiId(
  supabase: SupabaseClient,
  seed: CourseSeed,
  opts?: { normalizedName?: string },
): Promise<number | null> {
  const { apiId } = await resolveApiIdDetail(supabase, seed, opts);
  return apiId;
}

export async function runNightlyCourseImport(
  options?: NightlyImportOptions,
): Promise<{ batchId: string; results: NightlyImportCourseResult[] }> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);
  const dryRun = options?.dryRun === true;
  const includeSocietySeeds = options?.includeSocietySeeds !== false;
  const overwriteManualOverrides = options?.overwriteManualOverrides === true;
  const triggerType = options?.triggerType ?? "manual";
  const batchId = randomUUID();

  const societySeeds = includeSocietySeeds ? await discoverSocietyCourseSeeds(supabase) : [];
  const allSeeds = mergeSeeds(DEFAULT_PRIORITY_SEEDS, societySeeds);
  const results: NightlyImportCourseResult[] = [];

  for (const seed of allSeeds) {
    const sourceType = seed.sourceType ?? "golfcourseapi";
    const sourceUrl = seed.sourceUrl ?? null;
    const apiId = await resolveApiId(supabase, seed);
    const jobId = await insertJobStart(supabase, {
      batchId,
      triggerType,
      courseName: seed.name,
      apiId,
      sourceType,
      sourceUrl,
    });

    if (!apiId) {
      const failed: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId: null,
        status: "failed",
        validationIssues: [],
        error: "Unable to resolve GolfCourseAPI id from seed",
      };
      results.push(failed);
      await updateJob(supabase, jobId, {
        sync_status: "failed",
        finished_at: new Date().toISOString(),
        error_message: failed.error,
      });
      continue;
    }

    try {
      const fetched = await fetchCourseByApiId(apiId);
      const normalized = normalizeGolfCourseApiCourse(fetched.course);
      const validationIssues = validateNormalizedImport(normalized);
      const status: "ok" | "partial" = validationIssues.length === 0 ? "ok" : "partial";
      const importedAtIso = new Date().toISOString();
      const confidence = toConfidence(validationIssues);

      let courseId: string | undefined;
      if (!dryRun) {
        const persisted = await upsertNormalizedImport(supabase, normalized, {
          sourceType,
          sourceUrl,
          syncStatus: status,
          confidence,
          importedAtIso,
          rawRow: fetched.raw,
        });
        courseId = persisted.courseId;
        await applyManualOverrides(supabase, persisted.courseId, overwriteManualOverrides);
      }

      const result: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId,
        status,
        validationIssues,
        courseId,
      };
      results.push(result);

      await updateJob(supabase, jobId, {
        target_course_id: courseId ?? null,
        sync_status: status,
        finished_at: new Date().toISOString(),
        imported_at: dryRun ? null : importedAtIso,
        confidence_score: confidence,
        validation_errors: validationIssues,
        raw_source_payload: fetched.raw,
        summary: {
          dryRun,
          teeCount: normalized.tees.length,
          holeCount: normalized.tees.reduce((sum, tee) => sum + tee.holes.length, 0),
          overwriteManualOverrides,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: NightlyImportCourseResult = {
        courseName: seed.name,
        apiId,
        status: "failed",
        validationIssues: [],
        error: message,
      };
      results.push(failed);
      await updateJob(supabase, jobId, {
        sync_status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      });
    }
  }

  return { batchId, results };
}

type TerritoryCandidateRow = {
  id: string;
  candidate_name: string;
  normalized_name: string;
  country: string | null;
  territory: string;
  seed_phase: TerritorySeedPhase;
  discovery_source: string;
  status: TerritoryCandidateStatus;
  canonical_api_id: number | null;
  import_priority: number;
  refresh_due_at: string | null;
  last_synced_at: string | null;
  sync_status: string;
  confidence_score: number | null;
  retry_count: number;
  next_retry_at: string | null;
  first_discovered_at: string | null;
  last_discovered_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
};

const PHASE_ORDER: TerritorySeedPhase[] = ["england_wales", "scotland", "ireland"];
const DEFAULT_TERRITORY = "uk";

function normalizeCandidateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPostgresUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint");
}

type CandidateMergeRow = {
  id: string;
  candidate_name: string;
  normalized_name: string;
  import_priority: number;
  metadata: Record<string, unknown>;
};

async function selectCandidateByCanonicalApi(
  supabase: SupabaseClient,
  territory: string,
  canonicalApiId: number,
): Promise<CandidateMergeRow | null> {
  const { data, error } = await supabase
    .from("course_import_candidates")
    .select("id, candidate_name, normalized_name, import_priority, metadata")
    .eq("territory", territory)
    .eq("canonical_api_id", canonicalApiId)
    .limit(1);
  if (error) throw new Error(error.message || "Failed to read candidate by canonical API id.");
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    import_priority: Number(row.import_priority ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

async function selectCandidateByNormalizedName(
  supabase: SupabaseClient,
  territory: string,
  normalizedName: string,
): Promise<(CandidateMergeRow & { canonical_api_id: number | null }) | null> {
  const { data, error } = await supabase
    .from("course_import_candidates")
    .select("id, candidate_name, normalized_name, import_priority, metadata, canonical_api_id")
    .eq("territory", territory)
    .eq("normalized_name", normalizedName)
    .limit(1);
  if (error) throw new Error(error.message || "Failed to read candidate by normalized name.");
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const api = row.canonical_api_id;
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    import_priority: Number(row.import_priority ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    canonical_api_id: api != null && Number.isFinite(Number(api)) ? Number(api) : null,
  };
}

async function mergeDiscoveryIntoCandidate(
  supabase: SupabaseClient,
  existing: CandidateMergeRow,
  params: {
    name: string;
    country: string | null;
    phase: TerritorySeedPhase;
    discoverySource: string;
    priority: number;
    status?: TerritoryCandidateStatus;
    metadata?: Record<string, unknown>;
  },
  options: { nowIso: string; canonicalApiId?: number | null },
): Promise<void> {
  const existingMeta = existing.metadata ?? {};
  const existingAliases = Array.isArray(existingMeta.aliases)
    ? existingMeta.aliases.map((v) => String(v))
    : [];
  const aliasSet = new Set<string>([existing.candidate_name.trim(), ...existingAliases]);
  aliasSet.add(params.name.trim());
  const mergedMetadata: Record<string, unknown> = {
    ...existingMeta,
    ...(params.metadata ?? {}),
    aliases: [...aliasSet].filter((v) => v.length > 0),
  };
  const nextPriority = Math.max(existing.import_priority, params.priority);
  const patch: Record<string, unknown> = {
    candidate_name: existing.candidate_name.trim() || params.name,
    normalized_name: existing.normalized_name,
    country: params.country,
    seed_phase: params.phase,
    discovery_source: params.discoverySource,
    status: params.status ?? "queued",
    import_priority: nextPriority,
    last_discovered_at: options.nowIso,
    metadata: mergedMetadata,
  };
  if (options.canonicalApiId != null && options.canonicalApiId > 0) {
    patch.canonical_api_id = options.canonicalApiId;
  }
  const { error: updateErr } = await supabase.from("course_import_candidates").update(patch).eq("id", existing.id);
  if (updateErr) throw new Error(updateErr.message || "Failed to merge discovery into candidate.");
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/**
 * `COURSE_IMPORT_EXIT_OK_MAX_UNRESOLVED` overrides the default. Seeding mode allows more
 * API-resolution skips per batch (ambiguous / no search hit) so backlog runs do not spuriously fail
 * CI; maintenance stays strict.
 */
function getNightlyExitPolicyFromEnv(importRunMode: CourseImportRunMode): { maxUnresolvedOk: number } {
  const defaultMax = importRunMode === "seeding" ? 100 : 5;
  return { maxUnresolvedOk: parsePositiveIntEnv("COURSE_IMPORT_EXIT_OK_MAX_UNRESOLVED", defaultMax) };
}

function computeNightlyImportRunExitSummary(
  results: NightlyImportCourseResult[],
  policy: { maxUnresolvedOk: number },
): NightlyImportRunExitSummary {
  const hardFailureCount = results.filter((r) => r.status === "failed").length;
  const unresolvedCandidateNames = results
    .filter((r) => r.status === "skipped" && (r.error ?? "").includes(UNRESOLVED_CANDIDATE_MARKER))
    .map((r) => r.courseName);
  const unresolvedCandidateCount = unresolvedCandidateNames.length;
  let exitCode: 0 | 1 = 0;
  let exitReason = "ok";
  if (hardFailureCount > 0) {
    exitCode = 1;
    exitReason = "hard_failures_present";
  } else if (unresolvedCandidateCount > policy.maxUnresolvedOk) {
    exitCode = 1;
    exitReason = "unresolved_candidates_exceed_cap";
  } else if (unresolvedCandidateCount > 0) {
    exitReason = "ok_with_bounded_unresolved_api_matches";
  }
  const exitDowngradedToSuccess = exitCode === 0 && unresolvedCandidateCount > 0;
  return {
    exitCode,
    exitReason,
    hardFailureCount,
    unresolvedCandidateCount,
    unresolvedCandidateNames,
    exitDowngradedToSuccess,
    maxUnresolvedOk: policy.maxUnresolvedOk,
  };
}

/**
 * Tier-1 seeding preset (~75 growth API calls/night before per-field `caps` overrides).
 * Ramp when stable: raise `maxNewCourseImportAttempts` via CLI `--max-new-growth=` or env `COURSE_IMPORT_MAX_NEW_COURSE_IMPORT_ATTEMPTS` while `COURSE_IMPORT_RUN_MODE=seeding`.
 */
export const COURSE_IMPORT_SEEDING_PRESET_CAPS: TerritoryImportCaps = {
  maxPriorityCourses: 28,
  maxNewSeeds: 64,
  maxRetries: 14,
  maxRefreshes: 8,
  maxPriorityMaintenanceCourses: 5,
  maxDiscoveryPerRun: 500,
  maxNewCourseImportAttempts: 75,
  maxStaleCandidateRefreshAttempts: 2,
  maxStaleCatalogSweepCourses: 0,
};

export function resolveCourseImportRunMode(options?: TerritoryNightlyImportOptions): CourseImportRunMode {
  const o = options?.runMode?.trim().toLowerCase();
  if (o === "seeding" || o === "maintenance") return o;
  const e = process.env.COURSE_IMPORT_RUN_MODE?.trim().toLowerCase();
  if (e === "seeding" || e === "maintenance") return e;
  return "maintenance";
}

function getTerritoryImportCaps(overrides?: Partial<TerritoryImportCaps>, runMode: CourseImportRunMode = "maintenance"): TerritoryImportCaps {
  const seed = runMode === "seeding";
  const s = COURSE_IMPORT_SEEDING_PRESET_CAPS;
  const legacyTotal = overrides?.maxTotalAttempts;
  const maxNewCourseImportAttempts =
    overrides?.maxNewCourseImportAttempts ??
    (legacyTotal != null
      ? legacyTotal
      : seed
        ? parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_COURSE_IMPORT_ATTEMPTS", s.maxNewCourseImportAttempts)
        : parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_COURSE_IMPORT_ATTEMPTS", 42));
  const maxStaleCandidateRefreshAttempts =
    overrides?.maxStaleCandidateRefreshAttempts ??
    (seed
      ? parsePositiveIntEnv("COURSE_IMPORT_MAX_STALE_CANDIDATE_REFRESH", s.maxStaleCandidateRefreshAttempts)
      : parsePositiveIntEnv("COURSE_IMPORT_MAX_STALE_CANDIDATE_REFRESH", 8));
  const maxStaleCatalogSweepCourses =
    overrides?.maxStaleCatalogSweepCourses ??
    (seed
      ? parsePositiveIntEnv("COURSE_IMPORT_STALE_SWEEP_MAX_COURSES", s.maxStaleCatalogSweepCourses)
      : parsePositiveIntEnv("COURSE_IMPORT_STALE_SWEEP_MAX_COURSES", 12));
  return {
    maxPriorityCourses:
      overrides?.maxPriorityCourses ??
      (seed ? parsePositiveIntEnv("COURSE_IMPORT_MAX_PRIORITY", s.maxPriorityCourses) : parsePositiveIntEnv("COURSE_IMPORT_MAX_PRIORITY", 12)),
    maxNewSeeds:
      overrides?.maxNewSeeds ?? (seed ? parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_SEEDS", s.maxNewSeeds) : parsePositiveIntEnv("COURSE_IMPORT_MAX_NEW_SEEDS", 20)),
    maxRetries:
      overrides?.maxRetries ?? (seed ? parsePositiveIntEnv("COURSE_IMPORT_MAX_RETRIES", s.maxRetries) : parsePositiveIntEnv("COURSE_IMPORT_MAX_RETRIES", 12)),
    maxRefreshes:
      overrides?.maxRefreshes ?? (seed ? parsePositiveIntEnv("COURSE_IMPORT_MAX_REFRESHES", s.maxRefreshes) : parsePositiveIntEnv("COURSE_IMPORT_MAX_REFRESHES", 25)),
    maxPriorityMaintenanceCourses:
      overrides?.maxPriorityMaintenanceCourses ??
      (seed
        ? parsePositiveIntEnv("COURSE_IMPORT_MAX_PRIORITY_MAINTENANCE", s.maxPriorityMaintenanceCourses)
        : parsePositiveIntEnv("COURSE_IMPORT_MAX_PRIORITY_MAINTENANCE", 3)),
    maxDiscoveryPerRun:
      overrides?.maxDiscoveryPerRun ??
      (seed ? parsePositiveIntEnv("COURSE_IMPORT_MAX_DISCOVERY", s.maxDiscoveryPerRun) : parsePositiveIntEnv("COURSE_IMPORT_MAX_DISCOVERY", 120)),
    maxNewCourseImportAttempts,
    maxStaleCandidateRefreshAttempts,
    maxStaleCatalogSweepCourses,
    ...(legacyTotal != null ? { maxTotalAttempts: legacyTotal } : {}),
  };
}

type CandidatePickLimits = {
  maxTotalAttempts: number;
  maxPriorityCourses: number;
  maxNewSeeds: number;
  maxRetries: number;
  maxRefreshes: number;
};

async function countQueuedCandidatesForPhase(
  supabase: SupabaseClient,
  phase: TerritorySeedPhase,
  territory: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("course_import_candidates")
    .select("id", { count: "exact", head: true })
    .eq("seed_phase", phase)
    .eq("territory", territory)
    .eq("status", "queued");
  if (error) throw new Error(error.message || "Failed to count queued candidates.");
  return count ?? 0;
}

const CANDIDATE_STATUSES_FOR_QUEUE_SNAPSHOT: TerritoryCandidateStatus[] = [
  "queued",
  "resolved",
  "imported",
  "rejected",
  "failed",
  "skipped",
];

async function fetchQueueCompositionBySeedPhase(
  supabase: SupabaseClient,
  territory: string,
): Promise<Record<TerritorySeedPhase, QueueCompositionPhaseSnapshot>> {
  const counts = await Promise.all(
    PHASE_ORDER.flatMap((phase) =>
      CANDIDATE_STATUSES_FOR_QUEUE_SNAPSHOT.map(async (status) => {
        const { count, error } = await supabase
          .from("course_import_candidates")
          .select("id", { count: "exact", head: true })
          .eq("territory", territory)
          .eq("seed_phase", phase)
          .eq("status", status);
        if (error) throw new Error(error.message || "Failed to count candidates by phase/status.");
        return { phase, status, count: count ?? 0 };
      }),
    ),
  );
  const init = (): Record<TerritorySeedPhase, QueueCompositionPhaseSnapshot> => ({
    england_wales: { byStatus: { queued: 0, resolved: 0, imported: 0, rejected: 0, failed: 0, skipped: 0 }, totalRows: 0 },
    scotland: { byStatus: { queued: 0, resolved: 0, imported: 0, rejected: 0, failed: 0, skipped: 0 }, totalRows: 0 },
    ireland: { byStatus: { queued: 0, resolved: 0, imported: 0, rejected: 0, failed: 0, skipped: 0 }, totalRows: 0 },
  });
  const out = init();
  for (const row of counts) {
    out[row.phase].byStatus[row.status] = row.count;
    out[row.phase].totalRows += row.count;
  }
  return out;
}

function computeRefreshDueIso(now: Date): string {
  const days = parsePositiveIntEnv("COURSE_IMPORT_REFRESH_DAYS", 30);
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString();
}

function computeRetryDueIso(now: Date, retryCount: number): string {
  const hours = parsePositiveIntEnv("COURSE_IMPORT_RETRY_BASE_HOURS", 6);
  const factor = Math.max(1, retryCount);
  const due = new Date(now.getTime() + hours * factor * 60 * 60 * 1000);
  return due.toISOString();
}

/**
 * Picks the seed phase for this batch. Precedence: CLI `phaseOverride` → `COURSE_IMPORT_ACTIVE_PHASE`
 * → first phase with `queued`/`failed` backlog (UK territory) → first phase with **zero** candidate rows
 *   (territory bootstrap: run discovery for Scotland/Ireland after EW is populated) → `england_wales`.
 */
async function resolveActivePhase(
  supabase: SupabaseClient,
  phaseOverride?: TerritorySeedPhase,
): Promise<TerritorySeedPhase> {
  if (phaseOverride) return phaseOverride;
  const envPhase = process.env.COURSE_IMPORT_ACTIVE_PHASE;
  if (envPhase === "england_wales" || envPhase === "scotland" || envPhase === "ireland") return envPhase;

  for (const phase of PHASE_ORDER) {
    const { count, error } = await supabase
      .from("course_import_candidates")
      .select("id", { count: "exact", head: true })
      .eq("territory", DEFAULT_TERRITORY)
      .eq("seed_phase", phase)
      .in("status", ["queued", "failed"]);
    if (!error && (count ?? 0) > 0) return phase;
  }
  for (const phase of PHASE_ORDER) {
    const { count, error } = await supabase
      .from("course_import_candidates")
      .select("id", { count: "exact", head: true })
      .eq("territory", DEFAULT_TERRITORY)
      .eq("seed_phase", phase);
    if (!error && (count ?? 0) === 0) return phase;
  }
  return "england_wales";
}

function asCandidateRow(row: Record<string, unknown>): TerritoryCandidateRow {
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ""),
    normalized_name: String(row.normalized_name ?? ""),
    country: row.country != null ? String(row.country) : null,
    territory: String(row.territory ?? DEFAULT_TERRITORY),
    seed_phase: (row.seed_phase as TerritorySeedPhase) ?? "england_wales",
    discovery_source: String(row.discovery_source ?? "unknown"),
    status: (row.status as TerritoryCandidateStatus) ?? "queued",
    canonical_api_id: row.canonical_api_id != null ? Number(row.canonical_api_id) : null,
    import_priority: Number.isFinite(Number(row.import_priority)) ? Number(row.import_priority) : 0,
    refresh_due_at: row.refresh_due_at != null ? String(row.refresh_due_at) : null,
    last_synced_at: row.last_synced_at != null ? String(row.last_synced_at) : null,
    sync_status: String(row.sync_status ?? "queued"),
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    retry_count: Number.isFinite(Number(row.retry_count)) ? Number(row.retry_count) : 0,
    next_retry_at: row.next_retry_at != null ? String(row.next_retry_at) : null,
    first_discovered_at: row.first_discovered_at != null ? String(row.first_discovered_at) : null,
    last_discovered_at: row.last_discovered_at != null ? String(row.last_discovered_at) : null,
    last_error: row.last_error != null ? String(row.last_error) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

async function upsertCandidate(
  supabase: SupabaseClient,
  params: {
    name: string;
    country: string | null;
    territory: string;
    phase: TerritorySeedPhase;
    discoverySource: string;
    priority: number;
    canonicalApiId?: number | null;
    status?: TerritoryCandidateStatus;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const normalizedName = normalizeCandidateName(params.name);
  const pinnedApiId =
    params.canonicalApiId != null && Number.isFinite(Number(params.canonicalApiId)) && Number(params.canonicalApiId) > 0
      ? Math.round(Number(params.canonicalApiId))
      : null;

  if (pinnedApiId != null) {
    const byApi = await selectCandidateByCanonicalApi(supabase, params.territory, pinnedApiId);
    if (byApi) {
      await mergeDiscoveryIntoCandidate(supabase, byApi, params, { nowIso, canonicalApiId: pinnedApiId });
      return;
    }
  }

  if (pinnedApiId == null) {
    const byName = await selectCandidateByNormalizedName(supabase, params.territory, normalizedName);
    if (byName) {
      const { error: upErr } = await supabase
        .from("course_import_candidates")
        .update({
          country: params.country,
          seed_phase: params.phase,
          discovery_source: params.discoverySource,
          status: params.status ?? "queued",
          import_priority: Math.max(byName.import_priority, params.priority),
          last_discovered_at: nowIso,
          metadata: { ...byName.metadata, ...(params.metadata ?? {}) },
        })
        .eq("id", byName.id);
      if (upErr) throw new Error(upErr.message || "Failed to update candidate by normalized name.");
      return;
    }
  }

  const payload = {
    candidate_name: params.name,
    normalized_name: normalizedName,
    country: params.country,
    territory: params.territory,
    seed_phase: params.phase,
    discovery_source: params.discoverySource,
    import_priority: params.priority,
    canonical_api_id: pinnedApiId ?? null,
    status: params.status ?? "queued",
    sync_status: "queued" as const,
    first_discovered_at: nowIso,
    last_discovered_at: nowIso,
    metadata: params.metadata ?? {},
  };

  const { error } = await supabase
    .from("course_import_candidates")
    .upsert(payload, { onConflict: "territory,normalized_name" });
  if (!error) return;

  if (isPostgresUniqueViolation(error) && pinnedApiId != null) {
    const recovered = await selectCandidateByCanonicalApi(supabase, params.territory, pinnedApiId);
    if (recovered) {
      await mergeDiscoveryIntoCandidate(supabase, recovered, params, { nowIso, canonicalApiId: pinnedApiId });
      return;
    }
    const fallback = { ...payload, canonical_api_id: null };
    const { error: retryErr } = await supabase
      .from("course_import_candidates")
      .upsert(fallback, { onConflict: "territory,normalized_name" });
    if (!retryErr) return;
    throw new Error(retryErr.message || "Failed to upsert candidate after duplicate canonical fallback.");
  }
  throw new Error((error as { message?: string }).message || "Failed to upsert candidate");
}

async function discoverCandidatesBounded(
  supabase: SupabaseClient,
  phase: TerritorySeedPhase,
  territory: string,
  caps: TerritoryImportCaps,
  includeSocietySeeds: boolean,
  priorityEntries: PriorityCourseEntry[],
): Promise<number> {
  let discovered = 0;
  const dataset = await loadTerritoryDiscoveryDataset(phase);
  for (const item of dataset.slice(0, caps.maxDiscoveryPerRun)) {
    await upsertCandidate(supabase, {
      name: item.name,
      country: item.country,
      territory,
      phase,
      discoverySource: item.source,
      priority: item.priority,
      status: "queued",
    });
    discovered += 1;
  }

  for (const pinned of priorityEntries) {
    await upsertCandidate(supabase, {
      name: pinned.name,
      country: null,
      territory,
      phase,
      discoverySource: "pinned_seed",
      priority: 1200,
      metadata: {
        sourceType: "club_official",
        sourceUrl: pinned.officialUrls?.[0] ?? null,
        isPriorityCourse: true,
      },
    });
    discovered += 1;
  }

  if (includeSocietySeeds) {
    const societySeeds = await discoverSocietyCourseSeeds(supabase);
    for (const seed of societySeeds.slice(0, caps.maxDiscoveryPerRun)) {
      await upsertCandidate(supabase, {
        name: seed.name,
        country: null,
        territory,
        phase,
        discoverySource: "society_seed",
        priority: 850,
        canonicalApiId: seed.preferredApiId ?? null,
        metadata: {
          sourceType: seed.sourceType ?? "golfcourseapi",
          sourceUrl: seed.sourceUrl ?? null,
        },
      });
      discovered += 1;
    }
  }
  return discovered;
}

async function listCandidateBucket(
  supabase: SupabaseClient,
  params: {
    phase: TerritorySeedPhase;
    territory: string;
    statuses?: TerritoryCandidateStatus[];
    minPriority?: number;
    retryDueOnly?: boolean;
    refreshDueOnly?: boolean;
    limit: number;
  },
): Promise<TerritoryCandidateRow[]> {
  let q = supabase
    .from("course_import_candidates")
    .select("*")
    .eq("seed_phase", params.phase)
    .eq("territory", params.territory)
    .order("import_priority", { ascending: false })
    .order("last_discovered_at", { ascending: false })
    .limit(Math.max(1, params.limit));

  if (params.statuses && params.statuses.length > 0) q = q.in("status", params.statuses);
  if (params.minPriority != null) q = q.gte("import_priority", params.minPriority);
  if (params.retryDueOnly) q = q.lte("next_retry_at", new Date().toISOString());
  if (params.refreshDueOnly) q = q.lte("refresh_due_at", new Date().toISOString());

  const { data, error } = await q;
  if (error) throw new Error(error.message || "Failed to list candidate bucket");
  return ((data ?? []) as Record<string, unknown>[]).map(asCandidateRow);
}

function pickCandidates(
  limits: CandidatePickLimits,
  priorityCandidates: TerritoryCandidateRow[],
  retryCandidates: TerritoryCandidateRow[],
  newCandidates: TerritoryCandidateRow[],
  refreshCandidates: TerritoryCandidateRow[],
): TerritoryCandidateRow[] {
  if (limits.maxTotalAttempts <= 0) return [];
  const seen = new Set<string>();
  const picked: TerritoryCandidateRow[] = [];
  const addMany = (rows: TerritoryCandidateRow[], cap: number): void => {
    for (const row of rows) {
      if (picked.length >= limits.maxTotalAttempts) return;
      if (cap <= 0) return;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      picked.push(row);
      cap -= 1;
      if (cap <= 0) return;
    }
  };
  addMany(priorityCandidates, limits.maxPriorityCourses);
  addMany(retryCandidates, limits.maxRetries);
  addMany(newCandidates, limits.maxNewSeeds);
  addMany(refreshCandidates, limits.maxRefreshes);
  return picked.slice(0, limits.maxTotalAttempts);
}

export function planTerritoryCandidateOrder(
  caps: TerritoryImportCaps,
  buckets: {
    priority: Array<{ id: string }>;
    retries: Array<{ id: string }>;
    fresh: Array<{ id: string }>;
    refresh: Array<{ id: string }>;
  },
): string[] {
  const asRow = (items: Array<{ id: string }>): TerritoryCandidateRow[] =>
    items.map((item) => ({
      id: item.id,
      candidate_name: item.id,
      normalized_name: item.id,
      country: null,
      territory: DEFAULT_TERRITORY,
      seed_phase: "england_wales",
      discovery_source: "test",
      status: "queued",
      canonical_api_id: null,
      import_priority: 0,
      refresh_due_at: null,
      last_synced_at: null,
      sync_status: "queued",
      confidence_score: null,
      retry_count: 0,
      next_retry_at: null,
      first_discovered_at: null,
      last_discovered_at: null,
      last_error: null,
      metadata: {},
    }));
  const combinedCeiling = caps.maxNewCourseImportAttempts + caps.maxStaleCandidateRefreshAttempts;
  const limits: CandidatePickLimits = {
    maxTotalAttempts: combinedCeiling,
    maxPriorityCourses: caps.maxPriorityCourses,
    maxNewSeeds: caps.maxNewSeeds,
    maxRetries: caps.maxRetries,
    maxRefreshes: caps.maxStaleCandidateRefreshAttempts,
  };
  return pickCandidates(limits, asRow(buckets.priority), asRow(buckets.retries), asRow(buckets.fresh), asRow(buckets.refresh)).map(
    (row) => row.id,
  );
}

async function insertBatchRun(
  supabase: SupabaseClient,
  payload: {
    phase: TerritorySeedPhase;
    territory: string;
    mode: TerritoryImportMode;
    caps: TerritoryImportCaps;
    triggerType: "manual" | "nightly" | "territory_nightly";
    catalogFreshness?: CourseCatalogFreshnessReport;
    importRunMode?: CourseImportRunMode;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("course_import_batches")
    .insert({
      status: "running",
      mode: "territory_nightly",
      territory: payload.territory,
      seed_phase: payload.phase,
      trigger_type: payload.triggerType,
      max_priority: payload.caps.maxPriorityCourses,
      max_new_seeds: payload.caps.maxNewSeeds,
      max_retries: payload.caps.maxRetries,
      max_refreshes: payload.caps.maxRefreshes,
      summary_json: {
        mode: payload.mode,
        importRunMode: payload.importRunMode ?? "maintenance",
        ...(payload.catalogFreshness ? { catalogFreshness: payload.catalogFreshness } : {}),
      },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create batch run");
  return String((data as { id: string }).id);
}

async function clearCanonicalApiIdFromOtherCandidates(
  supabase: SupabaseClient,
  territory: string,
  apiId: number,
  keepCandidateId: string,
): Promise<void> {
  if (!Number.isFinite(apiId) || apiId <= 0) return;
  const { error } = await supabase
    .from("course_import_candidates")
    .update({ canonical_api_id: null })
    .eq("territory", territory)
    .eq("canonical_api_id", apiId)
    .neq("id", keepCandidateId);
  if (error) throw new Error(error.message || "Failed to clear duplicate canonical_api_id on peer candidates.");
}

async function updateCandidateAfterAttempt(
  supabase: SupabaseClient,
  candidate: TerritoryCandidateRow,
  payload: {
    status: TerritoryCandidateStatus;
    syncStatus: ImportSyncStatus | "failed" | "queued";
    apiId?: number | null;
    courseId?: string | null;
    confidence?: number | null;
    error?: string | null;
    refreshDueAt?: string | null;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const retryCount = payload.status === "failed" ? candidate.retry_count + 1 : 0;
  const nextApiId = payload.apiId ?? candidate.canonical_api_id;
  if (nextApiId != null && Number.isFinite(Number(nextApiId)) && Number(nextApiId) > 0) {
    await clearCanonicalApiIdFromOtherCandidates(
      supabase,
      candidate.territory,
      Math.round(Number(nextApiId)),
      candidate.id,
    );
  }
  const { error } = await supabase
    .from("course_import_candidates")
    .update({
      status: payload.status,
      sync_status: payload.syncStatus,
      canonical_api_id: payload.apiId ?? candidate.canonical_api_id,
      canonical_course_id: payload.courseId ?? null,
      confidence_score: payload.confidence ?? null,
      last_synced_at: payload.status === "imported" ? nowIso : candidate.last_synced_at,
      refresh_due_at: payload.status === "imported" ? payload.refreshDueAt ?? null : candidate.refresh_due_at,
      retry_count: retryCount,
      next_retry_at: payload.status === "failed" ? computeRetryDueIso(new Date(), retryCount) : null,
      last_error: payload.error ?? null,
      last_discovered_at: nowIso,
    })
    .eq("id", candidate.id);
  if (error) throw new Error(error.message || "Failed to update candidate");
}

type CourseDetailBindings = {
  candidate: TerritoryCandidateRow | null;
  displayCourseName: string;
  discoverySource: string;
  importPriority: number;
  firstDiscoveredAt: string | null;
  lastDiscoveredAt: string | null;
};

function toHoleSourceRows(holes: Array<{ holeNumber: number; par: number | null; strokeIndex: number | null; yardage: number | null }>): HoleSourceRow[] {
  return holes
    .map((h) => ({
      hole_number: h.holeNumber,
      par: h.par,
      stroke_index: h.strokeIndex,
      yardage: h.yardage,
    }))
    .sort((a, b) => a.hole_number - b.hole_number);
}

function toTeeSourceRows(normalized: NormalizedCourseImport): TeeSourceRows[] {
  return normalized.tees.map((b) => ({ teeName: b.tee.teeName, holes: toHoleSourceRows(b.holes) }));
}

function teeColorKey(name: string): string | null {
  const key = normalizeCandidateName(name);
  if (/\bwhite\b/.test(key)) return "white";
  if (/\byellow\b/.test(key)) return "yellow";
  if (/\bred\b/.test(key)) return "red";
  if (/\bblue\b/.test(key)) return "blue";
  if (/\bblack\b/.test(key)) return "black";
  if (/\bgold\b/.test(key)) return "gold";
  return null;
}

function previewTeeComparison(secondary: TeeSourceRows, primary: TeeSourceRows): {
  holesCompared: number;
  parMismatches: number;
  strokeIndexMismatches: number;
  yardageOutsideTolerance: number;
  yardageWithinToleranceVariance: number;
} {
  const primaryByHole = new Map(primary.holes.map((h) => [h.hole_number, h]));
  let holesCompared = 0;
  let parMismatches = 0;
  let strokeIndexMismatches = 0;
  let yardageOutsideTolerance = 0;
  let yardageWithinToleranceVariance = 0;
  for (const hole of secondary.holes) {
    const pHole = primaryByHole.get(hole.hole_number);
    if (!pHole) continue;
    holesCompared += 1;
    if (hole.par == null || pHole.par == null || hole.par !== pHole.par) parMismatches += 1;
    if (hole.stroke_index != null && pHole.stroke_index != null && hole.stroke_index !== pHole.stroke_index) {
      strokeIndexMismatches += 1;
    }
    if (hole.yardage != null && pHole.yardage != null && pHole.yardage > 0) {
      const deltaPct = Math.abs(hole.yardage - pHole.yardage) / pHole.yardage;
      if (deltaPct > 0.05) yardageOutsideTolerance += 1;
      else if (deltaPct > 0) yardageWithinToleranceVariance += 1;
    }
  }
  return {
    holesCompared,
    parMismatches,
    strokeIndexMismatches,
    yardageOutsideTolerance,
    yardageWithinToleranceVariance,
  };
}

function alignPrimaryTeeForSecondary(params: {
  secondaryTee: TeeSourceRows;
  primaryByTee: Map<string, TeeSourceRows>;
  unmatchedPrimaryKeys: Set<string>;
}): TeeSourceRows | null {
  const secondaryKey = normalizeCandidateName(params.secondaryTee.teeName);
  const byName = params.primaryByTee.get(secondaryKey);
  if (byName) {
    params.unmatchedPrimaryKeys.delete(normalizeCandidateName(byName.teeName));
    return byName;
  }
  const secondaryColor = teeColorKey(params.secondaryTee.teeName);
  if (secondaryColor) {
    for (const key of params.unmatchedPrimaryKeys) {
      const row = params.primaryByTee.get(key);
      if (!row) continue;
      if (teeColorKey(row.teeName) === secondaryColor) {
        params.unmatchedPrimaryKeys.delete(key);
        return row;
      }
    }
  }
  let bestKey: string | null = null;
  let bestScore = -Infinity;
  for (const key of params.unmatchedPrimaryKeys) {
    const row = params.primaryByTee.get(key);
    if (!row) continue;
    const preview = previewTeeComparison(params.secondaryTee, row);
    if (preview.holesCompared < 9) continue;
    const criticalMismatches =
      preview.parMismatches + preview.strokeIndexMismatches + preview.yardageOutsideTolerance;
    const maxCriticalAllowed = Math.max(1, Math.floor(preview.holesCompared * 0.1));
    if (criticalMismatches > maxCriticalAllowed) continue;
    const colorBonus = secondaryColor != null && teeColorKey(row.teeName) === secondaryColor ? 8 : 0;
    const nameTokenBonus =
      secondaryKey.split(" ").some((token) => token.length > 2 && normalizeCandidateName(row.teeName).includes(token)) ? 3 : 0;
    const score =
      preview.holesCompared * 2 +
      colorBonus +
      nameTokenBonus -
      criticalMismatches * 6 -
      preview.yardageWithinToleranceVariance * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  params.unmatchedPrimaryKeys.delete(bestKey);
  return params.primaryByTee.get(bestKey) ?? null;
}

function buildOfficialScorecardRowsOrNull(apiId: number, normalized: NormalizedCourseImport): TeeSourceRows[] | null {
  const out: TeeSourceRows[] = [];
  let anyApplied = false;
  for (const b of normalized.tees) {
    const patched = applyOfficialScorecardFallback({
      apiId,
      teeName: b.tee.teeName,
      holes: b.holes,
    });
    if (patched.applied) anyApplied = true;
    out.push({ teeName: b.tee.teeName, holes: toHoleSourceRows(patched.holes) });
  }
  return anyApplied ? out : null;
}

function validateMultiSourceCourseData(params: {
  apiId: number;
  normalized: NormalizedCourseImport;
  primaryRowsOverride?: TeeSourceRows[] | null;
  primarySourceId?: MultiSourceSourceId | "unavailable";
  secondarySourceId?: MultiSourceSourceId;
}): MultiSourceValidationResult {
  const secondary = toTeeSourceRows(params.normalized);
  const primary =
    params.primaryRowsOverride !== undefined ? params.primaryRowsOverride : buildOfficialScorecardRowsOrNull(params.apiId, params.normalized);
  const primarySourceId = params.primarySourceId ?? (primary != null ? "official_scorecard" : "unavailable");
  const secondarySourceId = params.secondarySourceId ?? "golf_api";
  const primaryByTee = new Map((primary ?? []).map((t) => [normalizeCandidateName(t.teeName), t]));
  const unmatchedPrimaryKeys = new Set<string>([...primaryByTee.keys()]);
  let teesCompared = 0;
  let holesCompared = 0;
  let parMismatches = 0;
  let strokeIndexMismatches = 0;
  let missingStrokeIndex = 0;
  let yardageOutsideTolerance = 0;
  let yardageWithinToleranceVariance = 0;

  for (const tee of secondary) {
    const p = alignPrimaryTeeForSecondary({
      secondaryTee: tee,
      primaryByTee,
      unmatchedPrimaryKeys,
    });
    if (!p) continue;
    teesCompared += 1;
    const pByHole = new Map(p.holes.map((h) => [h.hole_number, h]));
    for (const h of tee.holes) {
      const ph = pByHole.get(h.hole_number);
      if (!ph) continue;
      holesCompared += 1;
      if (h.par == null || ph.par == null || h.par !== ph.par) parMismatches += 1;
      if (h.stroke_index == null || ph.stroke_index == null) {
        missingStrokeIndex += 1;
      } else if (h.stroke_index !== ph.stroke_index) {
        strokeIndexMismatches += 1;
      }
      if (h.yardage != null && ph.yardage != null && ph.yardage > 0) {
        const deltaPct = Math.abs(h.yardage - ph.yardage) / ph.yardage;
        if (deltaPct > 0.05) yardageOutsideTolerance += 1;
        else if (deltaPct > 0) yardageWithinToleranceVariance += 1;
      }
    }
  }

  const reasons: string[] = [];
  let confidence: CourseDataConfidence = "high";
  if (missingStrokeIndex > 0) reasons.push(`missing_stroke_index:${missingStrokeIndex}`);
  if (parMismatches > 0) reasons.push(`par_mismatch:${parMismatches}`);
  if (strokeIndexMismatches > 0) reasons.push(`stroke_index_mismatch:${strokeIndexMismatches}`);
  if (yardageOutsideTolerance > 0) reasons.push(`yardage_outside_tolerance:${yardageOutsideTolerance}`);
  if (yardageWithinToleranceVariance > 0) reasons.push(`yardage_variance_within_tolerance:${yardageWithinToleranceVariance}`);
  if (primary == null) reasons.push("official_source_unavailable");

  if (missingStrokeIndex > 0 || parMismatches > 0 || strokeIndexMismatches > 0 || yardageOutsideTolerance > 0) {
    confidence = "low";
  } else if (yardageWithinToleranceVariance > 0 || primary == null) {
    confidence = "medium";
  }

  return {
    confidence,
    reasons,
    comparison: {
      sourceCount: primary != null ? 2 : 1,
      officialSourceUsed: primary != null,
      primarySource: primarySourceId,
      secondarySource: secondarySourceId,
      teesCompared,
      holesCompared,
      parMismatches,
      strokeIndexMismatches,
      missingStrokeIndex,
      yardageOutsideTolerance,
      yardageWithinToleranceVariance,
    },
  };
}

export function evaluateCourseCompleteness(normalized: NormalizedCourseImport): GolferDataCompleteness {
  let completeTeeCount = 0;
  let missingSI = 0;
  let missingYardage = 0;
  let promotedTeeMissingSI = 0;
  for (const tee of normalized.tees) {
    const holes = tee.holes;
    const has18 = holes.length === 18;
    const teeMissingSi = holes.filter((h) => h.strokeIndex == null).length;
    const teeMissingYardage = holes.filter((h) => h.yardage == null).length;
    const teeMissingPar = holes.filter((h) => h.par == null).length;
    missingSI += teeMissingSi;
    missingYardage += teeMissingYardage;
    if (has18 && teeMissingSi === 0 && teeMissingYardage === 0 && teeMissingPar === 0) {
      completeTeeCount += 1;
    }
    if (promotedTeeMissingSI === 0 && has18) {
      promotedTeeMissingSI = teeMissingSi;
    }
  }
  return { completeTeeCount, missingSI, missingYardage, promotedTeeMissingSI };
}

export function evaluateGolferDataPromotionDecision(params: {
  sourceValidation: MultiSourceValidationResult;
  completeness: GolferDataCompleteness;
}): GolferDataPromotionDecision {
  const sv = params.sourceValidation;
  const c = params.completeness;
  const reasons = [...sv.reasons];
  if (!sv.comparison.officialSourceUsed) reasons.push("official_source_unavailable");
  if (c.completeTeeCount === 0) reasons.push("no_complete_tee");
  if (c.missingSI > 0) reasons.push("missing_stroke_index");
  if (c.missingYardage > 0) reasons.push("missing_yardage");
  if (sv.comparison.sourceCount < 2 && !sv.comparison.officialSourceUsed) reasons.push("insufficient_source_validation");
  if (sv.comparison.parMismatches > 0 || sv.comparison.strokeIndexMismatches > 0 || sv.comparison.yardageOutsideTolerance > 0) {
    reasons.push("contradictory_sources");
  }

  let confidence: CourseDataConfidence = sv.confidence;
  if (
    sv.comparison.holesCompared === 0 ||
    c.completeTeeCount === 0 ||
    (sv.comparison.sourceCount < 2 && !sv.comparison.officialSourceUsed)
  ) {
    confidence = "low";
  }

  const contradictory = reasons.includes("contradictory_sources");
  const hasCompleteTee = c.completeTeeCount > 0;
  const verified =
    hasCompleteTee &&
    c.promotedTeeMissingSI === 0 &&
    sv.comparison.holesCompared > 0 &&
    (sv.comparison.officialSourceUsed || sv.comparison.sourceCount >= 2) &&
    !contradictory &&
    confidence !== "low";

  let status: CourseGolferDataStatus;
  let promotionDecision: GolferDataPromotionDecision["promotionDecision"];
  if (verified) {
    status = "verified";
    promotionDecision = "insert";
  } else if (contradictory) {
    status = "rejected";
    promotionDecision = "reject";
  } else if (sv.comparison.holesCompared === 0) {
    status = "unverified";
    promotionDecision = "stage_unverified";
  } else if (hasCompleteTee) {
    status = "unverified";
    promotionDecision = "stage_unverified";
  } else {
    status = "partial";
    promotionDecision = "stage_partial";
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    status,
    promotionDecision,
    confidence,
    reasons: uniqueReasons,
    metrics: {
      sourceCount: sv.comparison.sourceCount,
      officialSourceUsed: sv.comparison.officialSourceUsed,
      validatedHoleCount: sv.comparison.holesCompared,
      completeTeeCount: c.completeTeeCount,
      missingSI: c.missingSI,
      missingYardage: c.missingYardage,
      parMismatchCount: sv.comparison.parMismatches,
      yardageMismatchCount: sv.comparison.yardageOutsideTolerance,
      siMismatchCount: sv.comparison.strokeIndexMismatches,
      promotionDecision,
    },
  };
}

async function insertLowConfidenceStagingRow(
  supabase: SupabaseClient,
  params: {
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    apiId: number;
    candidate: TerritoryCandidateRow | null;
    courseName: string;
    validation: MultiSourceValidationResult;
    golferDecision: GolferDataPromotionDecision;
    rawPayload: unknown;
  },
): Promise<void> {
  const payload = {
    batch_run_id: params.batchRunId,
    phase: params.phase,
    territory: params.territory,
    api_id: params.apiId,
    candidate_id: params.candidate?.id ?? null,
    candidate_name: params.candidate?.candidate_name ?? params.courseName,
    course_name: params.courseName,
    confidence: params.golferDecision.confidence,
    failure_reason: params.golferDecision.reasons.join("; "),
    comparison_json: params.validation.comparison,
    raw_json:
      params.rawPayload && typeof params.rawPayload === "object"
        ? (params.rawPayload as Record<string, unknown>)
        : { raw_payload: params.rawPayload ?? null },
    status: params.golferDecision.status,
  };
  const { error } = await supabase.from("course_import_staging").insert(payload);
  if (error) throw new Error(error.message || "Failed to insert low-confidence row into course_import_staging.");
}

/**
 * Fetches from GolfCourseAPI and persists tees + holes (full detail refresh via `upsertNormalizedImport`).
 */
async function runCourseDetailImportFromApi(
  supabase: SupabaseClient,
  params: {
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
    apiId: number;
    jobId: string | null;
    bindings: CourseDetailBindings;
    catalogStaleSweep?: boolean;
    priorityEntries: PriorityCourseEntry[];
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const b = params.bindings;
  const seedName = b.displayCourseName;
  const isPriorityCourse = isPriorityCourseName(seedName, params.priorityEntries);

  try {
    const fetched = await fetchCourseByApiId(params.apiId);
    const normalized = normalizeGolfCourseApiCourse(fetched.course);
    const validationIssues = validateNormalizedImport(normalized);
    const status: "ok" | "partial" = validationIssues.length === 0 ? "ok" : "partial";
    const importedAtIso = new Date().toISOString();
    const confidenceScore = toConfidence(validationIssues);
    const missingSiCount = validationIssues.filter(
      (issue) => issue.code === "SI_OUT_OF_RANGE" || issue.code === "SI_DUPLICATE",
    ).length;
    const priorityOfficial = await resolvePriorityOfficialSource({
      courseName: seedName,
      apiCourseIdentityName: normalized.course.courseName,
      entries: params.priorityEntries,
      secondaryRowsForScoring: toTeeSourceRows(normalized),
    });
    let identitySanity: IdentitySanityResult | null = null;
    if (isPriorityCourse) {
      identitySanity = evaluateIdentitySanity({
        courseName: seedName,
        entries: params.priorityEntries,
        apiCourseIdentityName: normalized.course.courseName,
        apiCountry: normalized.course.country,
        apiRegion: normalized.course.city,
      });
      if (!identitySanity.ok) {
        console.log(
          `[course-import] Identity sanity FAILED for priority course ${seedName}: apiIdentity="${normalized.course.courseName}" country="${normalized.course.country ?? ""}" reason=${identitySanity.reason} matched=[${identitySanity.matchedTerms.join(",")}] missing=[${identitySanity.missingTerms.join(",")}] excludedHit=${identitySanity.excludedTermHit ?? "none"}`,
        );
      }
    }
    const identitySanityFailed = !!(identitySanity && !identitySanity.ok);
    const sourceValidation = validateMultiSourceCourseData({
      apiId: params.apiId,
      normalized,
      primaryRowsOverride: isPriorityCourse && !identitySanityFailed ? priorityOfficial.primaryRows : undefined,
    });
    const completeness = evaluateCourseCompleteness(normalized);
    let golferDecision = evaluateGolferDataPromotionDecision({ sourceValidation, completeness });
    if (identitySanityFailed) {
      golferDecision = {
        ...golferDecision,
        status: "unverified",
        promotionDecision: "stage_unverified",
        confidence: "low",
        reasons: [...new Set([...golferDecision.reasons, "api_identity_mismatch"])],
        metrics: {
          ...golferDecision.metrics,
          promotionDecision: "stage_unverified",
        },
      };
    }
    if (isPriorityCourse && !sourceValidation.comparison.officialSourceUsed) {
      golferDecision = {
        ...golferDecision,
        status: "unverified",
        promotionDecision: "stage_unverified",
        reasons: [...new Set([...golferDecision.reasons, "priority_requires_official_source"])],
        confidence: "low",
        metrics: {
          ...golferDecision.metrics,
          promotionDecision: "stage_unverified",
        },
      };
    }
    if (
      isPriorityCourse &&
      priorityOfficial.subCourseMappingRequired &&
      golferDecision.reasons.includes("contradictory_sources")
    ) {
      golferDecision = {
        ...golferDecision,
        status: "unverified",
        promotionDecision: "stage_unverified",
        confidence: "low",
        reasons: [...new Set([...golferDecision.reasons, "sub_course_mapping_required"])],
        metrics: {
          ...golferDecision.metrics,
          promotionDecision: "stage_unverified",
        },
      };
    }
    const validationBasis = deriveValidationBasis({
      officialSourceUsed: golferDecision.metrics.officialSourceUsed,
      sourceCount: golferDecision.metrics.sourceCount,
    });
    const promotedSourceType: ImportSourceType =
      priorityOfficial.sourceType !== "unavailable"
        ? (priorityOfficial.sourceType as ImportSourceType)
        : "golfcourseapi";
    const promotedSourceUrl = priorityOfficial.sourceUrl;
    const priorityPromotionAudit = {
      isPriority: isPriorityCourse,
      apiCourseIdentityName: normalized.course.courseName,
      officialSourceFound: priorityOfficial.officialSourceFound,
      parseSuccess: priorityOfficial.parseSuccess,
      subCourseMappingRequired: priorityOfficial.subCourseMappingRequired,
      selectedOfficialCandidateUrl: priorityOfficial.sourceUrl,
      selectedOfficialSubCourseName: priorityOfficial.selectedSubCourseName,
      completeTeeCount: golferDecision.metrics.completeTeeCount,
      missingSI: golferDecision.metrics.missingSI,
      missingYardage: golferDecision.metrics.missingYardage,
      finalStatus: golferDecision.status,
      unverifiedClassification:
        golferDecision.promotionDecision === "insert"
          ? undefined
          : classifyUnverifiedStage({
              completeTeeCount: golferDecision.metrics.completeTeeCount,
              missingSI: golferDecision.metrics.missingSI,
              missingYardage: golferDecision.metrics.missingYardage,
              officialSourceFound: priorityOfficial.officialSourceFound,
              officialParseSuccess: priorityOfficial.parseSuccess,
              ambiguousMatch: false,
              subCourseMappingRequired: priorityOfficial.subCourseMappingRequired || identitySanityFailed,
            }),
      identitySanity: identitySanity
        ? {
            ok: identitySanity.ok,
            reason: identitySanity.reason,
            matchedTerms: identitySanity.matchedTerms,
            missingTerms: identitySanity.missingTerms,
            excludedTermHit: identitySanity.excludedTermHit,
            expectedIdentityTerms: identitySanity.expectedIdentityTerms,
            excludedIdentityTerms: identitySanity.excludedIdentityTerms,
            expectedCountry: identitySanity.expectedCountry,
            expectedRegion: identitySanity.expectedRegion,
          }
        : undefined,
    };
    console.log(
      `[course-import] Source validation ${seedName} api_id=${params.apiId}: sourceCount=${golferDecision.metrics.sourceCount} official=${golferDecision.metrics.officialSourceUsed} holesValidated=${golferDecision.metrics.validatedHoleCount} completeTeeCount=${golferDecision.metrics.completeTeeCount} missingSI=${golferDecision.metrics.missingSI} missingYardage=${golferDecision.metrics.missingYardage} parMismatch=${golferDecision.metrics.parMismatchCount} siMismatch=${golferDecision.metrics.siMismatchCount} yardageMismatch=${golferDecision.metrics.yardageMismatchCount} confidence=${golferDecision.confidence} decision=${golferDecision.promotionDecision}`,
    );

    if (golferDecision.promotionDecision !== "insert") {
      const unverifiedClassification = classifyUnverifiedStage({
        completeTeeCount: golferDecision.metrics.completeTeeCount,
        missingSI: golferDecision.metrics.missingSI,
        missingYardage: golferDecision.metrics.missingYardage,
        officialSourceFound: priorityOfficial.officialSourceFound,
        officialParseSuccess: priorityOfficial.parseSuccess,
        ambiguousMatch: false,
        subCourseMappingRequired: priorityOfficial.subCourseMappingRequired || identitySanityFailed,
      });
      const lowReason =
        `classification=${unverifiedClassification}; ` + (golferDecision.reasons.join("; ") || "validation_not_promoted");
      if (!params.dryRun) {
        await insertLowConfidenceStagingRow(supabase, {
          batchRunId: params.batchRunId,
          phase: params.phase,
          territory: params.territory,
          apiId: params.apiId,
          candidate: b.candidate,
          courseName: seedName,
          validation: sourceValidation,
          golferDecision,
          rawPayload: fetched.raw,
        });
      }
      if (b.candidate) {
        await updateCandidateAfterAttempt(supabase, b.candidate, {
          status: "skipped",
          syncStatus: "skipped",
          apiId: params.apiId,
          error: `Low confidence import staged: ${lowReason}`.slice(0, 480),
        });
      }
      await updateJob(supabase, params.jobId, {
        sync_status: "skipped",
        finished_at: new Date().toISOString(),
        error_message: `low_confidence: ${lowReason}`.slice(0, 480),
        confidence_score: confidenceScore,
        validation_errors: validationIssues,
        raw_source_payload: fetched.raw,
        summary: {
          dryRun: params.dryRun,
          teeCount: normalized.tees.length,
          holeCount: normalized.tees.reduce((sum, tee) => sum + tee.holes.length, 0),
          candidateId: b.candidate?.id ?? null,
          phase: params.phase,
          territory: params.territory,
          detailPersistence: "staged_low_confidence",
          dataConfidence: golferDecision.confidence,
          golferDataStatus: golferDecision.status,
          golferDataMetrics: golferDecision.metrics,
          sourceComparison: sourceValidation.comparison,
          priorityPromotionAudit,
          validationBasis,
          unverifiedClassification,
        },
      });
      console.log(`[course-import] Decision ${seedName} api_id=${params.apiId}: REJECT_TO_STAGING reason=${lowReason}`);
      return {
        result: {
          courseName: seedName,
          apiId: params.apiId,
          status: "skipped",
          validationIssues,
          error: `Low confidence import staged: ${lowReason}`.slice(0, 480),
          golferDataStatus: golferDecision.status,
          golferDataMetrics: golferDecision.metrics,
          unverifiedClassification,
          priorityPromotionAudit,
        },
        inserted: false,
        updated: false,
        missingSiCount,
      };
    }
    console.log(
      `[course-import] Decision ${seedName} api_id=${params.apiId}: INSERT confidence=${golferDecision.confidence} reasons=${golferDecision.reasons.join("; ") || "all_match"}`,
    );

    const { data: existing } = await supabase
      .from("courses")
      .select("id")
      .eq("dedupe_key", normalized.course.dedupeKey)
      .maybeSingle();
    const existedBefore = !!existing;

    let courseId: string | undefined;
    if (!params.dryRun) {
      const persisted = await upsertNormalizedImport(supabase, normalized, {
        sourceType: promotedSourceType,
        sourceUrl: promotedSourceUrl,
        syncStatus: status,
        confidence: confidenceScore,
        importedAtIso,
        rawRow: fetched.raw,
        territory: params.territory,
        seedPhase: params.phase,
        discoverySource: b.discoverySource,
        importPriority: b.importPriority,
        refreshDueAt: computeRefreshDueIso(new Date()),
        firstDiscoveredAt: b.firstDiscoveredAt,
        lastDiscoveredAt: b.lastDiscoveredAt ?? importedAtIso,
        canonicalApiId: params.apiId,
        seededStatus: "seeded",
        discoveryStatus: "resolved",
        dataConfidence: golferDecision.confidence,
        golferDataStatus: "verified",
        validationBasis,
      });
      courseId = persisted.courseId;
      await applyManualOverrides(supabase, persisted.courseId, params.overwriteManualOverrides);
      if (b.candidate) {
        await updateCandidateAfterAttempt(supabase, b.candidate, {
          status: "imported",
          syncStatus: status,
          apiId: params.apiId,
          courseId,
          confidence: confidenceScore,
          refreshDueAt: computeRefreshDueIso(new Date()),
        });
      }
    }

    await updateJob(supabase, params.jobId, {
      target_course_id: courseId ?? null,
      sync_status: status,
      finished_at: new Date().toISOString(),
      imported_at: params.dryRun ? null : importedAtIso,
      confidence_score: confidenceScore,
      validation_errors: validationIssues,
      raw_source_payload: fetched.raw,
      summary: {
        dryRun: params.dryRun,
        teeCount: normalized.tees.length,
        holeCount: normalized.tees.reduce((sum, tee) => sum + tee.holes.length, 0),
        overwriteManualOverrides: params.overwriteManualOverrides,
        candidateId: b.candidate?.id ?? null,
        phase: params.phase,
        territory: params.territory,
        catalogStaleSweep: params.catalogStaleSweep === true,
        detailPersistence: "full",
        dataConfidence: golferDecision.confidence,
        golferDataStatus: "verified",
        golferDataMetrics: golferDecision.metrics,
        sourceComparison: sourceValidation.comparison,
        validationBasis,
        priorityPromotionAudit,
      },
    });

    return {
      result: {
        courseName: seedName,
        apiId: params.apiId,
        status,
        validationIssues,
        courseId,
        golferDataStatus: "verified",
        golferDataMetrics: golferDecision.metrics,
        priorityPromotionAudit: { ...priorityPromotionAudit, finalStatus: "verified" },
      },
      inserted: !existedBefore,
      updated: existedBefore,
      missingSiCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (b.candidate) {
      await updateCandidateAfterAttempt(supabase, b.candidate, {
        status: "failed",
        syncStatus: "failed",
        apiId: params.apiId,
        error: message,
      });
    }
    await updateJob(supabase, params.jobId, {
      sync_status: "failed",
      finished_at: new Date().toISOString(),
      error_message: message,
    });
    return {
      result: {
        courseName: seedName,
        apiId: params.apiId,
        status: "failed",
        validationIssues: [],
        error: message,
      },
      inserted: false,
      updated: false,
      missingSiCount: 0,
    };
  }
}

async function importCatalogStaleCourse(
  supabase: SupabaseClient,
  params: {
    row: StaleCatalogCourseRow;
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
    priorityEntries: PriorityCourseEntry[];
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const sourceType: ImportSourceType = "golfcourseapi";
  const sourceUrl = null;
  const jobId = await insertJobStart(supabase, {
    batchId: params.batchId,
    triggerType: params.triggerType,
    courseName: params.row.courseName,
    apiId: params.row.apiId,
    sourceType,
    sourceUrl,
    batchRunId: params.batchRunId,
    candidateId: null,
    seedPhase: params.phase,
    territory: params.territory,
    mode: "territory_nightly",
  });
  const nowIso = new Date().toISOString();
  return runCourseDetailImportFromApi(supabase, {
    batchId: params.batchId,
    batchRunId: params.batchRunId,
    phase: params.phase,
    territory: params.territory,
    dryRun: params.dryRun,
    overwriteManualOverrides: params.overwriteManualOverrides,
    triggerType: params.triggerType,
    apiId: params.row.apiId,
    jobId,
    bindings: {
      candidate: null,
      displayCourseName: params.row.courseName,
      discoverySource: "catalog_stale_sweep",
      importPriority: 0,
      firstDiscoveredAt: null,
      lastDiscoveredAt: nowIso,
    },
    catalogStaleSweep: true,
    priorityEntries: params.priorityEntries,
  });
}

async function importCandidateCourse(
  supabase: SupabaseClient,
  params: {
    candidate: TerritoryCandidateRow;
    batchId: string;
    batchRunId: string;
    phase: TerritorySeedPhase;
    territory: string;
    dryRun: boolean;
    overwriteManualOverrides: boolean;
    triggerType: "manual" | "nightly" | "territory_nightly";
    priorityEntries: PriorityCourseEntry[];
  },
): Promise<{
  result: NightlyImportCourseResult;
  inserted: boolean;
  updated: boolean;
  missingSiCount: number;
}> {
  const candidate = params.candidate;
  const seed: CourseSeed = {
    name: candidate.candidate_name,
    preferredApiId: candidate.canonical_api_id ?? undefined,
    sourceType: "golfcourseapi",
  };
  const sourceType: ImportSourceType = "golfcourseapi";
  const sourceUrl = null;
  const { apiId, diagnostic, resolutionClass, resolutionPath } = await resolveApiIdDetail(supabase, seed, {
    normalizedName: candidate.normalized_name,
    priorityEntries: params.priorityEntries,
  });
  const jobId = await insertJobStart(supabase, {
    batchId: params.batchId,
    triggerType: params.triggerType,
    courseName: seed.name,
    apiId,
    sourceType,
    sourceUrl,
    batchRunId: params.batchRunId,
    candidateId: candidate.id,
    seedPhase: params.phase,
    territory: params.territory,
    mode: "territory_nightly",
  });

  if (!apiId) {
    const cls = resolutionClass ?? "below_threshold";
    const isPriorityCourse = isPriorityCourseName(seed.name, params.priorityEntries);
    const canOfficialOnlyPromote =
      isPriorityCourse && cls === "no_sane_api_candidate" && allowsOfficialOnlyPromotion(seed.name, params.priorityEntries);
    if (canOfficialOnlyPromote) {
      const courseEntries = priorityEntriesForCourse(seed.name, params.priorityEntries).filter((e) => e.allowOfficialOnlyPromotion === true);
      const targets = courseEntries.length > 0 ? courseEntries : priorityEntriesForCourse(seed.name, params.priorityEntries);
      const promotions: Array<{
        targetCourseName: string;
        sourceUrl: string | null;
        sourceType: ImportSourceType;
        rows: TeeSourceRows[];
        completeTeeCount: number;
      }> = [];
      for (const entry of targets) {
        const targetCourseName = officialOnlyTargetCourseName(seed.name, entry);
        const priorityOfficial = await resolvePriorityOfficialSource({
          courseName: seed.name,
          apiCourseIdentityName: entry.subCourseName ?? undefined,
          entries: [entry],
        });
        const officialRows = priorityOfficial.primaryRows ?? [];
        const officialCompleteness = evaluateOfficialRowsCompleteness(officialRows);
        const officialConfigured = hasConfiguredOfficialSource(seed.name, [entry]);
        const officialPromotionSafe =
          officialConfigured &&
          priorityOfficial.officialSourceFound &&
          priorityOfficial.parseSuccess &&
          officialCompleteness.completeTeeCount > 0 &&
          officialCompleteness.missingSI === 0 &&
          officialCompleteness.missingYardage === 0;
        if (!officialPromotionSafe) continue;
        promotions.push({
          targetCourseName,
          sourceUrl: priorityOfficial.sourceUrl,
          sourceType:
            priorityOfficial.sourceType !== "unavailable"
              ? (priorityOfficial.sourceType as ImportSourceType)
              : "manual_dataset",
          rows: officialCompleteness.completeTees,
          completeTeeCount: officialCompleteness.completeTeeCount,
        });
      }

      if (promotions.length > 0) {
        const importedAtIso = new Date().toISOString();
        const aggregateHoleCount = promotions.reduce((sum, p) => sum + p.rows.reduce((acc, tee) => acc + tee.holes.length, 0), 0);
        const aggregateTeeCount = promotions.reduce((sum, p) => sum + p.completeTeeCount, 0);
        const golferMetrics: GolferDataPromotionDecision["metrics"] = {
          sourceCount: 1,
          officialSourceUsed: true,
          validatedHoleCount: aggregateHoleCount,
          completeTeeCount: aggregateTeeCount,
          missingSI: 0,
          missingYardage: 0,
          parMismatchCount: 0,
          yardageMismatchCount: 0,
          siMismatchCount: 0,
          promotionDecision: "insert",
        };
        const priorityPromotionAudit = {
          isPriority: true,
          apiCourseIdentityName: undefined,
          officialSourceFound: true,
          parseSuccess: true,
          subCourseMappingRequired: false,
          selectedOfficialCandidateUrl: promotions[0]?.sourceUrl ?? null,
          selectedOfficialSubCourseName: targets[0]?.subCourseName ?? null,
          completeTeeCount: aggregateTeeCount,
          missingSI: 0,
          missingYardage: 0,
          finalStatus: "verified" as const,
          unverifiedClassification: undefined,
          identitySanity: undefined,
          officialOnlyPromotedCourses: promotions.map((p) => ({
            courseName: p.targetCourseName,
            teeCount: p.completeTeeCount,
            holeCountsByTee: p.rows.map((tee) => ({ teeName: tee.teeName, holeCount: tee.holes.length })),
            sourceUrl: p.sourceUrl,
            golferDataStatus: "verified" as const,
          })),
        };
        let courseId: string | undefined = undefined;
        let inserted = false;
        let updated = false;
        if (!params.dryRun) {
          for (const p of promotions) {
            const persisted = await upsertOfficialOnlyPriorityImport(supabase, {
              courseName: p.targetCourseName,
              territory: params.territory,
              seedPhase: params.phase,
              country: candidate.country,
              sourceType: p.sourceType,
              sourceUrl: p.sourceUrl,
              importedAtIso,
              rawRow: {
                official_only_promotion: true,
                resolutionClass: cls,
                diagnostic: diagnostic ?? null,
                sourceUrl: p.sourceUrl,
                targetCourseName: p.targetCourseName,
              },
              rows: p.rows,
              importPriority: candidate.import_priority,
              discoverySource: candidate.discovery_source,
              firstDiscoveredAt: candidate.first_discovered_at,
              lastDiscoveredAt: candidate.last_discovered_at,
              metadata: candidate.metadata,
            });
            if (!courseId) courseId = persisted.courseId;
            inserted = inserted || !persisted.existedBefore;
            updated = updated || persisted.existedBefore;
            await applyManualOverrides(supabase, persisted.courseId, params.overwriteManualOverrides);
          }
        }
        await updateCandidateAfterAttempt(supabase, candidate, {
          status: "imported",
          syncStatus: "ok",
          apiId: null,
          error: null,
        });
        await updateJob(supabase, jobId, {
          target_course_id: courseId ?? null,
          sync_status: "ok",
          finished_at: new Date().toISOString(),
          imported_at: params.dryRun ? null : importedAtIso,
          confidence_score: 1,
          validation_errors: [],
          raw_source_payload: {
            official_only_promotion: true,
            resolutionClass: cls,
            diagnostic: diagnostic ?? null,
            promotedCourses: promotions.map((p) => ({
              courseName: p.targetCourseName,
              sourceUrl: p.sourceUrl,
              sourceType: p.sourceType,
              teeCount: p.completeTeeCount,
              holeCount: p.rows.reduce((sum, tee) => sum + tee.holes.length, 0),
            })),
          },
          summary: {
            dryRun: params.dryRun,
            teeCount: aggregateTeeCount,
            holeCount: aggregateHoleCount,
            overwriteManualOverrides: params.overwriteManualOverrides,
            candidateId: candidate.id,
            phase: params.phase,
            territory: params.territory,
            detailPersistence: "official_only_priority",
            dataConfidence: "high",
            golferDataStatus: "verified",
            golferDataMetrics: golferMetrics,
            sourceComparison: {
              sourceCount: 1,
              officialSourceUsed: true,
              validatedHoleCount: aggregateHoleCount,
              parMismatchCount: 0,
              yardageMismatchCount: 0,
              siMismatchCount: 0,
            },
            validationBasis: "official_only" as ValidationBasis,
            priorityPromotionAudit,
            officialOnlyPromotion: true,
            officialOnlyPromotedCourses: promotions.map((p) => ({
              courseName: p.targetCourseName,
              teeCount: p.completeTeeCount,
              holeCountsByTee: p.rows.map((tee) => ({ teeName: tee.teeName, holeCount: tee.holes.length })),
              sourceUrl: p.sourceUrl,
              golferDataStatus: "verified",
            })),
          },
        });
        return {
          result: {
            courseName: seed.name,
            apiId: null,
            status: "ok",
            validationIssues: [],
            courseId,
            golferDataStatus: "verified",
            golferDataMetrics: golferMetrics,
            priorityPromotionAudit,
            growthConversion: {
              resolutionPath: "unresolved",
              newCourseInserted: inserted,
              existingCourseUpdated: updated,
            },
          },
          inserted,
          updated,
          missingSiCount: 0,
        };
      }
    }
    const growthSkip: GrowthSkipReason =
      cls === "ambiguous_api_match"
        ? "ambiguous_api_match"
        : cls === "no_sane_api_candidate"
          ? "ambiguous_api_match"
        : cls === "no_catalog_match"
          ? "no_catalog_match"
          : "below_threshold";
    const clsTag =
      cls === "no_catalog_match"
        ? "(no_catalog_match)"
        : cls === "ambiguous_api_match"
          ? "(ambiguous_api_match)"
          : cls === "no_sane_api_candidate"
            ? "(no_sane_api_candidate)"
          : cls === "below_threshold"
            ? "(below_threshold)"
            : "(unresolved)";
    const errorMessage = `Unresolved candidate ${clsTag}: ${diagnostic ?? ""}`.slice(0, 480);
    const unverifiedClassification: UnverifiedClassification =
      cls === "no_sane_api_candidate"
        ? "unverified_ambiguous_course_mapping"
        : growthSkip === "ambiguous_api_match"
          ? "unverified_ambiguous_match"
          : "unverified_incomplete_hole_data";
    await updateCandidateAfterAttempt(supabase, candidate, {
      status: "skipped",
      syncStatus: "skipped",
      error: `classification=${unverifiedClassification}; ${errorMessage}`.slice(0, 480),
    });
    await updateJob(supabase, jobId, {
      sync_status: "skipped",
      finished_at: new Date().toISOString(),
      error_message: `classification=${unverifiedClassification}; ${errorMessage}`.slice(0, 480),
    });
    return {
      result: {
        courseName: seed.name,
        apiId: null,
        status: "skipped",
        validationIssues: [],
        error: `classification=${unverifiedClassification}; ${errorMessage}`.slice(0, 480),
        golferDataStatus: "unverified",
        unverifiedClassification,
        priorityPromotionAudit: isPriorityCourse
          ? {
              isPriority: true,
              officialSourceFound: false,
              parseSuccess: false,
              completeTeeCount: 0,
              missingSI: 0,
              missingYardage: 0,
              finalStatus: "unverified",
              unverifiedClassification,
            }
          : undefined,
        growthConversion: {
          resolutionPath: "unresolved",
          skipReason: growthSkip,
          newCourseInserted: false,
          existingCourseUpdated: false,
        },
      },
      inserted: false,
      updated: false,
      missingSiCount: 0,
    };
  }

  const detail = await runCourseDetailImportFromApi(supabase, {
    batchId: params.batchId,
    batchRunId: params.batchRunId,
    phase: params.phase,
    territory: params.territory,
    dryRun: params.dryRun,
    overwriteManualOverrides: params.overwriteManualOverrides,
    triggerType: params.triggerType,
    apiId,
    jobId,
    bindings: {
      candidate,
      displayCourseName: seed.name,
      discoverySource: candidate.discovery_source,
      importPriority: candidate.import_priority,
      firstDiscoveredAt: candidate.first_discovered_at,
      lastDiscoveredAt: candidate.last_discovered_at,
    },
    catalogStaleSweep: false,
    priorityEntries: params.priorityEntries,
  });
  return {
    result: {
      ...detail.result,
      growthConversion: {
        resolutionPath,
        newCourseInserted: detail.inserted,
        existingCourseUpdated: detail.updated,
      },
    },
    inserted: detail.inserted,
    updated: detail.updated,
    missingSiCount: detail.missingSiCount,
  };
}

function buildTopFailureReasons(results: NightlyImportCourseResult[]): Array<{ reason: string; count: number }> {
  const byReason = new Map<string, number>();
  for (const row of results) {
    if (row.status !== "failed") continue;
    const reason = (row.error ?? "unknown").slice(0, 180);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildManualReviewItems(
  candidates: TerritoryCandidateRow[],
  results: NightlyImportCourseResult[],
): Array<{ courseName: string; status: ImportSyncStatus; reason: string }> {
  const resultByName = new Map(results.map((row) => [row.courseName.toLowerCase(), row]));
  const ranked = [...candidates].sort((a, b) => b.import_priority - a.import_priority);
  const out: Array<{ courseName: string; status: ImportSyncStatus; reason: string }> = [];
  for (const candidate of ranked) {
    const row = resultByName.get(candidate.candidate_name.toLowerCase());
    if (!row) continue;
    if (row.status === "ok") continue;
    out.push({
      courseName: candidate.candidate_name,
      status: row.status,
      reason: row.error ?? `${row.validationIssues.length} validation issue(s)`,
    });
    if (out.length >= 10) break;
  }
  return out;
}

export async function runTerritoryScaleNightlyImport(
  options?: TerritoryNightlyImportOptions,
): Promise<TerritoryImportOutcome> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);
  const importRunMode = resolveCourseImportRunMode(options);
  const caps = getTerritoryImportCaps(options?.caps, importRunMode);
  const dryRun = options?.dryRun === true;
  const overwriteManualOverrides = options?.overwriteManualOverrides === true;
  const includeSocietySeeds = options?.includeSocietySeeds !== false;
  const triggerType: "manual" | "nightly" | "territory_nightly" =
    options?.triggerType === "manual" ? "manual" : "territory_nightly";
  const territory = options?.territoryOverride?.trim() || DEFAULT_TERRITORY;
  const phase = await resolveActivePhase(supabase, options?.phaseOverride);
  const priorityEntries = await loadPriorityCourseEntriesFromConfig();
  const batchId = randomUUID();
  const freshnessThresholds = getCourseCatalogFreshnessThresholdsFromEnv({
    ...options?.catalogFreshnessThresholds,
    staleSweepMaxCourses:
      options?.catalogFreshnessThresholds?.staleSweepMaxCourses ?? caps.maxStaleCatalogSweepCourses,
  });
  const catalogFreshness = await evaluateCourseCatalogFreshness(supabase, freshnessThresholds, {
    force: options?.forceCatalogFullRefresh === true,
  });

  console.log(
    `[course-import] Catalog freshness @ ${catalogFreshness.metrics.evaluatedAtIso} | api_courses=${catalogFreshness.metrics.coursesWithApiId} | stale(last_sync<cutoff)=${catalogFreshness.metrics.staleByLastSyncedCount} | missing_SI_courses≈${catalogFreshness.metrics.coursesWithMissingStrokeIndex} | incomplete_tee_courses≈${catalogFreshness.metrics.coursesWithIncompleteTeeBlock} | cutoff=${catalogFreshness.metrics.staleAgeCutoffIso}`,
  );
  if (catalogFreshness.triggeredFullRefresh && options?.forceCatalogFullRefresh === true) {
    console.log(
      `[course-import] Catalog stale sweep FORCED for this run. Reasons: ${catalogFreshness.reasons.join(" | ")}`,
    );
  } else if (catalogFreshness.triggeredFullRefresh) {
    console.log(
      `[course-import] Freshness thresholds crossed (catalog sweep eligible if no queued growth backlog after candidate phases). Reasons: ${catalogFreshness.reasons.join(" | ")}`,
    );
  } else {
    console.log(
      "[course-import] Catalog freshness within thresholds: no catalog-wide stale sweep eligibility from metrics alone.",
    );
  }
  console.log(
    `[course-import] Run mode: ${importRunMode} | Budgets: newCourseImports<=${caps.maxNewCourseImportAttempts} | staleCandidateRefresh<=${caps.maxStaleCandidateRefreshAttempts} | priorityMaintenance<=${caps.maxPriorityMaintenanceCourses} | staleCatalogSweep<=${caps.maxStaleCatalogSweepCourses} (seeding suppresses sweep unless --force-catalog-full-refresh).`,
  );
  console.log(
    "[course-import] Large-catalog note: stale-SI and incomplete-tee metrics use bounded scans; tune COURSE_IMPORT_STALE_SWEEP_MAX_COURSES, COURSE_IMPORT_STALE_AGE_DAYS, and scan caps in courseCatalogFreshness if needed.",
  );

  const batchRunId = await insertBatchRun(supabase, {
    phase,
    territory,
    mode: options?.triggerType ?? "nightly",
    caps,
    triggerType,
    catalogFreshness,
    importRunMode,
  });

  const discoveredCandidates = await discoverCandidatesBounded(
    supabase,
    phase,
    territory,
    caps,
    includeSocietySeeds,
    priorityEntries,
  );

  const [priorityGrowthCandidates, retryCandidates, newCandidates, refreshCandidates, priorityMaintenanceCandidates] = await Promise.all([
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["queued", "resolved", "failed"],
      minPriority: 500,
      limit: Math.max(caps.maxPriorityCourses * 4, 40),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["failed"],
      retryDueOnly: true,
      limit: Math.max(caps.maxRetries * 4, 40),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["queued"],
      limit: Math.max(caps.maxNewSeeds * 5, 80),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["imported"],
      refreshDueOnly: true,
      limit: Math.max(caps.maxRefreshes * 4, 80),
    }),
    listCandidateBucket(supabase, {
      phase,
      territory,
      statuses: ["imported"],
      minPriority: 900,
      limit: Math.max(caps.maxPriorityMaintenanceCourses * 4, 20),
    }),
  ]);

  const growthLimits: CandidatePickLimits = {
    maxTotalAttempts: caps.maxNewCourseImportAttempts,
    maxPriorityCourses: caps.maxPriorityCourses,
    maxNewSeeds: caps.maxNewSeeds,
    maxRetries: caps.maxRetries,
    maxRefreshes: 0,
  };
  const growthPicked = pickCandidates(
    growthLimits,
    priorityGrowthCandidates,
    retryCandidates,
    newCandidates,
    [],
  );

  const growthResults: NightlyImportCourseResult[] = [];
  let growthInserted = 0;
  let growthUpdated = 0;
  let missingSiCount = 0;
  for (const candidate of growthPicked) {
    const imported = await importCandidateCourse(supabase, {
      candidate,
      batchId,
      batchRunId,
      phase,
      territory,
      dryRun,
      overwriteManualOverrides,
      triggerType,
      priorityEntries,
    });
    growthResults.push(imported.result);
    if (imported.inserted) growthInserted += 1;
    if (imported.updated) growthUpdated += 1;
    missingSiCount += imported.missingSiCount;
  }

  const refreshLimits: CandidatePickLimits = {
    maxTotalAttempts: caps.maxStaleCandidateRefreshAttempts,
    maxPriorityCourses: 0,
    maxNewSeeds: 0,
    maxRetries: 0,
    maxRefreshes: caps.maxStaleCandidateRefreshAttempts,
  };
  const refreshPicked = pickCandidates(refreshLimits, [], [], [], refreshCandidates);
  const refreshResults: NightlyImportCourseResult[] = [];
  let refreshInserted = 0;
  let refreshUpdated = 0;
  for (const candidate of refreshPicked) {
    const imported = await importCandidateCourse(supabase, {
      candidate,
      batchId,
      batchRunId,
      phase,
      territory,
      dryRun,
      overwriteManualOverrides,
      triggerType,
      priorityEntries,
    });
    refreshResults.push(imported.result);
    if (imported.inserted) refreshInserted += 1;
    if (imported.updated) refreshUpdated += 1;
    missingSiCount += imported.missingSiCount;
  }

  const alreadyAttempted = new Set<string>([...growthPicked.map((c) => c.id), ...refreshPicked.map((c) => c.id)]);
  const priorityMaintenancePicked = priorityMaintenanceCandidates
    .filter((c) => !alreadyAttempted.has(c.id))
    .sort((a, b) => b.import_priority - a.import_priority)
    .slice(0, Math.max(0, caps.maxPriorityMaintenanceCourses));
  for (const candidate of priorityMaintenancePicked) {
    const imported = await importCandidateCourse(supabase, {
      candidate,
      batchId,
      batchRunId,
      phase,
      territory,
      dryRun,
      overwriteManualOverrides,
      triggerType,
      priorityEntries,
    });
    refreshResults.push(imported.result);
    if (imported.inserted) refreshInserted += 1;
    if (imported.updated) refreshUpdated += 1;
    missingSiCount += imported.missingSiCount;
  }

  const queuedCandidatesAfterCandidatePhases = await countQueuedCandidatesForPhase(supabase, phase, territory);
  const forceSweep = options?.forceCatalogFullRefresh === true;
  const shouldConsiderCatalogSweep = catalogFreshness.triggeredFullRefresh;
  const seedingSweepSuppressedByMode = importRunMode === "seeding" && !forceSweep;

  let skippedStaleCatalogSweepReason: string | null = null;
  if (seedingSweepSuppressedByMode) {
    skippedStaleCatalogSweepReason = "seeding_mode_catalog_sweep_suppressed";
    console.log(
      "[course-import] Stale catalog sweep suppressed for seeding mode (set COURSE_IMPORT_RUN_MODE=maintenance or pass --force-catalog-full-refresh to run a sweep).",
    );
  } else if (!shouldConsiderCatalogSweep) {
    skippedStaleCatalogSweepReason = "freshness_thresholds_not_met";
  } else if (!forceSweep && queuedCandidatesAfterCandidatePhases > 0) {
    skippedStaleCatalogSweepReason = "deferred_growth_queued_backlog";
    console.log(
      `[course-import] Stale catalog sweep skipped: ${queuedCandidatesAfterCandidatePhases} queued candidate(s) remain for this phase (growth-first policy). Use force flag to sweep anyway.`,
    );
  }

  let staleCatalogSweep: StaleCatalogSweepSummary | undefined;
  let sweepInserted = 0;
  let sweepUpdated = 0;
  const pickedApiIds = new Set<number>();
  for (const c of growthPicked) {
    if (c.canonical_api_id != null && c.canonical_api_id > 0) pickedApiIds.add(c.canonical_api_id);
  }
  for (const c of refreshPicked) {
    if (c.canonical_api_id != null && c.canonical_api_id > 0) pickedApiIds.add(c.canonical_api_id);
  }
  for (const r of growthResults) {
    if (r.apiId != null) pickedApiIds.add(r.apiId);
  }
  for (const r of refreshResults) {
    if (r.apiId != null) pickedApiIds.add(r.apiId);
  }

  const canRunStaleSweep =
    !seedingSweepSuppressedByMode &&
    shouldConsiderCatalogSweep &&
    (forceSweep || queuedCandidatesAfterCandidatePhases === 0) &&
    caps.maxStaleCatalogSweepCourses > 0;

  if (canRunStaleSweep) {
    skippedStaleCatalogSweepReason = null;
    const sweepRows = await fetchStaleCatalogCoursesForSweep(supabase, {
      maxRows: caps.maxStaleCatalogSweepCourses,
      staleAgeDays: catalogFreshness.thresholds.staleAgeDays,
    });
    let skippedDuplicateApiInBatch = 0;
    const sweepResults: NightlyImportCourseResult[] = [];
    console.log(
      `[course-import] Stale catalog sweep: selected ${sweepRows.length} course(s) from DB (cap=${caps.maxStaleCatalogSweepCourses}); batch already touched ${pickedApiIds.size} distinct api_id(s).`,
    );
    const sweepStarted = Date.now();
    for (const row of sweepRows) {
      if (pickedApiIds.has(row.apiId)) {
        skippedDuplicateApiInBatch += 1;
        continue;
      }
      pickedApiIds.add(row.apiId);
      const sweepOutcome = await importCatalogStaleCourse(supabase, {
        row,
        batchId,
        batchRunId,
        phase,
        territory,
        dryRun,
        overwriteManualOverrides,
        triggerType,
        priorityEntries,
      });
      sweepResults.push(sweepOutcome.result);
      if (sweepOutcome.inserted) sweepInserted += 1;
      if (sweepOutcome.updated) sweepUpdated += 1;
      missingSiCount += sweepOutcome.missingSiCount;
    }
    staleCatalogSweep = {
      attempted: sweepResults.length,
      skippedDuplicateApiInBatch,
      ok: sweepResults.filter((r) => r.status === "ok").length,
      partial: sweepResults.filter((r) => r.status === "partial").length,
      failed: sweepResults.filter((r) => r.status === "failed").length,
      results: sweepResults,
    };
    console.log(
      `[course-import] Stale catalog sweep finished in ${Date.now() - sweepStarted}ms: attempted=${staleCatalogSweep.attempted} ok=${staleCatalogSweep.ok} partial=${staleCatalogSweep.partial} failed=${staleCatalogSweep.failed} skippedDupApi=${staleCatalogSweep.skippedDuplicateApiInBatch}`,
    );
  } else if (!seedingSweepSuppressedByMode && shouldConsiderCatalogSweep && caps.maxStaleCatalogSweepCourses <= 0) {
    skippedStaleCatalogSweepReason = skippedStaleCatalogSweepReason ?? "stale_sweep_cap_zero";
    console.log("[course-import] Stale catalog sweep skipped (stale sweep cap is 0).");
  } else if (shouldConsiderCatalogSweep && !seedingSweepSuppressedByMode && skippedStaleCatalogSweepReason != null) {
    console.log("[course-import] Stale catalog sweep skipped (see skippedStaleCatalogSweepReason in report).");
  } else if (!shouldConsiderCatalogSweep) {
    console.log("[course-import] Stale catalog sweep skipped (freshness thresholds not met).");
  }

  const insertedCoursesFinal = growthInserted + refreshInserted + (staleCatalogSweep ? sweepInserted : 0);
  const updatedCoursesFinal = growthUpdated + refreshUpdated + (staleCatalogSweep ? sweepUpdated : 0);

  const results = [...growthResults, ...refreshResults, ...(staleCatalogSweep?.results ?? [])];
  const ok = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const staleFailed = staleCatalogSweep?.failed ?? 0;
  const staleOk = staleCatalogSweep?.ok ?? 0;
  const stalePartial = staleCatalogSweep?.partial ?? 0;
  const combinedForFailures = [...results];
  const topFailureReasons = buildTopFailureReasons(combinedForFailures);
  const manualReviewItems = buildManualReviewItems([...growthPicked, ...refreshPicked], [...growthResults, ...refreshResults]);

  const newCourseGrowthSummary: CandidateImportPhaseSummary = {
    attempted: growthResults.length,
    inserted: growthInserted,
    updated: growthUpdated,
    ok: growthResults.filter((r) => r.status === "ok").length,
    partial: growthResults.filter((r) => r.status === "partial").length,
    failed: growthResults.filter((r) => r.status === "failed").length,
    skipped: growthResults.filter((r) => r.status === "skipped").length,
  };
  const staleCandidateRefreshSummary: CandidateImportPhaseSummary = {
    attempted: refreshResults.length,
    inserted: refreshInserted,
    updated: refreshUpdated,
    ok: refreshResults.filter((r) => r.status === "ok").length,
    partial: refreshResults.filter((r) => r.status === "partial").length,
    failed: refreshResults.filter((r) => r.status === "failed").length,
    skipped: refreshResults.filter((r) => r.status === "skipped").length,
  };

  const golferDataQualitySummary = {
    verifiedCoursesPromoted: results.filter((r) => r.golferDataStatus === "verified" && (r.status === "ok" || r.status === "partial")).length,
    partialCoursesStaged: results.filter((r) => r.golferDataStatus === "partial" && r.status === "skipped").length,
    unverifiedCoursesStaged: results.filter((r) => r.golferDataStatus === "unverified" && r.status === "skipped").length,
    rejectedCourses: results.filter((r) => r.golferDataStatus === "rejected" && r.status === "skipped").length,
    coursesWithMissingSI: results.filter((r) => (r.golferDataMetrics?.missingSI ?? 0) > 0).length,
    coursesWithMissingYardage: results.filter((r) => (r.golferDataMetrics?.missingYardage ?? 0) > 0).length,
    coursesWithZeroCompleteTees: results.filter((r) => (r.golferDataMetrics?.completeTeeCount ?? 0) === 0).length,
    coursesInsertedButNotGolferReady: results.filter(
      (r) => (r.status === "ok" || r.status === "partial") && r.golferDataStatus != null && r.golferDataStatus !== "verified",
    ).length,
    unverifiedNeedsOfficialConfirmation: results.filter(
      (r) => r.unverifiedClassification === "unverified_needs_official_confirmation",
    ).length,
    unverifiedIncompleteHoleData: results.filter(
      (r) => r.unverifiedClassification === "unverified_incomplete_hole_data",
    ).length,
    unverifiedAmbiguousMatch: results.filter((r) => r.unverifiedClassification === "unverified_ambiguous_match").length,
    unverifiedAmbiguousCourseMapping: results.filter(
      (r) => r.unverifiedClassification === "unverified_ambiguous_course_mapping",
    ).length,
    unverifiedParseFailed: results.filter((r) => r.unverifiedClassification === "unverified_parse_failed").length,
  };
  const priorityCoursePromotionReport = results
    .filter((r) => r.priorityPromotionAudit?.isPriority === true && (r.status === "skipped" || r.golferDataStatus != null))
    .map((r) => ({
      courseName: r.courseName,
      apiCourseIdentityName: r.priorityPromotionAudit?.apiCourseIdentityName ?? null,
      officialSourceFound: r.priorityPromotionAudit?.officialSourceFound ?? false,
      parseSuccess: r.priorityPromotionAudit?.parseSuccess ?? false,
      subCourseMappingRequired: r.priorityPromotionAudit?.subCourseMappingRequired ?? false,
      selectedOfficialCandidateUrl: r.priorityPromotionAudit?.selectedOfficialCandidateUrl ?? null,
      selectedOfficialSubCourseName: r.priorityPromotionAudit?.selectedOfficialSubCourseName ?? null,
      completeTeeCount: r.priorityPromotionAudit?.completeTeeCount ?? 0,
      missingSI: r.priorityPromotionAudit?.missingSI ?? 0,
      missingYardage: r.priorityPromotionAudit?.missingYardage ?? 0,
      finalStatus: r.golferDataStatus ?? r.status,
      unverifiedClassification: r.unverifiedClassification ?? r.priorityPromotionAudit?.unverifiedClassification ?? null,
      identitySanity: r.priorityPromotionAudit?.identitySanity ?? null,
      officialOnlyPromotedCourses: r.priorityPromotionAudit?.officialOnlyPromotedCourses ?? [],
    }));
  const priorityCoursesReadyForOfficialConfirmation = priorityCoursePromotionReport
    .filter((row) => row.unverifiedClassification === "unverified_needs_official_confirmation")
    .map((row) => ({
      courseName: row.courseName,
      completeTeeCount: row.completeTeeCount,
      likelyPromotionBlocker: "missing_official_source_confirmation",
      suggestedNextAction: "add officialScorecardUrl override or provide manual official scorecard dataset",
    }));
  const invalidPromotions = results.filter(
    (r) =>
      r.golferDataStatus === "verified" &&
      ((r.golferDataMetrics?.validatedHoleCount ?? 0) === 0 ||
        (r.golferDataMetrics?.completeTeeCount ?? 0) === 0 ||
        (r.golferDataMetrics?.missingSI ?? 0) > 0),
  );
  const failOnInvalidPromotion = String(process.env.COURSE_IMPORT_FAIL_ON_INVALID_PROMOTION ?? "false").toLowerCase() === "true";
  let nightlyRunExit = computeNightlyImportRunExitSummary(results, getNightlyExitPolicyFromEnv(importRunMode));
  if (invalidPromotions.length > 0) {
    console.error(
      `[course-import] ERROR invalid promotions detected: ${invalidPromotions.length} course(s) marked verified with incomplete golfer metrics.`,
    );
    if (failOnInvalidPromotion) {
      nightlyRunExit = {
        ...nightlyRunExit,
        exitCode: 1,
        exitReason: "invalid_verified_promotion_detected",
      };
    }
  }
  console.log(
    `[course-import] Nightly exit policy: code=${nightlyRunExit.exitCode} reason=${nightlyRunExit.exitReason} hardFailures=${nightlyRunExit.hardFailureCount} unresolved=${nightlyRunExit.unresolvedCandidateCount}/${nightlyRunExit.maxUnresolvedOk} downgraded=${nightlyRunExit.exitDowngradedToSuccess}`,
  );

  const newCourseGrowthWaste = buildNewCourseGrowthWasteFromGrowthResults(growthResults);
  const queueCompositionBySeedPhase = await fetchQueueCompositionBySeedPhase(supabase, territory);
  const importYieldByWorkPhase: Record<TerritoryImportWorkPhaseId, ImportYieldWorkPhaseMetrics | null> = {
    newCourseGrowth: buildImportYieldWorkPhaseMetrics(growthResults.length, growthInserted, growthUpdated, growthResults),
    staleCandidateRefresh: buildImportYieldWorkPhaseMetrics(
      refreshResults.length,
      refreshInserted,
      refreshUpdated,
      refreshResults,
    ),
    staleCatalogSweep: staleCatalogSweep
      ? buildImportYieldWorkPhaseMetrics(
          staleCatalogSweep.attempted,
          sweepInserted,
          sweepUpdated,
          staleCatalogSweep.results,
        )
      : null,
  };
  const gY = importYieldByWorkPhase.newCourseGrowth ?? {
    attempted: 0,
    inserted: 0,
    updated: 0,
    unresolved: 0,
    skipped: 0,
    importYieldPct: null,
  };
  const rY = importYieldByWorkPhase.staleCandidateRefresh ?? {
    attempted: 0,
    inserted: 0,
    updated: 0,
    unresolved: 0,
    skipped: 0,
    importYieldPct: null,
  };
  console.log(
    `[course-import] Queue snapshot @end: EW queued=${queueCompositionBySeedPhase.england_wales.byStatus.queued} imported=${queueCompositionBySeedPhase.england_wales.byStatus.imported} skipped=${queueCompositionBySeedPhase.england_wales.byStatus.skipped} | SC queued=${queueCompositionBySeedPhase.scotland.byStatus.queued} | IE queued=${queueCompositionBySeedPhase.ireland.byStatus.queued}`,
  );
  console.log(
    `[course-import] Yield: growth ins/att=${gY.inserted}/${gY.attempted} (${gY.importYieldPct ?? "n/a"}%) upd=${gY.updated} unresolved=${gY.unresolved} | refresh ins/att=${rY.inserted}/${rY.attempted} (${rY.importYieldPct ?? "n/a"}%)`,
  );
  console.log(
    `[course-import] Growth waste: netNew=${newCourseGrowthWaste.netNewInserts} catalogRefresh=${newCourseGrowthWaste.existingCourseRowsRefreshed} skips amb=${newCourseGrowthWaste.skipped.ambiguousApiMatch} noMatch=${newCourseGrowthWaste.skipped.noCatalogMatch} lowScore=${newCourseGrowthWaste.skipped.belowThreshold} notNetNew db=${newCourseGrowthWaste.notNetNew.fromDbOrPreferredPath} searchDedupe=${newCourseGrowthWaste.notNetNew.fromApiSearchPath}`,
  );
  console.log(
    `[course-import] Golfer quality: verified=${golferDataQualitySummary.verifiedCoursesPromoted} partial=${golferDataQualitySummary.partialCoursesStaged} unverified=${golferDataQualitySummary.unverifiedCoursesStaged} rejected=${golferDataQualitySummary.rejectedCourses} missingSI=${golferDataQualitySummary.coursesWithMissingSI} missingYardage=${golferDataQualitySummary.coursesWithMissingYardage} zeroCompleteTees=${golferDataQualitySummary.coursesWithZeroCompleteTees}`,
  );
  console.log(`[course-import] Priority course promotion rows=${priorityCoursePromotionReport.length}`);

  const growthSkipped = growthResults.filter((r) => r.status === "skipped").length;
  const refreshSkipped = refreshResults.filter((r) => r.status === "skipped").length;
  const sweepSkipped = staleCatalogSweep ? staleCatalogSweep.results.filter((r) => r.status === "skipped").length : 0;
  const rejectedLowConfidenceCount = results.filter((r) =>
    (r.error ?? "").toLowerCase().includes("low confidence import staged"),
  ).length;
  const importRunBreakdown = {
    importRunMode,
    capsSnapshot: {
      maxNewCourseImportAttempts: caps.maxNewCourseImportAttempts,
      maxStaleCandidateRefreshAttempts: caps.maxStaleCandidateRefreshAttempts,
      maxPriorityMaintenanceCourses: caps.maxPriorityMaintenanceCourses,
      maxStaleCatalogSweepCourses: caps.maxStaleCatalogSweepCourses,
      maxDiscoveryPerRun: caps.maxDiscoveryPerRun,
      maxNewSeeds: caps.maxNewSeeds,
      maxPriorityCourses: caps.maxPriorityCourses,
      maxRetries: caps.maxRetries,
    },
    newCourseRowsInserted: {
      growthPhase: growthInserted,
      staleCandidateRefreshPhase: refreshInserted,
      staleCatalogSweepPhase: staleCatalogSweep ? sweepInserted : 0,
      total: insertedCoursesFinal,
    },
    existingCourseRowsUpdated: {
      growthPhase: growthUpdated,
      staleCandidateRefreshPhase: refreshUpdated,
      staleCatalogSweepPhase: staleCatalogSweep ? sweepUpdated : 0,
      total: updatedCoursesFinal,
    },
    skippedOrUnresolved: {
      growthPhase: growthSkipped,
      staleCandidateRefreshPhase: refreshSkipped,
      staleCatalogSweepPhase: sweepSkipped,
      total: skipped,
    },
    rejectedWork: {
      lowConfidence: rejectedLowConfidenceCount,
      totalRejected: rejectedLowConfidenceCount,
    },
    staleCatalogSweepWork: staleCatalogSweep
      ? {
          ran: true,
          attempted: staleCatalogSweep.attempted,
          skippedDuplicateApiInBatch: staleCatalogSweep.skippedDuplicateApiInBatch,
          ok: staleCatalogSweep.ok,
          partial: staleCatalogSweep.partial,
          failed: staleCatalogSweep.failed,
        }
      : { ran: false, skippedReason: skippedStaleCatalogSweepReason },
    staleCandidateRefreshWork: {
      attempted: refreshResults.length,
      inserted: refreshInserted,
      updated: refreshUpdated,
      skipped: refreshSkipped,
      priorityMaintenanceAttempted: priorityMaintenancePicked.length,
    },
    newCourseGrowthWork: {
      attempted: growthResults.length,
      inserted: growthInserted,
      updated: growthUpdated,
      skipped: growthSkipped,
    },
    importYieldByWorkPhase,
    queueCompositionBySeedPhase,
    newCourseGrowthWaste,
    golferDataQualitySummary,
    priorityCoursePromotionReport,
    priorityCoursesReadyForOfficialConfirmation,
    invalidPromotions: invalidPromotions.map((r) => ({
      courseName: r.courseName,
      metrics: r.golferDataMetrics ?? null,
    })),
  };

  const report: Record<string, unknown> = {
    batchId,
    batchRunId,
    phase,
    territory,
    importRunMode,
    importRunBreakdown,
    catalogFreshness,
    staleCatalogSweep: staleCatalogSweep ?? null,
    skippedStaleCatalogSweepReason,
    queuedCandidatesAfterCandidatePhases,
    discoveredCandidates,
    newCourseGrowthPicked: growthPicked.length,
    staleCandidateRefreshPicked: refreshPicked.length,
    priorityMaintenancePicked: priorityMaintenancePicked.length,
    attemptedCandidates: growthPicked.length + refreshResults.length,
    newCourseGrowthSummary,
    staleCandidateRefreshSummary,
    staleCatalogSweepAttempted: staleCatalogSweep?.attempted ?? 0,
    staleCatalogSweepInserted: sweepInserted,
    staleCatalogSweepUpdated: sweepUpdated,
    insertedCourses: insertedCoursesFinal,
    updatedCourses: updatedCoursesFinal,
    ok,
    partial,
    failed,
    skipped,
    rejectedCourses: rejectedLowConfidenceCount,
    staleSweepOk: staleOk,
    staleSweepPartial: stalePartial,
    staleSweepFailed: staleFailed,
    missingSiCount,
    topFailureReasons,
    manualReviewItems,
    nightlyRunExit,
    importYieldByWorkPhase,
    queueCompositionBySeedPhase,
    newCourseGrowthWaste,
    golferDataQualitySummary,
    priorityCoursePromotionReport,
    priorityCoursesReadyForOfficialConfirmation,
    invalidPromotions: invalidPromotions.map((r) => ({
      courseName: r.courseName,
      metrics: r.golferDataMetrics ?? null,
    })),
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from("course_import_batches")
    .update({
      finished_at: new Date().toISOString(),
      status: nightlyRunExit.exitCode === 1 ? "failed" : "completed",
      total_candidates: discoveredCandidates,
      total_attempted: growthPicked.length + refreshResults.length + (staleCatalogSweep?.attempted ?? 0),
      total_inserted: insertedCoursesFinal,
      total_updated: updatedCoursesFinal,
      total_ok: ok,
      total_partial: partial,
      total_failed: failed,
      total_skipped: skipped,
      summary_json: report,
      report_json: report,
    })
    .eq("id", batchRunId);

  return {
    batchId,
    batchRunId,
    phase,
    territory,
    results,
    discoveredCandidates,
    attemptedCandidates: growthPicked.length + refreshResults.length,
    insertedCourses: insertedCoursesFinal,
    updatedCourses: updatedCoursesFinal,
    missingSiCount,
    topFailureReasons,
    manualReviewItems,
    report,
    catalogFreshness,
    staleCatalogSweep,
    newCourseGrowthSummary,
    staleCandidateRefreshSummary,
    skippedStaleCatalogSweepReason,
    queuedCandidatesAfterCandidatePhases,
    queueCompositionBySeedPhase,
    importYieldByWorkPhase,
    newCourseGrowthWaste,
    nightlyRunExit,
    importRunMode,
  };
}

export { DEFAULT_PRIORITY_SEEDS };
