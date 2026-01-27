import { supabase } from "@/lib/supabase";
import { createSociety } from "@/lib/db/societyRepo";
import { createMember } from "@/lib/db/memberRepo";
import { setActiveSocietyAndMember } from "@/lib/db/profileRepo";

export async function runSupabaseDevTest() {
  if (!__DEV__) {
    throw new Error("runSupabaseDevTest is dev-only.");
  }

  const { data: authData, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message || "Failed to read auth user");
  }
  if (!authData?.user) {
    throw new Error("No authenticated user found");
  }

  const user = authData.user;
  const suffix = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 12);

  const society = await createSociety({
    name: `Dev Test Society ${suffix}`,
    country: "Test",
    created_by: user.id,
  });

  const memberId = await createMember({
    society_id: society.id,
    user_id: user.id,
    name: user.email ? user.email.split("@")[0] : "Dev Captain",
    display_name: "Dev Captain",
    email: user.email ?? null,
    role: "captain",
  });

  await setActiveSocietyAndMember(user.id, society.id, memberId);

  return { society, memberId };
}
