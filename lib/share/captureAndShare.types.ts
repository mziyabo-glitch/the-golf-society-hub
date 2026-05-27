export type WebCaptureOptions = {
  dialogTitle?: string;
  fallbackSelector?: string;
};

export type CaptureShareResult = {
  completedVia: "share" | "download";
};

export type ShareTarget = {
  ref: React.RefObject<unknown>;
  title?: string;
  fallbackSelector?: string;
  /** Native only: capture at this pixel width for higher resolution export */
  width?: number;
  /** Native only: capture at this pixel height for higher resolution export */
  height?: number;
};
