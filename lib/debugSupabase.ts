import { supabase } from "./supabase";

export async function debugSupabaseSession(tag: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log(
    `[supabase-debug:${tag}] anonKeyPresent=${!!anon} tokenPresent=${!!token} tokenLen=${token?.length ?? 0}`
  );
}
