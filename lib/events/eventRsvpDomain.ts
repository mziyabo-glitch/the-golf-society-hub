/**
 * Domain types and error parsing for public event member RSVP (invite flow).
 * Identity for writes must come from authenticated linked membership — see migrations 121+.
 */

export type RsvpErrorCode =
  | "RSVP_MEMBER_NOT_FOUND"
  | "RSVP_MEMBER_UNLINKED"
  | "RSVP_AUTH_REQUIRED"
  | "RSVP_EVENT_NOT_FOUND"
  | "RSVP_NOT_ALLOWED"
  | "RSVP_CLOSED"
  | "RSVP_AMBIGUOUS_EMAIL"
  | "RSVP_INVALID_EMAIL"
  | "RSVP_UNKNOWN";

export type PublicRsvpMemberEmailResolveStatus = "not_found" | "unlinked" | "linked" | "ambiguous";

export type PublicRsvpMemberEmailResolve = {
  status: PublicRsvpMemberEmailResolveStatus;
  memberId?: string;
  societyId?: string;
  userId?: string;
};

export class EventRsvpError extends Error {
  readonly code: RsvpErrorCode;

  constructor(code: RsvpErrorCode, rawMessage?: string) {
    super(rawMessage ?? code);
    this.name = "EventRsvpError";
    this.code = code;
  }
}

/** Map Postgres RAISE / legacy messages to a stable RSVP error code. */
export function parsePostgresRsvpMessage(raw: string): RsvpErrorCode {
  const m = raw || "";

  if (m.includes("rsvp_member_not_found") || m.includes("No member found with that email")) {
    return "RSVP_MEMBER_NOT_FOUND";
  }
  if (m.includes("rsvp_member_unlinked")) {
    return "RSVP_MEMBER_UNLINKED";
  }
  if (m.includes("rsvp_auth_required")) {
    return "RSVP_AUTH_REQUIRED";
  }
  if (m.includes("rsvp_event_not_found") || m.includes("Event not found")) {
    return "RSVP_EVENT_NOT_FOUND";
  }
  if (m.includes("rsvp_not_allowed")) {
    return "RSVP_NOT_ALLOWED";
  }
  if (m.includes("rsvp_closed")) {
    return "RSVP_CLOSED";
  }
  if (m.includes("multiple_members_found")) {
    return "RSVP_AMBIGUOUS_EMAIL";
  }
  if (m.includes("Enter a valid email")) {
    return "RSVP_INVALID_EMAIL";
  }
  return "RSVP_UNKNOWN";
}

/** Short inline copy for errors shown on the public invite form (not the unlinked card). */
export function mapRsvpErrorCodeToInlineMessage(code: RsvpErrorCode): string {
  switch (code) {
    case "RSVP_MEMBER_NOT_FOUND":
      return "No member found with that email for this event.";
    case "RSVP_MEMBER_UNLINKED":
      return ""; // caller should render the join-society-first card instead
    case "RSVP_AUTH_REQUIRED":
      return "Please sign in to respond to this event.";
    case "RSVP_EVENT_NOT_FOUND":
      return "This event could not be found.";
    case "RSVP_NOT_ALLOWED":
      return "You can’t respond as another member. Sign in with the account linked to that membership.";
    case "RSVP_CLOSED":
      return "RSVP is closed for this event.";
    case "RSVP_AMBIGUOUS_EMAIL":
      return RSVP_AMBIGUOUS_EMAIL_BODY;
    case "RSVP_INVALID_EMAIL":
      return "Enter a valid email address.";
    default:
      return "";
  }
}

export const RSVP_UNLINKED_MEMBER_TITLE = "Join the society in the app first";

export const RSVP_UNLINKED_MEMBER_BODY =
  "We found your email on the society record, but this membership is not yet linked to an app account. Please sign in and join the society before responding to this event.";

/** Invite screen card when the same email exists on more than one participating-society roster row. */
export const RSVP_AMBIGUOUS_EMAIL_TITLE = "That email isn’t unique for this event";

export const RSVP_AMBIGUOUS_EMAIL_BODY =
  "This event includes one or more societies (for example a joint day). The same email appears on more than one participating roster, so this page can’t choose the correct membership. Sign in to the app and RSVP from your linked account so we record the right society.";
