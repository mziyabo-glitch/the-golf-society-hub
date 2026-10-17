import { describe, expect, it } from "vitest";
import type { EventSocietyInput } from "./jointEventTypes";
import { eventSocietyInputsEqual, normalizeEventSocietyInput } from "./eventSocietiesUtils";

const host: EventSocietyInput = {
  society_id: "11111111-1111-1111-1111-111111111111",
  role: "host",
  has_society_oom: true,
};

const guest: EventSocietyInput = {
  society_id: "22222222-2222-2222-2222-222222222222",
  role: "participant",
  has_society_oom: true,
  society_oom_name: "Guest OOM",
};

describe("eventSocietyInputsEqual", () => {
  it("returns true for identical participating societies", () => {
    expect(eventSocietyInputsEqual([host, guest], [host, guest])).toBe(true);
  });

  it("returns true regardless of input order", () => {
    expect(eventSocietyInputsEqual([guest, host], [host, guest])).toBe(true);
  });

  it("returns false when society list changes", () => {
    const otherGuest: EventSocietyInput = { ...guest, society_id: "33333333-3333-3333-3333-333333333333" };
    expect(eventSocietyInputsEqual([host, guest], [host, otherGuest])).toBe(false);
  });

  it("returns false when OOM flag or custom name changes", () => {
    expect(
      eventSocietyInputsEqual([host, guest], [host, { ...guest, has_society_oom: false }]),
    ).toBe(false);
    expect(
      eventSocietyInputsEqual([host, guest], [host, { ...guest, society_oom_name: "Other" }]),
    ).toBe(false);
  });

  it("normalizes blank OOM names to null", () => {
    expect(
      normalizeEventSocietyInput({ ...guest, society_oom_name: "  " }).society_oom_name,
    ).toBeNull();
  });
});
