/**
 * Single-event results PDF — standalone HTML → PDF file (expo-print on native; jsPDF on web).
 */

import { getEvent, getFormatSortOrder, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getEventResultsForSociety, type EventResultDoc } from "@/lib/db_supabase/resultsRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
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
  formatPdfDate,
} from "./pdfExportTheme";
import { printHtmlToPdfFileAsync } from "./printHtmlToPdfFile";
import { sharePdfAsync } from "./sharePdf";

function safePdfFilenamePart(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event";
}

export type EventResultsPdfResultRow = {
  position: number | null;
  playerName: string;
  playingHandicap: string | null;
  stableford: number | null;
  gross: number | null;
  net: number | null;
  oomPoints: number | null;
};

export type EventResultsPdfPayload = {
  societyName: string;
  logoUrl: string | null;
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  formatLabel: string;
  teeLabel: string | null;
  classificationLabel: string;
  isOrderOfMerit: boolean;
  formatKind: "stableford" | "strokeplay" | "medal";
  nearestPinHoles: number[];
  longestDriveHoles: number[];
  results: EventResultsPdfResultRow[];
  playerCount: number;
  highlights: {
    winnerNames: string;
    bestScoreLine: string | null;
    oomWinnerLine: string | null;
  };
  generatedAt: string;
};

function classificationLabel(ev: EventDoc): string {
  const c = ev.classification;
  if (!c) return "General";
  if (c === "oom") return "Order of Merit";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function formatLabel(ev: EventDoc): string {
  const f = ev.format || "stableford";
  const found = [
    { value: "stableford", label: "Stableford" },
    { value: "strokeplay_net", label: "Strokeplay (Net)" },
    { value: "strokeplay_gross", label: "Strokeplay (Gross)" },
    { value: "medal", label: "Medal" },
  ].find((x) => x.value === f);
  return found?.label ?? f.replace(/_/g, " ");
}

function normalizeFormatKind(ev: EventDoc): EventResultsPdfPayload["formatKind"] {
  const f = (ev.format || "").toLowerCase();
  if (f === "stableford") return "stableford";
  if (f === "medal") return "medal";
  return "strokeplay";
}

function memberName(m: MemberDoc | undefined, fallbackId: string): string {
  if (!m) return fallbackId;
  return (m.displayName || m.name || fallbackId).trim();
}

function playingHandicapLabel(m: MemberDoc | undefined): string | null {
  if (!m) return null;
  const v =
    (m as any).playing_handicap ??
    m.handicapIndex ??
    m.handicap_index ??
    null;
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v).toFixed(1);
}

/** Sort like the app: by position when present, else by sort order on day_value / points. */
function sortResultsRows(
  rows: EventResultDoc[],
  sortOrder: "high_wins" | "low_wins",
): EventResultDoc[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const pa = a.position ?? 999;
    const pb = b.position ?? 999;
    if (pa !== pb) return pa - pb;
    const da = a.day_value != null ? Number(a.day_value) : sortOrder === "high_wins" ? -1e9 : 1e9;
    const db = b.day_value != null ? Number(b.day_value) : sortOrder === "high_wins" ? -1e9 : 1e9;
    if (da !== db) return sortOrder === "high_wins" ? db - da : da - db;
    const oa = Number(a.points) || 0;
    const ob = Number(b.points) || 0;
    return ob - oa;
  });
  return copy;
}

