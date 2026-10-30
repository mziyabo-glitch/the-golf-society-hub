/**
 * Renders standalone HTML to a PDF file URI.
 * Native: expo-print (WKWebView / Android print pipeline).
 * Web: jsPDF + html2canvas — expo-print's web implementation calls window.print() on the
 * live app tab and ignores `html`, so we must not use it on web.
 */

import * as Print from "expo-print";

export type PrintHtmlToFileOptions = {
  html: string;
  base64?: boolean;
};

export async function printHtmlToPdfFileAsync(
  options: PrintHtmlToFileOptions,
): Promise<{ uri: string }> {
  return Print.printToFileAsync(options);
}
