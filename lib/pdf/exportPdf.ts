/**
 * Centralized PDF Export Utility
 *
 * IMPORTANT: All PDF exports must go through this module.
 * NEVER use Print.printAsync on mobile - it prints the app UI screen.
 * ALWAYS use Print.printToFileAsync to generate a proper PDF file from HTML.
 *
 * This module provides:
 * - exportPdf(): Generate PDF from HTML and share it
 * - toDataUriFromUrl(): Convert image URL to base64 data URI for PDF embedding
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Alert } from "react-native";

export type ExportPdfOptions = {
  /** HTML content to convert to PDF */
  html: string;
  /** Filename for the share dialog (without .pdf extension) */
  filename: string;
  /** Optional width in points (default: auto) */
  width?: number;
  /** Optional height in points (default: auto) */
  height?: number;
};

/**
 * Generate a PDF file from HTML and share it
 *
 * This is the ONLY correct way to export PDFs in this app.
 * Do NOT use Print.printAsync - it prints the current app UI.
 *
 * @param opts - Export options
 * @throws Error if PDF generation or sharing fails
 */
export async function exportPdf(opts: ExportPdfOptions): Promise<void> {
  const { html, filename, width, height } = opts;

  if (!html) {
    throw new Error("HTML content is required for PDF export");
  }

  // Detect web platform reliably
  const isWeb = Platform.OS === "web" || (typeof window !== "undefined" && typeof document !== "undefined");
  
  console.log(`[exportPdf] Generating PDF: ${filename}`);
  console.log(`[exportPdf] Platform.OS: ${Platform.OS}`);
  console.log(`[exportPdf] isWeb: ${isWeb}`);
  console.log(`[exportPdf] HTML length: ${html.length}`);

  // WEB: Use printAsync to open print dialog (printToFileAsync doesn't work on web)
  if (isWeb) {
    console.log("[exportPdf] Web platform detected - opening print dialog");
    try {
      // Try Print.printAsync first
      await Print.printAsync({ html });
      console.log("[exportPdf] Print dialog opened successfully");
    } catch (err: any) {
      console.error("[exportPdf] Print.printAsync failed:", err);
      // Fallback: open HTML in new window for printing
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 250);
        } else {
          throw new Error("Could not open print window");
        }
      } catch (fallbackErr) {
        console.error("[exportPdf] Fallback print also failed:", fallbackErr);
        Alert.alert("Error", "Could not open print dialog. Please try on mobile.");
      }
    }
    return;
  }

  // MOBILE: Generate PDF file and share it
  console.log("[exportPdf] Mobile platform - generating PDF file");
  
  const printOptions: Print.FilePrintOptions = { html };
  if (width) printOptions.width = width;
  if (height) printOptions.height = height;

  const result = await Print.printToFileAsync(printOptions);
  
  if (!result || !result.uri) {
    throw new Error("Failed to generate PDF file - printToFileAsync returned no URI");
  }
  
  const { uri } = result;
  console.log(`[exportPdf] PDF file created: ${uri}`);

  // Share the PDF file
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert(
      "Export Complete",
      `PDF "${filename}" was generated but sharing is not available on this device.`,
      [{ text: "OK" }]
    );
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: filename,
    UTI: "com.adobe.pdf",
  });

  console.log(`[exportPdf] PDF shared successfully: ${filename}`);
}

/**
 * Fetch an image from URL and convert to base64 data URI
 *
 * Use this to embed images in PDFs reliably.
 * Remote URLs may not render in expo-print PDFs, but data URIs always work.
 *
 * @param url - Image URL to fetch
 * @returns Base64 data URI string (e.g., "data:image/png;base64,..."), or null if fetch fails
 */
export async function toDataUriFromUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  try {
    console.log("[toDataUriFromUrl] Fetching:", url.substring(0, 60) + "...");

    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[toDataUriFromUrl] Fetch failed:", response.status);
      return null;
    }

    const blob = await response.blob();

    // Convert blob to base64 data URI
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        console.log("[toDataUriFromUrl] Converted to base64, length:", result?.length || 0);
        resolve(result);
      };
      reader.onerror = () => {
        console.warn("[toDataUriFromUrl] FileReader error");
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    console.warn("[toDataUriFromUrl] Error:", err?.message);
    return null;
  }
}

/**
 * Get logo ready for PDF embedding
 *
 * Tries to fetch and convert to base64.
 * Falls back to original URL if conversion fails.
 *
 * @param logoUrl - Logo URL
 * @returns Object with logoSrc and isDataUri flag
 */
export async function getLogoDataUri(logoUrl: string | null | undefined): Promise<{
  logoSrc: string | null;
  isDataUri: boolean;
}> {
  if (!logoUrl) {
    return { logoSrc: null, isDataUri: false };
  }

  const base64 = await toDataUriFromUrl(logoUrl);

  if (base64) {
    return { logoSrc: base64, isDataUri: true };
  }

  // Fall back to URL (may not render in all PDF viewers)
  console.log("[getLogoDataUri] Falling back to URL");
  return { logoSrc: logoUrl, isDataUri: false };
}
