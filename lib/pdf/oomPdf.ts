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

/** Print-safe OOM report: compact header, dense table, one-line footer (no podium / UI chrome). */
export function buildOrderOfMeritPdfHtml(p: OrderOfMeritPdfPayload): string {
  const css = `
@page {
  size: A4 portrait;
  margin: 10mm;
}

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  margin: 0;
  padding: 0;
  font-size: 10.5px;
  color: #111;
}

.header {
  margin-bottom: 6px;
}

.title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
}

.meta {
  font-size: 9px;
  color: #555;
  margin: 2px 0 0 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th, td {
  border-bottom: 1px solid #ddd;
  padding: 4px 4px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

th {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  color: #666;
}

td.num {
  text-align: right;
}

td.pos {
  width: 8%;
}

td.player {
  width: 60%;
}

td.events {
  width: 12%;
}

td.points {
  width: 20%;
}

.footer {
  margin-top: 6px;
  font-size: 9px;
  color: #666;
}
`;

  const line2 = `${escapePdfHtml(p.societyName)} · ${p.seasonYear}`;
  const eventBit =
    p.oomEventCount > 0
      ? `${p.oomEventCount} event${p.oomEventCount !== 1 ? "s" : ""}`
      : "0 events";
  const line3 = `${escapePdfHtml(p.seasonSubtitle)} · ${eventBit} · Generated ${escapePdfHtml(p.generatedAt)}`;

  const footerLine = `${p.totalMembers} members · ${p.membersWithPoints} with OOM points · Generated ${escapePdfHtml(p.generatedAt)}`;

  const seenMember = new Set<string>();
  const rowsHtml = p.standings
    .filter((row) => {
      const id = String(row.memberId);
      if (seenMember.has(id)) return false;
      seenMember.add(id);
      return true;
    })
    .map((row) => {
      const pos = row.rank;
      const pts =
        row.totalPoints > 0 || row.hasOomPoints
          ? formatPdfNumber(row.totalPoints)
          : "—";
      return `<tr>
        <td class="pos">${pos}</td>
        <td class="player">${escapePdfHtml(row.memberName)}</td>
        <td class="events num">${row.eventsPlayed}</td>
        <td class="points num">${pts}</td>
      </tr>`;
    })
    .join("");

  const inner = `
<div class="header">
  <h1 class="title">Order of Merit</h1>
  <p class="meta">${line2}</p>
  <p class="meta">${line3}</p>
</div>
<table>
  <colgroup>
    <col style="width:8%" />
    <col style="width:60%" />
    <col style="width:12%" />
    <col style="width:20%" />
  </colgroup>
  <thead>
    <tr>
      <th>Pos</th>
      <th>Player</th>
      <th>Events</th>
      <th>Points</th>
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
