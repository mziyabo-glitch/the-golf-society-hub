import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { UkGolfApiProvider, summarizeRawShape } from "@/lib/server/ukGolfApiProvider";

dotenv.config();

function parseQueryArg(argv: string[]): string {
  const idx = argv.findIndex((a) => a === "--query");
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const inline = argv.find((a) => a.startsWith("--query="));
  if (inline) return inline.slice("--query=".length).trim();
  return "";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "query";
}

function redact(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((v) => redact(v));
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (key.includes("key") || key.includes("token") || key.includes("authorization") || key.includes("secret")) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const query = parseQueryArg(process.argv.slice(2));
  if (!query) {
    throw new Error('Missing --query. Example: npm run course-import:ukgolfapi:inspect -- --query "Upavon"');
  }

  const provider = new UkGolfApiProvider();
  provider.assertConfigured();

  const clubs = await provider.searchClubs(query);
  if (clubs.length === 0) throw new Error(`No clubs found for "${query}"`);
  const club = clubs[0]!;

  const courses = await provider.getClubCourses(club.id);
  if (courses.length === 0) throw new Error(`No courses found for club "${club.name}"`);
  const course = courses[0]!;

  const scorecard = await provider.getCourseScorecard(course.id);
  const teeSets = await provider.discoverCourseTeeSets(course.id);
  const raw = redact(scorecard.raw);
  const shape = summarizeRawShape(scorecard.raw);

  const base = slugify(query);
  const dir = resolvePath(process.cwd(), "reports", "uk-golf-api-inspect");
  await mkdir(dir, { recursive: true });
  const outPath = resolvePath(dir, `${base}-scorecard.raw.json`);
  await writeFile(outPath, JSON.stringify(raw, null, 2), "utf8");

  console.log("[course-import:ukgolfapi:inspect] summary");
  console.log(JSON.stringify({
    query,
    club: { id: club.id, name: club.name },
    course: { id: course.id, name: course.name },
    outputFile: outPath,
    availableTeeSets: teeSets,
    topLevelKeys: shape.topLevelKeys,
    arrays: shape.arrays,
  }, null, 2));
}

main().catch((error) => {
  console.error("[course-import:ukgolfapi:inspect] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
