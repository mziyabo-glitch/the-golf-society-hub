import { needsTeePolicyConfirmation, resolveTeeAssignment } from "@/lib/teeSheet/teeAssignment";

export type TeeSheetPublishPlayer = {
  id: string;
  name: string;
  gender?: "male" | "female" | null;
  teeAssignment?: "men" | "ladies" | null;
  handicapIndex?: number | null;
  playingHandicap?: number | null;
};

export type TeeSheetPublishGroup = {
  groupNumber: number;
  players: TeeSheetPublishPlayer[];
};

export type TeeSheetPublishValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const DEFAULT_MAX_PER_GROUP = 4;

function playerLabel(p: TeeSheetPublishPlayer): string {
  const name = (p.name || "").trim();
  return name.length > 0 ? name : p.id;
}

/**
 * Pre-publish checks — publish is blocked when `ok` is false; `warnings` are informational only.
 */
export function validateTeeSheetForPublish(input: {
  groups: TeeSheetPublishGroup[];
  eligiblePlayerIds?: ReadonlySet<string>;
  maxPlayersPerGroup?: number;
}): TeeSheetPublishValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxPerGroup = input.maxPlayersPerGroup ?? DEFAULT_MAX_PER_GROUP;
  const nonEmpty = input.groups.filter((g) => g.players.length > 0);

  if (nonEmpty.length === 0) {
    errors.push("Add at least one player to a group before publishing.");
    return { ok: false, errors, warnings };
  }

  const seenIds = new Map<string, { name: string; groupNumber: number }>();
  for (const group of nonEmpty) {
    if (group.players.length > maxPerGroup) {
      errors.push(
        `Group ${group.groupNumber} has ${group.players.length} players (maximum ${maxPerGroup}).`,
      );
    }

    for (const player of group.players) {
      const id = String(player.id);
      const prior = seenIds.get(id);
      if (prior) {
        errors.push(
          `${playerLabel(player)} appears in group ${prior.groupNumber} and group ${group.groupNumber}.`,
        );
      } else {
        seenIds.set(id, { name: playerLabel(player), groupNumber: group.groupNumber });
      }

      if (input.eligiblePlayerIds && !id.startsWith("guest-") && !input.eligiblePlayerIds.has(id)) {
        errors.push(`${playerLabel(player)} is not tee-sheet eligible (must be paid and confirmed).`);
      }

      const assignment = resolveTeeAssignment({
        gender: player.gender ?? null,
        teeAssignment: player.teeAssignment ?? null,
      });
      if (needsTeePolicyConfirmation({ gender: player.gender ?? null, teeAssignment: assignment })) {
        errors.push(`${playerLabel(player)} needs sex or tee policy (shows Tee TBC).`);
      }

      if (
        assignment != null &&
        player.handicapIndex != null &&
        Number.isFinite(player.handicapIndex) &&
        (player.playingHandicap == null || !Number.isFinite(player.playingHandicap))
      ) {
        errors.push(`${playerLabel(player)} is missing a playing handicap (PH).`);
      }
    }
  }

  const emptyNumbered = input.groups.filter((g) => g.players.length === 0);
  if (emptyNumbered.length > 0) {
    warnings.push(`${emptyNumbered.length} empty group slot(s) will be omitted from the published sheet.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function formatTeeSheetPublishValidationMessage(result: TeeSheetPublishValidationResult): string {
  if (result.ok && result.warnings.length === 0) return "";
  const lines = [...result.errors, ...result.warnings];
  return lines.join("\n");
}
