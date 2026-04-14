// lib/useBootstrap.tsx
// Bootstrap hook for auth and app state
// Uses singleton supabase client for consistent auth
// NO .select().single() after upsert to avoid 406 errors

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { SUPABASE_AUTH_CONFIG } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { getMySocieties, type MySocietyMembership } from "@/lib/db_supabase/mySocietiesRepo";
import { maybeBackfillProfileFullNameFromSignals } from "@/lib/db_supabase/profileRepo";
import { getCache, setCache, invalidateCache } from "@/lib/cache/clientCache";
import { Platform } from "react-native";
import { hasSupabaseStorageAdapter } from "@/lib/supabaseStorage";

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
  authRestoring: boolean;
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
const ACTIVE_SOCIETY_CACHE_KEY = "app:activeSociety";

const BOOTSTRAP_FALLBACK: BootstrapState = {
  loading: false,
  authRestoring: false,
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
    handicapLock: memberData?.handicap_lock ?? false,
    handicapUpdatedAt: memberData?.handicap_updated_at ?? null,
  };
}

// ============================================================================
// Internal Hook
// ============================================================================

function useBootstrapInternal(): BootstrapState {
  const [loading, setLoading] = useState(true);
  const [authRestoring, setAuthRestoring] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [member, setMemberState] = useState<MemberData | null>(null);
  const [memberships, setMemberships] = useState<MySocietyMembership[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const mounted = useRef(true);
  const bootstrapInFlight = useRef(false);
  const hydratedFromCacheRef = useRef(false);
  const authPersistLoggedRef = useRef(false);

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
    let alive = true;

    const bootstrap = async () => {
      if (bootstrapInFlight.current) return;
      bootstrapInFlight.current = true;

      let startupSessionFound = false;
      let startupAccessTokenPresent = false;
      let startupRefreshTokenPresent = false;
      try {
        setLoading(true);
        setError(null);

        // ----------------------------------------------------------------
        // Step 1: Hydrate auth session from persisted storage
        // (single startup getSession read, then derive user from it)
        // ----------------------------------------------------------------
        console.log("[useBootstrap] === SESSION HYDRATION START ===");

        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
        startupSessionFound = !!existingSession;
        startupAccessTokenPresent = !!existingSession?.access_token;
        startupRefreshTokenPresent = !!existingSession?.refresh_token;

        if (sessionError) {
          console.error("[useBootstrap] getSession error:", sessionError.message);
        }

        console.log("[useBootstrap] Boot getSession result:", {
          hasSession: !!existingSession,
          userId: existingSession?.user?.id ?? null,
          hasAccessToken: !!existingSession?.access_token,
          hasRefreshToken: !!existingSession?.refresh_token,
        });

        let currentSession = existingSession ?? null;
        let currentUser: User | null = existingSession?.user ?? null;

        // Validate current auth user before issuing data queries.
        if (currentSession) {
          const { data: authUserData, error: authUserError } = await supabase.auth.getUser();
          if (authUserError) {
            console.warn("[useBootstrap] getUser warning during restore:", authUserError.message);
          } else if (authUserData.user) {
            currentUser = authUserData.user;
          }
        }

        if (!currentSession || !currentUser) {
          // No session — user needs to sign in via the auth screen.
          console.log("[useBootstrap] No session — awaiting sign-in.");
          if (!alive || !mounted.current) return;
          setSession(null);
          setProfile(null);
          setSociety(null);
          setMemberState(null);
          setMemberships([]);
          setMembershipLoading(false);
          return;
        }

        console.log("[useBootstrap] Existing session found:", currentUser.id);

        if (!alive || !mounted.current) return;
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

        if (!alive || !mounted.current) return;

        let finalProfile = profileData;
        setProfile(finalProfile);
        console.log("[useBootstrap] Profile loaded:", finalProfile?.id);

        // ----------------------------------------------------------------
        // Step 2c: Load all memberships (multi-society support)
        // ----------------------------------------------------------------
        const allMemberships = await getMySocieties();
        if (!alive || !mounted.current) return;
        setMemberships(allMemberships);

        // ----------------------------------------------------------------
        // Step 3: Self-heal active society pointer
        // - Missing active_society_id → first membership (existing behaviour).
        // - active_society_id not in user's members rows (stale/joined wrong org) → same heal.
        //   Otherwise tee-sheet and gates run under a society the user is not linked to.
        // ----------------------------------------------------------------
        const membershipSocietyIds = new Set(allMemberships.map((m) => m.societyId));
        const profileActiveBeforeStep3 = finalProfile?.active_society_id ?? null;
        const activePointer = finalProfile?.active_society_id as string | undefined;
        const activeMissing = !activePointer;
        const activeStale =
          !!activePointer &&
          allMemberships.length > 0 &&
          !membershipSocietyIds.has(activePointer);

        let healReasonApplied: string | null = null;

        if (currentUser && allMemberships.length > 0 && (activeMissing || activeStale)) {
          const healRow = allMemberships[0];
          healReasonApplied = activeMissing ? "recover_missing_active_pointer" : "recover_stale_active_not_in_memberships";
          console.log("[useBootstrap] Self-heal: active society pointer", {
            reason: healReasonApplied,
            stale_or_missing_active: activePointer ?? null,
            new_society_id: healRow.societyId,
            new_member_id: healRow.memberId,
          });
          const { error: healErr } = await supabase
            .from("profiles")
            .update({
              active_society_id: healRow.societyId,
              active_member_id: healRow.memberId,
            })
            .eq("id", currentUser.id);

          if (!alive || !mounted.current) return;

          if (!healErr) {
            finalProfile = {
              ...(finalProfile ?? {}),
              id: currentUser.id,
              active_society_id: healRow.societyId,
              active_member_id: healRow.memberId,
            };
            setProfile(finalProfile);
            await invalidateCache(ACTIVE_SOCIETY_CACHE_KEY);
          } else {
            console.warn("[useBootstrap] Self-heal DB update failed:", healErr.message);
            healReasonApplied = null;
          }
        }

        if (__DEV__ && currentUser) {
          const resolvedMembershipSocietyIds = [...membershipSocietyIds].sort();
          const chosenActiveSocietyId = (finalProfile?.active_society_id as string | undefined) ?? null;
          let reason: string;
          if (allMemberships.length === 0) {
            reason = "no_memberships_loaded";
          } else if (healReasonApplied) {
            reason = healReasonApplied;
          } else if (chosenActiveSocietyId && !membershipSocietyIds.has(chosenActiveSocietyId)) {
            reason = "active_not_in_memberships_unhealed";
          } else {
            reason = "active_ok";
          }
          console.log("[joint-society-context]", {
            userId: currentUser.id,
            profileActiveSocietyId: profileActiveBeforeStep3,
            resolvedMembershipSocietyIds,
            chosenActiveSocietyId,
            reason,
          });
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

          if (!alive || !mounted.current) return;
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
        let memberRowForProfileBackfill: { name?: string | null; email?: string | null } | null = null;
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

          if (!alive || !mounted.current) return;

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
            memberRowForProfileBackfill = firstMember;
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

        if (currentUser && finalProfile) {
          void maybeBackfillProfileFullNameFromSignals({
            userId: currentUser.id,
            profile: finalProfile,
            member: memberRowForProfileBackfill,
            authUser: currentUser,
          });
        }

        // ----------------------------------------------------------------
        // Step 5: Poll profile for updates (handles external changes)
        // ----------------------------------------------------------------
        profilePollTimer = setInterval(async () => {
          if (!currentUser || !alive) return;

          const { data, error: pollError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (!alive || !mounted.current) return;
          if (!pollError && data) {
            setProfile(data);
            setMemberState((prev) => {
              if (!prev || !data?.full_name) return prev;
              const rowUid = prev.user_id != null ? String(prev.user_id) : null;
              if (!rowUid || rowUid !== currentUser.id) return prev;
              const fn = String(data.full_name).trim();
              if (!fn || prev.name === fn) return prev;
              return normalizeMemberData({ ...prev, name: fn, display_name: fn });
            });
          }
        }, 5000);

        // Log session state AFTER bootstrap
        console.log("[useBootstrap] === BOOTSTRAP COMPLETE ===");
        console.log("[useBootstrap] Final session user ID:", currentUser?.id);
        console.log("[useBootstrap] Session will persist across reloads");

      } catch (e: any) {
        console.error("[useBootstrap] Bootstrap error:", e);
        if (alive && mounted.current) {
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
        // Ignore teardown of this effect (e.g. React Strict Mode) so a stale run
        // does not clear loading while a new bootstrap is in flight.
        if (!alive) return;
        if (mounted.current) setMembershipLoading(false);
        if (mounted.current) {
          setLoading(false);
          setAuthRestoring(false);
        }
        if (!authPersistLoggedRef.current) {
          authPersistLoggedRef.current = true;
          console.log("[auth-persist]", {
            platform: Platform.OS,
            persistSession: SUPABASE_AUTH_CONFIG.persistSession,
            storageAdapterPresent: hasSupabaseStorageAdapter,
            sessionFoundOnStartup: startupSessionFound,
            accessTokenPresent: startupAccessTokenPresent,
            refreshTokenPresent: startupRefreshTokenPresent,
            authRestoreComplete: true,
          });
        }
      }
    };

    bootstrap();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("[useBootstrap] onAuthStateChange", {
        event, // INITIAL_SESSION | SIGNED_IN | TOKEN_REFRESHED | SIGNED_OUT | etc
        hasSession: !!newSession,
        userId: newSession?.user?.id ?? null,
      });

      if (!mounted.current) return;
      setSession(newSession);

      // Re-bootstrap app profile/membership state only when auth identity changes.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
        setLoading(true);
        setRefreshKey((k) => k + 1);
      }
    });

    return () => {
      alive = false;
      bootstrapInFlight.current = false;
      if (profilePollTimer) clearInterval(profilePollTimer);
      subscription.unsubscribe();
    };
  }, [refreshKey]);

  useEffect(() => {
    if (hydratedFromCacheRef.current) return;
    hydratedFromCacheRef.current = true;
    void (async () => {
      const cached = await getCache<{
        profile: any | null;
        society: SocietyData | null;
        member: MemberData | null;
      }>(ACTIVE_SOCIETY_CACHE_KEY, { maxAgeMs: 1000 * 60 * 60 * 24 });
      if (!cached || !mounted.current) return;
      if (cached.value.profile?.active_society_id) {
        setProfile((prev: any) => prev ?? cached.value.profile);
      }
      if (cached.value.society) {
        setSociety((prev) => prev ?? cached.value.society);
      }
      if (cached.value.member) {
        setMemberState((prev) => prev ?? cached.value.member);
      }
    })();
  }, []);

  useEffect(() => {
    if (!profile?.active_society_id || !society || !member) return;
    void setCache(ACTIVE_SOCIETY_CACHE_KEY, { profile, society, member }, { ttlMs: 1000 * 60 * 60 * 24 });
  }, [profile, society, member]);

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
    await invalidateCache(ACTIVE_SOCIETY_CACHE_KEY);
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
    authRestoring,
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
    ready: !loading && !authRestoring,
    bootstrapped: !loading && !authRestoring,
    isSignedIn: !!userId,
    user: userId ? { uid: userId, activeSocietyId, activeMemberId } : null,
  };
}
