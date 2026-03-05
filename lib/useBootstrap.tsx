// lib/useBootstrap.tsx
// Bootstrap hook for auth and app state
// Uses singleton supabase client for consistent auth
// NO .select().single() after upsert to avoid 406 errors

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { getMySocieties, type MySocietyMembership } from "@/lib/db_supabase/mySocietiesRepo";

// ============================================================================
// Types
// ============================================================================

type SocietyData = {
  id: string;
  name: string;
  joinCode?: string;
  country?: string;
  [key: string]: unknown;
};

type MemberData = {
  id: string;
  name?: string;
  displayName?: string;
  role?: string;
  roles?: string[];
  [key: string]: unknown;
};

type BootstrapState = {
  // Loading & error
  loading: boolean;
  membershipLoading: boolean;
  error: string | null;

  // Auth state
  userId: string | null;
  session: Session | null;

  // Profile & active pointers
  profile: any | null;
  activeSocietyId: string | null;
  activeMemberId: string | null;

  // Loaded data
  societyId: string | null;
  society: SocietyData | null;
  member: MemberData | null;

  // Multi-society
  memberships: MySocietyMembership[];
  switchSociety: (societyId: string) => Promise<void>;

  // Actions
  setActiveSociety: (societyId: string | null, memberId: string | null) => Promise<void>;
  setActiveSocietyId: (societyId: string | null) => void;
  setMember: (member: MemberData | null) => void;
  refresh: () => void;
  signOut: () => Promise<void>;

  // Aliases for backwards compatibility
  ready: boolean;
  bootstrapped: boolean;
  isSignedIn: boolean;
  user: { uid: string; activeSocietyId: string | null; activeMemberId: string | null } | null;
};

// ============================================================================
// Context
// ============================================================================

const BootstrapContext = createContext<BootstrapState | null>(null);
let warnedMissingBootstrapProvider = false;

const BOOTSTRAP_FALLBACK: BootstrapState = {
  loading: false,
  membershipLoading: false,
  error: "BootstrapProvider is missing",
  userId: null,
  session: null,
  profile: null,
  activeSocietyId: null,
  activeMemberId: null,
  societyId: null,
  society: null,
  member: null,
  memberships: [],
  switchSociety: async () => {},
  setActiveSociety: async () => {},
  setActiveSocietyId: () => {},
  setMember: () => {},
  refresh: () => {},
  signOut: async () => {},
  ready: true,
  bootstrapped: true,
  isSignedIn: false,
  user: null,
};

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const value = useBootstrapInternal();
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapState {
  const ctx = useContext(BootstrapContext);
  if (ctx) return ctx;
  // Safe fallback for components outside provider.
  // Avoid calling hooks conditionally (which can crash React at runtime).
  if (!warnedMissingBootstrapProvider) {
    warnedMissingBootstrapProvider = true;
    console.warn("[useBootstrap] BootstrapProvider missing; returning fallback state.");
  }
  return BOOTSTRAP_FALLBACK;
}

function normalizeMemberData(memberData: any): MemberData {
  const safeName =
    typeof memberData?.name === "string"
      ? memberData.name
      : typeof memberData?.display_name === "string"
        ? memberData.display_name
        : String(memberData?.name ?? memberData?.display_name ?? "");
  const safeRole = typeof memberData?.role === "string" ? memberData.role : undefined;
  const rawHi = memberData?.handicap_index;
  const safeHi = rawHi != null && typeof rawHi !== "object" ? rawHi : null;

  return {
    ...memberData,
    id: String(memberData?.id ?? ""),
    name: safeName,
    displayName: safeName,
    role: safeRole,
    roles: safeRole ? [safeRole] : ["member"],
    handicapIndex: safeHi,
    whsNumber:
      typeof memberData?.whs_number === "string"
        ? memberData.whs_number
        : memberData?.whs_number != null
          ? String(memberData.whs_number)
          : null,
    hasSeat: memberData?.has_seat ?? false,
  };
}

// ============================================================================
// Internal Hook
// ============================================================================

