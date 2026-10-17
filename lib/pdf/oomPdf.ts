/**
 * Order of Merit PDF exports — standalone HTML → PDF file (expo-print on native; jsPDF on web).
 */

import {
  getOrderOfMeritLog,
  getOrderOfMeritFullFieldExport,
  type OomFullFieldStandingRow,
  type OomLeaderPodiumSlot,
} from "@/lib/db_supabase/resultsRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { assertNoPrintAsync, validateInputs } from "./exportContract";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";
import {
  buildPdfDocumentShell,
  buildPremiumPdfCss,
  buildPdfLogoImg,
  escapePdfHtml,
  formatPdfGenerationTimestamp,
  formatPdfNumber,
  formatPdfDateShort,
} from "./pdfExportTheme";
import { printHtmlToPdfFileAsync } from "./printHtmlToPdfFile";
import { sharePdfAsync } from "./sharePdf";

// --- Public payload types -------------------------------------------------

export type OrderOfMeritPdfPayload = {
  societyName: string;
  logoUrl: string | null;
  seasonYear: number;
  seasonSubtitle: string;
  oomEventCount: number;
  leadersTop3: OomLeaderPodiumSlot[];
  standings: OomFullFieldStandingRow[];
  generatedAt: string;
  totalMembers: number;
  membersWithPoints: number;
};

export type OomMatrixEventBlock = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  format: string | null;
  results: Array<{
    memberName: string;
    points: number;
    dayValue: number | null;
    position: number | null;
  }>;
};

export type OomMatrixPdfPayload = {
  societyName: string;
  logoUrl: string | null;
  seasonYear: number;
  seasonSubtitle: string;
  events: OomMatrixEventBlock[];
  generatedAt: string;
};

/**
 * Order of Merit PDF — strict print mode: minimal header, dense table, natural page breaks.
 * No logo, cards, or decorative chrome. `seasonSubtitle` already includes season + event count;
 * do not append `oomEventCount` again (avoids "1 event · 1 event").
 */
export function buildOrderOfMeritPdfHtml(p: OrderOfMeritPdfPayload): string {
  const uniqueRows = p.standings.filter((row, idx, arr) => {
    const id = String(row.memberId);
    return arr.findIndex((item) => String(item.memberId) === id) === idx;
  });

  const css = `
@page {
  size: A4 portrait;
  margin: 7mm 9mm;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 100%;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  line-height: 1.2;
  color: #111;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.pdf-root.doc {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

.print-header {
  margin: 0 0 4px 0;
  padding: 0;
}

.print-header .title {
  font-size: 13px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
  color: #111;
}

.print-header .meta {
  font-size: 9px;
  color: #555;
  margin: 0;
  line-height: 1.2;
}

.print-header .meta + .meta {
  margin-top: 1px;
}

.standings {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10px;
  line-height: 1.2;
}

.standings thead {
  display: table-header-group;
}

.standings tbody tr {
  page-break-inside: auto;
  break-inside: auto;
}

.standings th,
.standings td {
  min-width: 0;
  padding: 3px;
  border-bottom: 1px solid #ccc;
  vertical-align: middle;
  line-height: 1.2;
}

.standings thead th {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  color: #444;
  border-bottom: 1px solid #999;
}

.standings .c-pos {
  width: 10%;
  text-align: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.standings .c-player {
  width: 58%;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standings .c-ev {
  width: 12%;
  text-align: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.standings .c-pts {
  width: 20%;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.standings tbody td.c-pts.muted {
  color: #666;
}

.footer {
  margin-top: 4px;
  font-size: 9px;
  color: #666;
  line-height: 1.2;
}
`;

  const line2 = `${escapePdfHtml(p.societyName)} · ${p.seasonYear}`;
  const line3 = `${escapePdfHtml(p.seasonSubtitle)} · Generated ${escapePdfHtml(p.generatedAt)}`;

  const footerLine = `${p.totalMembers} members · ${p.membersWithPoints} with OOM points · Generated ${escapePdfHtml(p.generatedAt)}`;
  const rowsHtml = uniqueRows
    .map((row) => {
      const pos = row.rank;
      const pts =
        row.totalPoints > 0 || row.hasOomPoints
          ? formatPdfNumber(row.totalPoints)
          : "—";
      const ptsClass =
        !row.hasOomPoints && row.totalPoints === 0 ? "c-pts muted" : "c-pts";
      return `<tr>
        <td class="c-pos">${pos}</td>
        <td class="c-player">${escapePdfHtml(row.memberName)}</td>
        <td class="c-ev">${row.eventsPlayed}</td>
        <td class="${ptsClass}">${pts}</td>
      </tr>`;
    })
    .join("");

  const inner = `
<div class="print-header">
  <div class="title">Order of Merit</div>
  <div class="meta">${line2}</div>
  <div class="meta">${line3}</div>
</div>
<table class="standings">
  <thead>
    <tr>
      <th class="c-pos" style="width:10%">Pos</th>
      <th class="c-player" style="width:58%">Player</th>
      <th class="c-ev" style="width:12%">Ev</th>
      <th class="c-pts" style="width:20%">Pts</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<p class="footer">${footerLine}</p>`;

  return buildPdfDocumentShell({
    title: `Order of Merit — ${p.societyName}`,
    css,
    bodyInnerHtml: inner,
  });
}

