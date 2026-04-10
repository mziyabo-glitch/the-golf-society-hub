/**
 * Event payment lists PDF — society-scoped Paid / Unpaid (tee sheet = confirmed + paid).
 */

import { Platform } from "react-native";
import { assertNoPrintAsync, validateInputs } from "./exportContract";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";
import {
  buildPdfDocumentShell,
  escapePdfAttr,
  escapePdfHtml,
  formatPdfDate,
  formatPdfGenerationTimestamp,
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
  const dateLine = p.eventDate ? formatPdfDate(p.eventDate) : "—";
  const rows = [
    ...p.paidNames.map((name) => ({ name, status: "Paid" })),
    ...p.unpaidNames.map((name) => ({ name, status: "Unpaid" })),
  ];
  const useFallback11 = rows.length >= 40;
  const logoTag = p.logoUrl
    ? `<img class="mini-logo" src="${escapePdfAttr(p.logoUrl)}" alt="${escapePdfAttr(p.societyName)}" />`
    : "";
  const headerMeta = `The Golf Society Hub | ${dateLine} | ${p.societyName} | Paid ${p.paidNames.length} | Unpaid ${p.unpaidNames.length}`;
  const rowHtml =
    rows.length > 0
      ? rows
          .map(
            (row, i) => `
            <tr>
              <td class="col-no">${i + 1}</td>
              <td class="col-name">${escapePdfHtml(row.name)}</td>
              <td class="col-status ${row.status === "Paid" ? "status-paid" : "status-unpaid"}">${row.status}</td>
            </tr>
          `,
          )
          .join("")
      : `<tr><td colspan="3" class="empty">No players found for this event.</td></tr>`;

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
    font-size: 12px;
    line-height: 1.2;
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
    padding: 6px 8px;
    margin-bottom: 0;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #f8fafc;
  }
  .header-line {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-logo {
    width: 22px;
    height: 22px;
    object-fit: contain;
    flex: 0 0 auto;
  }
  .brand-chip {
    margin-left: auto;
    padding: 1px 6px;
    border: 1px solid #d0d7de;
    border-radius: 999px;
    background: #ffffff;
    color: #334155;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .header-subline {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.2;
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
    font-size: 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sheet-table thead th {
    background: #eef2f7;
    color: #1f2937;
    border-right: 1px solid #d0d7de;
    border-bottom: 1px solid #d0d7de;
    padding: 4px 5px;
    text-align: left;
    font-weight: 700;
    white-space: nowrap;
  }
  .sheet-table thead th:last-child { border-right: none; }
  .sheet-table tbody td {
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 4px 5px;
    line-height: 1.15;
    vertical-align: middle;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sheet-table tbody td:last-child { border-right: none; }
  .sheet-table tbody tr:nth-child(even) { background: #fafafa; }
  .status-paid { color: #166534; font-weight: 600; }
  .status-unpaid { color: #b45309; font-weight: 600; }
  .sheet-table tr { page-break-inside: avoid; break-inside: avoid; }
  .col-no { width: 10%; white-space: nowrap; }
  .col-name {
    width: 68%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col-status { width: 22%; white-space: nowrap; }
  .empty {
    text-align: center;
    color: #666;
  }
  .sheet-note {
    margin-top: 4px;
    font-size: 10px;
    line-height: 1.2;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fallback-11 .sheet-table,
  .fallback-11 .sheet-table thead th,
  .fallback-11 .sheet-table tbody td,
  .fallback-11 .header-subline { font-size: 11px; }
  .fallback-11 .sheet-table thead th,
  .fallback-11 .sheet-table tbody td { padding: 3px 4px; }
  `;

  const inner = `
  <div class="sheet-page ${useFallback11 ? "fallback-11" : ""}">
    <div class="sheet-header">
      <div class="header-line">${logoTag}<span>${escapePdfHtml(p.eventName)} Payments</span><span class="brand-chip">GOLF SOCIETY HUB</span></div>
      <div class="header-subline">${escapePdfHtml(headerMeta)}</div>
    </div>
    <table class="sheet-table">
      <thead>
        <tr>
          <th class="col-no">#</th>
          <th class="col-name">Name</th>
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

async function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

async function sharePaymentPngWeb(opts: {
  html: string;
  title: string;
  filename: string;
}): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("PNG export is not available in this environment.");
  }

  const html2canvas = (await import("html2canvas")).default;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "payment-png-export");
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:794px;min-height:5000px;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("Could not create export document.");
    idoc.open();
    idoc.write(opts.html);
    idoc.close();
    idoc.body.classList.add("export-web");
    await waitForImages(idoc);

    const root = idoc.querySelector(".sheet-page") as HTMLElement | null;
    if (!root) throw new Error("Payment print layout is missing .sheet-page.");

    const canvas = await html2canvas(root, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 794,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to render PNG."))), "image/png");
    });

    const safeName = opts.filename.replace(/[/\\?%*:|"<>]/g, "-") || "event-payments";
    const file = new File([blob], `${safeName}.png`, { type: "image/png" });

    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: opts.title, files: [file] });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    iframe.remove();
  }
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

  if (Platform.OS === "web") {
    await sharePaymentPngWeb({
      html,
      title: "Event payments",
      filename: `payments-${safePdfFilenamePart(payload.eventName)}`,
    });
    return;
  }

  const { uri } = await printHtmlToPdfFileAsync({ html, base64: false });
  await sharePdfAsync({
    uri,
    mimeType: "application/pdf",
    dialogTitle: "Event payments",
    filename: `payments-${safePdfFilenamePart(payload.eventName)}`,
  });
}
