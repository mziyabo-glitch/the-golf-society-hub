import { supabase, requireSupabaseSession } from "@/lib/supabase";

export type TeeSetDoc = {
  id: string;
  societyId: string;
  courseId: string;
  name: string;
  teeColor: string;
  appliesTo: "male" | "female";
  par: number;
  courseRating: number;
  slopeRating: number;
  updatedAt?: string | null;
};

type TeeSetInput = Omit<TeeSetDoc, "id" | "updatedAt">;

function mapTeeSet(row: any): TeeSetDoc {
  return {
    id: row.id,
    societyId: row.society_id,
    courseId: row.course_id,
    name: row.name,
    teeColor: row.tee_color ?? row.name,
    appliesTo: row.applies_to,
    par: row.par,
    courseRating: row.course_rating,
    slopeRating: row.slope_rating,
    updatedAt: row.updated_at ?? null,
  };
}

export async function createTeeSet(input: TeeSetInput): Promise<TeeSetDoc> {
  await requireSupabaseSession("teesetRepo.createTeeSet");
  const payload = {
    society_id: input.societyId,
    course_id: input.courseId,
    name: input.name,
    tee_color: input.teeColor,
    applies_to: input.appliesTo,
    par: input.par,
    course_rating: input.courseRating,
    slope_rating: input.slopeRating,
  };

  const { data, error } = await supabase
    .from("teesets")
    .insert(payload)
    .select("id, society_id, course_id, name, tee_color, applies_to, par, course_rating, slope_rating, updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create tee set");
  }
  return mapTeeSet(data);
}

export function subscribeTeesetsBySociety(
  societyId: string,
  onChange: (teesets: TeeSetDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const items = await listTeesetsBySociety(societyId);
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

export async function listTeesetsBySociety(societyId: string): Promise<TeeSetDoc[]> {
  await requireSupabaseSession("teesetRepo.listTeesetsBySociety");
  const { data, error } = await supabase
    .from("teesets")
    .select("id, society_id, course_id, name, tee_color, applies_to, par, course_rating, slope_rating, updated_at")
    .eq("society_id", societyId);

  if (error) {
    throw new Error(error.message || "Failed to load tee sets");
  }
  return (data ?? []).map(mapTeeSet);
}

export async function listTeesetsByCourse(courseId: string): Promise<TeeSetDoc[]> {
  await requireSupabaseSession("teesetRepo.listTeesetsByCourse");
  const { data, error } = await supabase
    .from("teesets")
    .select("id, society_id, course_id, name, tee_color, applies_to, par, course_rating, slope_rating, updated_at")
    .eq("course_id", courseId);

  if (error) {
    throw new Error(error.message || "Failed to load tee sets");
  }
  return (data ?? []).map(mapTeeSet);
}

export async function updateTeeSetDoc(id: string, updates: Partial<TeeSetDoc>): Promise<void> {
  await requireSupabaseSession("teesetRepo.updateTeeSetDoc");
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.teeColor !== undefined) payload.tee_color = updates.teeColor;
  if (updates.appliesTo !== undefined) payload.applies_to = updates.appliesTo;
  if (updates.par !== undefined) payload.par = updates.par;
  if (updates.courseRating !== undefined) payload.course_rating = updates.courseRating;
  if (updates.slopeRating !== undefined) payload.slope_rating = updates.slopeRating;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("teesets")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message || "Failed to update tee set");
  }
}

export async function deleteTeeSetDoc(id: string): Promise<void> {
  await requireSupabaseSession("teesetRepo.deleteTeeSetDoc");
  const { error } = await supabase.from("teesets").delete().eq("id", id);
  if (error) {
    throw new Error(error.message || "Failed to delete tee set");
  }
}
