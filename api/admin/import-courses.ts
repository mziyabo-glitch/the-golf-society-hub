import { importUkCourses } from "../../lib/server/importUkCourses";

export default async function handler(req: any, res: any): Promise<void> {
  const method = String(req?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const result = await importUkCourses();
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Import failed." });
  }
}
