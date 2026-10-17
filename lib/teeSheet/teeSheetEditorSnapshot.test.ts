import { describe, expect, it } from "vitest";
import {
  buildTeeSheetEditorSnapshot,
  teeSheetEditorSnapshotsEqual,
} from "@/lib/teeSheet/teeSheetEditorSnapshot";

describe("teeSheetEditorSnapshot", () => {
  it("detects group order changes as dirty", () => {
    const base = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "a" }, { id: "b" }] }],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "7",
      ldHolesInput: "",
      selectedPlayerIds: ["a", "b"],
    });
    const moved = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "b" }, { id: "a" }] }],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "7",
      ldHolesInput: "",
      selectedPlayerIds: ["a", "b"],
    });
    expect(teeSheetEditorSnapshotsEqual(base, base)).toBe(true);
    expect(teeSheetEditorSnapshotsEqual(base, moved)).toBe(false);
  });

  it("ignores empty groups in snapshot", () => {
    const snap = buildTeeSheetEditorSnapshot({
      groups: [
        { groupNumber: 1, players: [{ id: "a" }] },
        { groupNumber: 2, players: [] },
      ],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "",
      ldHolesInput: "",
      selectedPlayerIds: ["a"],
    });
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0].playerIds).toEqual(["a"]);
  });
});
