import type { ManCoDetails } from "@/lib/db_supabase/memberRepo";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import {
  buildTeeSheetDataFromCanonical,
  type CanonicalTeeSheetResult,
} from "@/lib/teeSheet/canonicalTeeSheet";
export type TeeSheetExportGenderHint = {
  id: string;
  gender?: "male" | "female" | null;
  teeAssignment?: "men" | "ladies" | null;
  manualOverride?: boolean;
  playingHandicapSnapshot?: number | null;
};

export type BuildTeeSheetExportPayloadInput = {
  canonical: CanonicalTeeSheetResult;
  societyId: string;
  societyName: string;
  logoUrl?: string | null;
  manCo: ManCoDetails;
  nearestPinHoles: number[] | null;
  longestDriveHoles: number[] | null;
  startTime: string | null;
  teeTimeInterval: number;
  /** Flat list from editor — used to attach gender from ManCo UI */
  genderHints: TeeSheetExportGenderHint[];
};

/** Build encoded share-route payload from persisted canonical + editor gender hints. */
export function buildTeeSheetExportPayload(input: BuildTeeSheetExportPayloadInput): TeeSheetData {
  const { canonical, genderHints, ...opts } = input;

  let exportData = buildTeeSheetDataFromCanonical(canonical, {
    societyId: opts.societyId,
    societyName: opts.societyName,
    logoUrl: opts.logoUrl,
    jointSocieties:
      canonical.isJoint && canonical.jointParticipatingSocieties?.length
        ? canonical.jointParticipatingSocieties.map((s) => ({
            societyId: s.society_id,
            societyName: s.society_name || s.society_id,
            logoUrl: null,
          }))
        : undefined,
    manCo: opts.manCo,
    nearestPinHoles: opts.nearestPinHoles,
    longestDriveHoles: opts.longestDriveHoles,
    startTime: opts.startTime,
    teeTimeInterval: opts.teeTimeInterval,
  });

  const genderById = new Map<string, "male" | "female" | null>(
    genderHints.map((p) => [p.id, p.gender ?? null] as const),
  );
  const teeAssignmentById = new Map<string, "men" | "ladies" | null>(
    genderHints.map((p) => [p.id, p.teeAssignment ?? null] as const),
  );
  const manualOverrideById = new Map<string, boolean>(
    genderHints.map((p) => [p.id, p.manualOverride === true] as const),
  );
  const phSnapshotById = new Map<string, number | null>(
    genderHints.map((p) => [p.id, p.playingHandicapSnapshot ?? null] as const),
  );

  return {
    ...exportData,
    players: exportData.players.map((p) => ({
      ...p,
      gender: (p.id ? genderById.get(p.id) : null) ?? p.gender ?? null,
      teeAssignment: (p.id ? teeAssignmentById.get(p.id) : null) ?? p.teeAssignment ?? null,
      manualOverride: p.id ? manualOverrideById.get(p.id) === true : false,
      playingHandicapSnapshot: (p.id ? phSnapshotById.get(p.id) : null) ?? p.playingHandicapSnapshot ?? null,
    })),
  };
}

