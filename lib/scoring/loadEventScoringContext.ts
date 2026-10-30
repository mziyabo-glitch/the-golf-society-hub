/**
 * Loads {@link EventScoringContext} from Supabase using **immutable event course data only**:
 * `events`, `event_courses`, `event_course_holes`, and `members` for handicaps.
 * Does not use live `course_tees` / `course_holes` for rating or hole layout (see `getEventCourseContext` options).
 *
 * Default Supabase/repo imports are **dynamic** so Vitest can test pure scoring without loading the RN client graph.
 */

import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { EventHoleSnapshotRow, EventTeeRatingSnapshot } from "@/types/eventCourseScoring";
import { normalizeEventFormat } from "@/lib/scoring/eventFormat";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";
import { calcPlayingHandicap } from "@/lib/whs";
import type { EventHoleSnapshot, EventScoringContext, EventScoringPlayerInput, EventScoringTeeSnapshot } from "@/lib/scoring/eventScoringTypes";
import { validateEventHoleSnapshotSet } from "@/lib/scoring/eventScoringReadiness";

export type LoadEventScoringContextDeps = {
  getEvent: (eventId: string) => Promise<EventDoc | null>;
  /** Must use snapshot tables only (e.g. `getEventCourseContext(id, { includeLiveTee: false })`). */
  getEventCourseContextForScoring: (eventId: string) => Promise<import("@/types/eventCourseScoring").EventCourseContext | null>;
  getMembersByIds: (memberIds: string[]) => Promise<MemberDoc[]>;
};

function mapSnapshot(s: EventTeeRatingSnapshot | null): EventScoringTeeSnapshot {
  if (!s || s.courseRating == null || s.slopeRating == null || s.parTotal == null) {
    throw new Error("loadEventScoringContext: incomplete tee rating snapshot on event_courses.");
  }
  const cr = Number(s.courseRating);
  const sr = Math.round(Number(s.slopeRating));
  const pt = Math.round(Number(s.parTotal));
  if (!Number.isFinite(cr) || !Number.isFinite(sr) || sr <= 0 || !Number.isFinite(pt)) {
    throw new Error("loadEventScoringContext: invalid tee snapshot numbers.");
  }
  return {
    teeName: s.teeName ?? null,
    courseRating: cr,
    slopeRating: sr,
    parTotal: pt,
  };
}

function mapHoles(rows: EventHoleSnapshotRow[]): EventHoleSnapshot[] {
  return rows.map((r) => ({
    holeNumber: r.hole_number,
    par: r.par,
    yardage: r.yardage,
    strokeIndex: r.stroke_index,
  }));
}

function displayName(m: MemberDoc): string {
  return (m.displayName || m.display_name || m.name || "Member").trim() || "Member";
}

function createDefaultLoadDeps(): LoadEventScoringContextDeps {
  return {
    getEvent: async (eventId: string) => (await import("@/lib/db_supabase/eventRepo")).getEvent(eventId),
    getEventCourseContextForScoring: async (eventId: string) =>
      (await import("@/lib/db_supabase/courseRepo")).getEventCourseContext(eventId, { includeLiveTee: false }),
    getMembersByIds: async (memberIds: string[]) => (await import("@/lib/db_supabase/memberRepo")).getMembersByIds(memberIds),
  };
}

/**
 * @throws If event, snapshots, or hole set are not ready for scoring.
 */
export async function loadEventScoringContext(
  eventId: string,
  deps: Partial<LoadEventScoringContextDeps> = {},
): Promise<EventScoringContext> {
  const d = { ...createDefaultLoadDeps(), ...deps };
  const ev = await d.getEvent(eventId);
  if (!ev?.id) throw new Error(`loadEventScoringContext: event ${eventId} not found.`);

  const rawFormat = String(ev.format ?? "").trim();
  const format = normalizeEventFormat(rawFormat);

  const allowanceRaw = ev.handicapAllowance ?? ev.handicap_allowance;
  const allowance =
    allowanceRaw != null && Number.isFinite(Number(allowanceRaw))
      ? Math.min(1, Math.max(0.1, Number(allowanceRaw)))
      : 0.95;

  const ctx = await d.getEventCourseContextForScoring(eventId);
  if (!ctx) throw new Error("loadEventScoringContext: could not load event course context.");

  const holeIssues = validateEventHoleSnapshotSet(ctx.holes);
  if (holeIssues.length) {
    throw new Error(`loadEventScoringContext: invalid hole snapshots:\n- ${holeIssues.join("\n- ")}`);
  }

  const teeSnapshot = mapSnapshot(ctx.teeRatingSnapshot);
  const holes = mapHoles(ctx.holes);

  const playerIds = Array.isArray(ev.playerIds) ? ev.playerIds.map(String) : [];
  const members = playerIds.length ? await d.getMembersByIds(playerIds) : [];
  const byId = new Map(members.map((m) => [m.id, m]));

  const players: EventScoringPlayerInput[] = playerIds.map((id) => {
    const m = byId.get(id);
    const hiRaw = m?.handicapIndex ?? m?.handicap_index;
    const hi = hiRaw != null && Number.isFinite(Number(hiRaw)) ? Number(hiRaw) : null;
    let courseHandicap: number | null = null;
    let playingHandicap: number | null = null;
    if (hi != null) {
      courseHandicap = calculateCourseHandicap(hi, teeSnapshot.slopeRating, teeSnapshot.courseRating, teeSnapshot.parTotal);
      playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
    }
    return {
      memberId: id,
      displayName: m ? displayName(m) : "Unknown member",
      handicapIndex: hi,
      courseHandicap,
      playingHandicap,
    };
  });

  const societyId = String(ev.society_id ?? "");
  if (!societyId) throw new Error("loadEventScoringContext: event missing society_id.");

  return {
    eventId: String(ev.id),
    societyId,
    name: String(ev.name ?? "Event"),
    format,
    rawFormat,
    handicapAllowance: allowance,
    teeSnapshot,
    holes,
    players,
  };
}
