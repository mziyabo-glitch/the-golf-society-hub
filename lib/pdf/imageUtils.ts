/**
 * Image utilities for PDF generation.
 *
 * expo-print renders HTML in an off-screen WebView that often cannot load
 * remote images reliably. Converting the image to a base-64 data URI first
 * guarantees the image is embedded inline in the HTML and will always render.
 */

/**
 * Fetch a remote image URL and return it as a base-64 data URI
 * (e.g. "data:image/png;base64,iVBOR...").
 *
 * Returns `null` on any failure so callers can fall back gracefully.
 */
export function imageUrlToBase64DataUri(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(xhr.response);
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.open("GET", url);
      xhr.responseType = "blob";
      xhr.timeout = 10_000;
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}
