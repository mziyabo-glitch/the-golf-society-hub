/**
 * Event payment lists PDF — society-scoped Paid / Unpaid (tee sheet = confirmed + paid).
 */

import { Platform } from "react-native";
import { assertNoPrintAsync, validateInputs } from "./exportContract";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";
import {
  formatPdfGenerationTimestamp,
} from "./pdfExportTheme";
import { printHtmlToPdfFileAsync } from "./printHtmlToPdfFile";
import { sharePdfAsync } from "./sharePdf";
import type { PaymentShareExportRow } from "@/lib/eventPaymentShare";
import {
  buildEventPaymentPdfHtml,
  type EventPaymentPdfPayload,
} from "./eventPaymentPdfHtml";

function safePdfFilenamePart(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event";
}

export { buildEventPaymentPdfHtml, type EventPaymentPdfPayload } from "./eventPaymentPdfHtml";

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
      scale: 3,
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

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare?.({ files: [file] })
    ) {
      try {
        await navigator.share({ title: opts.title, files: [file] });
        return;
      } catch {
        // iOS Safari and other WebKit builds reject file share without user gesture (async export path).
      }
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
  paidEntries?: { name: string; type: "member" | "guest"; typeLabel?: string }[];
  unpaidEntries?: { name: string; type: "member" | "guest"; typeLabel?: string }[];
  exportRows?: PaymentShareExportRow[];
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
    paidEntries: opts.paidEntries,
    unpaidEntries: opts.unpaidEntries,
    exportRows: opts.exportRows,
    generatedAt: formatPdfGenerationTimestamp(),
    jointThisSocietyNote: opts.isJointEvent
      ? "Joint event: all participating societies are included."
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
