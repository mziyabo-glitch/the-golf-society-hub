import { enqueueCourseSyncJob } from "@/lib/courseSyncJobs";

export async function GET(req: Request) {
  try {
    const pathParts = new URL(req.url).pathname.split("/");
    const id = pathParts[pathParts.length - 1];
    const url = `https://api.golfcourseapi.com/v1/courses/${id}`;

    console.log("[golf/course] GET request:", { id, url });

    if (!id) {
      console.error("[golf/course] 400: Missing course id");
      return Response.json({ error: "Missing course id" }, { status: 400 });
    }

    const apiKey = process.env.GOLF_API_KEY ?? process.env.NEXT_PUBLIC_GOLF_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Golf API key missing in environment variables" },
        { status: 500 }
      );
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const bodyText = await response.text();
    let data: unknown;
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      data = { raw: bodyText?.slice(0, 500) };
    }

    console.log("[golf/course] GolfCourseAPI response:", {
      status: response.status,
      statusText: response.statusText,
      courseId: id,
      bodyPreview: typeof data === "object" && data && "name" in (data as object)
        ? (data as { name?: string }).name
        : "(no name)",
      errorPreview: typeof data === "object" && data && "error" in (data as object)
        ? (data as { error?: string }).error
        : undefined,
    });

    if (response.status === 401) {
      console.error("[golf/course] GolfCourseAPI authorization failed. Check API key format.");
      return Response.json(
        { error: "Golf API authentication failed" },
        { status: 401 }
      );
    }

    if (!response.ok) {
      console.error("[golf/course] GolfCourseAPI error:", {
        status: response.status,
        url,
        courseId: id,
        body: bodyText?.slice(0, 1000),
      });
      return Response.json(
        { error: (data as { error?: string })?.error || bodyText || `Golf API error (${response.status})` },
        { status: response.status }
      );
    }

    if (response.ok && data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const courseName = (obj.name ?? obj.course_name ?? "") as string;
      const apiId = Number(id);
      if (Number.isFinite(apiId)) {
        console.log("[golf/course] live fetch succeeded, enqueueing sync job", { api_id: apiId });
        enqueueCourseSyncJob({
          api_id: apiId,
          course_name: courseName || undefined,
          job_type: "sync_course",
          payload: obj as Record<string, unknown>,
        }).catch((err) => console.warn("[golf/course] sync job enqueue failed:", (err as Error)?.message));
      }
    }

    return Response.json(typeof data === "object" && data ? data : {});
  } catch (error) {
    console.error("[golf/course] Golf API error:", error);
    return Response.json({ error: "Failed to fetch course" }, { status: 500 });
  }
}
