/**
 * Capture a React Native view as PNG and open the native share sheet.
 *
 * Uses react-native-view-shot for capture and expo-sharing for the share dialog.
 * On web, falls back to window.print().
 */

import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

export async function captureAndShare(
  ref: React.RefObject<any>,
  options?: { dialogTitle?: string }
): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
    return;
  }

  if (!ref.current || !captureRef) {
    throw new Error("View not ready for capture.");
  }

  const uri = await captureRef(ref, {
    format: "png",
    quality: 1,
    result: "tmpfile",
    snapshotContentContainer: true,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    dialogTitle: options?.dialogTitle || "Share",
  });
}
