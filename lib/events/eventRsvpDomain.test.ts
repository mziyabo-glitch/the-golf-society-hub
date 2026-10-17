import { describe, expect, it } from "vitest";

import { mapPublicRsvpError } from "@/lib/eventInvitePublic";

import {
  mapRsvpErrorCodeToInlineMessage,
  parsePostgresRsvpMessage,
  RSVP_UNLINKED_MEMBER_BODY,
  RSVP_UNLINKED_MEMBER_TITLE,
} from "./eventRsvpDomain";

describe("parsePostgresRsvpMessage", () => {
  it("maps legacy not-found copy", () => {
    expect(parsePostgresRsvpMessage("No member found with that email for this event")).toBe("RSVP_MEMBER_NOT_FOUND");
  });

  it("maps canonical rsvp_member_not_found", () => {
    expect(parsePostgresRsvpMessage("rsvp_member_not_found")).toBe("RSVP_MEMBER_NOT_FOUND");
  });

  it("maps unlinked, auth, mismatch, closed, ambiguous", () => {
    expect(parsePostgresRsvpMessage("rsvp_member_unlinked")).toBe("RSVP_MEMBER_UNLINKED");
    expect(parsePostgresRsvpMessage("rsvp_auth_required")).toBe("RSVP_AUTH_REQUIRED");
    expect(parsePostgresRsvpMessage("rsvp_not_allowed")).toBe("RSVP_NOT_ALLOWED");
    expect(parsePostgresRsvpMessage("rsvp_closed")).toBe("RSVP_CLOSED");
    expect(parsePostgresRsvpMessage("multiple_members_found")).toBe("RSVP_AMBIGUOUS_EMAIL");
    expect(parsePostgresRsvpMessage("rsvp_event_not_found")).toBe("RSVP_EVENT_NOT_FOUND");
    expect(parsePostgresRsvpMessage("Event not found")).toBe("RSVP_EVENT_NOT_FOUND");
  });
});

describe("mapPublicRsvpError", () => {
  it("maps new rsvp_* tokens from the database", () => {
    expect(mapPublicRsvpError("rsvp_member_not_found")).toContain("No member found");
    expect(mapPublicRsvpError("rsvp_auth_required")).toMatch(/sign in/i);
    expect(mapPublicRsvpError("rsvp_not_allowed")).toMatch(/another member/i);
  });
});

describe("mapRsvpErrorCodeToInlineMessage", () => {
  it("returns empty string for unlinked (UI uses dedicated card)", () => {
    expect(mapRsvpErrorCodeToInlineMessage("RSVP_MEMBER_UNLINKED")).toBe("");
  });

  it("uses explicit ambiguous copy (not empty / not generic)", () => {
    const m = mapRsvpErrorCodeToInlineMessage("RSVP_AMBIGUOUS_EMAIL");
    expect(m.length).toBeGreaterThan(40);
    expect(m).toMatch(/society|roster|joint/i);
  });

  it("returns member-not-found and auth copy", () => {
    expect(mapRsvpErrorCodeToInlineMessage("RSVP_MEMBER_NOT_FOUND")).toContain("No member found");
    expect(mapRsvpErrorCodeToInlineMessage("RSVP_AUTH_REQUIRED")).toMatch(/sign in/i);
  });

  it("exposes unlinked card copy constants", () => {
    expect(RSVP_UNLINKED_MEMBER_TITLE.length).toBeGreaterThan(5);
    expect(RSVP_UNLINKED_MEMBER_BODY).toContain("society");
  });
});
