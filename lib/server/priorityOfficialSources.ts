import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { inflateSync } from "node:zlib";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";

export type ValidationBasis =
  | "official_only"
  | "official_plus_secondary"
  | "dual_secondary_match"
  | "secondary_only"
  | "gsh_review";

export type PriorityCourseEntry = {
  name: string;
  subCourseName?: string;
  courseAlias?: string[];
  officialUrls?: string[];
  officialScorecardUrl?: string;
  sourceType?: "pdf" | "html";
  notes?: string;
  expectedIdentityTerms?: string[];
  excludedIdentityTerms?: string[];
  expectedCountry?: string;
  expectedRegion?: string;
  allowOfficialOnlyPromotion?: boolean;
};

export type IdentitySanityResult = {
  ok: boolean;
  matchedTerms: string[];
  missingTerms: string[];
  excludedTermHit: string | null;
  expectedIdentityTerms: string[];
  excludedIdentityTerms: string[];
  expectedCountry: string | null;
  expectedRegion: string | null;
  reason: "no_constraints" | "identity_matched" | "identity_missing_terms" | "identity_excluded_term_hit" | "identity_absent";
};

export type HoleSourceRow = {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
  yardage: number | null;
};

export type TeeSourceRows = {
  teeName: string;
  holes: HoleSourceRow[];
};

export type PriorityOfficialAcquisitionResult = {
  isPriority: boolean;
  officialSourceFound: boolean;
  parseSuccess: boolean;
  subCourseMappingRequired: boolean;
  selectedSubCourseName: string | null;
  sourceType: "official_pdf" | "official_html" | "official_embedded" | "manual_dataset" | "unavailable";
  sourceUrl: string | null;
  attemptedQueries: string[];
  attemptedUrls: string[];
  primaryRows: TeeSourceRows[] | null;
  fieldProvenance: {
    par: { source_type: string; source_url: string | null };
    yardage: { source_type: string; source_url: string | null };
    stroke_index: { source_type: string; source_url: string | null };
  } | null;
};

type OfficialSourceDebugEvent = {
  stage: string;
  url?: string;
  detail?: string;
};

type ParseDebugContext = {
  enabled: boolean;
  courseName: string;
  events: OfficialSourceDebugEvent[];
};

export type ManualScorecardDataset = {
  courses: Array<{
    courseName: string;
    sourceUrl?: string | null;
    tees: Array<{
      teeName: string;
      holes: Array<{
        hole_number: number;
        par: number | null;
        yardage: number | null;
        stroke_index: number | null;
      }>;
    }>;
  }>;
};

const DEFAULT_PRIORITY_COURSES = [
  "The Vale Resort",
  "Wycombe Heights Golf Centre",
  "Upavon Golf Club",
  "Shrivenham Park Golf Club",
];

