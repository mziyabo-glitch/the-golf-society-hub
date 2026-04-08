/**
 * Event payment lists PDF — society-scoped Paid / Unpaid (tee sheet = confirmed + paid).
 */

import { assertNoPrintAsync, validateInputs } from "./exportContract";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";
import {
  buildPdfDocumentShell,
  buildPremiumPdfCss,
  buildPdfLogoImg,
  escapePdfHtml,
  formatPdfDate,
  formatPdfGenerationTimestamp,
  PDF_THEME,
} from "./pdfExportTheme";
import { printHtmlToPdfFileAsync } from "./printHtmlToPdfFile";
import { sharePdfAsync } from "./sharePdf";

function safePdfFilenamePart(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event";
}

export type EventPaymentPdfPayload = {
  societyName: string;
  logoUrl: string | null;
  eventName: string;
  eventDate: string | null;
  paidNames: string[];
  unpaidNames: string[];
  generatedAt: string;
  jointThisSocietyNote: string | null;
};

export function buildEventPaymentPdfHtml(p: EventPaymentPdfPayload): string {
  const extraCss = `
  .pdf-pay h2 { font-size: 15px; color: ${PDF_THEME.accent}; margin: 16px 0 8px; page-break-after: avoid; }
  .pdf-pay ul { margin: 0 0 12px; padding-left: 20px; }
  .pdf-pay li { margin-bottom: 4px; font-size: 12px; line-height: 1.35; }
  .pdf-pay .scope-note { font-size: 10.5px; color: ${PDF_THEME.navyMuted}; margin: 0 0 14px; line-height: 1.4; }
  .pdf-pay .joint-note { font-size: 10px; color: ${PDF_THEME.textSecondary}; margin-top: 12px; }
  `;
  const css = `${buildPremiumPdfCss()}${extraCss}`;
  const logo = buildPdfLogoImg(p.logoUrl, p.societyName);
  const dateLine = p.eventDate ? formatPdfDate(p.eventDate) : "—";

  const listItems = (names: string[], emptyLabel: string) =>
    names.length > 0
      ? names.map((n) => `<li>${escapePdfHtml(n)}</li>`).join("")
      : `<li style="color:${PDF_THEME.navyMuted}">${escapePdfHtml(emptyLabel)}</li>`;

  const inner = `
  <header class="doc-header block-avoid">
    ${logo ? `<div class="doc-logo-wrap">${logo}</div>` : ""}
    <div class="doc-header-main">
      <div class="doc-brand-kicker">The Golf Society Hub</div>
      <h1 class="doc-title">Event payments</h1>
      <p class="doc-subtitle">${escapePdfHtml(p.eventName)}</p>
      <p class="doc-meta">${escapePdfHtml(p.societyName)} · ${escapePdfHtml(dateLine)}</p>
      <p class="doc-meta">Generated ${escapePdfHtml(p.generatedAt)}</p>
    </div>
  </header>

  <div class="pdf-pay">
    <p class="scope-note">
      Paid = confirmed and paid (same list as the tee sheet). Unpaid = payment still due or no fee row yet.
      This sheet includes only members of this society.
    </p>
    <h2>Paid (${p.paidNames.length})</h2>
    <ul>${listItems(p.paidNames, "None")}</ul>
    <h2>Unpaid (${p.unpaidNames.length})</h2>
    <ul>${listItems(p.unpaidNames, "None")}</ul>
    ${p.jointThisSocietyNote ? `<p class="joint-note">${escapePdfHtml(p.jointThisSocietyNote)}</p>` : ""}
  </div>

  <footer class="doc-footer">
    <span class="brand">The Golf Society Hub</span>
  </footer>`;

  return buildPdfDocumentShell({
    title: `Payments — ${p.eventName}`,
    css,
    bodyInnerHtml: inner,
  });
}

export async function exportEventPaymentPdf(opts: {
  eventName: string;
  eventDate: string | null;
  societyId: string;
  society: unknown;
  paidNames: string[];
  unpaidNames: string[];
  isJointEvent: boolean;
}): Promise<void> {
  assertNoPrintAsync();
  validateInputs({ societyId: opts.societyId });

  const societyName =
    (opts.society as { name?: string } | null)?.name?.trim() || "Golf Society";
  const rawLogoUrl = getSocietyLogoUrl(opts.society);
  const logoDataUri = rawLogoUrl
    ? await getSocietyLogoDataUri(opts.societyId, { logoUrl: rawLogoUrl })
    : null;
  const logoSrc = logoDataUri ?? rawLogoUrl;

  const payload: EventPaymentPdfPayload = {
    societyName,
    logoUrl: logoSrc,
    eventName: opts.eventName.trim() || "Event",
    eventDate: opts.eventDate,
    paidNames: opts.paidNames,
    unpaidNames: opts.unpaidNames,
    generatedAt: formatPdfGenerationTimestamp(),
    jointThisSocietyNote: opts.isJointEvent
      ? "Joint event: other participating societies are not listed here."
      : null,
  };

  const html = buildEventPaymentPdfHtml(payload);
  const { uri } = await printHtmlToPdfFileAsync({ html, base64: false });
  await sharePdfAsync({
    uri,
    mimeType: "application/pdf",
    dialogTitle: "Event payments",
    filename: `payments-${safePdfFilenamePart(payload.eventName)}`,
  });
}
