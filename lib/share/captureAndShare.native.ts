/**
 * Native PNG export — react-native-view-shot + expo-sharing.
 */

import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import type { CaptureShareResult, ShareTarget } from "./captureAndShare.types";

export type { CaptureShareResult, ShareTarget } from "./captureAndShare.types";

export async function captureAndShare(
  ref: React.RefObject<unknown>,
  options?: { dialogTitle?: string; width?: number; height?: number },
): Promise<CaptureShareResult> {
  if (Platform.OS === "web") {
    throw new Error("captureAndShare.native must not run on web.");
  }

  if (!ref.current) {
    throw new Error("View not ready for capture.");
  }

  const captureOptions: Record<string, unknown> = {
    format: "png",
    quality: 1,
    result: "tmpfile",
    snapshotContentContainer: true,
  };
  if (options?.width != null) captureOptions.width = options.width;
  if (options?.height != null) captureOptions.height = options.height;

  const uri = await captureRef(ref as React.RefObject<unknown>, captureOptions);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    dialogTitle: options?.dialogTitle || "Share",
  });
  return { completedVia: "share" };
}

export async function captureAndShareMultiple(
  targets: ShareTarget[],
  options?: { dialogTitle?: string },
): Promise<CaptureShareResult> {
  if (targets.length === 0) {
    throw new Error("No views to capture.");
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (!target.ref.current) {
      throw new Error("View not ready for capture.");
    }

    const captureOptions: Record<string, unknown> = {
      format: "png",
      quality: 1,
      result: "tmpfile",
      snapshotContentContainer: true,
    };
    if (target.width != null) captureOptions.width = target.width;
    if (target.height != null) captureOptions.height = target.height;
    const uri = await captureRef(target.ref as React.RefObject<unknown>, captureOptions);

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: target.title || options?.dialogTitle || `Share ${i + 1}`,
    });
  }
  return { completedVia: "share" };
}
