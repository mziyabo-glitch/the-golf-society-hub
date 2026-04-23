import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

export type ValidationBasis = "official_only" | "official_plus_secondary" | "dual_secondary_match" | "secondary_only";

export type PriorityCourseEntry = {
  name: string;
  officialUrls?: string[];
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
  const entries: PriorityCourseEntry[] = [];
  for (const name of DEFAULT_PRIORITY_COURSES) entries.push({ name });

  const envList = String(process.env.COURSE_IMPORT_PRIORITY_COURSES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const name of envList) entries.push({ name });

  const configPath = process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON?.trim();
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
        const r = row as { name?: unknown; officialUrls?: unknown };
        const name = typeof r.name === "string" ? r.name.trim() : "";
        if (!name) continue;
        const officialUrls = Array.isArray(r.officialUrls)
          ? r.officialUrls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u))
          : [];
        entries.push({ name, officialUrls: officialUrls.length > 0 ? officialUrls : undefined });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[course-import] Failed reading COURSE_IMPORT_PRIORITY_COURSES_JSON: ${msg}`);
    }
  }

  const byName = new Map<string, PriorityCourseEntry>();
  for (const row of entries) {
    const key = normalizeCourseKey(row.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...row });
      continue;
    }
    const mergedUrls = [...(existing.officialUrls ?? []), ...(row.officialUrls ?? [])];
    existing.officialUrls = [...new Set(mergedUrls)];
  }
  return [...byName.values()];
}

export function isPriorityCourseName(courseName: string, entries: PriorityCourseEntry[]): boolean {
  const key = normalizeCourseKey(courseName);
  return entries.some((e) => normalizeCourseKey(e.name) === key);
}

export function buildOfficialDiscoveryQueries(courseName: string): string[] {
  const n = courseName.trim();
  if (!n) return [];
  return [
    `${n} scorecard pdf`,
    `${n} hole by hole`,
    `${n} golf scorecard`,
    `${n} tee yardage stroke index`,
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
  return parseStructuredScorecardText($.text());
}

export async function parsePdfScorecard(pdfBuffer: Buffer): Promise<TeeSourceRows[]> {
  const parsed = await pdfParse(pdfBuffer);
  return parseStructuredScorecardText(parsed.text ?? "");
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

async function parseOfficialUrl(url: string): Promise<{
  rows: TeeSourceRows[] | null;
  sourceType: "official_pdf" | "official_html" | "official_embedded";
}> {
  if (/\.pdf(\?|$)/i.test(url)) {
    const pdfRes = await fetch(url, { signal: withTimeout(12000) });
    if (!pdfRes.ok) return { rows: null, sourceType: "official_pdf" };
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    const rows = await parsePdfScorecard(buf);
    return { rows: rows.length > 0 ? rows : null, sourceType: "official_pdf" };
  }
  const htmlRes = await fetch(url, { signal: withTimeout(12000) });
  if (!htmlRes.ok) return { rows: null, sourceType: "official_html" };
  const html = await htmlRes.text();
  const parsed = parseHtmlScorecard(html);
  if (parsed.length > 0) return { rows: parsed, sourceType: "official_html" };
  const $ = cheerio.load(html);
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
    const embeddedParsed = await parseOfficialUrl(emb);
    if (embeddedParsed.rows?.length) return { rows: embeddedParsed.rows, sourceType: "official_embedded" };
  }
  return { rows: null, sourceType: "official_html" };
}

async function loadManualDataset(): Promise<ManualScorecardDataset | null> {
  const manualPath = process.env.COURSE_IMPORT_MANUAL_SCORECARD_JSON?.trim();
  if (!manualPath) return null;
  try {
    const raw = await readFile(toAbsoluteIfNeeded(manualPath), "utf8");
    const parsed = JSON.parse(raw) as ManualScorecardDataset;
    if (!parsed || !Array.isArray(parsed.courses)) return null;
    return parsed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[course-import] Failed reading COURSE_IMPORT_MANUAL_SCORECARD_JSON: ${msg}`);
    return null;
  }
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

function mergeAndNormalizeUrls(explicit: string[] | undefined, discovered: string[]): string[] {
  return sortOfficialCandidates([...(explicit ?? []), ...discovered]);
}

export async function resolvePriorityOfficialSource(params: {
  courseName: string;
  entries: PriorityCourseEntry[];
}): Promise<PriorityOfficialAcquisitionResult> {
  const entry = params.entries.find((e) => normalizeCourseKey(e.name) === normalizeCourseKey(params.courseName));
  const isPriority = !!entry;
  if (!isPriority) {
    return {
      isPriority: false,
      officialSourceFound: false,
      parseSuccess: false,
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
    return {
      isPriority: true,
      officialSourceFound: true,
      parseSuccess: true,
      sourceType: "manual_dataset",
      sourceUrl:
        manual?.courses.find((c) => normalizeCourseKey(c.courseName) === normalizeCourseKey(params.courseName))?.sourceUrl ?? null,
      attemptedQueries: [],
      attemptedUrls: [],
      primaryRows: manualRows,
      fieldProvenance: {
        par: { source_type: "manual_dataset", source_url: null },
        yardage: { source_type: "manual_dataset", source_url: null },
        stroke_index: { source_type: "manual_dataset", source_url: null },
      },
    };
  }

  const queries = buildOfficialDiscoveryQueries(params.courseName);
  let discovered: string[] = [];
  for (const query of queries) {
    try {
      discovered = [...discovered, ...(await fetchSearchResultsFromDuckDuckGo(query))];
    } catch {
      // best-effort discovery only
    }
  }
  const urls = mergeAndNormalizeUrls(entry?.officialUrls, discovered).slice(0, 12);
  let officialSourceFound = urls.length > 0;
  const attemptedUrls: string[] = [];
  for (const url of urls) {
    attemptedUrls.push(url);
    try {
      const parsed = await parseOfficialUrl(url);
      if (parsed.rows && parsed.rows.length > 0) {
        return {
          isPriority: true,
          officialSourceFound: true,
          parseSuccess: true,
          sourceType: parsed.sourceType,
          sourceUrl: url,
          attemptedQueries: queries,
          attemptedUrls,
          primaryRows: parsed.rows,
          fieldProvenance: {
            par: { source_type: parsed.sourceType, source_url: url },
            yardage: { source_type: parsed.sourceType, source_url: url },
            stroke_index: { source_type: parsed.sourceType, source_url: url },
          },
        };
      }
    } catch {
      // continue
    }
  }
  return {
    isPriority: true,
    officialSourceFound,
    parseSuccess: false,
    sourceType: "unavailable",
    sourceUrl: null,
    attemptedQueries: queries,
    attemptedUrls,
    primaryRows: null,
    fieldProvenance: null,
  };
}
