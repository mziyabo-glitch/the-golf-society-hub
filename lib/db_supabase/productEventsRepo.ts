import { supabase } from "@/lib/supabase";

export type ProductEventInsert = {
  event_name: string;
  user_id: string;
  society_id?: string | null;
  screen?: string | null;
  feature?: string | null;
  related_event_id?: string | null;
  user_role?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertProductEvent(row: ProductEventInsert): Promise<void> {
  const { error } = await supabase.from("product_events").insert({
    event_name: row.event_name,
    user_id: row.user_id,
    society_id: row.society_id ?? null,
    screen: row.screen ?? null,
    feature: row.feature ?? null,
    related_event_id: row.related_event_id ?? null,
    user_role: row.user_role ?? null,
    platform: row.platform ?? null,
    metadata: row.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
