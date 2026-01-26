// lib/useBootstrap.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db, onAuthChange } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";

import { subscribeMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";

type UserDoc = {
  uid: string;
  activeSocietyId?: string | null;
  activeMemberId?: string | null;
};

type BootstrapCtx = {
  user: UserDoc | null;
  societyId: string | null;
  memberId: string | null;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  society: SocietyDoc | null;
  member: MemberDoc | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
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
  const [user, setUser] = useState<UserDoc | null>(null);
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [member, setMember] = useState<MemberDoc | null>(null);

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const societyId = useMemo(() => user?.activeSocietyId ?? null, [user?.activeSocietyId]);
  const memberId = useMemo(() => user?.activeMemberId ?? null, [user?.activeMemberId]);

  // Main init: wait for auth, ensure user doc, then read it
  useEffect(() => {
    let cancelled = false;
    let unsubUserDoc: (() => void) | null = null;

    const initAuth = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) Wait for auth state - only sign in if no currentUser
        let uid = auth.currentUser?.uid;

        if (!uid) {
          // Sign in anonymously only if needed
          try {
            const result = await signInAnonymously(auth);
            uid = result.user.uid;
          } catch (e: any) {
            console.error("[bootstrap] signInAnonymously failed:", e?.code, e?.message);
            throw e;
          }
        }

        if (cancelled) return;

        // 2) Ensure user doc exists BEFORE any reads
        const userDocRef = doc(db, "users", uid);
        try {
          await setDoc(userDocRef, { updatedAt: serverTimestamp() }, { merge: true });
          console.log(`[bootstrap] uid=${uid}, ensured user doc`);
        } catch (e: any) {
          console.error(`[bootstrap] setDoc users/${uid} denied:`, e?.code, e?.message);
          throw e;
        }

        if (cancelled) return;

        // 3) Read user doc once to get activeSocietyId/activeMemberId
        let userDocData: any = null;
        try {
          const snap = await getDoc(userDocRef);
          userDocData = snap.exists() ? snap.data() : {};
        } catch (e: any) {
          console.error(`[bootstrap] getDoc users/${uid} denied:`, e?.code, e?.message);
          throw e;
        }

        if (cancelled) return;

        const activeSocietyId = userDocData?.activeSocietyId ?? null;
        const activeMemberId = userDocData?.activeMemberId ?? null;

        console.log(`[bootstrap] activeSocietyId=${activeSocietyId}, activeMemberId=${activeMemberId}`);

        // Set user state
        setUser({
          uid,
          activeSocietyId,
          activeMemberId,
        });

        // 4) Subscribe to user doc for live updates
        unsubUserDoc = onSnapshot(
          userDocRef,
          (snap) => {
            if (cancelled) return;
            const data = snap.exists() ? snap.data() : {};
            setUser({
              uid,
              activeSocietyId: data?.activeSocietyId ?? null,
              activeMemberId: data?.activeMemberId ?? null,
            });
          },
          (err: any) => {
            console.error(`[bootstrap] onSnapshot users/${uid} error:`, err?.code, err?.message);
          }
        );

        setLoading(false);
        setReady(true);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[bootstrap] initAuth failed:", e?.message);
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

  // Subscribe society doc only if societyId is non-null
  useEffect(() => {
    let unsub: (() => void) | null = null;
    setSociety(null);

    if (!societyId) return;

    unsub = subscribeSocietyDoc(
      societyId,
      (doc) => setSociety(doc),
      (err: any) => {
        console.error(`[bootstrap] subscribeSocietyDoc societies/${societyId} error:`, err?.code, err?.message);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [societyId]);

  // Subscribe member doc only if memberId is non-null
  useEffect(() => {
    let unsub: (() => void) | null = null;
    setMember(null);

    if (!memberId) return;

    unsub = subscribeMemberDoc(
      memberId,
      (doc) => setMember(doc),
      (err: any) => {
        console.error(`[bootstrap] subscribeMemberDoc members/${memberId} error:`, err?.code, err?.message);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [memberId]);

  const refresh = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, { updatedAt: serverTimestamp() }, { merge: true });
      const snap = await getDoc(userDocRef);
      const data = snap.exists() ? snap.data() : {};
      setUser({
        uid: user.uid,
        activeSocietyId: data?.activeSocietyId ?? null,
        activeMemberId: data?.activeMemberId ?? null,
      });
    } catch (e: any) {
      console.error("[bootstrap] refresh failed:", e?.message);
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