const DEBUG_TARGET_COURSE_KEYS = new Set<string>([
  normalizeCourseKey("The Vale Resort"),
  normalizeCourseKey("Upavon Golf Club"),
]);

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function normalizeCourseKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toAbsoluteIfNeeded(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

export async function loadPriorityCourseEntriesFromConfig(): Promise<PriorityCourseEntry[]> {
  const debugOfficialSource = String(process.env.COURSE_IMPORT_DEBUG_OFFICIAL_SOURCE ?? "false").toLowerCase() === "true";
  const entries: PriorityCourseEntry[] = [];
  for (const name of DEFAULT_PRIORITY_COURSES) entries.push({ name });

  const envList = String(process.env.COURSE_IMPORT_PRIORITY_COURSES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const name of envList) entries.push({ name });

  const envConfigPath = process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON?.trim();
  const defaultConfigPath = "data/course-import-priority-courses.json";
  const configPath = envConfigPath || defaultConfigPath;
  let configSourceUsed: "env_path" | "default_json" | "built_in_defaults" = envConfigPath ? "env_path" : "default_json";
  if (configPath) {
    try {
      const raw = await readFile(toAbsoluteIfNeeded(configPath), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { courses?: unknown[] }).courses)
          ? (parsed as { courses: unknown[] }).courses
          : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const r = row as {
          name?: unknown;
          courseName?: unknown;
          subCourseName?: unknown;
          courseAlias?: unknown;
          officialUrls?: unknown;
          officialScorecardUrl?: unknown;
          sourceType?: unknown;
          notes?: unknown;
          expectedIdentityTerms?: unknown;
          excludedIdentityTerms?: unknown;
          expectedCountry?: unknown;
          expectedRegion?: unknown;
          allowOfficialOnlyPromotion?: unknown;
        };
        const name =
          typeof r.name === "string"
            ? r.name.trim()
            : typeof r.courseName === "string"
              ? r.courseName.trim()
              : "";
        if (!name) continue;
        const officialUrls = Array.isArray(r.officialUrls)
          ? r.officialUrls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u))
          : [];
        const officialScorecardUrl =
          typeof r.officialScorecardUrl === "string" && /^https?:\/\//i.test(r.officialScorecardUrl.trim())
            ? r.officialScorecardUrl.trim()
            : undefined;
        const subCourseName = typeof r.subCourseName === "string" ? r.subCourseName.trim() : undefined;
        const courseAlias = Array.isArray(r.courseAlias)
          ? r.courseAlias
              .map((a) => String(a).trim())
              .filter(Boolean)
          : typeof r.courseAlias === "string" && r.courseAlias.trim().length > 0
            ? [r.courseAlias.trim()]
            : undefined;
        const sourceType = r.sourceType === "pdf" || r.sourceType === "html" ? r.sourceType : undefined;
        const notes = typeof r.notes === "string" ? r.notes.trim() : undefined;
        const expectedIdentityTerms = Array.isArray(r.expectedIdentityTerms)
          ? r.expectedIdentityTerms.map((t) => String(t).trim()).filter(Boolean)
          : undefined;
        const excludedIdentityTerms = Array.isArray(r.excludedIdentityTerms)
          ? r.excludedIdentityTerms.map((t) => String(t).trim()).filter(Boolean)
          : undefined;
        const expectedCountry = typeof r.expectedCountry === "string" && r.expectedCountry.trim().length > 0
          ? r.expectedCountry.trim()
          : undefined;
        const expectedRegion = typeof r.expectedRegion === "string" && r.expectedRegion.trim().length > 0
          ? r.expectedRegion.trim()
          : undefined;
        const allowOfficialOnlyPromotion = r.allowOfficialOnlyPromotion === true;
        entries.push({
          name,
          subCourseName,
          courseAlias,
          officialUrls: officialUrls.length > 0 ? officialUrls : undefined,
          officialScorecardUrl,
          sourceType,
          notes,
          expectedIdentityTerms: expectedIdentityTerms && expectedIdentityTerms.length > 0 ? expectedIdentityTerms : undefined,
          excludedIdentityTerms: excludedIdentityTerms && excludedIdentityTerms.length > 0 ? excludedIdentityTerms : undefined,
          expectedCountry,
          expectedRegion,
          allowOfficialOnlyPromotion,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[course-import] Failed reading COURSE_IMPORT_PRIORITY_COURSES_JSON: ${msg}`);
      configSourceUsed = "built_in_defaults";
    }
  }

  const byName = new Map<string, PriorityCourseEntry>();
  for (const row of entries) {
    const key = `${normalizeCourseKey(row.name)}::${normalizeCourseKey(row.subCourseName ?? "")}`;
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...row });
      continue;
    }
    const mergedUrls = [...(existing.officialUrls ?? []), ...(row.officialUrls ?? [])];
    existing.officialUrls = [...new Set(mergedUrls)];
    existing.courseAlias = [...new Set([...(existing.courseAlias ?? []), ...(row.courseAlias ?? [])])];
    existing.subCourseName = existing.subCourseName ?? row.subCourseName;
    existing.officialScorecardUrl = existing.officialScorecardUrl ?? row.officialScorecardUrl;
    existing.sourceType = existing.sourceType ?? row.sourceType;
    existing.notes = existing.notes ?? row.notes;
    existing.expectedIdentityTerms = [
      ...new Set([...(existing.expectedIdentityTerms ?? []), ...(row.expectedIdentityTerms ?? [])]),
    ];
    existing.excludedIdentityTerms = [
      ...new Set([...(existing.excludedIdentityTerms ?? []), ...(row.excludedIdentityTerms ?? [])]),
    ];
    existing.expectedCountry = existing.expectedCountry ?? row.expectedCountry;
    existing.expectedRegion = existing.expectedRegion ?? row.expectedRegion;
    existing.allowOfficialOnlyPromotion = existing.allowOfficialOnlyPromotion || row.allowOfficialOnlyPromotion === true;
    if (existing.expectedIdentityTerms && existing.expectedIdentityTerms.length === 0) existing.expectedIdentityTerms = undefined;
    if (existing.excludedIdentityTerms && existing.excludedIdentityTerms.length === 0) existing.excludedIdentityTerms = undefined;
  }
  const out = [...byName.values()];
  if (debugOfficialSource) {
    console.log(`[course-import] Official source config: source=${configSourceUsed} entries=${out.length}`);
  }
  return out;
}

export function isPriorityCourseName(courseName: string, entries: PriorityCourseEntry[]): boolean {
  const key = normalizeCourseKey(courseName);
  return entries.some((e) => normalizeCourseKey(e.name) === key);
}

/**
 * Returns the merged identity sanity constraints for all matching priority entries
 * (e.g. venue-level + sub-course entries under the same name).
 */
function mergedIdentityConstraintsForName(
  courseName: string,
  entries: PriorityCourseEntry[],
): {
  expectedIdentityTerms: string[];
  excludedIdentityTerms: string[];
  aliases: string[];
  expectedCountry: string | null;
  expectedRegion: string | null;
} {
  const key = normalizeCourseKey(courseName);
  const matched = entries.filter((e) => normalizeCourseKey(e.name) === key);
  const expected = new Set<string>();
  const excluded = new Set<string>();
  const aliases = new Set<string>();
  let country: string | null = null;
  let region: string | null = null;
  for (const entry of matched) {
    for (const term of entry.expectedIdentityTerms ?? []) expected.add(term);
    for (const term of entry.excludedIdentityTerms ?? []) excluded.add(term);
    for (const alias of entry.courseAlias ?? []) aliases.add(alias);
    if (entry.subCourseName) aliases.add(entry.subCourseName);
    aliases.add(entry.name);
    if (!country && entry.expectedCountry) country = entry.expectedCountry;
    if (!region && entry.expectedRegion) region = entry.expectedRegion;
  }
  return {
    expectedIdentityTerms: [...expected],
    excludedIdentityTerms: [...excluded],
    aliases: [...aliases],
    expectedCountry: country,
    expectedRegion: region,
  };
}

/**
 * Evaluates identity sanity for a priority course against the API-resolved identity.
 * Returns ok=true when either no constraints are configured, or configured expected
 * terms/aliases match, AND no excluded terms appear in the API identity context.
 */
export function evaluateIdentitySanity(params: {
  courseName: string;
  entries: PriorityCourseEntry[];
  apiCourseIdentityName?: string;
  apiCountry?: string | null;
  apiRegion?: string | null;
}): IdentitySanityResult {
  const constraints = mergedIdentityConstraintsForName(params.courseName, params.entries);
  const expectedIdentityTerms = constraints.expectedIdentityTerms;
  const excludedIdentityTerms = constraints.excludedIdentityTerms;
  const hasConstraints =
    expectedIdentityTerms.length > 0 ||
    excludedIdentityTerms.length > 0 ||
    constraints.expectedCountry != null ||
    constraints.expectedRegion != null;
  if (!hasConstraints) {
    return {
      ok: true,
      matchedTerms: [],
      missingTerms: [],
      excludedTermHit: null,
      expectedIdentityTerms,
      excludedIdentityTerms,
      expectedCountry: null,
      expectedRegion: null,
      reason: "no_constraints",
    };
  }
  const identityKey = normalizeCourseKey(params.apiCourseIdentityName ?? "");
  const countryKey = normalizeCourseKey(params.apiCountry ?? "");
  const regionKey = normalizeCourseKey(params.apiRegion ?? "");
  const haystack = [identityKey, countryKey, regionKey].filter((v) => v.length > 0).join(" ");
  if (identityKey.length === 0) {
    return {
      ok: false,
      matchedTerms: [],
      missingTerms: expectedIdentityTerms,
      excludedTermHit: null,
      expectedIdentityTerms,
      excludedIdentityTerms,
      expectedCountry: constraints.expectedCountry,
      expectedRegion: constraints.expectedRegion,
      reason: "identity_absent",
    };
  }
  const excludedHit = excludedIdentityTerms.find((term) => {
    const k = normalizeCourseKey(term);
    return k.length > 0 && haystack.includes(k);
  });
  if (excludedHit) {
    return {
      ok: false,
      matchedTerms: [],
      missingTerms: [],
      excludedTermHit: excludedHit,
      expectedIdentityTerms,
      excludedIdentityTerms,
      expectedCountry: constraints.expectedCountry,
      expectedRegion: constraints.expectedRegion,
      reason: "identity_excluded_term_hit",
    };
  }
  const matched: string[] = [];
  const missing: string[] = [];
  const expectedPool = [...expectedIdentityTerms, ...constraints.aliases];
  for (const term of expectedPool) {
    const k = normalizeCourseKey(term);
    if (k.length === 0) continue;
    if (haystack.includes(k)) {
      matched.push(term);
    } else if (expectedIdentityTerms.includes(term)) {
      missing.push(term);
    }
  }
  if (constraints.expectedCountry) {
    const k = normalizeCourseKey(constraints.expectedCountry);
    if (k.length > 0 && !countryKey.includes(k) && !identityKey.includes(k)) {
      missing.push(constraints.expectedCountry);
    } else if (k.length > 0) {
      matched.push(constraints.expectedCountry);
    }
  }
  if (constraints.expectedRegion) {
    const k = normalizeCourseKey(constraints.expectedRegion);
    if (k.length > 0 && !regionKey.includes(k) && !identityKey.includes(k)) {
      missing.push(constraints.expectedRegion);
    } else if (k.length > 0) {
      matched.push(constraints.expectedRegion);
    }
  }
  const ok = matched.length > 0 && (expectedIdentityTerms.length === 0 || missing.length < expectedIdentityTerms.length);
  return {
    ok,
    matchedTerms: [...new Set(matched)],
    missingTerms: [...new Set(missing)],
    excludedTermHit: null,
    expectedIdentityTerms,
    excludedIdentityTerms,
    expectedCountry: constraints.expectedCountry,
    expectedRegion: constraints.expectedRegion,
    reason: ok ? "identity_matched" : "identity_missing_terms",
  };
}

export function buildOfficialDiscoveryQueries(courseName: string): string[] {
  const n = courseName.trim();
  if (!n) return [];
  return [
    `${n} scorecard pdf`,
    `${n} hole by hole`,
    `${n} golf scorecard`,
    `${n} tee yardage stroke index`,
    `${n} England Golf`,
    `${n} R&A`,
  ];
}

function parseIntOrNull(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function ensureCompleteRows(tees: TeeSourceRows[]): TeeSourceRows[] {
  return tees
    .map((t) => ({ ...t, holes: [...t.holes].sort((a, b) => a.hole_number - b.hole_number) }))
    .filter((t) => t.holes.length > 0);
}

function parseTabularMultiTeeRows(text: string): TeeSourceRows[] {
  const blue: HoleSourceRow[] = [];
  const white: HoleSourceRow[] = [];
  const yellow: HoleSourceRow[] = [];
  const red: HoleSourceRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!/^\d{1,2}\s+/.test(line)) continue;
    const nums = line
      .split(" ")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (nums.length < 9) continue;
    const hole = nums[0]!;
    if (hole < 1 || hole > 18) continue;
    const blueY = nums[1]!;
    const whiteY = nums[2]!;
    const yellowY = nums[3]!;
    const par = nums[4]!;
    const si = nums[5]!;
    const redY = nums[6]!;
    const redPar = nums[7]!;
    const redSi = nums[8]!;
    blue.push({ hole_number: hole, par, yardage: blueY, stroke_index: si });
    white.push({ hole_number: hole, par, yardage: whiteY, stroke_index: si });
    yellow.push({ hole_number: hole, par, yardage: yellowY, stroke_index: si });
    red.push({ hole_number: hole, par: redPar, yardage: redY, stroke_index: redSi });
  }
  const tees: TeeSourceRows[] = [];
  if (blue.length >= 9) tees.push({ teeName: "Blue", holes: blue });
  if (white.length >= 9) tees.push({ teeName: "White", holes: white });
  if (yellow.length >= 9) tees.push({ teeName: "Yellow", holes: yellow });
  if (red.length >= 9) tees.push({ teeName: "Red", holes: red });
  return ensureCompleteRows(tees);
}

function parseTokenStreamScorecardRows(text: string): TeeSourceRows[] {
  const tokens = text
    .replace(/[^\x20-\x7E\r\n]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const white: HoleSourceRow[] = [];
  const yellow: HoleSourceRow[] = [];
  const red: HoleSourceRow[] = [];
  const isBoundary = (value: string | undefined, nextHole: number): boolean =>
    value === String(nextHole) || value === "OUT" || value === "IN" || value === "TOTAL" || value === "PLEASE";
  for (let i = 0; i < tokens.length; i += 1) {
    const hole = Number(tokens[i]);
    if (!Number.isFinite(hole) || hole < 1 || hole > 18) continue;
    const nextHole = hole + 1;
    const n1 = Number(tokens[i + 1]);
    const n2 = Number(tokens[i + 2]);
    const n3 = Number(tokens[i + 3]);
    const n4 = Number(tokens[i + 4]);
    const n5 = Number(tokens[i + 5]);
    const n6 = Number(tokens[i + 6]);
    const n7 = Number(tokens[i + 7]);
    const t6 = tokens[i + 6];
    const t8 = tokens[i + 8];
    const looksExtended =
      Number.isFinite(n1) &&
      Number.isFinite(n2) &&
      Number.isFinite(n3) &&
      Number.isFinite(n4) &&
      Number.isFinite(n5) &&
      Number.isFinite(n6) &&
      Number.isFinite(n7) &&
      isBoundary(t8, nextHole);
    const looksBasic =
      Number.isFinite(n1) &&
      Number.isFinite(n2) &&
      Number.isFinite(n3) &&
      Number.isFinite(n4) &&
      Number.isFinite(n5) &&
      isBoundary(t6, nextHole);
    if (looksExtended) {
      white.push({ hole_number: hole, yardage: n1, par: n3, stroke_index: n4 });
      yellow.push({ hole_number: hole, yardage: n2, par: n3, stroke_index: n4 });
      red.push({ hole_number: hole, yardage: n5, par: n6, stroke_index: n7 });
      i += 7;
      continue;
    }
    if (looksBasic) {
      white.push({ hole_number: hole, yardage: n1, par: n4, stroke_index: n5 });
      yellow.push({ hole_number: hole, yardage: n2, par: n4, stroke_index: n5 });
      red.push({ hole_number: hole, yardage: n3, par: n4, stroke_index: n5 });
      i += 5;
    }
  }
  const tees: TeeSourceRows[] = [];
  if (white.length >= 9) tees.push({ teeName: "White", holes: white });
  if (yellow.length >= 9) tees.push({ teeName: "Yellow", holes: yellow });
  if (red.length >= 9) tees.push({ teeName: "Red", holes: red });
  return ensureCompleteRows(tees);
}

function decodePdfLiteral(input: string): string {
  return input
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractTextFromPdfOperators(source: string): string {
  const out: string[] = [];
  const tjRegex = /\(([^)]{1,1200})\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRegex.exec(source)) != null) {
    out.push(decodePdfLiteral(m[1] ?? ""));
  }
  const tjArrayRegex = /\[(.{1,1200}?)\]\s*TJ/g;
  while ((m = tjArrayRegex.exec(source)) != null) {
    const chunk = m[1] ?? "";
    const nested = [...chunk.matchAll(/\(([^)]{1,400})\)/g)];
    for (const n of nested) out.push(decodePdfLiteral(n[1] ?? ""));
  }
  return out.join("\n");
}

function extractPdfTextFallback(pdfBuffer: Buffer): string {
  const latin = pdfBuffer.toString("latin1");
  const out: string[] = [extractTextFromPdfOperators(latin)];
  const streamRegex = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRegex.exec(latin)) != null) {
    const streamStart = m.index + m[0].length;
    const end = latin.indexOf("endstream", streamStart);
    if (end < 0) break;
    const chunk = pdfBuffer.subarray(streamStart, end);
    try {
      const inflated = inflateSync(chunk);
      const inflatedLatin = inflated.toString("latin1");
      out.push(extractTextFromPdfOperators(inflatedLatin));
    } catch {
      // not a flate stream; ignore.
    }
    streamRegex.lastIndex = end + "endstream".length;
  }
  return out.join("\n");
}

async function writeDebugArtifact(
  ctx: ParseDebugContext,
  kind: "html" | "pdf_text",
  sourceUrl: string,
  body: string,
): Promise<void> {
  if (!ctx.enabled) return;
  const dir = path.join(os.tmpdir(), "course-import-official-debug");
  await mkdir(dir, { recursive: true });
  const key = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12);
  const safeName = ctx.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const ext = kind === "html" ? "html" : "txt";
  const file = path.join(dir, `${safeName}-${key}-${kind}.${ext}`);
  await writeFile(file, body || `# Empty ${kind} artifact`, "utf8");
  ctx.events.push({ stage: "artifact_saved", url: sourceUrl, detail: file });
}

export function parseStructuredScorecardText(text: string): TeeSourceRows[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const tees = new Map<string, HoleSourceRow[]>();
  let currentTee = "White";
  for (const line of lines) {
    const teeMatch = /^(?:tee|tees?)\s*[:\-]\s*(.+)$/i.exec(line);
    if (teeMatch?.[1]) {
      currentTee = teeMatch[1].trim();
      if (!tees.has(currentTee)) tees.set(currentTee, []);
      continue;
    }
    if (/^(white|yellow|red|blue|black|gold)\b/i.test(line)) {
      currentTee = line.split(/[|,:-]/)[0]!.trim();
      if (!tees.has(currentTee)) tees.set(currentTee, []);
      continue;
    }
    const compact = line.replace(/,/g, " ");
    const m = /^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{1,2})$/.exec(compact);
    if (!m) continue;
    const hole_number = parseIntOrNull(m[1] ?? "");
    const par = parseIntOrNull(m[2] ?? "");
    const yardage = parseIntOrNull(m[3] ?? "");
    const stroke_index = parseIntOrNull(m[4] ?? "");
    if (hole_number == null || hole_number < 1 || hole_number > 36) continue;
    if (!tees.has(currentTee)) tees.set(currentTee, []);
    tees.get(currentTee)!.push({
      hole_number,
      par,
      yardage,
      stroke_index,
    });
  }
  return ensureCompleteRows([...tees.entries()].map(([teeName, holes]) => ({ teeName, holes })));
}

export function parseHtmlScorecard(html: string): TeeSourceRows[] {
  const $ = cheerio.load(html);
  const tableCount = $("table").length;
  const tees: TeeSourceRows[] = [];
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;
    let holeIdx = -1;
    let parIdx = -1;
    let yardIdx = -1;
    let siIdx = -1;
    const headerCells = rows
      .first()
      .find("th,td")
      .toArray()
      .map((c) => $(c).text().trim().toLowerCase());
    for (let i = 0; i < headerCells.length; i += 1) {
      const h = headerCells[i] ?? "";
      if (holeIdx < 0 && /hole|no/.test(h)) holeIdx = i;
      if (parIdx < 0 && /^par$/.test(h)) parIdx = i;
      if (yardIdx < 0 && /yard|yds|yards/.test(h)) yardIdx = i;
      if (siIdx < 0 && /stroke|index|hcp|handicap|si/.test(h)) siIdx = i;
    }
    if (holeIdx < 0 || parIdx < 0 || yardIdx < 0 || siIdx < 0) return;

    const teeName =
      $(table).attr("data-tee-name")?.trim() ||
      $(table).find("caption").first().text().trim() ||
      "White";
    const holes: HoleSourceRow[] = [];
    rows.slice(1).each((__, row) => {
      const cells = $(row)
        .find("td,th")
        .toArray()
        .map((c) => $(c).text().replace(/\s+/g, " ").trim());
      const hole_number = parseIntOrNull(cells[holeIdx] ?? "");
      if (hole_number == null || hole_number < 1 || hole_number > 36) return;
      holes.push({
        hole_number,
        par: parseIntOrNull(cells[parIdx] ?? ""),
        yardage: parseIntOrNull(cells[yardIdx] ?? ""),
        stroke_index: parseIntOrNull(cells[siIdx] ?? ""),
      });
    });
    if (holes.length > 0) tees.push({ teeName, holes });
  });
  if (tees.length > 0) return ensureCompleteRows(tees);
  const structured = parseStructuredScorecardText($.text());
  if (structured.length > 0) return structured;
  const multi = parseTabularMultiTeeRows($.text());
  if (multi.length > 0) return multi;
  if (tableCount === 0) return [];
  return [];
}