function useBootstrapInternal(): BootstrapState {
  const [loading, setLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [member, setMemberState] = useState<MemberData | null>(null);
  const [memberships, setMemberships] = useState<MySocietyMembership[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const mounted = useRef(true);
  const bootstrapRunRef = useRef(false);
  const bootstrapInFlight = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Main bootstrap effect
  useEffect(() => {
    let profilePollTimer: ReturnType<typeof setInterval> | null = null;

    const bootstrap = async () => {
      if (bootstrapInFlight.current) return;
      if (bootstrapRunRef.current && refreshKey === 0) return;
      bootstrapInFlight.current = true;
      bootstrapRunRef.current = true;

      try {
        setLoading(true);
        setError(null);

        // ----------------------------------------------------------------
        // Step 1: Get existing session (persisted from previous sign-in)
        // Session persistence: localStorage on web, SecureStore on native
        // ----------------------------------------------------------------
        console.log("[useBootstrap] === SESSION CHECK ===");

        const { data: { session: existingSession }, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("[useBootstrap] getSession error:", sessionError.message);
        }

        console.log("[useBootstrap] Session from storage:", existingSession ? "FOUND" : "NOT FOUND");

        let currentSession = existingSession ?? null;
        let currentUser: User | null = existingSession?.user ?? null;

        if (!currentSession || !currentUser) {
          // No session — user needs to sign in via the auth screen.
          console.log("[useBootstrap] No session — awaiting sign-in.");
          if (!mounted.current) return;
          setSession(null);
          setProfile(null);
          setSociety(null);
          setMemberState(null);
          setMembershipLoading(false);
          return;
        }

        console.log("[useBootstrap] Existing session found:", currentUser.id);

        if (!mounted.current) return;
        setSession(currentSession);

        // ----------------------------------------------------------------
        // Step 2: Ensure profile exists
        // IMPORTANT: upsert WITHOUT .select().single() to avoid 406 errors
        // Then fetch separately with .maybeSingle()
        // ----------------------------------------------------------------
        console.log("[useBootstrap] Ensuring profile for user:", currentUser.id);

        // Step 2a: Upsert without .select().single()
        // Only upsert the id — always safe regardless of migration state.
        const { error: upsertError } = await supabase
          .from("profiles")
          .upsert(
            { id: currentUser.id },
            { onConflict: "id" }
          );

        if (upsertError) {
          console.warn("[useBootstrap] Profile upsert warning:", upsertError.message);
          // Don't throw - profile might already exist
        }

        // Seed email from auth user (non-blocking — may fail if 031 not yet run)
        if (currentUser.email) {
          supabase
            .from("profiles")
            .update({ email: currentUser.email })
            .eq("id", currentUser.id)
            .then(({ error: emailErr }) => {
              if (emailErr) console.warn("[useBootstrap] Email seed skipped:", emailErr.message);
            });
        }

        // Step 2b: Fetch profile with .maybeSingle()
        const { data: profileData, error: profileSelectError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (profileSelectError) {
          console.error("[useBootstrap] Profile select error:", profileSelectError.message);
          throw new Error("Failed to load profile");
        }

        if (!mounted.current) return;

        let finalProfile = profileData;
        setProfile(finalProfile);
        console.log("[useBootstrap] Profile loaded:", finalProfile?.id);

        // ----------------------------------------------------------------
        // Step 2c: Load all memberships (multi-society support)
        // ----------------------------------------------------------------
        const allMemberships = await getMySocieties();
        if (!mounted.current) return;
        setMemberships(allMemberships);

        // ----------------------------------------------------------------
        // Step 3: Self-heal — if profile has no active_society_id but
        // the user has a membership, recover the pointers.
        // ----------------------------------------------------------------
        if (!finalProfile?.active_society_id && currentUser) {
          const healRow = allMemberships[0];
          if (healRow) {
            console.log("[useBootstrap] Self-heal: recovering pointers", {
              society_id: healRow.societyId,
              member_id: healRow.memberId,
            });
            const { error: healErr } = await supabase
              .from("profiles")
              .update({
                active_society_id: healRow.societyId,
                active_member_id: healRow.memberId,
              })
              .eq("id", currentUser.id);

            if (!mounted.current) return;

            if (!healErr) {
              finalProfile = {
                ...(finalProfile ?? {}),
                id: currentUser.id,
                active_society_id: healRow.societyId,
                active_member_id: healRow.memberId,
              };
              setProfile(finalProfile);
            } else {
              console.warn("[useBootstrap] Self-heal DB update failed:", healErr.message);
            }
          }
        }

        // ----------------------------------------------------------------
        // Step 4: Load society if active_society_id exists
        // ----------------------------------------------------------------
        if (finalProfile?.active_society_id) {
          console.log("[useBootstrap] Loading society:", finalProfile.active_society_id);

          const { data: societyData, error: societyError } = await supabase
            .from("societies")
            .select("*")
            .eq("id", finalProfile.active_society_id)
            .maybeSingle();

          if (societyError) {
            console.warn("[useBootstrap] Society load error:", societyError.message);
          }

          if (!mounted.current) return;
          if (societyData) {
            const safeSocietyName =
              typeof societyData.name === "string"
                ? societyData.name
                : String(societyData.name ?? "Society");

            setSociety({
              ...societyData,
              name: safeSocietyName,
              joinCode: societyData.join_code,
            });
          }
        }

        // ----------------------------------------------------------------
        // Step 5: Load membership by active society + current auth user
        // ----------------------------------------------------------------
        if (finalProfile?.active_society_id) {
          const targetSocietyId = finalProfile.active_society_id as string;
          const targetUserId = currentUser.id;
          setMembershipLoading(true);
          console.log("[useBootstrap] Membership lookup filters:", {
            society_id: targetSocietyId,
            user_id: targetUserId,
          });

          const { data: memberData, error: memberError } = await supabase
            .from("members")
            .select("*")
            .eq("society_id", targetSocietyId)
            .eq("user_id", targetUserId)
            .order("created_at", { ascending: false })
            .limit(1);

          if (!mounted.current) return;

          const firstMember = Array.isArray(memberData) ? memberData[0] : null;
          console.log("[useBootstrap] Membership lookup result:", {
            society_id: targetSocietyId,
            user_id: targetUserId,
            memberId: firstMember?.id ?? null,
            found: !!firstMember,
            error: memberError?.message ?? null,
          });

          if (memberError) {
            // Keep current member state during transient query issues.
            setMembershipLoading(false);
          } else if (firstMember) {
            setMemberState(normalizeMemberData(firstMember));

            if (finalProfile.active_member_id !== firstMember.id) {
              setProfile((prev: any) => ({
                ...(prev ?? {}),
                id: currentUser.id,
                active_society_id: targetSocietyId,
                active_member_id: firstMember.id,
              }));
            }
            setMembershipLoading(false);
          } else {
            // No matching member — preserve existing member if one was set
            // locally (e.g. from join flow) to avoid triggering the guard.
            setMembershipLoading(false);
          }
        } else {
          setMemberState(null);
          setMembershipLoading(false);
        }

        // ----------------------------------------------------------------
        // Step 5: Poll profile for updates (handles external changes)
        // ----------------------------------------------------------------
        profilePollTimer = setInterval(async () => {
          if (!currentUser) return;

          const { data, error: pollError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (!mounted.current) return;
          if (!pollError && data) {
            setProfile(data);
          }
        }, 5000);

        // Log session state AFTER bootstrap
        console.log("[useBootstrap] === BOOTSTRAP COMPLETE ===");
        console.log("[useBootstrap] Final session user ID:", currentUser?.id);
        console.log("[useBootstrap] Session will persist across reloads");

      } catch (e: any) {
        console.error("[useBootstrap] Bootstrap error:", e);
        if (mounted.current) {
          // Ensure error is always a plain string (guard against structured error objects)
          const rawMsg = e?.message;
          const errStr =
            typeof rawMsg === "string" && rawMsg.length > 0
              ? rawMsg
              : "Bootstrap failed";
          setError(errStr);
        }
      } finally {
        bootstrapInFlight.current = false;
        if (mounted.current) setMembershipLoading(false);
        if (mounted.current) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // Temporary debug log for auth state change events
        console.log("[useBootstrap] Auth state change:", {
          event,
          hasSession: !!newSession,
          userId: newSession?.user?.id ?? null,
        });

        if (mounted.current) {
          setSession(newSession);

          // Refresh bootstrap on sign in/out/recovery.
          // IMPORTANT: set loading=true in the SAME synchronous batch as
          // setRefreshKey so the loading overlay stays up. Without this,
          // there is a render frame where isSignedIn=true but profile/
          // society/member are still null, causing the Home screen to
          // flash PersonalModeHome ("old state") before bootstrap reloads.
          if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
            setLoading(true);
            setRefreshKey((k) => k + 1);
          }
        }
      }
    );

    return () => {
      if (profilePollTimer) clearInterval(profilePollTimer);
      subscription.unsubscribe();
    };
  }, [refreshKey]);

  // ============================================================================
  // Derived state
  // ============================================================================

  const userId = session?.user?.id ?? null;

  const activeSocietyId = useMemo(
    () => (profile?.active_society_id ?? null) as string | null,
    [profile]
  );

  const activeMemberId = useMemo(
    () => (profile?.active_member_id ?? null) as string | null,
    [profile]
  );

  // ============================================================================
  // Actions
  // ============================================================================

  const setActiveSociety = async (societyId: string | null, memberId: string | null) => {
    if (!userId) {
      console.error("[useBootstrap] setActiveSociety: No user ID");
      return;
    }

    console.log("[useBootstrap] setActiveSociety:", { societyId, memberId });

    const { error } = await supabase
      .from("profiles")
      .update({
        active_society_id: societyId,
        active_member_id: memberId,
      })
      .eq("id", userId);

    if (error) {
      console.error("[useBootstrap] setActiveSociety error:", error.message);
      throw new Error(error.message);
    }

    // Update local state
    setProfile((prev: any) => ({
      ...(prev ?? {}),
      id: userId,
      active_society_id: societyId,
      active_member_id: memberId,
    }));
    if (memberId === null) {
      setMemberState(null);
      setMembershipLoading(false);
    } else {
      setMembershipLoading(false);
    }
    if (societyId === null) {
      setSociety(null);
    }
  };

  const setActiveSocietyId = (societyId: string | null) => {
    if (!userId) return;
    setMembershipLoading(societyId !== null);
    setProfile((prev: any) => ({
      ...(prev ?? {}),
      id: userId,
      active_society_id: societyId,
    }));
  };

  const setMember = (memberData: MemberData | null) => {
    if (!memberData) {
      setMemberState(null);
      setMembershipLoading(false);
      return;
    }
    const normalized = normalizeMemberData(memberData);
    setMemberState(normalized);
    setMembershipLoading(false);
    setProfile((prev: any) => ({
      ...(prev ?? {}),
      id: userId ?? prev?.id ?? normalized.user_id ?? null,
      active_society_id: normalized.society_id ?? prev?.active_society_id ?? null,
      active_member_id: normalized.id ?? prev?.active_member_id ?? null,
    }));
  };

  const refresh = useCallback(() => {
    console.log("[useBootstrap] Manual refresh triggered");
    setRefreshKey((k) => k + 1);
  }, []);

  const switchSociety = useCallback(async (targetSocietyId: string) => {
    if (!userId) return;
    const target = memberships.find((m) => m.societyId === targetSocietyId);
    if (!target) {
      console.warn("[useBootstrap] switchSociety: no membership for", targetSocietyId);
      return;
    }

    const { error: err } = await supabase
      .from("profiles")
      .update({ active_society_id: target.societyId, active_member_id: target.memberId })
      .eq("id", userId);

    if (err) {
      console.error("[useBootstrap] switchSociety DB error:", err.message);
      return;
    }

    setProfile((prev: any) => ({
      ...(prev ?? {}),
      id: userId,
      active_society_id: target.societyId,
      active_member_id: target.memberId,
    }));
    setSociety(null);
    setMemberState(null);
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, [userId, memberships]);

  const signOut = async () => {
    console.log("[useBootstrap] Signing out...");
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setSociety(null);
    setMemberState(null);
    setMembershipLoading(false);
  };

  // ============================================================================
  // Return state
  // ============================================================================

  return {
    // Core state
    loading,
    membershipLoading,
    error,
    userId,
    session,
    profile,
    activeSocietyId,
    activeMemberId,
    societyId: activeSocietyId,
    society,
    member,

    // Multi-society
    memberships,
    switchSociety,

    // Actions
    setActiveSociety,
    setActiveSocietyId,
    setMember,
    refresh,
    signOut,

    // Backwards compatibility aliases
    ready: !loading,
    bootstrapped: !loading,
    isSignedIn: !!userId,
    user: userId ? { uid: userId, activeSocietyId, activeMemberId } : null,
  };
}
