import { supabase } from "@/lib/supabase";

export type CourseDoc = {
  id: string;
  societyId: string;
  name: string;
  address?: string;
  postcode?: string;
  status?: string;
  notes?: string;
  mapsUrl?: string;
  googlePlaceId?: string;
  updatedAt?: string | null;
};

type CourseInput = Omit<CourseDoc, "id" | "updatedAt">;

function mapCourse(row: any): CourseDoc {
  return {
    id: row.id,
    societyId: row.society_id,
    name: row.name,
    address: row.address ?? undefined,
    postcode: row.postcode ?? undefined,
    status: row.status ?? undefined,
    notes: row.notes ?? undefined,
    mapsUrl: row.maps_url ?? undefined,
    googlePlaceId: row.google_place_id ?? undefined,
    updatedAt: row.updated_at ?? null,
  };
}

export async function createCourse(input: CourseInput): Promise<CourseDoc> {
  const payload: Record<string, unknown> = {
    society_id: input.societyId,
    name: input.name,
    address: input.address ?? null,
    postcode: input.postcode ?? null,
    status: input.status ?? "active",
    notes: input.notes ?? null,
    maps_url: input.mapsUrl ?? null,
    google_place_id: input.googlePlaceId ?? null,
  };

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create course");
  }
  return mapCourse(data);
}

export async function getCourseDoc(id: string): Promise<CourseDoc | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load course");
  }
  return data ? mapCourse(data) : null;
}

export function subscribeCoursesBySociety(
  societyId: string,
  onChange: (courses: CourseDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const items = await listCoursesBySociety(societyId);
      if (active) onChange(items);
    } catch (error: any) {
      if (active && onError) onError(error);
    }
  };

  fetchOnce();
  const timer = setInterval(fetchOnce, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export async function listCoursesBySociety(societyId: string): Promise<CourseDoc[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("society_id", societyId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load courses");
  }
  return (data ?? []).map(mapCourse);
}

export async function updateCourseDoc(id: string, updates: Partial<CourseDoc>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.address !== undefined) payload.address = updates.address;
  if (updates.postcode !== undefined) payload.postcode = updates.postcode;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.mapsUrl !== undefined) payload.maps_url = updates.mapsUrl;
  if (updates.googlePlaceId !== undefined) payload.google_place_id = updates.googlePlaceId;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("courses")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message || "Failed to update course");
  }
}

export async function deleteCourseDoc(id: string): Promise<void> {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) {
    throw new Error(error.message || "Failed to delete course");
  }
}
