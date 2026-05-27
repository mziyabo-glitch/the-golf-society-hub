import { Platform } from "react-native";

export type ShareErrorContext = {
  eventId?: string | null;
  action: "share" | "export" | "publish" | "save_draft";
  screen?: string;
};

/** Structured console logging for share/export failures (dev-friendly). */
export function logShareError(err: unknown, ctx: ShareErrorContext): void {
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("[share-export]", {
    ...ctx,
    platform: Platform.OS,
    message: err instanceof Error ? err.message : String(err),
    stack,
  });
}
