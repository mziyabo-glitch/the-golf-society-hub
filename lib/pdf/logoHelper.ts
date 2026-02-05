/**
 * Logo Helper for PDF Exports
 *
 * Re-exports logo utilities from the centralized exportPdf module.
 * This file is kept for backward compatibility.
 *
 * @deprecated Import from "./exportPdf" directly
 */

export {
  toDataUriFromUrl as fetchImageAsBase64,
  getLogoDataUri as getLogoForPdf,
} from "./exportPdf";

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
