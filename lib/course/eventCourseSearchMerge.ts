export type EventCourseSearchHit =
  | {
      source: "db";
      key: string;
      courseId: string;
      name: string;
      location?: string | null;
    }
  | {
      source: "api";
      key: string;
      apiId: number;
      name: string;
      club_name?: string;
      location?: string;
    };

type DbCourseSearchHit = { id: string; name: string; location?: string | null };
type ApiCourseSearchHit = { id: number; name: string; club_name?: string; location?: string };

function normalizeCourseSearchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Prefer DB hits when names match — keeps seeded WHS ratings authoritative. */
export function mergeEventCourseSearchHits(
  dbHits: DbCourseSearchHit[],
  apiHits: ApiCourseSearchHit[],
): EventCourseSearchHit[] {
  const dbKeys = new Set(dbHits.map((h) => normalizeCourseSearchKey(h.name)));
  const merged: EventCourseSearchHit[] = dbHits.map((h) => ({
    source: "db",
    key: `db:${h.id}`,
    courseId: h.id,
    name: h.name,
    location: h.location ?? null,
  }));

  for (const hit of apiHits) {
    const label = (hit.club_name || hit.name || "").trim();
    const key = normalizeCourseSearchKey(label);
    if (!label || dbKeys.has(key)) continue;
    merged.push({
      source: "api",
      key: `api:${hit.id}`,
      apiId: hit.id,
      name: label,
      club_name: hit.club_name,
      location: hit.location,
    });
  }

  return merged;
}
