import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { getOrderOfMeritTotals, getOrderOfMeritLog } from "@/lib/db_supabase/resultsRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";

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

export function buildOomPdfHtml(options: OomPdfOptions): string {
  const { societyName, logoUrl, seasonYear, rows } = options;

  const rowHtml = rows
    .map((row) => {
      const memberLabel = row.handicapLabel
        ? `${escapeHtml(row.memberName)} (HCP: ${escapeHtml(row.handicapLabel)})`
        : escapeHtml(row.memberName);

      return `
        <tr>
          <td class="pos">${row.position}</td>
          <td class="member">${memberLabel}</td>
          <td class="num">${formatPoints(row.points)}</td>
          <td class="num">${row.wins}</td>
          <td class="num">${row.played}</td>
        </tr>
      `;
    })
    .join("");

  const logoHtml = logoUrl
    ? `<img class="logo" src="${escapeAttribute(logoUrl)}" alt="Society logo" />`
    : "";

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #111827;
          background: #ffffff;
        }
        .page {
          max-width: 794px;
          margin: 0 auto;
        }
        .logo {
          display: block;
          width: 72px;
          height: 72px;
          object-fit: contain;
          margin: 0 auto 12px;
        }
        h1 {
          margin: 0;
          text-align: center;
          font-size: 26px;
          color: #0B6E4F;
        }
        .subtitle {
          text-align: center;
          color: #6B7280;
          margin-top: 6px;
          margin-bottom: 20px;
          font-size: 13px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #E5E7EB;
        }
        th {
          background: #0B6E4F;
          color: #ffffff;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          font-size: 11px;
          padding: 10px 8px;
          text-align: left;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #E5E7EB;
          font-size: 12.5px;
          vertical-align: top;
        }
        td.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        td.pos {
          width: 50px;
        }
        td.member {
          width: 50%;
        }
        .footer {
          text-align: center;
          margin-top: 18px;
          color: #9CA3AF;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="page">
        ${logoHtml}
        <h1>Order of Merit</h1>
        <div class="subtitle">${escapeHtml(societyName)} – ${seasonYear}</div>
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Member</th>
              <th style="text-align:right;">Points</th>
              <th style="text-align:right;">Wins</th>
              <th style="text-align:right;">Played</th>
            </tr>
          </thead>
          <tbody>
            ${rowHtml || ""}
          </tbody>
        </table>
        <div class="footer">Produced by The Golf Society Hub</div>
      </div>
    </body>
  </html>`;
}

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

  const filtered = totals.filter((entry) => entry.totalPoints > 0);
  const sorted = filtered.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const winsDiff = (winsMap.get(b.memberId) || 0) - (winsMap.get(a.memberId) || 0);
    if (winsDiff !== 0) return winsDiff;
    return a.memberName.localeCompare(b.memberName);
  });

  let currentPos = 1;
  let lastPoints: number | null = null;

  const rows: OomPdfRow[] = sorted.map((entry, index) => {
    if (lastPoints !== null && entry.totalPoints < lastPoints) {
      currentPos = index + 1;
    }
    lastPoints = entry.totalPoints;

    const member = memberMap.get(entry.memberId);
    const handicapValue =
      member?.handicapIndex ?? member?.handicap_index ?? null;
    const handicapLabel =
      handicapValue != null ? handicapValue.toFixed(1) : null;

    return {
      position: currentPos,
      memberName: entry.memberName,
      handicapLabel,
      points: entry.totalPoints,
      wins: winsMap.get(entry.memberId) || 0,
      played: playedMap.get(entry.memberId) || 0,
    };
  });

  const html = buildOomPdfHtml({
    societyName: society?.name || "Golf Society",
    logoUrl: (society as any)?.logo_url || (society as any)?.logoUrl || null,
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

function formatPoints(points: number): string {
  if (points === Math.floor(points)) return points.toString();
  return points.toFixed(1);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/"/g, "&quot;");
}
