/**
 * Cron endpoint for course import job worker.
 * Call via: GET/POST /api/cron/process-course-jobs
 * Secure with CRON_SECRET header to prevent public abuse.
 */
import { runWorker } from "@/lib/courseEnrichmentWorker";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

async function handleRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret") ?? authHeader?.replace(/^Bearer\s+/i, "");

  if (CRON_SECRET && cronSecret !== CRON_SECRET) {
    console.warn("[cron] process-course-jobs: unauthorized");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { processed, succeeded } = await runWorker(5);
    return Response.json({
      ok: true,
      processed,
      succeeded,
    });
  } catch (err) {
    console.error("[cron] process-course-jobs error:", err);
    return Response.json(
      { error: (err as Error)?.message ?? "Worker failed" },
      { status: 500 }
    );
  }
}
