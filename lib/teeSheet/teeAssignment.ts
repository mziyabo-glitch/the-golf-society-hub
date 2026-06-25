import type { TeeSheetData, TeeSheetPlayer } from "@/lib/teeSheetPdf";
import type { TeeBlock } from "@/lib/whs";
import { formatTeeRowLabel } from "@/lib/teeSheet/teeColour";

export type TeeAssignment = "men" | "ladies" | null;

export type TeeIndicator = {
  label: string;
};

export function resolveTeeAssignment(player: TeeSheetPlayer): TeeAssignment {
  // Policy: sex is authoritative when present.
  if (player.gender === "female") return "ladies";
  if (player.gender === "male") return "men";
  // Unknown sex preserves explicit assignment if one exists.
  if (player.teeAssignment === "men" || player.teeAssignment === "ladies") return player.teeAssignment;
  return null;
}

export function teeSettingsForAssignment(data: TeeSheetData, assignment: TeeAssignment): TeeBlock | null {
  if (assignment === "ladies") return data.ladiesTeeSettings ?? null;
  if (assignment === "men") return data.teeSettings ?? null;
  return null;
}

function teeNameForAssignment(data: TeeSheetData, assignment: TeeAssignment): string | null {
  if (assignment === "ladies") return data.ladiesTeeName ?? null;
  if (assignment === "men") return data.teeName ?? null;
  return null;
}

/** Compact tee label for group/player rows — uses event tee names (e.g. White / Red). */
export function compactTeeRowLabel(assignment: TeeAssignment, data: TeeSheetData): string {
  if (assignment == null) return "Tee TBC";
  return formatTeeRowLabel(teeNameForAssignment(data, assignment));
}

export function teeIndicatorForAssignment(data: TeeSheetData, assignment: TeeAssignment): TeeIndicator {
  if (assignment == null) {
    return { label: "Tee TBC" };
  }
  return { label: compactTeeRowLabel(assignment, data) };
}

export function needsTeePolicyConfirmation(player: Pick<TeeSheetPlayer, "gender" | "teeAssignment">): boolean {
  const assignment = resolveTeeAssignment(player);
  return player.gender == null || assignment == null;
}

export function hasManualTeeOverride(player: Pick<TeeSheetPlayer, "manualOverride">): boolean {
  return player.manualOverride === true;
}
