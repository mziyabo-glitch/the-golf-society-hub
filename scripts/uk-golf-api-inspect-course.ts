import dotenv from "dotenv";
import { UkGolfApiProvider } from "@/lib/server/ukGolfApiProvider";

dotenv.config();

function parseQueryArg(argv: string[]): string {
  const idx = argv.findIndex((a) => a === "--query");
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const inline = argv.find((a) => a.startsWith("--query="));
  if (inline) return inline.slice("--query=".length).trim();
  return "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

async function main(): Promise<void> {
  const query = parseQueryArg(process.argv.slice(2));
  if (!query) {
    throw new Error('Missing --query. Example: npm run course-import:ukgolfapi:inspect-course -- --query "Upavon"');
  }

  const provider = new UkGolfApiProvider();
  provider.assertConfigured();

  const clubs = await provider.searchClubs(query);
  if (clubs.length === 0) throw new Error(`No clubs found for "${query}"`);
  const club = clubs[0]!;
  const courses = await provider.getClubCourses(club.id);
  if (courses.length === 0) throw new Error(`No courses found for club "${club.name}"`);
  const course = courses[0]!;

  const detail = await provider.getCourseDetail(course.id);
  const raw = detail.raw;
  const topLevelKeys = Object.keys(raw);
  const teeRows = (Array.isArray(raw.tee_sets) ? raw.tee_sets : Array.isArray(raw.teeSets) ? raw.teeSets : Array.isArray(raw.tees) ? raw.tees : []) as unknown[];
  const firstTee = asRecord(teeRows[0] ?? null);
  const firstTeeHoles = firstTee
    ? ((Array.isArray(firstTee.holes) ? firstTee.holes : Array.isArray(firstTee.scorecard) ? firstTee.scorecard : []) as unknown[])
    : [];
  const firstTeeHole = asRecord(firstTeeHoles[0] ?? null);

  console.log("[course-import:ukgolfapi:inspect-course] summary");
  console.log(
    JSON.stringify(
      {
        query,
        club: { id: club.id, name: club.name },
        course: { id: course.id, name: course.name },
        topLevelKeys,
        teeSetArrayField:
          Array.isArray(raw.tee_sets) ? "tee_sets" : Array.isArray(raw.teeSets) ? "teeSets" : Array.isArray(raw.tees) ? "tees" : null,
        teeSetCount: teeRows.length,
        firstTeeKeys: firstTee ? Object.keys(firstTee) : [],
        firstTeeHoleKeys: firstTeeHole ? Object.keys(firstTeeHole) : [],
        firstTeeRatingSlope: firstTee
          ? {
              courseRating:
                firstTee.course_rating ?? firstTee.rating ?? null,
              slopeRating: firstTee.slope_rating ?? firstTee.slope ?? null,
              parTotal: firstTee.par_total ?? firstTee.par ?? null,
              totalYardage:
                firstTee.total_yardage ?? firstTee.total_yards ?? firstTee.yardage ?? firstTee.yards ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[course-import:ukgolfapi:inspect-course] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