export async function parsePdfScorecard(
  pdfBuffer: Buffer,
  debug?: ParseDebugContext,
  sourceUrl?: string,
): Promise<TeeSourceRows[]> {
  let text = "";
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text ?? "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    if (debug?.enabled) {
      debug.events.push({
        stage: "pdf_parse_primary_error",
        url: sourceUrl,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!text || text.replace(/\s+/g, "").length < 120) {
    text = extractPdfTextFallback(pdfBuffer);
    if (debug?.enabled) {
      debug.events.push({
        stage: "pdf_parse_fallback_used",
        url: sourceUrl,
        detail: `len=${text.length}`,
      });
    }
  }
  if (debug?.enabled && sourceUrl) {
    debug.events.push({ stage: "pdf_text_length", url: sourceUrl, detail: String(text.length) });
    await writeDebugArtifact(debug, "pdf_text", sourceUrl, text);
  }
  const structured = parseStructuredScorecardText(text);
  if (structured.length > 0) return structured;
  const multi = parseTabularMultiTeeRows(text);
  if (multi.length > 0) return multi;
  const tokenized = parseTokenStreamScorecardRows(text);
  if (tokenized.length > 0) return tokenized;
  return [];
}

async function fetchSearchResultsFromDuckDuckGo(query: string): Promise<string[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: withTimeout(9000) });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a.result__a, a[href]").each((_, a) => {
    const href = $(a).attr("href")?.trim();
    if (!href) return;
    if (/^https?:\/\//i.test(href)) links.add(href);
  });
  return [...links];
}

