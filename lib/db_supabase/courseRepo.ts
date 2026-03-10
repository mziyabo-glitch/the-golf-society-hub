import { supabase } from "@/lib/supabase";

export type CourseDoc = {
  id: string;
  name: string;
  city?: string | null;
  area?: string | null;
  county?: string | null;
  region?: string | null;
  country?: string | null;
};

function mapCourse(row: any): CourseDoc {
  return {
    id: row.id,
    name: row.name,
    city: row.city ?? row.county ?? row.region ?? row.area ?? null,
    area: row.area ?? null,
    county: row.county ?? null,
    region: row.region ?? null,
    country: row.country ?? null,
  };
}

export async function searchCourses(search = "", limit = 25): Promise<CourseDoc[]> {
  const trimmedSearch = search.trim();

  let query = supabase
    .from("courses")
    .select("id, name, area, country, region, county")
    .order("name", { ascending: true })
    .limit(limit);

  if (trimmedSearch) {
    query = query.ilike("name", `%${trimmedSearch}%`);
  }

  console.log("[courseRepo] searchCourses", {
    table: "courses",
    search: trimmedSearch,
    limit,
  });

  const { data, error } = await query;

  if (error) {
    console.error("[courseRepo] searchCourses failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to load courses");
  }

  console.log("[courseRepo] searchCourses returned", (data ?? []).length, "rows");
  return (data ?? []).map(mapCourse);
}
