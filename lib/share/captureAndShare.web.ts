/**
 * Web tee sheet / OOM PNG export — html2canvas + download / Web Share API.
 * No native-only modules (view-shot, expo-sharing) in this bundle.
 */

import html2canvas from "html2canvas";
import { isWebShareLikelyBlockedWithoutGesture } from "@/lib/web/browserEnvironment";
import type {
  CaptureShareResult,
  ShareTarget,
  WebCaptureOptions,
} from "./captureAndShare.types";

export type { CaptureShareResult, ShareTarget } from "./captureAndShare.types";

async function resolveWebElement(
  ref: React.RefObject<unknown>,
  fallbackSelector?: string,
): Promise<HTMLElement> {
  const current = ref.current as {
    getScrollableNode?: () => HTMLElement;
    getInnerViewNode?: () => HTMLElement;
    getNativeScrollRef?: () => HTMLElement;
    _nativeRef?: { current?: HTMLElement };
  } | HTMLElement | null;

  const candidate: HTMLElement | null =
    (current && typeof current === "object" && "getScrollableNode" in current
      ? current.getScrollableNode?.()
      : null) ??
    (current && typeof current === "object" && "getInnerViewNode" in current
      ? current.getInnerViewNode?.()
      : null) ??
    (current && typeof current === "object" && "_nativeRef" in current
      ? current._nativeRef?.current
      : null) ??
    (current && typeof current === "object" && "getNativeScrollRef" in current
      ? current.getNativeScrollRef?.()
      : null) ??
    (current instanceof HTMLElement ? current : null);

  if (candidate) return candidate;

  const selector = fallbackSelector || "[data-testid='share-target']";
  const fallback = document.querySelector(selector) as HTMLElement | null;
  if (!fallback) {
    throw new Error("Cannot find the view to capture on web.");
  }
  return fallback;
}

async function captureElement(
  el: HTMLElement,
  options?: { dialogTitle?: string },
): Promise<CaptureShareResult> {
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#FFFFFF",
    scale: 3,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to create image blob."));
    }, "image/png");
  });

  const title = options?.dialogTitle || "Share";

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
        // User cancelled or activation lost — fall through to download
      }
    }
  }

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

async function captureAndShareWeb(
  ref: React.RefObject<unknown>,
  options?: WebCaptureOptions,
): Promise<CaptureShareResult> {
  if (typeof window === "undefined") return { completedVia: "download" };
  const node = await resolveWebElement(ref, options?.fallbackSelector);
  return captureElement(node, options);
}

export async function captureAndShare(
  ref: React.RefObject<unknown>,
  options?: { dialogTitle?: string; width?: number; height?: number },
): Promise<CaptureShareResult> {
  return captureAndShareWeb(ref, options);
}

export async function captureAndShareMultiple(
  targets: ShareTarget[],
  options?: { dialogTitle?: string },
): Promise<CaptureShareResult> {
  if (targets.length === 0) {
    throw new Error("No views to capture.");
  }

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
