export type RsvpTelemetrySource = "home_dashboard_rsvp" | "event_detail_rsvp";

type RsvpFailureTelemetry = {
  eventId: string;
  societyId: string;
  resolvedMemberIdPresent: boolean;
  bootstrapMemberIdPresent: boolean;
  errorCode: string;
  errorMessage: string;
  source: RsvpTelemetrySource;
};

function truncateForLog(input: string, max = 220): string {
  const value = String(input ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function deriveErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const anyErr = error as { code?: unknown; name?: unknown };
    if (typeof anyErr.code === "string" && anyErr.code.trim()) return anyErr.code.trim();
    if (typeof anyErr.name === "string" && anyErr.name.trim()) return anyErr.name.trim();
  }
  return "RSVP_UNKNOWN";
}

function deriveErrorMessage(error: unknown): string {
  if (error instanceof Error) return truncateForLog(error.message || "Unknown RSVP error");
  return truncateForLog(String(error ?? "Unknown RSVP error"));
}

export function logRsvpFailureTelemetry(input: {
  eventId: string;
  societyId: string;
  resolvedMemberIdPresent: boolean;
  bootstrapMemberIdPresent: boolean;
  source: RsvpTelemetrySource;
  error: unknown;
}): void {
  const payload: RsvpFailureTelemetry = {
    eventId: String(input.eventId),
    societyId: String(input.societyId),
    resolvedMemberIdPresent: Boolean(input.resolvedMemberIdPresent),
    bootstrapMemberIdPresent: Boolean(input.bootstrapMemberIdPresent),
    errorCode: deriveErrorCode(input.error),
    errorMessage: deriveErrorMessage(input.error),
    source: input.source,
  };
  console.error("[rsvp.telemetry] failure", payload);
}

export function logRsvpSuccessDevOnly(input: {
  eventId: string;
  societyId: string;
  memberId: string;
  status: "in" | "out";
  source: RsvpTelemetrySource;
}): void {
  if (!(typeof __DEV__ !== "undefined" && __DEV__)) return;
  const memberPrefix = input.memberId ? `${String(input.memberId).slice(0, 8)}...` : "unknown";
  console.log("[rsvp.telemetry] success", {
    message: "RSVP status updated",
    eventId: String(input.eventId),
    societyId: String(input.societyId),
    memberIdPrefix: memberPrefix,
    status: input.status,
    source: input.source,
  });
}
