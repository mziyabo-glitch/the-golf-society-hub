import type { TeeSheetData } from "@/lib/teeSheetPdf";

export function encodeTeeSheetShareRoutePayload(data: TeeSheetData): string {
  return encodeURIComponent(JSON.stringify(data));
}