/** Per-event matrix (results log) — premium layout. */
export function buildOomMatrixPdfHtml(p: OomMatrixPdfPayload): string {
  const css = buildPremiumPdfCss(`
    .matrix-event { page-break-inside: avoid; break-inside: avoid; margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: visible; }
    .matrix-event-head { padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .matrix-event-title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .matrix-event-meta { font-size: 11px; color: #475569; margin-top: 4px; }
  `);

  const logo = buildPdfLogoImg(p.logoUrl, p.societyName);
  const blocks =
    p.events.length === 0
      ? `<div class="empty-msg">No saved results yet.</div>`
      : p.events
          .map((ev) => {
            const dateStr = ev.eventDate ? formatPdfDateShort(ev.eventDate) : "Date TBC";
            const fmt = ev.format
              ? ev.format.charAt(0).toUpperCase() + ev.format.slice(1).replace(/_/g, " ")
              : "";
            const body = ev.results
              .map((row) => {
                const posDisp =
                  row.position === 1
                    ? "🥇"
                    : row.position === 2
                      ? "🥈"
                      : row.position === 3
                        ? "🥉"
                        : row.position != null
                          ? String(row.position)
                          : "–";
                const scr =
                  row.dayValue != null && row.dayValue !== ("" as unknown)
                    ? String(row.dayValue)
                    : "–";
                return `<tr>
              <td class="num">${posDisp}</td>
              <td>${escapePdfHtml(row.memberName)}</td>
              <td class="num">${scr}</td>
              <td class="num rt">${formatPdfNumber(row.points)}</td>
            </tr>`;
              })
              .join("");
            return `<div class="matrix-event">
            <div class="matrix-event-head">
              <div class="matrix-event-title">${escapePdfHtml(ev.eventName)}</div>
              <div class="matrix-event-meta">${escapePdfHtml(dateStr)}${fmt ? ` · ${escapePdfHtml(fmt)}` : ""}</div>
            </div>
            <table class="sheet"><thead><tr>
              <th class="num">Pos</th><th>Player</th><th class="num">Score</th><th class="num rt">OOM</th>
            </tr></thead><tbody>${body}</tbody></table>
          </div>`;
          })
          .join("");

  const inner = `
  <header class="doc-header block-avoid">
    ${logo ? `<div class="doc-logo-wrap">${logo}</div>` : ""}
    <div class="doc-header-main">
      <div class="doc-brand-kicker">Produced by The Golf Society Hub</div>
      <h1 class="doc-title">Order of Merit</h1>
      <p class="doc-subtitle">Results matrix · ${escapePdfHtml(p.societyName)} · ${p.seasonYear}</p>
      <p class="doc-meta">${escapePdfHtml(p.seasonSubtitle)} · Generated ${escapePdfHtml(p.generatedAt)}</p>
    </div>
  </header>
  <p class="doc-meta" style="margin:0 0 12px;">Per-event scores and OOM points for your society.</p>
  ${blocks}
  <footer class="doc-footer">
    <span class="brand">The Golf Society Hub</span><br />
    ${escapePdfHtml(p.generatedAt)}
  </footer>`;

  return buildPdfDocumentShell({
    title: `OOM Results — ${p.societyName}`,
    css,
    bodyInnerHtml: inner,
  });
}