export function buildEventResultsPdfHtml(p: EventResultsPdfPayload): string {
  const css = buildPremiumPdfCss();
  const logo = buildPdfLogoImg(p.logoUrl, p.societyName);

  const metaBits = [
    p.eventDate ? formatPdfDate(p.eventDate) : null,
    p.venue ? escapePdfHtml(p.venue) : null,
    escapePdfHtml(p.formatLabel),
    p.teeLabel ? `Tees: ${escapePdfHtml(p.teeLabel)}` : null,
  ].filter(Boolean);
  const metaLine = metaBits.join(" · ");

  const summaryStrip = `
    <div class="summary-strip block-avoid">
      <span><strong>Players</strong> ${p.playerCount}</span>
      <span><strong>Format</strong> ${escapePdfHtml(p.formatLabel)}</span>
      ${p.teeLabel ? `<span><strong>Tees</strong> ${escapePdfHtml(p.teeLabel)}</span>` : ""}
      <span><strong>OOM event</strong> ${p.isOrderOfMerit ? "Yes" : "No"}</span>
      <span><strong>Classification</strong> ${escapePdfHtml(p.classificationLabel)}</span>
    </div>`;

  const isStableford = p.formatKind === "stableford";

  const thead = isStableford
    ? `<tr>
      <th class="num">Pos</th>
      <th>Player</th>
      <th class="num">PH</th>
      <th class="num rt">Stableford</th>
      <th class="num rt">OOM</th>
    </tr>`
    : `<tr>
      <th class="num">Pos</th>
      <th>Player</th>
      <th class="num">PH</th>
      <th class="num rt">Gross</th>
      <th class="num rt">Net</th>
      <th class="num rt">OOM</th>
    </tr>`;

  const tbody = p.results
    .map((row, i) => {
      const pos =
        row.position === 1
          ? "🥇"
          : row.position === 2
            ? "🥈"
            : row.position === 3
              ? "🥉"
              : row.position != null
                ? String(row.position)
                : "–";
      const ph = row.playingHandicap ?? "—";
      const oom =
        row.oomPoints != null && row.oomPoints > 0
          ? formatPdfNumber(row.oomPoints)
          : p.isOrderOfMerit
            ? formatPdfNumber(row.oomPoints ?? 0)
            : "—";
      const alt = i % 2 === 1 ? "" : "";
      if (isStableford) {
        const sf = row.stableford != null ? formatPdfNumber(row.stableford) : "—";
        return `<tr class="${alt}">
        <td class="num">${pos}</td>
        <td>${escapePdfHtml(row.playerName)}</td>
        <td class="num">${escapePdfHtml(ph)}</td>
        <td class="num rt">${sf}</td>
        <td class="num rt">${oom}</td>
      </tr>`;
      }
      const gross = row.gross != null ? formatPdfNumber(row.gross) : "—";
      const net = row.net != null ? formatPdfNumber(row.net) : "—";
      return `<tr class="${alt}">
        <td class="num">${pos}</td>
        <td>${escapePdfHtml(row.playerName)}</td>
        <td class="num">${escapePdfHtml(ph)}</td>
        <td class="num rt">${gross}</td>
        <td class="num rt">${net}</td>
        <td class="num rt">${oom}</td>
      </tr>`;
    })
    .join("");

  const highlightLines = [
    p.highlights.winnerNames
      ? `<div class="line"><strong>Winner</strong> ${escapePdfHtml(p.highlights.winnerNames)}</div>`
      : "",
    p.highlights.bestScoreLine
      ? `<div class="line">${escapePdfHtml(p.highlights.bestScoreLine)}</div>`
      : "",
    p.highlights.oomWinnerLine
      ? `<div class="line">${escapePdfHtml(p.highlights.oomWinnerLine)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const winnersCard =
    highlightLines.length > 0
      ? `<div class="winners-card block-avoid"><div class="label">Round highlights</div>${highlightLines}</div>`
      : "";

  const ntp =
    p.nearestPinHoles?.length > 0
      ? p.nearestPinHoles.join(", ")
      : null;
  const ld =
    p.longestDriveHoles?.length > 0 ? p.longestDriveHoles.join(", ") : null;
  const compSection = `<div class="comp-block block-avoid">
    <h3>Competition holes</h3>
    <div>
      ${ntp ? `<strong>Nearest the pin:</strong> holes ${escapePdfHtml(ntp)}<br/>` : ""}
      ${ld ? `<strong>Longest drive:</strong> holes ${escapePdfHtml(ld)}` : ""}
      ${!ntp && !ld ? `<span style="color:#64748b">Not set for this event.</span>` : ""}
    </div>
  </div>`;

  const inner = `
  <header class="doc-header block-avoid">
    ${logo ? `<div class="doc-logo-wrap">${logo}</div>` : ""}
    <div class="doc-header-main">
      <div class="doc-brand-kicker">Produced by The Golf Society Hub</div>
      <h1 class="doc-title">Event Results</h1>
      <p class="doc-subtitle">${escapePdfHtml(p.eventName)}</p>
      <p class="doc-meta">${escapePdfHtml(p.societyName)}${metaLine ? `<br/>${metaLine}` : ""}</p>
      <p class="doc-meta">Generated ${escapePdfHtml(p.generatedAt)}</p>
    </div>
  </header>

  ${summaryStrip}

  ${winnersCard}

  <div class="table-wrap">
    <table class="sheet">
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>

  ${compSection}

  <footer class="doc-footer">
    <span class="brand">The Golf Society Hub</span><br />
    ${escapePdfHtml(p.generatedAt)}
  </footer>`;

  return buildPdfDocumentShell({
    title: `Event Results — ${p.eventName}`,
    css,
    bodyInnerHtml: inner,
  });
}

export async function buildEventResultsPdfPayload(
  eventId: string,
  societyId: string,
): Promise<EventResultsPdfPayload> {
  const [event, society, rawResults, members] = await Promise.all([
    getEvent(eventId),
    getSociety(societyId),
    getEventResultsForSociety(eventId, societyId),
    getMembersBySocietyId(societyId),
  ]);

  if (!event) throw new Error("Event not found");

  const memberById = new Map(members.map((m) => [m.id, m]));
  const sortOrder = getFormatSortOrder(event.format);
  const sorted = sortResultsRows(rawResults as EventResultDoc[], sortOrder);
  const fmtKind = normalizeFormatKind(event);
  const isStableford = fmtKind === "stableford";

  const isOomEvent = !!(event.isOOM || event.classification === "oom");

  const results: EventResultsPdfResultRow[] = sorted.map((r) => {
    const m = memberById.get(r.member_id);
    const dv =
      r.day_value != null && !Number.isNaN(Number(r.day_value)) ? Number(r.day_value) : null;
    const pts = Number(r.points) || 0;
    let stableford: number | null = null;
    let gross: number | null = null;
    let net: number | null = null;
    if (isStableford) stableford = dv;
    else if (event.format === "strokeplay_gross") gross = dv;
    else net = dv;
    return {
      position: r.position ?? null,
      playerName: memberName(m, r.member_id),
      playingHandicap: playingHandicapLabel(m),
      stableford,
      gross,
      net,
      oomPoints: isOomEvent ? pts : null,
    };
  });

  const winners = results.filter((x) => x.position === 1);
  const winnerNames = winners.map((w) => w.playerName).join(", ");

  let bestScoreLine: string | null = null;
  if (results.length > 0) {
    if (isStableford) {
      const top = results.reduce(
        (a, b) => ((a.stableford ?? -999) >= (b.stableford ?? -999) ? a : b),
        results[0],
      );
      if (top.stableford != null) {
        bestScoreLine = `Best stableford: ${formatPdfNumber(top.stableford)} pts (${top.playerName})`;
      }
    } else if (event.format === "strokeplay_gross") {
      const top = results.reduce(
        (a, b) => ((a.gross ?? 999) <= (b.gross ?? 999) ? a : b),
        results[0],
      );
      if (top.gross != null) {
        bestScoreLine = `Best gross: ${formatPdfNumber(top.gross)} (${top.playerName})`;
      }
    } else {
      const top = results.reduce((a, b) => ((a.net ?? 999) <= (b.net ?? 999) ? a : b), results[0]);
      if (top.net != null) {
        bestScoreLine = `Best net: ${formatPdfNumber(top.net)} (${top.playerName})`;
      }
    }
  }

  let oomWinnerLine: string | null = null;
  if (event.isOOM || event.classification === "oom") {
    const topOom = results.reduce(
      (a, b) => ((a.oomPoints ?? 0) >= (b.oomPoints ?? 0) ? a : b),
      results[0],
    );
    if (topOom && (topOom.oomPoints ?? 0) > 0) {
      oomWinnerLine = `OOM points leader this event: ${formatPdfNumber(topOom.oomPoints ?? 0)} pts (${topOom.playerName})`;
    }
  }

  const rawLogoUrl = getSocietyLogoUrl(society);
  const logoDataUri = rawLogoUrl
    ? await getSocietyLogoDataUri(societyId, { logoUrl: rawLogoUrl })
    : null;
  const logoSrc = logoDataUri ?? rawLogoUrl;

  const teeLabel = event.teeName?.trim() || event.ladiesTeeName?.trim() || null;

  return {
    societyName: society?.name || "Golf Society",
    logoUrl: logoSrc,
    eventName: event.name || "Event",
    eventDate: event.date ?? null,
    venue: event.courseName?.trim() || null,
    formatLabel: formatLabel(event),
    teeLabel,
    classificationLabel: classificationLabel(event),
    isOrderOfMerit: !!(event.isOOM || event.classification === "oom"),
    formatKind: fmtKind,
    nearestPinHoles: event.nearestPinHoles ?? [],
    longestDriveHoles: event.longestDriveHoles ?? [],
    results,
    playerCount: results.length,
    highlights: {
      winnerNames,
      bestScoreLine,
      oomWinnerLine,
    },
    generatedAt: formatPdfGenerationTimestamp(),
  };
}

export async function exportEventResultsPdf(eventId: string, societyId: string): Promise<void> {
  assertNoPrintAsync();
  validateInputs({ societyId, eventId });

  const payload = await buildEventResultsPdfPayload(eventId, societyId);
  if (payload.results.length === 0) {
    throw new Error("No saved results to export for this society.");
  }

  const html = buildEventResultsPdfHtml(payload);
  const { uri } = await printHtmlToPdfFileAsync({ html, base64: false });
  await sharePdfAsync({
    uri,
    mimeType: "application/pdf",
    dialogTitle: "Event results",
    filename: `event-results-${safePdfFilenamePart(payload.eventName)}`,
  });
}
