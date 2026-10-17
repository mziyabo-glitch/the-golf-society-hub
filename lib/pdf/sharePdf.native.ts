/**
 * Share a PDF on native — expo-sharing.
 */

import * as Sharing from "expo-sharing";

export type SharePdfOptions = {
  uri: string;
  mimeType?: string;
  dialogTitle?: string;
  filename?: string;
};

export async function sharePdfAsync(opts: SharePdfOptions): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(opts.uri, {
    mimeType: opts.mimeType ?? "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: opts.dialogTitle,
  });
}
