import {
  calcCourseHandicap,
  calcPlayingHandicap,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import { groupPlayers, type PlayerGroup } from "@/lib/teeSheetGrouping";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { resolveTeeAssignment, teeSettingsForAssignment } from "@/lib/teeSheet/teeAssignment";
import type { PosterGroup, PosterPlayer } from "@/lib/teeSheet/TeeSheetPoster";
import { paginateTeeSheetGroups } from "@/lib/teeSheet/teeSheetPageLimits";

export type TeeSheetPosterPage = PosterGroup[];

/** Build paginated poster groups from encoded share payload (no 12-group truncation). */
export function buildTeeSheetPages(data: TeeSheetData): TeeSheetPosterPage[] {
  const allowance = data.handicapAllowance ?? DEFAULT_ALLOWANCE;

  const playersWithHandicaps: PosterPlayer[] = data.players.map((player, idx) => {
    const gender = player.gender ?? null;
    const teeAssignment = resolveTeeAssignment(player);
    const playerTee = teeSettingsForAssignment(data, teeAssignment);
    const courseHandicap = calcCourseHandicap(player.handicapIndex, playerTee);
    const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

    return {
      id: player.id || String(idx),
      name: player.name,
      handicapIndex: player.handicapIndex ?? null,
      courseHandicap,
      playingHandicap: player.playingHandicapSnapshot ?? playingHandicap,
      gender,
      teeAssignment,
      manualOverride: player.manualOverride === true,
    };
  });

  let groups: PlayerGroup[];
  if (data.preGrouped) {
    const groupMap = new Map<number, { players: PosterPlayer[]; teeTime?: string | null }>();
    data.players.forEach((player, idx) => {
      const groupNum = player.group ?? 1;
      const playerWithCalcs = playersWithHandicaps[idx];
      if (!groupMap.has(groupNum)) groupMap.set(groupNum, { players: [], teeTime: player.teeTime ?? null });
      const row = groupMap.get(groupNum)!;
      row.players.push(playerWithCalcs);
      if (!row.teeTime && player.teeTime) row.teeTime = player.teeTime;
    });

    groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupNumber, grouped]) => ({
        groupNumber,
        players: grouped.players,
        teeTime: grouped.teeTime ?? undefined,
      }));
  } else {
    groups = groupPlayers(playersWithHandicaps, true);
  }

  const baseStartTime = isValidTime(data.startTime) ? data.startTime! : "08:00";
  const intervalMinutes =
    Number.isFinite(data.teeTimeInterval) && data.teeTimeInterval! > 0 ? data.teeTimeInterval! : 8;

  const nonEmptyGroups = groups.filter((group) => group.players.length > 0);
  const groupsWithTimes: TeeSheetPosterPage[number][] = nonEmptyGroups.map((group) => ({
    ...group,
    teeTime: isValidTime(group.teeTime)
      ? group.teeTime!
      : buildTeeTime(baseStartTime, intervalMinutes, Math.max(0, group.groupNumber - 1)),
  }));

  return paginateTeeSheetGroups(groupsWithTimes);
}

function isValidTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  return Number.isFinite(hours) && Number.isFinite(minutes);
}

function buildTeeTime(startTime: string, intervalMinutes: number, index: number): string {
  const [hoursStr, minutesStr] = startTime.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const baseMinutes = hours * 60 + minutes + intervalMinutes * index;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;
  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
}
