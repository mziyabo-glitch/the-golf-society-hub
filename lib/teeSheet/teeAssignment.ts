import type { TeeSheetData, TeeSheetPlayer } from "@/lib/teeSheetPdf";
import type { TeeBlock } from "@/lib/whs";

export type TeeAssignment = "men" | "ladies" | null;

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

export function teeIndicatorForAssignment(data: TeeSheetData, assignment: TeeAssignment): { label: string; color: string } {
  if (assignment === "ladies") {
    return { label: data.ladiesTeeName?.trim() || "Ladies", color: "#C1121F" };
  }
  if (assignment === "men") {
    return { label: data.teeName?.trim() || "Men", color: "#E0B100" };
  }
  return { label: "Tee TBC", color: "#94A3B8" };
}

export function needsTeePolicyConfirmation(player: Pick<TeeSheetPlayer, "gender" | "teeAssignment">): boolean {
  const assignment = resolveTeeAssignment(player);
  return player.gender == null || assignment == null;
}

export function hasManualTeeOverride(player: Pick<TeeSheetPlayer, "manualOverride">): boolean {
  return player.manualOverride === true;
}