export async function exportOomPdf(societyId: string): Promise<void> {
  assertNoPrintAsync();
  validateInputs({ societyId });

  const [society, fullField, log] = await Promise.all([
    getSociety(societyId),
    getOrderOfMeritFullFieldExport(societyId),
    getOrderOfMeritLog(societyId),
  ]);

  const rawLogoUrl = getSocietyLogoUrl(society);
  const logoDataUri = rawLogoUrl
    ? await getSocietyLogoDataUri(societyId, { logoUrl: rawLogoUrl })
    : null;
  const logoSrc = logoDataUri ?? rawLogoUrl;

  const year = new Date().getFullYear();
  const eventCount = new Set(log.map((e) => e.eventId)).size;
  const seasonSubtitle = `${year} Season${eventCount ? ` · ${eventCount} event${eventCount !== 1 ? "s" : ""}` : ""}`;

  const membersWithPoints = fullField.standings.filter((s) => s.hasOomPoints).length;

  const html = buildOrderOfMeritPdfHtml({
    societyName: society?.name || "Golf Society",
    logoUrl: logoSrc,
    seasonYear: year,
    seasonSubtitle,
    oomEventCount: fullField.oomEventCount,
    leadersTop3: fullField.leadersTop3,
    standings: fullField.standings,
    generatedAt: formatPdfGenerationTimestamp(),
    totalMembers: fullField.standings.length,
    membersWithPoints,
  });

  const { uri } = await printHtmlToPdfFileAsync({ html, base64: false });
  await sharePdfAsync({
    uri,
    mimeType: "application/pdf",
    dialogTitle: "Order of Merit",
    filename: "order-of-merit",
  });
}

export async function exportOomResultsLogPdf(societyId: string): Promise<void> {
  assertNoPrintAsync();
  validateInputs({ societyId });

  const [society, log] = await Promise.all([getSociety(societyId), getOrderOfMeritLog(societyId)]);

  const grouped: OomMatrixEventBlock[] = [];
  let currentEventId: string | null = null;

  for (const entry of log) {
    if (entry.eventId !== currentEventId) {
      grouped.push({
        eventId: entry.eventId,
        eventName: entry.eventName,
        eventDate: entry.eventDate,
        format: entry.format,
        results: [],
      });
      currentEventId = entry.eventId;
    }
    grouped[grouped.length - 1].results.push({
      memberName: entry.memberName,
      points: entry.points,
      dayValue: entry.dayValue,
      position: entry.position,
    });
  }

  const rawLogoUrl = getSocietyLogoUrl(society);
  const logoDataUri = rawLogoUrl
    ? await getSocietyLogoDataUri(societyId, { logoUrl: rawLogoUrl })
    : null;
  const logoSrc = logoDataUri ?? rawLogoUrl;

  const year = new Date().getFullYear();
  const eventCount = grouped.length;
  const seasonSubtitle = `${year} Season${eventCount ? ` · ${eventCount} event${eventCount !== 1 ? "s" : ""} with results` : ""}`;

  const html = buildOomMatrixPdfHtml({
    societyName: society?.name || "Golf Society",
    logoUrl: logoSrc,
    seasonYear: year,
    seasonSubtitle,
    events: grouped,
    generatedAt: formatPdfGenerationTimestamp(),
  });

  const { uri } = await printHtmlToPdfFileAsync({ html, base64: false });
  await sharePdfAsync({
    uri,
    mimeType: "application/pdf",
    dialogTitle: "Order of Merit — Results matrix",
    filename: "oom-results-matrix",
  });
}

/** @deprecated Prefer server-shaped log entries; kept for any legacy callers building win counts. */
export function buildWinsMap(
  log: Array<{ eventId: string; memberId: string; points: number; position: number | null }>,
): Map<string, number> {
  const wins = new Map<string, number>();
  const grouped = new Map<string, typeof log>();
  for (const entry of log) {
    if (!grouped.has(entry.eventId)) grouped.set(entry.eventId, []);
    grouped.get(entry.eventId)!.push(entry);
  }
  grouped.forEach((entries) => {
    if (entries.length === 0) return;
    const hasPositions = entries.some((e) => e.position === 1);
    let winners: typeof entries = [];
    if (hasPositions) winners = entries.filter((e) => e.position === 1);
    else {
      const maxPoints = Math.max(...entries.map((e) => e.points || 0));
      winners = entries.filter((e) => e.points === maxPoints);
    }
    winners.forEach((entry) => {
      wins.set(entry.memberId, (wins.get(entry.memberId) || 0) + 1);
    });
  });
  return wins;
}

export function buildPlayedMap(
  log: Array<{ eventId: string; memberId: string; points: number }>,
): Map<string, number> {
  const played = new Map<string, Set<string>>();
  for (const entry of log) {
    if (entry.points <= 0) continue;
    if (!played.has(entry.memberId)) played.set(entry.memberId, new Set());
    played.get(entry.memberId)!.add(entry.eventId);
  }
  const counts = new Map<string, number>();
  played.forEach((set, memberId) => {
    counts.set(memberId, set.size);
  });
  return counts;
}
