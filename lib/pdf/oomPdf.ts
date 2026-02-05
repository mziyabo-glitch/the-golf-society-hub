import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { getOrderOfMeritTotals, getOrderOfMeritLog } from "@/lib/db_supabase/resultsRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";
import { imageUrlToBase64DataUri } from "./imageUtils";

type OomPdfRow = {
  position: number;
  memberName: string;
  handicapLabel: string | null;
  points: number;
  wins: number;
  played: number;
};

type OomPdfOptions = {
  societyName: string;
  logoUrl: string | null;
  seasonYear: number;
  rows: OomPdfRow[];
};

/**
 * Build clean HTML for OOM PDF export.
 * Layout: centered logo, title "Order of Merit", subtitle "<SocietyName> – <SeasonYear>",
 * then a table with columns: Pos | Member | Points | Wins | Played
 */
export function buildOomPdfHtml(options: OomPdfOptions): string {
  const { societyName, logoUrl, seasonYear, rows } = options;

  const rowHtml = rows
    .map((row) => {
      const memberLabel = row.handicapLabel
        ? `${escapeHtml(row.memberName)} (HCP: ${escapeHtml(row.handicapLabel)})`
        : escapeHtml(row.memberName);

      // Medal emoji for top 3, plain number for rest
      const posDisplay =
        row.position === 1
          ? '<span class="medal">&#x1F947;</span>'
          : row.position === 2
            ? '<span class="medal">&#x1F948;</span>'
            : row.position === 3
              ? '<span class="medal">&#x1F949;</span>'
              : `${row.position}`;

      const top3Class = row.position <= 3 ? " top3" : "";

      return `
        <tr class="${top3Class}">
          <td class="num">${posDisplay}</td>
          <td class="member">${memberLabel}</td>
          <td class="num bold">${formatPoints(row.points)}</td>
          <td class="num">${row.wins}</td>
          <td class="num">${row.played}</td>
        </tr>`;
    })
    .join("");

  const logoHtml = logoUrl
    ? `<img class="logo" src="${escapeAttribute(logoUrl)}" />`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color:#111; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .logo { width: 56px; height: 56px; object-fit: contain; display:block; margin: 0 auto 8px; }
  h1 { text-align:center; margin: 6px 0 2px; font-size: 20px; }
  .sub { text-align:center; color:#444; margin: 0 0 16px; font-size: 12px; }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th { background:#0f6b4a; color:#fff; text-align:left; padding:8px; border:1px solid #0b4f37; }
  th.num { text-align:center; }
  td { padding:8px; border:1px solid #d6d6d6; vertical-align: top; }
  .num { text-align:center; width:64px; }
  .bold { font-weight:700; }
  .member { width:auto; }
  .medal { font-size:18px; }
  tr.top3 { background:#FFFBEB; }
  tr.top3 td.member { font-weight:600; }
  .footer { text-align:center; margin-top: 24px; padding-top: 12px; border-top:1px solid #e5e7eb; font-size: 11px; color:#9ca3af; font-style:italic; }
</style>
</head>
<body>
  <div class="wrap">
    ${logoHtml}
    <h1>Order of Merit</h1>
    <div class="sub">${escapeHtml(societyName)} – ${seasonYear}</div>

    <table>
      <thead>
        <tr>
          <th class="num">Pos</th>
          <th class="member">Member</th>
          <th class="num">Points</th>
          <th class="num">Wins</th>
          <th class="num">Played</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml}
      </tbody>
    </table>

    <div class="footer">Produced by The Golf Society Hub</div>
  </div>
</body>
</html>`;
}

/**
 * Export OOM leaderboard as a clean PDF.
 * Uses expo-print HTML -> Print.printToFileAsync and Sharing.shareAsync.
 * PDF contains only the document (no tabs, no app chrome).
 */
export async function exportOomPdf(societyId: string): Promise<void> {
  if (!societyId) {
    throw new Error("Missing society ID.");
  }

  const [society, totals, log, members] = await Promise.all([
    getSociety(societyId),
    getOrderOfMeritTotals(societyId),
    getOrderOfMeritLog(societyId),
    getMembersBySocietyId(societyId),
  ]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const winsMap = buildWinsMap(log);
  const playedMap = buildPlayedMap(log);

  // Filter to members with >0 points
  const filtered = totals.filter((entry) => entry.totalPoints > 0);

  // Sort by Points desc, then Wins desc, then name asc
  const sorted = filtered.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const winsA = winsMap.get(a.memberId) || 0;
    const winsB = winsMap.get(b.memberId) || 0;
    if (winsB !== winsA) return winsB - winsA;
    return a.memberName.localeCompare(b.memberName);
  });

  // Assign positions with tie handling (same points = same position)
  let currentPos = 1;
  let lastPoints: number | null = null;

  const rows: OomPdfRow[] = sorted.map((entry, index) => {
    if (lastPoints !== null && entry.totalPoints < lastPoints) {
      currentPos = index + 1;
    }
    lastPoints = entry.totalPoints;

    const member = memberMap.get(entry.memberId);
    // Use playing_handicap or handicap_index (whichever exists)
    const handicapValue =
      (member as any)?.playing_handicap ??
      member?.handicapIndex ??
      member?.handicap_index ??
      null;
    const handicapLabel =
      handicapValue != null ? Number(handicapValue).toFixed(1) : null;

    return {
      position: currentPos,
      memberName: entry.memberName,
      handicapLabel,
      points: entry.totalPoints,
      wins: winsMap.get(entry.memberId) || 0,
      played: playedMap.get(entry.memberId) || 0,
    };
  });

  // Convert remote logo URL to base64 data URI so expo-print can embed it
  const rawLogoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;
  const logoDataUri = rawLogoUrl ? await imageUrlToBase64DataUri(rawLogoUrl) : null;

  const html = buildOomPdfHtml({
    societyName: society?.name || "Golf Society",
    logoUrl: logoDataUri,
    seasonYear: new Date().getFullYear(),
    rows,
  });

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Order of Merit",
  });
}

/**
 * Build a map of memberId -> number of wins.
 * A "win" is when a player finished position 1 or had the highest points in an event.
 */
function buildWinsMap(log: Array<{
  eventId: string;
  memberId: string;
  points: number;
  position: number | null;
}>): Map<string, number> {
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

    if (hasPositions) {
      winners = entries.filter((e) => e.position === 1);
    } else {
      const maxPoints = Math.max(...entries.map((e) => e.points || 0));
      winners = entries.filter((e) => e.points === maxPoints);
    }

    winners.forEach((entry) => {
      wins.set(entry.memberId, (wins.get(entry.memberId) || 0) + 1);
    });
  });

  return wins;
}

/**
 * Build a map of memberId -> number of events played.
 * Only counts events where the player has OOM points > 0.
 */
function buildPlayedMap(log: Array<{
  eventId: string;
  memberId: string;
  points: number;
}>): Map<string, number> {
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

/**
 * Format points for display - show decimal only if not a whole number.
 */
function formatPoints(points: number): string {
  if (points === Math.floor(points)) return points.toString();
  return points.toFixed(1);
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape string for use in HTML attributes.
 */
function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/"/g, "&quot;");
}
