/**
 * Web: build a real PDF from HTML. expo-print's printToFileAsync only triggers window.print()
 * on the current page and does not use the `html` option (see expo-print ExponentPrint.web.ts).
 */

import type { PrintHtmlToFileOptions } from "./printHtmlToPdfFile";

function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  return Promise.all(
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
  ).then(() => undefined);
}

export async function printHtmlToPdfFileAsync(
  options: PrintHtmlToFileOptions,
): Promise<{ uri: string }> {
  if (typeof document === "undefined") {
    throw new Error("PDF export is not available in this environment.");
  }

  const { jsPDF } = await import("jspdf");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "pdf-export");
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:794px;min-height:200px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("Could not create export document.");

    idoc.open();
    idoc.write(options.html);
    idoc.close();

    await waitForImages(idoc);

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    await pdf.html(idoc.body, {
      x: 8,
      y: 8,
      width: 194,
      windowWidth: 794,
      autoPaging: "text",
      html2canvas: {
        scale: 0.72,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
    });

    const blob = pdf.output("blob");
    const uri = URL.createObjectURL(blob);
    return { uri };
  } finally {
    document.body.removeChild(iframe);
  }
}
