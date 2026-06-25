import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/db_supabase/jointEventRepo", () => ({
  getJointEventTeeSheet: vi.fn(),
}));

import {
  assertTeeSheetUpsertWritten,
  assertTeeTimePublished,
  competitionHolesInputFromPersisted,
  editorGroupsFromCanonicalRows,
  formatTeeSheetPersistenceError,
  jointMetaFromParticipatingSocieties,
  parseEditorCompetitionHoles,
  policyByPlayerId,
  reconcileJointEventMeta,
  resolveCompetitionHolesInputForReload,
  shouldLoadPersistedTeeSheetDraft,
  teeAssignmentFromGender,
} from "@/lib/teeSheet/teeSheetDraftPersistence";
import {
  ensurePaidGuestsInEditorGroups,
  hydrateEditorGroupsWithPaidGuests,
  hydratePersistedEditorGroupsWithGuestAssignments,
} from "@/lib/teeSheet/teeSheetEditorGuests";
import { guestPlayerId } from "@/lib/teeSheetEligibility";
import type { CanonicalTeeSheetResult } from "@/lib/teeSheet/canonicalTeeSheet";

describe("teeSheet draft persistence helpers", () => {
  it("prefers tee_groups canonical over computed fallback", () => {
    const canonical = {
      source: "tee_groups",
      groups: [{ groupNumber: 1, teeTime: "08:00", players: [{ id: "a", name: "A", handicapIndex: 1 }] }],
    } as CanonicalTeeSheetResult;
    expect(shouldLoadPersistedTeeSheetDraft(canonical)).toBe(true);
    expect(
      shouldLoadPersistedTeeSheetDraft({
        ...canonical,
        source: "computed_fallback",
      }),
    ).toBe(false);
  });

  it("reconciles under-reported joint meta from RPC participating societies", () => {
    const fromTable = {
      is_joint_event: false,
      linkedSocietyCount: 1,
      participantSocietyIds: ["millbrook"],
    };
    const reconciled = reconcileJointEventMeta("ev1", fromTable, ["millbrook", "meon-valley"]);
    expect(reconciled.is_joint_event).toBe(true);
    expect(reconciled.linkedSocietyCount).toBe(2);
  });

  it("keeps editor group player order from canonical rows", () => {
    const groups = editorGroupsFromCanonicalRows(
      [
        {
          groupNumber: 2,
          teeTime: "08:10",
          players: [
            { id: "b", name: "Bob", handicapIndex: 12 },
            { id: "a", name: "Ann", handicapIndex: 8 },
          ],
        },
        {
          groupNumber: 1,
          teeTime: "08:00",
          players: [{ id: "c", name: "Cal", handicapIndex: 20 }],
        },
      ],
      { persistedPolicy: policyByPlayerId([]) },
    );
    expect(groups.map((g) => g.groupNumber)).toEqual([2, 1]);
    expect(groups[0]?.players.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("applies manual sex and tee policy on reload mapping", () => {
    const groups = editorGroupsFromCanonicalRows(
      [{ groupNumber: 1, teeTime: "08:00", players: [{ id: "m1", name: "Pat", handicapIndex: 10 }] }],
      {
        persistedPolicy: policyByPlayerId([
          {
            id: "pol1",
            event_id: "ev1",
            player_id: "m1",
            manual_gender: "female",
            manual_tee_assignment: "ladies",
            manual_tee_override: "ladies",
          },
        ]),
      },
    );
    const player = groups[0]?.players[0];
    expect(player?.gender).toBe("female");
    expect(player?.teeAssignment).toBe("ladies");
    expect(player?.manualGenderSet).toBe(true);
    expect(teeAssignmentFromGender("female", null)).toBe("ladies");
  });

  it("does not re-inject removed paid guests when hydrating persisted draft", () => {
    const paidGuest = {
      id: "g1",
      society_id: "s1",
      event_id: "ev1",
      name: "Removed Guest",
      attendee_type: "guest" as const,
      sex: "male" as const,
      handicap_index: 18,
      paid: true,
      created_at: "",
      updated_at: "",
    };
    const saved = [{ groupNumber: 1, players: [{ id: "m1", name: "Member", handicapIndex: 10, gender: null }] }];
    const hydrated = hydratePersistedEditorGroupsWithGuestAssignments(saved, [paidGuest]);
    expect(hydrated.flatMap((g) => g.players).map((p) => p.id)).toEqual(["m1"]);

    const withPool = hydrateEditorGroupsWithPaidGuests(saved, [paidGuest]);
    expect(withPool[0]?.players.some((p) => p.id === guestPlayerId("g1"))).toBe(true);

    const onlyPool = ensurePaidGuestsInEditorGroups([], [paidGuest]);
    expect(onlyPool[0]?.players[0]?.id).toBe(guestPlayerId("g1"));
  });

  it("joint meta from two participating societies is joint", () => {
    const meta = jointMetaFromParticipatingSocieties(["soc-a", "soc-b"]);
    expect(meta.is_joint_event).toBe(true);
    expect(meta.participantSocietyIds).toEqual(["soc-a", "soc-b"]);
  });

  it("surfaces save failure when upsert writes zero rows", () => {
    expect(() =>
      assertTeeSheetUpsertWritten({
        groupsRequested: 2,
        playersRequested: 8,
        groupsInserted: 0,
        playersInserted: 0,
      }),
    ).toThrow(/tee groups/i);
    expect(() =>
      assertTeeSheetUpsertWritten({
        groupsRequested: 1,
        playersRequested: 4,
        groupsInserted: 1,
        playersInserted: 0,
      }),
    ).toThrow(/tee group players/i);
  });

  it("treats publish as success when the refreshed event has tee_time_published_at", () => {
    expect(() =>
      assertTeeTimePublished({ teeTimePublishedAt: "2026-06-25T21:11:23.211Z" }),
    ).not.toThrow();
  });

  it("surfaces a real publish error when tee_time_published_at is not set", () => {
    // Regression: publish_tee_times RPC failing (e.g. text->time cast) or an RLS no-op must NOT
    // report a false success. The refreshed event then has no published_at and we must throw.
    expect(() => assertTeeTimePublished({ teeTimePublishedAt: null })).toThrow(
      /tee_time_published_at/i,
    );
    expect(() => assertTeeTimePublished(null)).toThrow(/tee_time_published_at/i);
    expect(() => assertTeeTimePublished(undefined)).toThrow(/permissions|Save Draft/i);
  });

  it("maps RLS errors to friendly copy outside dev", () => {
    expect(formatTeeSheetPersistenceError(new Error("no rows written — check permissions"))).toMatch(
      /don't have permission/i,
    );
    vi.stubGlobal("__DEV__", true);
    expect(formatTeeSheetPersistenceError(new Error("custom db error"))).toBe("custom db error");
    vi.stubGlobal("__DEV__", false);
  });

  it("round-trips NTP 12,14 through save/reload editor input", () => {
    const saved = parseEditorCompetitionHoles({ ntpHolesInput: "12, 14", ldHolesInput: "" });
    expect(saved).toEqual({ ok: true, nearestPinHoles: [12, 14], longestDriveHoles: [] });
    expect(competitionHolesInputFromPersisted(saved.ok ? saved.nearestPinHoles : [])).toBe("12, 14");
    expect(resolveCompetitionHolesInputForReload(saved.ok ? saved.nearestPinHoles : null)).toBe("12, 14");
  });

  it("round-trips LD 8,10 through save/reload editor input", () => {
    const saved = parseEditorCompetitionHoles({ ntpHolesInput: "", ldHolesInput: "8, 10" });
    expect(saved).toEqual({ ok: true, nearestPinHoles: [], longestDriveHoles: [8, 10] });
    expect(competitionHolesInputFromPersisted(saved.ok ? saved.longestDriveHoles : [])).toBe("8, 10");
    expect(resolveCompetitionHolesInputForReload(saved.ok ? saved.longestDriveHoles : null)).toBe("8, 10");
  });

  it("does not overwrite in-progress input with blank when DB has no holes", () => {
    expect(resolveCompetitionHolesInputForReload(null, "12, 14")).toBe("12, 14");
    expect(resolveCompetitionHolesInputForReload([], "8, 10")).toBe("8, 10");
  });

  it("prefers persisted DB holes over blank editor state", () => {
    expect(resolveCompetitionHolesInputForReload([12, 14], "")).toBe("12, 14");
  });

  it("surfaces invalid competition hole validation errors", () => {
    const invalid = parseEditorCompetitionHoles({ ntpHolesInput: "abc", ldHolesInput: "8" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toMatch(/Nearest the Pin/i);
    }
  });
});
