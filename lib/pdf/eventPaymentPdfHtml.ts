/**
 * Pure HTML builder for event payment PDF/PNG export (no React Native imports).
 */

import type { PaymentShareExportRow } from "@/lib/eventPaymentShare";
import {
  buildPdfDocumentShell,
  escapePdfAttr,
  escapePdfHtml,
  formatPdfDate,
} from "./pdfExportTheme";

export type EventPaymentPdfPayload = {
  societyName: string;
  logoUrl: string | null;
  eventName: string;
  eventDate: string | null;
  paidNames: string[];
  unpaidNames: string[];
  generatedAt: string;
  jointThisSocietyNote: string | null;
  paidEntries?: { name: string; type: "member" | "guest"; typeLabel?: string }[];
  unpaidEntries?: { name: string; type: "member" | "guest"; typeLabel?: string }[];
  /** Joint events: one row per de-duped person with society source + payment labels. */
  exportRows?: PaymentShareExportRow[];
};

export function buildEventPaymentPdfHtml(p: EventPaymentPdfPayload): string {
  const dateLine = p.eventDate ? formatPdfDate(p.eventDate) : "—";

  type TableRow = {
    name: string;
    typeLabel: string;
    statusLabel: string;
    statusClass: "status-paid" | "status-unpaid";
  };

  let rows: TableRow[];
  let paidCount: number;
  let unpaidCount: number;
  let guestCount: number;

  if (p.exportRows && p.exportRows.length > 0) {
    rows = p.exportRows.map((row) => {
      const allPaid = row.statusLabel === "Paid";
      const statusClass: TableRow["statusClass"] = allPaid ? "status-paid" : "status-unpaid";
      return {
        name: row.name,
        typeLabel: row.typeLabel,
        statusLabel: row.statusLabel,
        statusClass,
      };
    });
    paidCount = rows.filter((r) => r.statusLabel === "Paid").length;
    unpaidCount = rows.filter((r) => r.statusLabel !== "Paid").length;
    guestCount = rows.filter((r) => /\bguest\b/i.test(r.typeLabel)).length;
  } else {
    const paidDetailed =
      p.paidEntries && p.paidEntries.length > 0
        ? p.paidEntries
        : p.paidNames.map((name) => ({ name, type: "member" as const }));
    const unpaidDetailed =
      p.unpaidEntries && p.unpaidEntries.length > 0
        ? p.unpaidEntries
        : p.unpaidNames.map((name) => ({ name, type: "member" as const }));
    rows = [
      ...paidDetailed.map((x) => ({
        name: x.name,
        typeLabel: x.typeLabel ?? (x.type === "guest" ? "Guest" : "Member"),
        statusLabel: "Paid" as const,
        statusClass: "status-paid" as const,
      })),
      ...unpaidDetailed.map((x) => ({
        name: x.name,
        typeLabel: x.typeLabel ?? (x.type === "guest" ? "Guest" : "Member"),
        statusLabel: "Unpaid" as const,
        statusClass: "status-unpaid" as const,
      })),
    ];
    paidCount = p.paidNames.length;
    unpaidCount = p.unpaidNames.length;
    guestCount = rows.filter((r) => r.typeLabel.toLowerCase().includes("guest")).length;
  }

  const useFallback12 = rows.length >= 42;
  const logoTag = p.logoUrl
    ? `<img class="mini-logo" src="${escapePdfAttr(p.logoUrl)}" alt="${escapePdfAttr(p.societyName)}" />`
    : "";
  const headerMeta = `The Golf Society Hub | ${dateLine} | ${p.societyName} | Paid ${paidCount} | Unpaid ${unpaidCount} | Guests ${guestCount}`;
  const rowHtml =
    rows.length > 0
      ? rows
          .map(
            (row, i) => `
            <tr>
              <td class="col-no">${i + 1}</td>
              <td class="col-name">${escapePdfHtml(row.name)}</td>
              <td class="col-type">${escapePdfHtml(row.typeLabel)}</td>
              <td class="col-status ${row.statusClass}">${escapePdfHtml(row.statusLabel)}</td>
            </tr>
          `,
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No players found for this event.</td></tr>`;

  const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 9mm; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
  }
  .pdf-root {
    width: 100%;
    max-width: 100%;
    font-size: 14px;
    line-height: 1.15;
    color: #111;
    background: #fff;
    overflow: hidden;
  }
  .sheet-page {
    width: 100%;
    max-width: 100%;
    height: 279mm;
    max-height: 279mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
  }
  body.export-web .sheet-page {
    height: auto;
    max-height: none;
    overflow: visible;
  }
  .sheet-header {
    border: 1px solid #d0d7de;
    border-bottom: none;
    padding: 10px 12px;
    margin-bottom: 0;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #f8fafc;
  }
  .header-line {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-logo {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: 0 0 auto;
  }
  .brand-chip {
    margin-left: auto;
    padding: 3px 9px;
    border: 1px solid #d0d7de;
    border-radius: 999px;
    background: #ffffff;
    color: #334155;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .header-subline {
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.15;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #d0d7de;
    font-size: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sheet-table thead th {
    background: #eef2f7;
    color: #1f2937;
    border-right: 1px solid #d0d7de;
    border-bottom: 1px solid #d0d7de;
    padding: 7px 8px;
    text-align: left;
    font-weight: 700;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.1;
  }
  .sheet-table thead th:last-child { border-right: none; }
  .sheet-table tbody td {
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 6px 8px;
    line-height: 1.12;
    vertical-align: middle;
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: hidden;
  }
  .sheet-table tbody td:last-child { border-right: none; }
  .sheet-table tbody tr:nth-child(even) { background: #fafafa; }
  .status-paid { color: #166534; font-weight: 600; }
  .status-unpaid { color: #b45309; font-weight: 600; }
  .sheet-table tr { page-break-inside: avoid; break-inside: avoid; }
  .col-no { width: 8%; white-space: nowrap; font-weight: 700; }
  .col-name {
    width: 40%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col-type {
    width: 28%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col-status {
    width: 24%;
    white-space: normal;
    overflow: hidden;
    word-break: break-word;
  }
  .empty {
    text-align: center;
    color: #666;
  }
  .sheet-note {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.2;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fallback-12 .sheet-table,
  .fallback-12 .sheet-table thead th,
  .fallback-12 .sheet-table tbody td,
  .fallback-12 .header-subline { font-size: 12px; }
  .fallback-12 .sheet-table thead th,
  .fallback-12 .sheet-table tbody td { padding: 4px 6px; }
  `;

  const inner = `
  <div class="sheet-page ${useFallback12 ? "fallback-12" : ""}">
    <div class="sheet-header">
      <div class="header-line">${logoTag}<span>${escapePdfHtml(p.eventName)} Payments</span><span class="brand-chip">GOLF SOCIETY HUB</span></div>
      <div class="header-subline">${escapePdfHtml(headerMeta)}</div>
    </div>
    <table class="sheet-table">
      <thead>
        <tr>
          <th class="col-no">#</th>
          <th class="col-name">Name</th>
          <th class="col-type">Type</th>
          <th class="col-status">Status</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
    ${p.jointThisSocietyNote ? `<div class="sheet-note">${escapePdfHtml(p.jointThisSocietyNote)}</div>` : ""}
  </div>`;

  return buildPdfDocumentShell({
    title: `Payments — ${p.eventName}`,
    css,
    bodyInnerHtml: inner,
  });
}
