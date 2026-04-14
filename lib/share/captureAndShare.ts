/**
 * Capture a React Native view as PNG and open the native share sheet.
 *
 * PNG is canonical for OOM/Tee Sheet exports. Do not replace with PDF.
 *
 * - Native (iOS/Android): react-native-view-shot + expo-sharing
 * - Web: html2canvas → Web Share API (or fallback download)
 */

import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { isWebShareLikelyBlockedWithoutGesture } from "@/lib/web/browserEnvironment";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

/**
 * On web, capture the ScrollView's inner DOM node with html2canvas,
 * then share via Web Share API or trigger a PNG download as fallback.
 */
type WebCaptureOptions = {
  dialogTitle?: string;
  fallbackSelector?: string;
};

export type CaptureShareResult = {
  completedVia: "share" | "download";
};

async function resolveWebElement(
  ref: React.RefObject<any>,
  fallbackSelector?: string
): Promise<HTMLElement> {
  const candidate: HTMLElement | null =
    ref.current?.getScrollableNode?.() ??
    ref.current?.getInnerViewNode?.() ??
    (ref.current as any)?._nativeRef?.current ??
    (ref.current as any)?.getNativeScrollRef?.() ??
    ref.current;

  if (candidate && candidate instanceof HTMLElement) {
    return candidate;
  }

  const selector = fallbackSelector || "[data-testid='share-target']";
  const fallback = document.querySelector(selector) as HTMLElement | null;
  if (!fallback) {
    throw new Error("Cannot find the view to capture on web.");
  }
  return fallback;
}

async function captureAndShareWeb(
  ref: React.RefObject<any>,
  options?: WebCaptureOptions
): Promise<CaptureShareResult> {
  if (typeof window === "undefined") return { completedVia: "download" };

  // html2canvas is a web-only dependency; dynamic import keeps the native bundle clean
  const html2canvas = (await import("html2canvas")).default;

  const node = await resolveWebElement(ref, options?.fallbackSelector);
  return captureElement(node, html2canvas, options);
}

async function captureElement(
  el: HTMLElement,
  html2canvas: any,
  options?: { dialogTitle?: string }
): Promise<CaptureShareResult> {
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#FFFFFF",
    scale: 3,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b: Blob | null) => {
      if (b) resolve(b);
      else reject(new Error("Failed to create image blob."));
    }, "image/png");
  });

  const title = options?.dialogTitle || "Share";

  // Web Share with File requires transient user activation on iOS Safari. This path runs after
  // async html2canvas work (often from useEffect), so share() throws NotAllowedError — use download.
  const skipFileShare =
    isWebShareLikelyBlockedWithoutGesture() ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function";

  if (!skipFileShare) {
    const file = new File([blob], `${title.replace(/\s+/g, "-")}.png`, {
      type: "image/png",
    });
    const shareData: ShareData = { files: [file], title };

    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return { completedVia: "share" };
      } catch {
        // User cancelled, or non-iOS browser without activation — fall through to download
      }
    }
  }

  // Fallback: download the image
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "-")}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { completedVia: "download" };
}

export async function captureAndShare(
  ref: React.RefObject<any>,
  options?: { dialogTitle?: string; width?: number; height?: number }
): Promise<CaptureShareResult> {
  if (Platform.OS === "web") {
    return captureAndShareWeb(ref, options);
  }

  if (!ref.current || !captureRef) {
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

  const uri = await captureRef(ref, captureOptions);

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

export type ShareTarget = {
  ref: React.RefObject<any>;
  title?: string;
  fallbackSelector?: string;
  /** Native only: capture at this pixel width for higher resolution export */
  width?: number;
  /** Native only: capture at this pixel height for higher resolution export */
  height?: number;
};

export async function captureAndShareMultiple(
  targets: ShareTarget[],
  options?: { dialogTitle?: string }
): Promise<CaptureShareResult> {
  if (targets.length === 0) {
    throw new Error("No views to capture.");
  }

  if (Platform.OS === "web") {
    let downloaded = false;
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const result = await captureAndShareWeb(target.ref, {
        dialogTitle: target.title || options?.dialogTitle || `Share ${i + 1}`,
        fallbackSelector: target.fallbackSelector,
      });
      if (result.completedVia === "download") downloaded = true;
    }
    return { completedVia: downloaded ? "download" : "share" };
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (!target.ref.current || !captureRef) {
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
    const uri = await captureRef(target.ref, captureOptions);

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: target.title || options?.dialogTitle || `Share ${i + 1}`,
    });
  }
  return { completedVia: "share" };
}
