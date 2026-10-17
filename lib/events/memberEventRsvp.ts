import { findMemberByUserAndSociety } from "@/lib/db_supabase/memberRepo";
import { setMyStatus, type EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { logRsvpFailureTelemetry, logRsvpSuccessDevOnly, type RsvpTelemetrySource } from "@/lib/events/rsvpTelemetry";

export async function resolveMemberIdForSocietyRsvp(opts: {
  societyId: string;
  userId: string | null;
  bootstrapMemberId: string | null;
  membershipMemberId: string | null;
}): Promise<string | null> {
  let resolved = opts.bootstrapMemberId ?? opts.membershipMemberId ?? null;
  if (!resolved && opts.userId) {
    const linked = await findMemberByUserAndSociety(opts.societyId, opts.userId);
    resolved = linked?.id ?? null;
  }
  return resolved;
}

export async function submitMemberEventRsvp(opts: {
  eventId: string;
  societyId: string;
  status: "in" | "out";
  userId: string | null;
  bootstrapMemberId: string | null;
  membershipMemberId: string | null;
  source: RsvpTelemetrySource;
}): Promise<{ registration: EventRegistration | null; resolvedMemberId: string }> {
  const bootstrapMemberIdPresent = Boolean(opts.bootstrapMemberId);
  const resolvedMemberId = await resolveMemberIdForSocietyRsvp({
    societyId: opts.societyId,
    userId: opts.userId,
    bootstrapMemberId: opts.bootstrapMemberId,
    membershipMemberId: opts.membershipMemberId,
  });

  if (!resolvedMemberId) {
    const err = new Error("Could not resolve your active membership for this society.");
    logRsvpFailureTelemetry({
      eventId: opts.eventId,
      societyId: opts.societyId,
      resolvedMemberIdPresent: false,
      bootstrapMemberIdPresent,
      source: opts.source,
      error: err,
    });
    throw err;
  }

  try {
    const registration = await setMyStatus({
      eventId: opts.eventId,
      societyId: opts.societyId,
      memberId: resolvedMemberId,
      status: opts.status,
    });
    logRsvpSuccessDevOnly({
      eventId: opts.eventId,
      societyId: opts.societyId,
      memberId: resolvedMemberId,
      status: opts.status,
      source: opts.source,
    });
    return { registration, resolvedMemberId };
  } catch (error: unknown) {
    logRsvpFailureTelemetry({
      eventId: opts.eventId,
      societyId: opts.societyId,
      resolvedMemberIdPresent: true,
      bootstrapMemberIdPresent,
      source: opts.source,
      error,
    });
    throw error;
  }
}