function sortOfficialCandidates(urls: string[]): string[] {
  const seen = new Set<string>();
  const filtered = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return !/(golfshake|18birdies|facebook|instagram|x\.com|twitter\.com)/i.test(u);
  });
  return filtered.sort((a, b) => {
    const aPdf = /\.pdf(\?|$)/i.test(a) ? 1 : 0;
    const bPdf = /\.pdf(\?|$)/i.test(b) ? 1 : 0;
    return bPdf - aPdf;
  });
}

async function parseOfficialUrl(
  url: string,
  depth = 0,
  visited: Set<string> = new Set<string>(),
  debugEvents: OfficialSourceDebugEvent[] = [],
  debugCtx?: ParseDebugContext,
): Promise<{
  rows: TeeSourceRows[] | null;
  sourceType: "official_pdf" | "official_html" | "official_embedded";
}> {
  if (visited.has(url)) return { rows: null, sourceType: "official_html" };
  visited.add(url);
  debugEvents.push({ stage: "visit_url", url, detail: `depth=${depth}` });

  const looksPdf = /\.pdf(\?|$)/i.test(url);
  if (looksPdf) {
    const pdfRes = await fetch(url, { signal: withTimeout(12000) });
    debugEvents.push({
      stage: "fetch_pdf",
      url,
      detail: `status=${pdfRes.status}`,
    });
    if (!pdfRes.ok) return { rows: null, sourceType: "official_pdf" };
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    const rows = await parsePdfScorecard(buf, debugCtx, pdfRes.url || url);
    debugEvents.push({
      stage: "parse_pdf_rows",
      url,
      detail: `rows=${rows.length}; finalUrl=${pdfRes.url || url}; contentType=${pdfRes.headers.get("content-type") || ""}`,
    });
    return { rows: rows.length > 0 ? rows : null, sourceType: "official_pdf" };
  }
  const htmlRes = await fetch(url, { signal: withTimeout(12000) });
  debugEvents.push({
    stage: "fetch_html",
    url,
    detail: `status=${htmlRes.status}`,
  });
  if (!htmlRes.ok) return { rows: null, sourceType: "official_html" };
  const contentType = String(htmlRes.headers.get("content-type") ?? "").toLowerCase();
  debugEvents.push({ stage: "content_type", url, detail: contentType || "unknown" });
  if (contentType.includes("pdf")) {
    const pdfBuf = Buffer.from(await htmlRes.arrayBuffer());
    const pdfRows = await parsePdfScorecard(pdfBuf, debugCtx, htmlRes.url || url);
    debugEvents.push({
      stage: "parse_pdf_content_type_rows",
      url,
      detail: `rows=${pdfRows.length}; finalUrl=${htmlRes.url || url}; contentType=${contentType}`,
    });
    return { rows: pdfRows.length > 0 ? pdfRows : null, sourceType: "official_pdf" };
  }
  const html = await htmlRes.text();
  if (debugCtx?.enabled) {
    await writeDebugArtifact(debugCtx, "html", htmlRes.url || url, html);
  }
  const parsed = parseHtmlScorecard(html);
  const $ = cheerio.load(html);
  const htmlTableCount = $("table").length;
  debugEvents.push({
    stage: "parse_html_rows",
    url,
    detail: `rows=${parsed.length}; tables=${htmlTableCount}; finalUrl=${htmlRes.url || url}; contentType=${contentType}`,
  });
  if (parsed.length > 0) return { rows: parsed, sourceType: "official_html" };
  const embeddedPdf = $("a[href]")
    .toArray()
    .map((a) => {
      const href = $(a).attr("href")?.trim();
      const text = $(a).text().replace(/\s+/g, " ").trim().toLowerCase();
      return { href, text };
    })
    .filter((a): a is { href: string; text: string } => !!a.href && /\.pdf(\?|$)/i.test(a.href))
    .map((a) => a.href)
    .map((h) => {
      try {
        return new URL(h, url).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u);
  for (const emb of embeddedPdf.slice(0, 4)) {
    debugEvents.push({ stage: "follow_link", url: emb, detail: "embedded_pdf" });
    const embeddedParsed = await parseOfficialUrl(emb, depth + 1, visited, debugEvents, debugCtx);
    if (embeddedParsed.rows?.length) return { rows: embeddedParsed.rows, sourceType: "official_embedded" };
  }

  // Follow scorecard-like anchors that may route to a PDF or scorecard page.
  if (depth < 2) {
    const scorecardLinks = $("a[href]")
      .toArray()
      .map((a) => {
        const href = $(a).attr("href")?.trim();
        const text = $(a).text().replace(/\s+/g, " ").trim().toLowerCase();
        return { href, text };
      })
      .filter(
        (a): a is { href: string; text: string } =>
          !!a.href &&
          (/scorecard|local rules|golf brochure|course guide/.test(a.text) ||
            /scorecard|brochure|local-rules|course-guide|pdf|lake|national|golf-?course/i.test(a.href)),
      )
      .map((a) => {
        try {
          return new URL(a.href, url).toString();
        } catch {
          return null;
        }
      })
      .filter((u): u is string => !!u);

    for (const link of scorecardLinks.slice(0, 5)) {
      debugEvents.push({ stage: "follow_link", url: link, detail: "scorecard_like" });
      const nextParsed = await parseOfficialUrl(link, depth + 1, visited, debugEvents, debugCtx);
      if (nextParsed.rows?.length) return { rows: nextParsed.rows, sourceType: "official_embedded" };
    }
  }

  const embedded = $("a[href]")
    .toArray()
    .map((a) => $(a).attr("href")?.trim())
    .filter((h): h is string => !!h && /\.pdf(\?|$)/i.test(h))
    .map((h) => {
      try {
        return new URL(h, url).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u);
  for (const emb of embedded.slice(0, 3)) {
    debugEvents.push({ stage: "follow_link", url: emb, detail: "embedded_generic_pdf" });
    const embeddedParsed = await parseOfficialUrl(emb, depth + 1, visited, debugEvents, debugCtx);
    if (embeddedParsed.rows?.length) return { rows: embeddedParsed.rows, sourceType: "official_embedded" };
  }
  return { rows: null, sourceType: "official_html" };
}

async function loadManualDataset(): Promise<ManualScorecardDataset | null> {
  const manualPath = process.env.COURSE_IMPORT_MANUAL_SCORECARD_JSON?.trim();
  const defaultPath = "data/course-import-manual-scorecards.json";
  const candidatePaths = manualPath ? [manualPath] : [defaultPath];
  for (const p of candidatePaths) {
    try {
      const raw = await readFile(toAbsoluteIfNeeded(p), "utf8");
      const parsed = JSON.parse(raw) as ManualScorecardDataset;
      if (parsed && Array.isArray(parsed.courses)) return parsed;
    } catch (error) {
      const code = typeof error === "object" && error != null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (!manualPath && code === "ENOENT") continue;
      const msg = error instanceof Error ? error.message : String(error);
      const label = manualPath ? "COURSE_IMPORT_MANUAL_SCORECARD_JSON" : defaultPath;
      console.warn(`[course-import] Failed reading ${label}: ${msg}`);
      return null;
    }
  }
  return null;
}

function manualRowsForCourse(courseName: string, manual: ManualScorecardDataset | null): TeeSourceRows[] | null {
  if (!manual) return null;
  const key = normalizeCourseKey(courseName);
  const row = manual.courses.find((c) => normalizeCourseKey(c.courseName) === key);
  if (!row) return null;
  const tees = row.tees.map((tee) => ({
    teeName: tee.teeName,
    holes: tee.holes.map((h) => ({
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage,
      stroke_index: h.stroke_index,
    })),
  }));
  return ensureCompleteRows(tees);
}

function mergeAndNormalizeUrls(
  entry: PriorityCourseEntry | undefined,
  discovered: string[],
): Array<{
  url: string;
  source: "override" | "discovery";
  preferredType?: "pdf" | "html";
  subCourseName?: string;
  courseAlias?: string[];
}> {
  const merged: Array<{
    url: string;
    source: "override" | "discovery";
    preferredType?: "pdf" | "html";
    subCourseName?: string;
    courseAlias?: string[];
  }> = [];
  if (entry?.officialScorecardUrl) {
    merged.push({
      url: entry.officialScorecardUrl,
      source: "override",
      preferredType: entry.sourceType,
      subCourseName: entry.subCourseName,
      courseAlias: entry.courseAlias,
    });
  }
  for (const url of entry?.officialUrls ?? []) {
    merged.push({
      url,
      source: "override",
      subCourseName: entry?.subCourseName,
      courseAlias: entry?.courseAlias,
    });
  }
  for (const url of sortOfficialCandidates(discovered)) merged.push({ url, source: "discovery" });
  const seen = new Set<string>();
  return merged.filter((row) => {
    if (seen.has(row.url)) return false;
    seen.add(row.url);
    return true;
  });
}

function entryIdentityTokens(entry: PriorityCourseEntry): string[] {
  const out = [entry.name, entry.subCourseName ?? "", ...(entry.courseAlias ?? [])]
    .map((v) => normalizeCourseKey(v))
    .filter(Boolean);
  return [...new Set(out)];
}

function selectPriorityEntries(params: {
  requestedName: string;
  apiCourseIdentityName?: string;
  entries: PriorityCourseEntry[];
}): { entries: PriorityCourseEntry[]; subCourseMappingRequired: boolean } {
  const requestedKey = normalizeCourseKey(params.requestedName);
  const matched = params.entries.filter((e) => normalizeCourseKey(e.name) === requestedKey);
  if (matched.length === 0) return { entries: [], subCourseMappingRequired: false };
  const withSub = matched.filter((e) => normalizeCourseKey(e.subCourseName ?? "").length > 0);
  if (withSub.length === 0) return { entries: matched, subCourseMappingRequired: false };
  const identity = normalizeCourseKey(params.apiCourseIdentityName ?? "");
  const identityLooksVenueOnly = identity === "" || identity === requestedKey;
  const identityMatched = withSub.filter((e) =>
    entryIdentityTokens(e).some((token) => token.length > 0 && identity.includes(token)),
  );
  if (identityMatched.length > 0) return { entries: identityMatched, subCourseMappingRequired: false };
  if (identityLooksVenueOnly) {
    return {
      entries: matched,
      subCourseMappingRequired: true,
    };
  }
  return {
    entries: matched,
    subCourseMappingRequired: true,
  };
}

function teeColorKey(name: string): string | null {
  const key = normalizeCourseKey(name);
  if (/\bwhite\b/.test(key)) return "white";
  if (/\byellow\b/.test(key)) return "yellow";
  if (/\bred\b/.test(key)) return "red";
  if (/\bblue\b/.test(key)) return "blue";
  if (/\bblack\b/.test(key)) return "black";
  if (/\bgold\b/.test(key)) return "gold";
  return null;
}

function chooseBestOfficialRowsForSecondary(
  candidates: Array<{
    url: string;
    sourceType: "official_pdf" | "official_html" | "official_embedded";
    rows: TeeSourceRows[];
    subCourseName?: string;
    courseAlias?: string[];
  }>,
  secondaryRows: TeeSourceRows[],
  apiCourseIdentityName?: string,
): {
  url: string;
  sourceType: "official_pdf" | "official_html" | "official_embedded";
  rows: TeeSourceRows[];
  subCourseName?: string;
  courseAlias?: string[];
} | null {
  if (candidates.length === 0) return null;
  const identity = normalizeCourseKey(apiCourseIdentityName ?? "");
  let best:
    | {
        url: string;
        sourceType: "official_pdf" | "official_html" | "official_embedded";
        rows: TeeSourceRows[];
        subCourseName?: string;
        courseAlias?: string[];
      }
    | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let totalCompared = 0;
    let totalCritical = 0;
    let totalVariance = 0;
    for (const primaryTee of candidate.rows) {
      const pByHole = new Map(primaryTee.holes.map((h) => [h.hole_number, h]));
      let bestTeeScore = -Infinity;
      let bestCompared = 0;
      let bestCritical = 9999;
      let bestVariance = 0;
      const pColor = teeColorKey(primaryTee.teeName);
      for (const secondaryTee of secondaryRows) {
        const sColor = teeColorKey(secondaryTee.teeName);
        let compared = 0;
        let parMismatch = 0;
        let siMismatch = 0;
        let yardageOut = 0;
        let yardageVar = 0;
        for (const sHole of secondaryTee.holes) {
          const pHole = pByHole.get(sHole.hole_number);
          if (!pHole) continue;
          compared += 1;
          if (sHole.par == null || pHole.par == null || sHole.par !== pHole.par) parMismatch += 1;
          if (
            sHole.stroke_index != null &&
            pHole.stroke_index != null &&
            sHole.stroke_index !== pHole.stroke_index
          ) {
            siMismatch += 1;
          }
          if (sHole.yardage != null && pHole.yardage != null && pHole.yardage > 0) {
            const pct = Math.abs(sHole.yardage - pHole.yardage) / pHole.yardage;
            if (pct > 0.05) yardageOut += 1;
            else if (pct > 0) yardageVar += 1;
          }
        }
        if (compared === 0) continue;
        const critical = parMismatch + siMismatch + yardageOut;
        const colorBonus = pColor != null && sColor != null && pColor === sColor ? 12 : 0;
        const score = compared * 2 + colorBonus - critical * 6 - yardageVar * 0.25;
        if (score > bestTeeScore) {
          bestTeeScore = score;
          bestCompared = compared;
          bestCritical = critical;
          bestVariance = yardageVar;
        }
      }
      if (bestCompared > 0) {
        totalCompared += bestCompared;
        totalCritical += bestCritical;
        totalVariance += bestVariance;
      }
    }
    const candidateTokens = [
      normalizeCourseKey(candidate.subCourseName ?? ""),
      ...(candidate.courseAlias ?? []).map((a) => normalizeCourseKey(a)),
      normalizeCourseKey(candidate.url.replace(/^https?:\/\//i, "").replace(/[-_/]+/g, " ")),
    ].filter(Boolean);
    const identityBonus = candidateTokens.some((token) => token.length > 0 && identity.includes(token)) ? 16 : 0;
    const candidateScore = totalCompared * 2 - totalCritical * 8 - totalVariance * 0.5 + identityBonus;
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      best = candidate;
    }
  }
  return best;
}

export async function resolvePriorityOfficialSource(params: {
  courseName: string;
  apiCourseIdentityName?: string;
  entries: PriorityCourseEntry[];
  secondaryRowsForScoring?: TeeSourceRows[];
}): Promise<PriorityOfficialAcquisitionResult> {
  const debugOfficialSource = String(process.env.COURSE_IMPORT_DEBUG_OFFICIAL_SOURCE ?? "false").toLowerCase() === "true";
  const debugEvents: OfficialSourceDebugEvent[] = [];
  const requestedKey = normalizeCourseKey(params.courseName);
  const debugTarget = debugOfficialSource && DEBUG_TARGET_COURSE_KEYS.has(requestedKey);
  const debugCtx: ParseDebugContext = {
    enabled: debugTarget,
    courseName: params.courseName,
    events: debugEvents,
  };
  const availableKeys = params.entries.map((e) => normalizeCourseKey(e.name));
  const selection = selectPriorityEntries({
    requestedName: params.courseName,
    apiCourseIdentityName: params.apiCourseIdentityName,
    entries: params.entries,
  });
  const matchedEntries = selection.entries;
  const primaryEntry = matchedEntries[0];
  if (debugTarget && primaryEntry) {
    console.log(
      `[course-import] Official source debug match: requested="${params.courseName}" identity="${params.apiCourseIdentityName ?? ""}" requestedKey="${requestedKey}" matchedName="${
        primaryEntry.name
      }" matchedSubCourse="${primaryEntry.subCourseName ?? ""}" matchedKey="${normalizeCourseKey(primaryEntry.name)}" officialScorecardUrl="${
        primaryEntry.officialScorecardUrl ?? ""
      }" officialUrlsLen=${primaryEntry.officialUrls?.length ?? 0} sourceType="${primaryEntry.sourceType ?? ""}" notes="${
        primaryEntry.notes ?? ""
      }" candidateEntries=${matchedEntries.length} subCourseMappingRequired=${selection.subCourseMappingRequired}`,
    );
  }
  if (debugTarget && matchedEntries.length === 0) {
    const shouldBePriority = DEFAULT_PRIORITY_COURSES.some((n) => normalizeCourseKey(n) === requestedKey);
    if (shouldBePriority) {
      console.log(
        `[course-import] Official source debug no_match_expected_priority: requested="${params.courseName}" requestedKey="${requestedKey}" availableKeys="${availableKeys.join(
          ",",
        )}"`,
      );
    }
  }
  const isPriority = matchedEntries.length > 0;
  if (!isPriority) {
    return {
      isPriority: false,
      officialSourceFound: false,
      parseSuccess: false,
      subCourseMappingRequired: false,
      selectedSubCourseName: null,
      sourceType: "unavailable",
      sourceUrl: null,
      attemptedQueries: [],
      attemptedUrls: [],
      primaryRows: null,
      fieldProvenance: null,
    };
  }

  const manual = await loadManualDataset();
  const manualRows = manualRowsForCourse(params.courseName, manual);
  if (manualRows && manualRows.length > 0) {
    const manualSourceUrl =
      manual?.courses.find((c) => normalizeCourseKey(c.courseName) === normalizeCourseKey(params.courseName))?.sourceUrl ?? null;
    return {
      isPriority: true,
      officialSourceFound: true,
      parseSuccess: true,
      subCourseMappingRequired: false,
      selectedSubCourseName: null,
      sourceType: "manual_dataset",
      sourceUrl: manualSourceUrl,
      attemptedQueries: [],
      attemptedUrls: [],
      primaryRows: manualRows,
      fieldProvenance: {
        par: { source_type: "manual_dataset", source_url: manualSourceUrl },
        yardage: { source_type: "manual_dataset", source_url: manualSourceUrl },
        stroke_index: { source_type: "manual_dataset", source_url: manualSourceUrl },
      },
    };
  }

  const queries = buildOfficialDiscoveryQueries(params.apiCourseIdentityName ?? params.courseName);
  let discovered: string[] = [];
  for (const query of queries) {
    try {
      discovered = [...discovered, ...(await fetchSearchResultsFromDuckDuckGo(query))];
    } catch {
      // best-effort discovery only
      debugEvents.push({ stage: "search_error", detail: query });
    }
  }
  const mergedCandidates = matchedEntries.flatMap((entry) => mergeAndNormalizeUrls(entry, discovered));
  const seenMerged = new Set<string>();
  const urlCandidates = mergedCandidates
    .filter((c) => {
    if (seenMerged.has(c.url)) return false;
    seenMerged.add(c.url);
    return true;
    })
    .slice(0, 12);
  const urls = urlCandidates.map((u) => u.url);
  const officialSourceFound = urls.length > 0;
  const attemptedUrls: string[] = [];
  const successfulParses: Array<{
    url: string;
    sourceType: "official_pdf" | "official_html" | "official_embedded";
    rows: TeeSourceRows[];
    subCourseName?: string;
    courseAlias?: string[];
  }> = [];
  for (const url of urls) {
    attemptedUrls.push(url);
    try {
      const parsed = await parseOfficialUrl(url, 0, new Set<string>(), debugEvents, debugCtx);
      if (parsed.rows && parsed.rows.length > 0) {
        successfulParses.push({
          url,
          sourceType: parsed.sourceType,
          rows: parsed.rows,
          subCourseName: urlCandidates.find((c) => c.url === url)?.subCourseName,
          courseAlias: urlCandidates.find((c) => c.url === url)?.courseAlias,
        });
      }
    } catch {
      // continue
      debugEvents.push({ stage: "parse_error", url });
    }
  }
  if (successfulParses.length > 0) {
    const selected =
      params.secondaryRowsForScoring && params.secondaryRowsForScoring.length > 0
        ? chooseBestOfficialRowsForSecondary(successfulParses, params.secondaryRowsForScoring, params.apiCourseIdentityName)
        : successfulParses[0] ?? null;
    if (selected) {
      if (debugTarget) {
        console.log(
          `[course-import] Official source debug ${params.courseName}: success url=${selected.url} attemptedUrlsCount=${attemptedUrls.length} parsedCandidates=${successfulParses.length} events=${debugEvents
            .map((e) => `${e.stage}:${e.url ?? ""}${e.detail ? `{${e.detail}}` : ""}`)
            .join(" | ")}`,
        );
      }
      return {
        isPriority: true,
        officialSourceFound: true,
        parseSuccess: true,
        subCourseMappingRequired: selection.subCourseMappingRequired,
        selectedSubCourseName: selected.subCourseName ?? null,
        sourceType: selected.sourceType,
        sourceUrl: selected.url,
        attemptedQueries: queries,
        attemptedUrls,
        primaryRows: selected.rows,
        fieldProvenance: {
          par: { source_type: selected.sourceType, source_url: selected.url },
          yardage: { source_type: selected.sourceType, source_url: selected.url },
          stroke_index: { source_type: selected.sourceType, source_url: selected.url },
        },
      };
    }
  }
  if (debugTarget) {
    console.log(
      `[course-import] Official source debug ${params.courseName}: no_parse queries=${queries.join(" ; ")} urlsCount=${urls.length} urls=${urls.join(" , ")} events=${debugEvents
        .map((e) => `${e.stage}:${e.url ?? ""}${e.detail ? `{${e.detail}}` : ""}`)
        .join(" | ")}`,
    );
  }
  return {
    isPriority: true,
    officialSourceFound,
    parseSuccess: false,
    subCourseMappingRequired: selection.subCourseMappingRequired,
    selectedSubCourseName: null,
    sourceType: "unavailable",
    sourceUrl: null,
    attemptedQueries: queries,
    attemptedUrls,
    primaryRows: null,
    fieldProvenance: null,
  };
}
