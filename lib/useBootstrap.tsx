import { useEffect, useMemo, useRef, useState } from "react";
import { ensureProfile, ensureSignedIn, updateActiveSociety } from "@/lib/auth_supabase";
import { supabase } from "@/lib/supabase";

type BootstrapState = {
  loading: boolean;
  userId: string | null;
  profile: any | null;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  setActiveSociety: (societyId: string | null, memberId: string | null) => Promise<void>;
};

export function useBootstrap(): BootstrapState {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let timer: any;

    const run = async () => {
      try {
        setLoading(true);

        const user = await ensureSignedIn();
        if (!mounted.current) return;

        setUserId(user.id);

        const p = await ensureProfile(user.id);
        if (!mounted.current) return;
        setProfile(p);

        // Poll profile every 3s (simple + reliable)
        timer = setInterval(async () => {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (!mounted.current) return;
          if (!error && data) setProfile(data);
        }, 3000);
      } catch (e) {
        console.error("Bootstrap error:", e);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    run();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const activeSocietyId = useMemo(
    () => (profile?.active_society_id ?? null) as string | null,
    [profile]
  );

  const activeMemberId = useMemo(
    () => (profile?.active_member_id ?? null) as string | null,
    [profile]
  );

  const setActiveSociety = async (societyId: string | null, memberId: string | null) => {
    if (!userId) return;

    await updateActiveSociety({
      userId,
      activeSocietyId: societyId,
      activeMemberId: memberId,
    });

    // optimistic update
    setProfile((prev: any) => ({
      ...(prev ?? {}),
      id: userId,
      active_society_id: societyId,
      active_member_id: memberId,
    }));
  };

  return {
    loading,
    userId,
    profile,
    activeSocietyId,
    activeMemberId,
    setActiveSociety,
  };
}
