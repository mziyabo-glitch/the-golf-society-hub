// lib/useBootstrap.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, ensureSignedIn, onAuthChange } from "@/lib/firebase";

import * as userRepo from "@/lib/db/userRepo";
import { subscribeMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";

type BootstrapCtx = {
  // Auth/user doc
  user: (userRepo.UserDoc & { uid: string }) | null;

  // Derived active links (aliased for convenience)
  societyId: string | null;
  memberId: string | null;
  activeSocietyId: string | null;
  activeMemberId: string | null;

  // Hydrated docs
  society: SocietyDoc | null;
  member: MemberDoc | null;

  // State
  loading: boolean;
  ready: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
};

const BootstrapContext = createContext<BootstrapCtx>({
  user: null,
  societyId: null,
  memberId: null,
  activeSocietyId: null,
  activeMemberId: null,
  society: null,
  member: null,
  loading: true,
  ready: false,
  error: null,
  refresh: async () => {},
});

export const BootstrapProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<(userRepo.UserDoc & { uid: string }) | null>(null);
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [member, setMember] = useState<MemberDoc | null>(null);

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const societyId = useMemo(() => user?.activeSocietyId ?? null, [user?.activeSocietyId]);
  const memberId = useMemo(() => user?.activeMemberId ?? null, [user?.activeMemberId]);

  // Step 1: Wait for Firebase Auth state, then ensure signed in
  useEffect(() => {
    let cancelled = false;
    let unsubUserDoc: (() => void) | null = null;

    const initAuth = async () => {
      setLoading(true);
      setError(null);

      try {
        // ensureSignedIn waits for onAuthStateChanged then signs in anonymously if needed
        const uid = await ensureSignedIn();

        if (cancelled) return;

        console.log(`[useBootstrap] Auth ready, uid=${uid}`);

        // Ensure user doc exists
        await userRepo.ensureUserDoc(uid);

        if (cancelled) return;

        // Subscribe to user doc
        unsubUserDoc = userRepo.subscribeUserDoc(
          uid,
          (doc) => {
            if (cancelled) return;
            setUser(doc ? { ...doc, uid } : null);
            setLoading(false);
            setReady(true);
          },
          (err: any) => {
            if (cancelled) return;
            console.error("[useBootstrap] subscribeUserDoc error:", err);
            setError(err?.message ?? String(err));
            setLoading(false);
          }
        );
      } catch (e: any) {
        if (cancelled) return;
        console.error("[useBootstrap] initAuth failed:", e);
        setError(e?.message ?? String(e));
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      cancelled = true;
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  // Also listen for auth state changes (e.g., sign out, token refresh)
  useEffect(() => {
    const unsub = onAuthChange((firebaseUser) => {
      if (!firebaseUser) {
        // User signed out, clear state
        setUser(null);
        setReady(false);
        // Re-trigger sign in
        ensureSignedIn().catch((e) => {
          console.error("[useBootstrap] re-auth failed:", e);
          setError(e?.message ?? String(e));
        });
      }
    });
    return unsub;
  }, []);

  // Subscribe society doc whenever societyId changes
  useEffect(() => {
    let unsub: (() => void) | null = null;
    setSociety(null);

    if (!societyId) return;

    unsub = subscribeSocietyDoc(
      societyId,
      (doc) => setSociety(doc),
      (err) => {
        console.error("[useBootstrap] subscribeSocietyDoc error:", err);
        setError(err?.message ?? String(err));
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [societyId]);

  // Subscribe member doc whenever memberId changes
  useEffect(() => {
    let unsub: (() => void) | null = null;
    setMember(null);

    if (!memberId) return;

    unsub = subscribeMemberDoc(
      memberId,
      (doc) => setMember(doc),
      (err) => {
        console.error("[useBootstrap] subscribeMemberDoc error:", err);
        setError(err?.message ?? String(err));
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [memberId]);

  const refresh = async () => {
    setLoading(true);
    try {
      const uid = await ensureSignedIn();
      await userRepo.ensureUserDoc(uid);
      // User doc subscription will update state
    } catch (e: any) {
      console.error("[useBootstrap] refresh failed:", e);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BootstrapContext.Provider
      value={{
        user,
        societyId,
        memberId,
        activeSocietyId: societyId,
        activeMemberId: memberId,
        society,
        member,
        loading,
        ready,
        error,
        refresh,
      }}
    >
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
