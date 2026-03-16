/**
 * On-demand course seeding: fetch from Golf API, save locally, enqueue enrichment jobs.
 * POST /api/courses/seed
 * Body: { api_id: number }
 */
import { getCourseById } from "@/lib/golfApi";
import { importCourse } from "@/lib/importCourse";
import { enqueueEnrichmentJobs } from "@/lib/courseImportJobs";
import { isValidUuid } from "@/lib/uuid";

export async function POST(req: Request) {
  try {
    let body: { api_id?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const apiId = body?.api_id != null ? Number(body.api_id) : null;
    if (!Number.isFinite(apiId)) {
      return Response.json({ error: "api_id required" }, { status: 400 });
    }

    const apiCourse = await getCourseById(apiId);
    const result = await importCourse(apiCourse);
    const { courseId, courseName, tees, imported } = result;

    if (isValidUuid(courseId)) {
      enqueueEnrichmentJobs(courseId).catch((err) =>
        console.warn("[courses/seed] enqueue failed:", err)
      );
    }

    return Response.json({
      courseId: courseId || "",
      courseName,
      tees: tees.map((t) => ({
        id: t.id,
        teeName: t.teeName,
        courseRating: t.courseRating,
        slopeRating: t.slopeRating,
        parTotal: t.parTotal,
        gender: t.gender,
        yards: t.yards,
      })),
      imported,
    });
  } catch (err) {
    console.error("[courses/seed] error:", err);
    return Response.json(
      { error: (err as Error)?.message ?? "Seed failed" },
      { status: 500 }
    );
  }
}
