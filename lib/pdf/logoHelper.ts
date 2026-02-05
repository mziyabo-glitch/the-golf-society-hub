/**
 * Logo Helper for PDF Exports
 *
 * Fetches society logo and converts to base64 data URI for embedding in HTML PDFs.
 * This ensures logos render reliably in expo-print generated PDFs.
 */

import { Platform } from "react-native";

/**
 * Fetch an image URL and convert to base64 data URI
 *
 * @param url - Image URL to fetch
 * @returns Base64 data URI string, or null if fetch fails
 */
export async function fetchImageAsBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  try {
    console.log("[logoHelper] Fetching image:", url.substring(0, 60) + "...");

    // On web, we might hit CORS issues - try anyway
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[logoHelper] Fetch failed:", response.status);
      return null;
    }

    const blob = await response.blob();

    // Convert blob to base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        console.log("[logoHelper] Converted to base64, length:", result?.length || 0);
        resolve(result);
      };
      reader.onerror = () => {
        console.warn("[logoHelper] FileReader error");
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    console.warn("[logoHelper] fetchImageAsBase64 error:", err?.message);
    return null;
  }
}

/**
 * Get logo for PDF embedding
 * 
 * Tries to fetch logo and convert to base64.
 * Falls back to original URL if base64 conversion fails (less reliable in PDFs).
 * Returns null if no logo or all attempts fail.
 *
 * @param logoUrl - Society logo URL
 * @returns Object with logoDataUri (base64 or URL) and whether it's a data URI
 */
export async function getLogoForPdf(logoUrl: string | null | undefined): Promise<{
  logoSrc: string | null;
  isDataUri: boolean;
}> {
  if (!logoUrl) {
    return { logoSrc: null, isDataUri: false };
  }

  // Try to get base64 version for reliable PDF embedding
  const base64 = await fetchImageAsBase64(logoUrl);

  if (base64) {
    return { logoSrc: base64, isDataUri: true };
  }

  // Fall back to URL - may not render in all PDF viewers
  console.log("[logoHelper] Falling back to URL for logo");
  return { logoSrc: logoUrl, isDataUri: false };
}

/**
 * Generate HTML img tag for logo, handling both data URIs and URLs
 *
 * @param logoSrc - Logo source (data URI or URL)
 * @param size - Size in pixels (width and height)
 * @param className - Optional CSS class name
 * @returns HTML string for img tag, or empty string if no logo
 */
export function buildLogoImgTag(
  logoSrc: string | null,
  size: number = 56,
  className?: string
): string {
  if (!logoSrc) return "";

  const classAttr = className ? ` class="${className}"` : "";
  const styleAttr = `style="width:${size}px;height:${size}px;object-fit:contain;display:block;"`;

  return `<img${classAttr} ${styleAttr} src="${escapeAttribute(logoSrc)}" alt="Society logo" />`;
}

/**
 * Escape string for use in HTML attributes
 */
function escapeAttribute(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
