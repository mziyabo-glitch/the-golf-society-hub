/**
 * Logs intent for flows that capture a raster image (tee sheet, OOM PNG share).
 * OOM also supports PDF via `expo-print` — that path does not call this helper.
 */
export function assertPngExportOnly(context: string): void {
  const label = context ? `[${context}]` : "[export]";
  if (__DEV__) {
    console.log(`${label} PNG capture path (view-shot).`);
  }
}
