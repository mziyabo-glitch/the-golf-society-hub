/**
 * Treasurer Ledger PDF Generator
 *
 * Generates a clean PDF for the financial ledger.
 * Uses the centralized exportPdf() function - never calls Print.printAsync.
 */

import { exportPdf, getLogoDataUri } from "./exportPdf";
import { formatPenceToGBP } from "@/lib/utils/currency";

export type LedgerEntry = {
  id: string;
  entry_type: "income" | "cost";
  entry_date: string;
  amount_pence: number;
  description: string;
  runningBalancePence: number;
};

export type LedgerPdfData = {
  societyName: string;
  logoUrl: string | null;
  openingBalancePence: number;
  entries: LedgerEntry[];
  totalIncomePence: number;
  totalCostsPence: number;
  currentBalancePence: number;
};

/**
 * Export treasurer ledger as PDF
 *
 * Uses centralized exportPdf() function - never printAsync.
 */
export async function exportLedgerPdf(data: LedgerPdfData): Promise<void> {
  // Get logo as base64 for reliable PDF embedding
  const { logoSrc } = await getLogoDataUri(data.logoUrl);

  const html = buildLedgerPdfHtml({
    ...data,
    logoUrl: logoSrc,
  });

  await exportPdf({
    html,
    filename: `Financial Ledger - ${data.societyName}`,
  });
}

/**
 * Build HTML template for ledger PDF
 */
export function buildLedgerPdfHtml(data: LedgerPdfData): string {
  const {
    societyName,
    logoUrl,
    openingBalancePence,
    entries,
    totalIncomePence,
    totalCostsPence,
    currentBalancePence,
  } = data;

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const logoHtml = logoUrl
    ? `<img src="${escapeAttribute(logoUrl)}" style="height: 50px; width: auto; margin-right: 16px;" />`
    : "";

  const entriesHtml = entries.length === 0
    ? `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #6B7280;">No entries recorded</td></tr>`
    : entries
        .map(
          (entry) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
              ${new Date(entry.entry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${
                entry.entry_type === "income" ? "#DEF7EC" : "#FDE8E8"
              }; color: ${entry.entry_type === "income" ? "#03543F" : "#9B1C1C"};">
                ${entry.entry_type === "income" ? "Income" : "Expense"}
              </span>
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(entry.description)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: ${
              entry.entry_type === "income" ? "#03543F" : "#9B1C1C"
            };">
              ${entry.entry_type === "income" ? "+" : "-"}${formatPenceToGBP(entry.amount_pence)}
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 600;">
              ${formatPenceToGBP(entry.runningBalancePence)}
            </td>
          </tr>
        `
        )
        .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Financial Ledger - ${escapeHtml(societyName)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 24px;
            color: #111827;
            background: #fff;
            font-size: 12px;
            line-height: 1.4;
          }
          .container { max-width: 800px; margin: 0 auto; }
          .header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #0B6E4F;
          }
          .header-text { flex: 1; }
          .society-name {
            font-size: 14px;
            font-weight: 600;
            color: #0B6E4F;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .title { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px; }
          .date { font-size: 12px; color: #6B7280; }
          .summary { display: flex; gap: 16px; margin-bottom: 24px; }
          .summary-card {
            flex: 1;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card.highlight { background: #0B6E4F; border-color: #0B6E4F; }
          .summary-card.highlight .summary-label, .summary-card.highlight .summary-value { color: #fff; }
          .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: 700; color: #111827; font-family: 'SF Mono', Consolas, monospace; }
          .summary-value.income { color: #03543F; }
          .summary-value.cost { color: #9B1C1C; }
          table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
          thead tr { background: #F9FAFB; }
          th { padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; }
          th:nth-child(4), th:nth-child(5) { text-align: right; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoHtml}
            <div class="header-text">
              <div class="society-name">${escapeHtml(societyName)}</div>
              <div class="title">Society Financial Ledger</div>
              <div class="date">Generated on ${today}</div>
            </div>
          </div>
          <div class="summary">
            <div class="summary-card">
              <div class="summary-label">Opening Balance</div>
              <div class="summary-value">${formatPenceToGBP(openingBalancePence)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Income</div>
              <div class="summary-value income">${formatPenceToGBP(totalIncomePence)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Costs</div>
              <div class="summary-value cost">${formatPenceToGBP(totalCostsPence)}</div>
            </div>
            <div class="summary-card highlight">
              <div class="summary-label">Closing Balance</div>
              <div class="summary-value">${formatPenceToGBP(currentBalancePence)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 100px;">Date</th>
                <th style="width: 80px;">Type</th>
                <th>Description</th>
                <th style="width: 100px; text-align: right;">Amount</th>
                <th style="width: 100px; text-align: right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: #F0FDF4;">
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #E5E7EB; color: #374151;">Opening</span>
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-style: italic;">Opening Balance</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 600;">${formatPenceToGBP(openingBalancePence)}</td>
              </tr>
              ${entriesHtml}
            </tbody>
          </table>
          <div class="footer">
            ${entries.length} transaction${entries.length !== 1 ? "s" : ""} recorded<br/>
            Produced by The Golf Society Hub
          </div>
        </div>
      </body>
    </html>
  `;
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
