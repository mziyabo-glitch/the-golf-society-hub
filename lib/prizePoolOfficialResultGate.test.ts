import { describe, expect, it } from "vitest";
import { confirmedPrizePoolEntryHasOfficialScoredResult } from "@/lib/prizePoolOfficialResultGate";
import type { EventPrizePoolEntryRow } from "@/lib/event-prize-pools-types";
import type { EventResultDoc } from "@/lib/db_supabase/resultsRepo";

function row(
  partial: Partial<EventResultDoc> & Pick<EventResultDoc, "member_id" | "event_guest_id" | "society_id" | "day_value">,
): EventResultDoc {
  return {
    id: partial.id ?? "r1",
    society_id: partial.society_id,
    event_id: partial.event_id ?? "e1",
    member_id: partial.member_id,
    event_guest_id: partial.event_guest_id,
    points: partial.points ?? 0,
    day_value: partial.day_value,
    front_9_value: partial.front_9_value ?? null,
    back_9_value: partial.back_9_value ?? null,
    birdie_count: partial.birdie_count ?? null,
    position: partial.position ?? null,
    created_at: partial.created_at ?? "",
    updated_at: partial.updated_at ?? "",
  };
}

describe("confirmedPrizePoolEntryHasOfficialScoredResult", () => {
  const societyScope = "soc-a";

  it("guest confirmed + official guest result → eligible", () => {
    const entry = {
      pool_id: "pool-1",
      participant_type: "guest",
      guest_id: "g1",
      member_id: null,
      confirmed_by_pot_master: true,
    } as EventPrizePoolEntryRow;

    const resultByMemberId = new Map<string, EventResultDoc>();
    const resultByGuestKey = new Map<string, EventResultDoc>([
      [`${societyScope}:g1`, row({ society_id: societyScope, member_id: null, event_guest_id: "g1", day_value: 38 })],
    ]);

    expect(
      confirmedPrizePoolEntryHasOfficialScoredResult(entry, resultByMemberId, resultByGuestKey, societyScope),
    ).toBe(true);
  });

  it("guest in results but not a confirmed prize pool entrant row → gate is false when unconfirmed", () => {
    const entry = {
      pool_id: "pool-1",
      participant_type: "guest",
      guest_id: "g1",
      member_id: null,
      confirmed_by_pot_master: false,
    } as EventPrizePoolEntryRow;

    const resultByGuestKey = new Map<string, EventResultDoc>([
      [`${societyScope}:g1`, row({ society_id: societyScope, member_id: null, event_guest_id: "g1", day_value: 40 })],
    ]);

    expect(
      confirmedPrizePoolEntryHasOfficialScoredResult(
        entry,
        new Map(),
        resultByGuestKey,
        societyScope,
      ),
    ).toBe(false);
  });

  it("confirmed guest but no matching official result → false", () => {
    const entry = {
      pool_id: "pool-1",
      participant_type: "guest",
      guest_id: "g1",
      member_id: null,
      confirmed_by_pot_master: true,
    } as EventPrizePoolEntryRow;

    expect(
      confirmedPrizePoolEntryHasOfficialScoredResult(entry, new Map(), new Map(), societyScope),
    ).toBe(false);
  });

  it("confirmed member with official result → true", () => {
    const entry = {
      pool_id: "pool-1",
      participant_type: "member",
      member_id: "m1",
      guest_id: null,
      confirmed_by_pot_master: true,
    } as EventPrizePoolEntryRow;

    const resultByMemberId = new Map<string, EventResultDoc>([
      ["m1", row({ society_id: societyScope, member_id: "m1", event_guest_id: null, day_value: 36 })],
    ]);

    expect(
      confirmedPrizePoolEntryHasOfficialScoredResult(entry, resultByMemberId, new Map(), societyScope),
    ).toBe(true);
  });

  it("only requires official scored day value", () => {
    const entry = {
      pool_id: "pool-1",
      participant_type: "member",
      member_id: "m1",
      guest_id: null,
      confirmed_by_pot_master: true,
    } as EventPrizePoolEntryRow;

    const resultByMemberId = new Map<string, EventResultDoc>([
      ["m1", row({ society_id: societyScope, member_id: "m1", event_guest_id: null, day_value: 36 })],
    ]);

    expect(
      confirmedPrizePoolEntryHasOfficialScoredResult(entry, resultByMemberId, new Map(), societyScope),
    ).toBe(true);
  });
});
