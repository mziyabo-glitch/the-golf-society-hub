/**
 * Share a PDF on web — Web Share API with File when possible, otherwise download.
 */

export type SharePdfOptions = {
  uri: string;
  mimeType?: string;
  dialogTitle?: string;
  filename?: string;
};

export async function sharePdfAsync(opts: SharePdfOptions): Promise<void> {
  const name = (opts.filename ?? "export").replace(/[/\\?%*:|"<>]/g, "-") + ".pdf";

  const res = await fetch(opts.uri);
  const blob = await res.blob();
  const file = new File([blob], name, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const shareData: ShareData = {
        title: opts.dialogTitle ?? name,
        files: [file],
      };
      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        URL.revokeObjectURL(opts.uri);
        return;
      }
    } catch {
      // User cancelled or share failed — fall back to download
    }
  }

  const a = document.createElement("a");
  a.href = opts.uri;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(opts.uri);
}
