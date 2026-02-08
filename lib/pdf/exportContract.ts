import { formatError } from "@/lib/ui/formatError";

export type ExportContext = {
  societyId?: string | null;
  eventId?: string | null;
};

export type ExportFailure = {
  message: string;
  detail?: string;
};

export function assertNoPrintAsync(): void {
  // Guardrail: exports must use Print.printToFileAsync + Sharing.shareAsync.
  // This is a placeholder to make intent explicit at call sites.
}

export function validateInputs(context: ExportContext): void {
  if (context.societyId !== undefined && !context.societyId) {
    throw new Error("Missing society ID.");
  }
  if (context.eventId !== undefined && !context.eventId) {
    throw new Error("Missing event ID.");
  }
}

export function wrapExportErrors(error: unknown, contextLabel = "export"): ExportFailure {
  const fallback = `Couldn't generate ${contextLabel}.`;
  const formatted = formatError(error, fallback);

  let message = fallback;
  let detail = formatted.message !== fallback ? formatted.message : formatted.detail;

  if (formatted.message.toLowerCase().includes("sharing is not available")) {
    detail = "Sharing isn't available on this device.";
  }

  if (formatted.message.toLowerCase().includes("network")) {
    detail = "Network error. Check your connection and try again.";
  }

  if (formatted.message.toLowerCase().includes("permission")) {
    detail = "Permission denied. Check your access and try again.";
  }

  return { message, detail };
}
