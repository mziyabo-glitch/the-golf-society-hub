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
  /* Stay in the layout viewport so html2canvas/getBoundingClientRect math matches the clone
     jsPDF injects into the host document (off-screen -100000px overlays break paging). */
  /* Wide enough for layout; tall min-height so long tables get full scrollHeight (not 100vh). */
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:794px;min-height:8000px;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("Could not create export document.");

    idoc.open();
    idoc.write(options.html);
    idoc.close();

    await waitForImages(idoc);

    const root = idoc.querySelector(".pdf-root") as HTMLElement | null;
    if (!root) {
      throw new Error(
        "PDF HTML must include a .pdf-root wrapper with embedded styles (see buildPdfDocumentShell).",
      );
    }

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    /**
     * Pass `.pdf-root` not `body`. jsPDF clones the node into the host document; if the source
     * is `body`, container height is taken from the host app body (huge) → blank leading pages.
     * autoPaging "slice" rasterizes consistently; "text" can mis-measure with tables.
     */
    await pdf.html(root, {
      x: 10,
      y: 10,
      width: 190,
      windowWidth: 794,
      autoPaging: true,
      html2canvas: {
        scale: 0.8,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
      },
    });

    const blob = pdf.output("blob");
    const uri = URL.createObjectURL(blob);
    return { uri };
  } finally {
    document.body.removeChild(iframe);
  }
}
