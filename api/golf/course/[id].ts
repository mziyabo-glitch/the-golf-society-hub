export async function GET(req: Request) {
  try {
    const pathParts = new URL(req.url).pathname.split("/");
    const id = pathParts[pathParts.length - 1];
    if (!id) {
      return Response.json({ error: "Missing course id" }, { status: 400 });
    }

    const apiKey = process.env.GOLF_API_KEY ?? process.env.NEXT_PUBLIC_GOLF_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Golf API key missing in environment variables" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.golfcourseapi.com/v1/courses/${id}`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 401) {
      console.error("GolfCourseAPI authorization failed. Check API key format.");
      return Response.json(
        { error: "Golf API authentication failed" },
        { status: 401 }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("Golf API error:", error);
    return Response.json({ error: "Failed to fetch course" }, { status: 500 });
  }
}
