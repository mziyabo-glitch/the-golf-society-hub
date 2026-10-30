import dotenv from "dotenv";
import { createHash } from "node:crypto";
import {
  UkGolfApiProvider,
  classifyUkDryRunStatus,
  normalizeUkTeeLabel,
  validateUkGolfTee,
} from "@/lib/server/ukGolfApiProvider";

dotenv.config();

function parseQueryArg(argv: string[]): string {
  const idx = argv.findIndex((a) => a === "--query");
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const inline = argv.find((a) => a.startsWith("--query="));
  if (inline) return inline.slice("--query=".length).trim();
  return "";
}

async function main(): Promise<void> {
  const query = parseQueryArg(process.argv.slice(2));
  if (!query) {
    throw new Error('Missing --query. Example: npm run course-import:ukgolfapi:inspect-tees -- --query "Upavon"');
  }

  const provider = new UkGolfApiProvider();
  provider.assertConfigured();

  const clubs = await provider.searchClubs(query);
  if (clubs.length === 0) throw new Error(`No clubs found for "${query}"`);
  const club = clubs[0]!;

  const courses = await provider.getClubCourses(club.id);
  if (courses.length === 0) throw new Error(`No courses found for club "${club.name}"`);
  const course = courses[0]!;

  const discovered = await provider.discoverCourseTeeSets(course.id);
  const rows: Array<Record<string, unknown>> = [];
  const checksums: string[] = [];
  for (const tee of discovered) {
    if (!tee.id) continue;
    const { scorecard, debug } = await provider.getCourseScorecardForTeeWithDebug(course.id, tee.id);
    const bestTee = scorecard.tees[0] ?? null;
    const normalized = normalizeUkTeeLabel(bestTee?.teeName ?? tee.label);
    const validation = bestTee ? validateUkGolfTee(bestTee) : null;
    const siPresent = bestTee?.holes.filter((h) => h.strokeIndex != null).length ?? 0;
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          holes: bestTee?.holes ?? [],
          courseRating: bestTee?.courseRating ?? null,
          slopeRating: bestTee?.slopeRating ?? null,
          totalYardage: bestTee?.totalYardage ?? null,
        }),
      )
      .digest("hex");
    checksums.push(checksum);
    const status = classifyUkDryRunStatus(
      scorecard,
      validation ? [validation] : undefined,
    );

    rows.push({
      teeLabelDiscovered: tee.label,
      teeSetId: tee.id,
      endpointPatternWorked: debug.endpointUsed,
      endpointPatternsTried: debug.attemptedEndpoints,
      returnedTeeSet: bestTee?.teeName ?? null,
      checksum,
      normalizedTeeSet: normalized.teeSet,
      teeColour: normalized.teeColour,
      gender: normalized.gender,
      courseRating: bestTee?.courseRating ?? null,
      slopeRating: bestTee?.slopeRating ?? null,
      parTotal: bestTee?.parTotal ?? null,
      totalYardage: bestTee?.totalYardage ?? null,
      siCompleteness: bestTee ? `${siPresent}/${bestTee.holes.length}` : "0/0",
      dryRunStatus: status,
      first3Holes: (bestTee?.holes ?? []).slice(0, 3).map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        strokeIndex: h.strokeIndex,
      })),
    });
  }

  console.log("[course-import:ukgolfapi:inspect-tees] summary");
  const checksumDistinct = new Set(checksums);
  const warning =
    discovered.length > 1 && checksumDistinct.size <= 1
      ? "Provider discovered multiple tee sets but scorecard endpoint returned the same tee for each request."
      : null;
  console.log(
    JSON.stringify(
      {
        query,
        club: { id: club.id, name: club.name },
        course: { id: course.id, name: course.name },
        discoveredTeeSets: discovered,
        perTeeFetchSupported: checksumDistinct.size > 1,
        warning,
        teeScorecards: rows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[course-import:ukgolfapi:inspect-tees] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
