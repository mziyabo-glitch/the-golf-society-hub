/**
 * Capture a React Native view as PNG and open the native share sheet.
 *
 * - Native (iOS/Android): react-native-view-shot + expo-sharing
 * - Web: html2canvas → Web Share API (or fallback download)
 */

import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

/**
 * On web, capture the ScrollView's inner DOM node with html2canvas,
 * then share via Web Share API or trigger a PNG download as fallback.
 */
async function captureAndShareWeb(
  ref: React.RefObject<any>,
  options?: { dialogTitle?: string }
): Promise<void> {
  if (typeof window === "undefined") return;

  // html2canvas is a web-only dependency; dynamic import keeps the native bundle clean
  const html2canvas = (await import("html2canvas")).default;

  // ref.current is the RN ScrollView instance – get the underlying DOM node
  const node: HTMLElement | null =
    ref.current?.getScrollableNode?.() ??
    ref.current?.getInnerViewNode?.() ??
    (ref.current as any)?._nativeRef?.current ??
    (ref.current as any)?.getNativeScrollRef?.() ??
    ref.current;

  if (!node || !(node instanceof HTMLElement)) {
    // Last resort: find the first child of the ScrollView DOM wrapper
    const wrapper = document.querySelector("[data-testid='share-target']") as HTMLElement | null;
    if (!wrapper) {
      throw new Error("Cannot find the view to capture on web.");
    }
    return captureElement(wrapper, html2canvas, options);
  }

  return captureElement(node, html2canvas, options);
}

async function captureElement(
  el: HTMLElement,
  html2canvas: any,
  options?: { dialogTitle?: string }
): Promise<void> {
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#FFFFFF",
    scale: 2,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b: Blob | null) => {
      if (b) resolve(b);
      else reject(new Error("Failed to create image blob."));
    }, "image/png");
  });

  const title = options?.dialogTitle || "Share";

  // Try the Web Share API first (mobile browsers, some desktop)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], `${title.replace(/\s+/g, "-")}.png`, {
      type: "image/png",
    });
    const shareData = { files: [file], title };

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return;
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
}

export async function captureAndShare(
  ref: React.RefObject<any>,
  options?: { dialogTitle?: string }
): Promise<void> {
  if (Platform.OS === "web") {
    return captureAndShareWeb(ref, options);
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
