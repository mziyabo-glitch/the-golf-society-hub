/**
 * Shared premium print design system for Golf Society Hub PDF exports.
 * Print-first HTML/CSS for PDF export (native: expo-print; web: jsPDF — see printHtmlToPdfFile.web.ts).
 * No live DOM, no window.print.
 */

export const PDF_THEME = {
  navy: "#0f172a",
  navyMuted: "#334155",
  textSecondary: "#475569",
  divider: "#e2e8f0",
  dividerStrong: "#cbd5e1",
  accent: "#0B6E4F",
  accentSoft: "#ecfdf5",
  accentBorder: "#bbf7d0",
  white: "#ffffff",
  rowAlt: "#f8fafc",
  rowHighlight: "#f1f5f9",
};

/** Safe font stack for WebView / print engines */
export const PDF_FONT_STACK =
  "Arial, Helvetica, 'Helvetica Neue', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function escapePdfHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapePdfAttr(input: string): string {
  return escapePdfHtml(input).replace(/"/g, "&quot;");
}

/** Points / numbers: trim trailing .0 */
export function formatPdfNumber(n: number): string {
  if (Number.isNaN(n)) return "—";
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(1);
}

export function formatPdfDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatPdfDateShort(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatPdfGenerationTimestamp(): string {
  return new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Logo tag — omit entirely if no URL (avoids broken icons).
 */
export function buildPdfLogoImg(logoUrl: string | null | undefined, alt: string): string {
  if (!logoUrl?.trim()) return "";
  return `<img class="doc-logo" src="${escapePdfAttr(logoUrl.trim())}" alt="${escapePdfAttr(alt)}" />`;
}

/**
 * Full HTML5 shell: styles live inside `.pdf-root` so jsPDF/html2canvas clones
 * (which are moved into the host document) still apply — styles in `<head>` are not cloned.
 * Also avoids passing `<body>` to jsPDF, which incorrectly sizes the canvas using the *host*
 * document body height (blank leading pages).
 */
export function buildPdfDocumentShell(options: {
  title: string;
  css: string;
  bodyInnerHtml: string;
}): string {
  const t = escapePdfHtml(options.title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
</head>
<body>
<div class="pdf-root doc">
<style>${options.css}</style>
${options.bodyInnerHtml}
</div>
</body>
</html>`;
}

/** Inline <style> for all premium exports */
export function buildPremiumPdfCss(extra = ""): string {
  const t = PDF_THEME;
  return `
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
html, body {
  margin: 0;
  padding: 0;
  height: auto;
  min-height: 0;
  overflow: visible;
}
body {
  font-family: ${PDF_FONT_STACK};
  font-size: 13px;
  line-height: 1.45;
  color: ${t.navy};
  background: ${t.white};
}
.pdf-root.doc {
  max-width: 210mm;
  margin: 0 auto;
  padding: 0;
  position: relative;
  background: ${t.white};
}
.doc-header {
  page-break-inside: avoid;
  break-inside: avoid;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid ${t.dividerStrong};
}
.doc-header-main { flex: 1; min-width: 0; }
.doc-logo-wrap { flex-shrink: 0; width: 64px; height: 64px; }
.doc-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  object-position: center;
  border-radius: 6px;
  display: block;
}
.doc-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: ${t.navy};
  letter-spacing: -0.02em;
}
.doc-subtitle {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: ${t.navyMuted};
}
.doc-meta {
  margin: 0;
  font-size: 12px;
  color: ${t.textSecondary};
  line-height: 1.5;
}
.doc-brand-kicker {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${t.accent};
  margin-bottom: 6px;
}
.block-avoid {
  page-break-inside: avoid;
  break-inside: avoid;
}
.oom-lead {
  page-break-inside: avoid;
  break-inside: avoid;
}
.table-wrap {
  width: 100%;
  overflow: visible;
  margin-top: 10px;
}
table.sheet {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
table.sheet thead th {
  background: ${t.navy};
  color: ${t.white};
  text-align: left;
  padding: 8px 10px;
  font-weight: 600;
  border: 1px solid ${t.navy};
}
table.sheet thead th.num,
table.sheet td.num {
  text-align: center;
}
table.sheet thead th.rt {
  text-align: right;
}
table.sheet td.rt {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
table.sheet tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid ${t.divider};
  vertical-align: middle;
  color: ${t.navy};
}
table.sheet tbody tr:nth-child(even) { background: ${t.rowAlt}; }
table.sheet tbody tr.muted td { color: ${t.textSecondary}; }
.table-hero-row td {
  font-weight: 600;
  background: ${t.accentSoft} !important;
  border-bottom-color: ${t.accentBorder};
}
.podium {
  page-break-inside: avoid;
  break-inside: avoid;
  display: grid;
  align-items: end;
  justify-items: stretch;
  gap: 10px;
  margin: 14px 0 18px;
  padding: 14px 12px;
  background: ${t.rowHighlight};
  border: 1px solid ${t.divider};
  border-radius: 10px;
}
.podium--3 {
  grid-template-columns: 1fr 1.12fr 1fr;
}
.podium--2 {
  grid-template-columns: 1fr 1fr;
  max-width: 420px;
  margin-left: auto;
  margin-right: auto;
}
.podium--1 {
  grid-template-columns: 1fr;
  max-width: 220px;
  margin-left: auto;
  margin-right: auto;
}
.podium-slot {
  min-width: 0;
  text-align: center;
  padding: 10px 8px;
  background: ${t.white};
  border: 1px solid ${t.divider};
  border-radius: 8px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.podium-slot--first {
  padding-bottom: 14px;
  border-color: ${t.accent};
  box-shadow: 0 2px 8px rgba(11, 110, 79, 0.12);
}
.podium-medal { font-size: 20px; line-height: 1; margin-bottom: 6px; }
.podium-name {
  font-size: 12px;
  font-weight: 700;
  color: ${t.navy};
  margin-bottom: 4px;
  word-wrap: break-word;
}
.podium-pts {
  font-size: 15px;
  font-weight: 700;
  color: ${t.accent};
  font-variant-numeric: tabular-nums;
}
.podium-rank {
  font-size: 10px;
  font-weight: 600;
  color: ${t.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.summary-strip {
  page-break-inside: avoid;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: ${t.rowHighlight};
  border: 1px solid ${t.divider};
  border-radius: 8px;
  font-size: 12px;
  color: ${t.textSecondary};
}
.summary-strip strong { color: ${t.navy}; font-weight: 600; }
.winners-card {
  page-break-inside: avoid;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: ${t.accentSoft};
  border: 1px solid ${t.accentBorder};
  border-radius: 8px;
  font-size: 12px;
}
.winners-card .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${t.accent}; margin-bottom: 6px; }
.winners-card .line { color: ${t.navy}; margin: 2px 0; }
.comp-block {
  page-break-inside: avoid;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid ${t.divider};
  font-size: 12px;
  color: ${t.textSecondary};
}
.comp-block h3 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${t.navyMuted};
}
.field-summary {
  page-break-inside: avoid;
  margin-top: 16px;
  padding: 10px 12px;
  font-size: 11px;
  color: ${t.textSecondary};
  border: 1px dashed ${t.divider};
  border-radius: 8px;
}
.doc-footer {
  margin-top: 22px;
  padding-top: 12px;
  border-top: 1px solid ${t.divider};
  font-size: 10px;
  color: ${t.textSecondary};
  text-align: center;
  line-height: 1.5;
}
.doc-footer .brand { font-weight: 600; color: ${t.navyMuted}; }
.empty-msg { text-align: center; color: ${t.textSecondary}; padding: 24px; font-size: 13px; }
${extra}
`;
}
