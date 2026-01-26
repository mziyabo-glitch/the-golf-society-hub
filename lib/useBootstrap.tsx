import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { ensureProfile, ensureSignedIn, updateActiveSociety } from "@/lib/auth_supabase";
import { supabase } from "@/lib/supabase";

type BootstrapState = {
  loading: boolean;
  error: string | null;
  userId: string | null;
  profile: any | null;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  societyId: string | null; // alias for activeSocietyId for layout compatibility
  setActiveSociety: (societyId: string | null, memberId: string | null) => Promise<void>;
  refresh: () => void;
  // Backward-compatible aliases for onboarding.tsx
  ready: boolean;
  user: { uid: string } | null;
};

const BootstrapContext = createContext<BootstrapState | null>(null);

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const value = useBootstrapInternal();
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapState {
  const ctx = useContext(BootstrapContext);
  if (ctx) return ctx;
  // Fallback for direct usage (without provider) - shouldn't happen in normal use
  return useBootstrapInternal();
}

function useBootstrapInternal(): BootstrapState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
        setError(null);

        const user = await ensureSignedIn();
        if (!mounted.current) return;

        setUserId(user.id);

        const p = await ensureProfile(user.id);
        if (!mounted.current) return;
        setProfile(p);

        // Poll profile every 3s (simple + reliable)
        timer = setInterval(async () => {
          const { data, error: pollErr } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (!mounted.current) return;
          if (!pollErr && data) setProfile(data);
        }, 3000);
      } catch (e: any) {
        console.error("Bootstrap error:", e);
        if (mounted.current) setError(e?.message || "Bootstrap failed");
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    run();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [refreshKey]);

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

  const refresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return {
    loading,
    error,
    userId,
    profile,
    activeSocietyId,
    activeMemberId,
    societyId: activeSocietyId, // alias for layout compatibility
    setActiveSociety,
    refresh,
    // Backward-compatible aliases for onboarding.tsx
    ready: !loading,
    user: userId ? { uid: userId } : null,
  };
}
