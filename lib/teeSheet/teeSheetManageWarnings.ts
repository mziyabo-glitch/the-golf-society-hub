export type TeeSheetManageWarningGroup = {
  players?: { member_id?: string | null; guest_id?: string | null }[];
};

export type TeeSheetManageWarningKind =
  | 'paid_not_on_sheet'
  | 'ineligible_on_sheet'
  | 'duplicate_players'
  | 'joint_paid_missing_from_pool'
  | 'draft_published_count_mismatch';

export type TeeSheetManageWarning = {
  kind: TeeSheetManageWarningKind;
  message: string;
  /** Paid member IDs not on the tee sheet (for review navigation). */
  missingPaidMemberIds?: string[];
};

export type TeeSheetManageWarningInput = {
  paidMemberIds: string[];
  eligibleMemberIds: string[];
  groups: TeeSheetManageWarningGroup[];
  publishedPlayerCount: number | null;
  draftPlayerCount: number;
  isJointEvent: boolean;
  jointPaidMissingFromPoolCount?: number;
};

function countPlayersOnSheet(groups: TeeSheetManageWarningGroup[]): {
  memberIds: string[];
  guestIds: string[];
  total: number;
} {
  const memberIds: string[] = [];
  const guestIds: string[] = [];
  for (const g of groups) {
    for (const p of g.players ?? []) {
      if (p.member_id) memberIds.push(p.member_id);
      else if (p.guest_id) guestIds.push(p.guest_id);
    }
  }
  return { memberIds, guestIds, total: memberIds.length + guestIds.length };
}

function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    else seen.add(id);
  }
  return [...dupes];
}

/**
 * Build administrator warnings for the event manage screen tee-sheet section.
 */
export function buildTeeSheetManageWarnings(input: TeeSheetManageWarningInput): TeeSheetManageWarning[] {
  const warnings: TeeSheetManageWarning[] = [];
  const { memberIds: onSheetMemberIds, total: onSheetTotal } = countPlayersOnSheet(input.groups);
  const onSheetSet = new Set(onSheetMemberIds);
  const eligibleSet = new Set(input.eligibleMemberIds);

  const paidNotOnSheet = input.paidMemberIds.filter((id) => !onSheetSet.has(id));
  if (paidNotOnSheet.length > 0) {
    const paidCount = input.paidMemberIds.length;
    warnings.push({
      kind: 'paid_not_on_sheet',
      message: `${paidCount} player${paidCount === 1 ? '' : 's'} ${paidCount === 1 ? 'is' : 'are'} marked as paid, but only ${onSheetTotal} ${onSheetTotal === 1 ? 'is' : 'are'} currently on the tee sheet.`,
      missingPaidMemberIds: paidNotOnSheet,
    });
  }

  const ineligibleOnSheet = onSheetMemberIds.filter((id) => !eligibleSet.has(id));
  if (ineligibleOnSheet.length > 0) {
    warnings.push({
      kind: 'ineligible_on_sheet',
      message: `${ineligibleOnSheet.length} player${ineligibleOnSheet.length === 1 ? '' : 's'} on the tee sheet ${ineligibleOnSheet.length === 1 ? 'is' : 'are'} no longer eligible for this event.`,
    });
  }

  const duplicateMemberIds = findDuplicateIds(onSheetMemberIds);
  if (duplicateMemberIds.length > 0) {
    warnings.push({
      kind: 'duplicate_players',
      message: `The tee sheet contains ${duplicateMemberIds.length} duplicate player${duplicateMemberIds.length === 1 ? '' : 's'}.`,
    });
  }

  if (input.isJointEvent && (input.jointPaidMissingFromPoolCount ?? 0) > 0) {
    const n = input.jointPaidMissingFromPoolCount!;
    warnings.push({
      kind: 'joint_paid_missing_from_pool',
      message: `This joint event has ${n} paid player${n === 1 ? '' : 's'} missing from the combined player pool.`,
    });
  }

  if (
    input.publishedPlayerCount != null &&
    input.draftPlayerCount !== input.publishedPlayerCount
  ) {
    warnings.push({
      kind: 'draft_published_count_mismatch',
      message: `The saved tee sheet has ${input.draftPlayerCount} players but the published version has ${input.publishedPlayerCount}.`,
    });
  }

  return warnings;
}
