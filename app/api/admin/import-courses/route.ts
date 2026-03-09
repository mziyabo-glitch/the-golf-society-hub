import { importUkCourses } from "../../../../lib/server/importUkCourses";

export async function POST(): Promise<Response> {
  try {
    const result = await importUkCourses();
    return Response.json(result);
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Import failed." },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  return POST();
}
