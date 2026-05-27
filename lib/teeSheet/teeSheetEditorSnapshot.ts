/**
 * Serializable editor state for dirty detection (tee sheet ManCo screen).
 */

export type TeeSheetEditorSnapshot = {
  groups: { groupNumber: number; playerIds: string[] }[];
  startTime: string;
  teeInterval: string;
  ntpHolesInput: string;
  ldHolesInput: string;
  selectedPlayerIds: string[];
};

export function buildTeeSheetEditorSnapshot(input: {
  groups: { groupNumber: number; players: { id: string }[] }[];
  startTime: string;
  teeInterval: string;
  ntpHolesInput: string;
  ldHolesInput: string;
  selectedPlayerIds: string[];
}): TeeSheetEditorSnapshot {
  const nonEmpty = input.groups.filter((g) => g.players.length > 0);
  return {
    groups: nonEmpty.map((g) => ({
      groupNumber: g.groupNumber,
      playerIds: g.players.map((p) => String(p.id)),
    })),
    startTime: (input.startTime || "08:00").trim() || "08:00",
    teeInterval: String(input.teeInterval || "10"),
    ntpHolesInput: input.ntpHolesInput ?? "",
    ldHolesInput: input.ldHolesInput ?? "",
    selectedPlayerIds: [...new Set(input.selectedPlayerIds.map(String))].sort(),
  };
}

export function teeSheetEditorSnapshotsEqual(a: TeeSheetEditorSnapshot, b: TeeSheetEditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
