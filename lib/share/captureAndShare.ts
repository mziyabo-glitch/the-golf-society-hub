/**
 * TypeScript entry — Metro resolves `captureAndShare.web.ts` / `.native.ts` at bundle time.
 */
export type { CaptureShareResult, ShareTarget, WebCaptureOptions } from "./captureAndShare.types";
export { captureAndShare, captureAndShareMultiple } from "./captureAndShare.web";
