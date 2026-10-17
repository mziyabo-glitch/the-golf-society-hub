import { describe, expect, it } from "vitest";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  eventDateKey,
  filterParticipantEventsForSocietyList,
  shouldSuppressParticipantEventForSocietyList,
} from "./eventListSocietyScope";

const ZGS = "3ddf9225-4220-4f72-80fc-6039ab39b523";
const M4 = "0eb58347-7da5-49b5-b908-ee80d246a389";

function event(
  id: string,
  societyId: string,
  date: string,
  name = id,
): Pick<EventDoc, "id" | "society_id" | "date" | "name"> {
  return { id, society_id: societyId, date, name };
}

describe("eventDateKey", () => {
  it("normalizes ISO timestamps to YYYY-MM-DD", () => {
    expect(eventDateKey("2026-08-01T00:00:00.000Z")).toBe("2026-08-01");
  });
});

describe("shouldSuppressParticipantEventForSocietyList", () => {
  it("suppresses partner-hosted Super Cup when society hosts same-day event", () => {
    const hostEvents = [event("oom10", ZGS, "2026-08-01", "OOM 10 - Super Cup")];
    const m4SuperCup = event("oom6", M4, "2026-08-01", "OOM 6 - Super Cup");

    expect(
      shouldSuppressParticipantEventForSocietyList({
        societyId: ZGS,
        hostEvents,
        participantEvent: m4SuperCup,
        participantSocietyIds: [M4, ZGS],
      }),
    ).toBe(true);
  });

  it("does not suppress for the host society", () => {
    const hostEvents = [event("oom6", M4, "2026-08-01", "OOM 6 - Super Cup")];
    const m4SuperCup = event("oom6", M4, "2026-08-01", "OOM 6 - Super Cup");

    expect(
      shouldSuppressParticipantEventForSocietyList({
        societyId: M4,
        hostEvents,
        participantEvent: m4SuperCup,
        participantSocietyIds: [M4, ZGS],
      }),
    ).toBe(false);
  });

  it("keeps joint events when participant society has no same-day host event", () => {
    const hostEvents = [event("zgs-other", ZGS, "2026-07-18", "OOM 8")];
    const millbrook = event("millbrook", M4, "2026-06-27", "OOM 4 - The Millbrook");

    expect(
      shouldSuppressParticipantEventForSocietyList({
        societyId: ZGS,
        hostEvents,
        participantEvent: millbrook,
        participantSocietyIds: [M4, ZGS],
      }),
    ).toBe(false);
  });

  it("does not suppress when society is not a participant on the merged event", () => {
    const hostEvents = [event("oom10", ZGS, "2026-08-01")];
    const m4Only = event("m4-only", M4, "2026-08-01");

    expect(
      shouldSuppressParticipantEventForSocietyList({
        societyId: ZGS,
        hostEvents,
        participantEvent: m4Only,
        participantSocietyIds: [M4],
      }),
    ).toBe(false);
  });
});

describe("filterParticipantEventsForSocietyList", () => {
  it("filters duplicate Super Cup while keeping other joint events", () => {
    const hostEvents = [event("oom10", ZGS, "2026-08-01") as EventDoc];
    const participantEvents = [
      event("oom6", M4, "2026-08-01") as EventDoc,
      event("millbrook", M4, "2026-06-27") as EventDoc,
    ];
    const societyIdsByEvent = new Map<string, string[]>([
      ["oom6", [M4, ZGS]],
      ["millbrook", [M4, ZGS]],
    ]);

    const filtered = filterParticipantEventsForSocietyList(
      ZGS,
      hostEvents,
      participantEvents,
      societyIdsByEvent,
    );

    expect(filtered.map((e) => e.id)).toEqual(["millbrook"]);
  });
});
