import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  filterEventsForSegment,
  indexRegistrationsByEventId,
  isMemberPlayingEvent,
} from "./eventsListScreenModel";

function ev(partial: Partial<EventDoc> & { id: string }): EventDoc {
  return {
    society_id: "s1",
    name: "Test",
    format: "stableford",
    classification: "general",
    ...partial,
  } as EventDoc;
}

function reg(eventId: string, status: "in" | "out"): EventRegistration {
  return {
    id: "r1",
    society_id: "s1",
    event_id: eventId,
    member_id: "m1",
    status,
    paid: false,
    amount_paid_pence: 0,
    paid_at: null,
    marked_by_member_id: null,
    created_at: "",
    updated_at: "",
  };
}

describe("eventsListScreenModel", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  it("filters my events to playing registrations", () => {
    const events = [
      ev({ id: "e1", date: tomorrowStr }),
      ev({ id: "e2", date: tomorrowStr }),
      ev({ id: "e3", date: yesterdayStr, isCompleted: true }),
    ];
    const map = indexRegistrationsByEventId([
      reg("e1", "in"),
      reg("e2", "out"),
      reg("e3", "in"),
    ]);
    const mine = filterEventsForSegment(events, "my_events", map);
    expect(mine.map((e) => e.id)).toEqual(["e1", "e3"]);
    expect(isMemberPlayingEvent("e2", map)).toBe(false);
  });

  it("sorts upcoming nearest first", () => {
    const far = new Date();
    far.setDate(far.getDate() + 10);
    const events = [
      ev({ id: "far", date: far.toISOString().slice(0, 10) }),
      ev({ id: "near", date: tomorrowStr }),
    ];
    const list = filterEventsForSegment(events, "upcoming", new Map());
    expect(list.map((e) => e.id)).toEqual(["near", "far"]);
  });
});
