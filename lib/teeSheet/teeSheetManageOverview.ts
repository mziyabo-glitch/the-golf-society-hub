/**
 * Summary counts for the ManCo tee sheet management screen.
 */

export type TeeSheetManageOverviewStats = {
  registeredCount: number;
  paidCount: number;
  assignedCount: number;
  unassignedCount: number;
  /** Players on the sheet (any group, including unassigned bucket). */
  onSheetCount: number;
  /** Tee-eligible pool rows not yet placed on the sheet. */
  poolRemainingCount: number;
  draftLabel: string;
};

export type TeeSheetManageOverviewInput = {
  /** Attendee rows shown in the player pool (confirmed / attending). */
  registeredCount: number;
  paidAttendeeCount: number;
  groups: { groupNumber: number; players: { id: string }[] }[];
  /** Paid + confirmed players still available to add (not on sheet). */
  poolRemainingCount: number;
  isDirty: boolean;
  lastSavedAt: Date | null;
  teeTimePublishedAt: string | null | undefined;
  saving?: boolean;
  publishing?: boolean;
};

function playersInGroupNumber(
  groups: TeeSheetManageOverviewInput["groups"],
  groupNumber: number,
): number {
  return groups
    .filter((g) => g.groupNumber === groupNumber)
    .reduce((sum, g) => sum + g.players.length, 0);
}

function totalOnSheet(groups: TeeSheetManageOverviewInput["groups"]): number {
  return groups.reduce((sum, g) => sum + g.players.length, 0);
}

export function computeTeeSheetManageOverview(
  input: TeeSheetManageOverviewInput,
): TeeSheetManageOverviewStats {
  const onSheetCount = totalOnSheet(input.groups);
  const assignedCount = input.groups
    .filter((g) => g.groupNumber > 0)
    .reduce((sum, g) => sum + g.players.length, 0);
  const unassignedBucket = playersInGroupNumber(input.groups, 0);
  const unassignedCount = unassignedBucket + input.poolRemainingCount;

  let draftLabel: string;
  if (input.publishing) {
    draftLabel = "Publishing…";
  } else if (input.saving) {
    draftLabel = "Saving draft…";
  } else if (input.isDirty) {
    draftLabel = "Unsaved changes";
  } else if (input.lastSavedAt) {
    draftLabel = `Draft saved · ${input.lastSavedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else if (input.teeTimePublishedAt) {
    draftLabel = "Published — members see tee times";
  } else if (onSheetCount > 0) {
    draftLabel = "On-screen draft (not saved yet)";
  } else {
    draftLabel = "No draft saved yet";
  }

  return {
    registeredCount: input.registeredCount,
    paidCount: input.paidAttendeeCount,
    assignedCount,
    unassignedCount,
    onSheetCount,
    poolRemainingCount: input.poolRemainingCount,
    draftLabel,
  };
}
