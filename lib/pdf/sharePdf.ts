/**
 * Share a PDF file URI. Native uses expo-sharing; web uses Web Share API with a File when
 * possible, otherwise downloads — expo-sharing on web only passes a URL string, not file bytes.
 */

import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

export type SharePdfOptions = {
  uri: string;
  mimeType?: string;
  dialogTitle?: string;
  /** Used for web download / share filename */
  filename?: string;
};

export async function sharePdfAsync(opts: SharePdfOptions): Promise<void> {
  if (Platform.OS === "web") {
    await sharePdfWeb(opts);
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(opts.uri, {
    mimeType: opts.mimeType ?? "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: opts.dialogTitle,
  });
}

async function sharePdfWeb(opts: SharePdfOptions): Promise<void> {
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
