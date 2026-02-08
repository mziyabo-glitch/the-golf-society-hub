export function assertPngExportOnly(context: string): void {
  // Quick guardrail: OOM/Tee Sheet exports must remain PNG.
  const label = context ? `[${context}]` : "[export]";
  console.log(`${label} PNG is canonical for OOM/Tee Sheet exports.`);

  const globalAny = globalThis as any;
  if (globalAny?.ExpoPrint || globalAny?.printToFileAsync || globalAny?.Print) {
    console.warn(`${label} Detected Print.* in runtime. Do not use it for OOM/Tee Sheet exports.`);
  }
}
