// lib/useBootstrap.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ensureSignedIn } from "@/lib/firebase";

import * as userRepo from "@/lib/db/userRepo";
import { subscribeMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";

type BootstrapCtx = {
  // Auth/user doc
  user: userRepo.UserDoc | null;

  // Derived active links
  societyId: string | null;
  memberId: string | null;

  // Hydrated docs
  society: SocietyDoc | null;
  member: MemberDoc | null;

  // State
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
};

const BootstrapContext = createContext<BootstrapCtx>({
  user: null,
  societyId: null,
  memberId: null,
  society: null,
  member: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export const BootstrapProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<userRepo.UserDoc | null>(null);
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [member, setMember] = useState<MemberDoc | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const societyId = useMemo(() => user?.activeSocietyId ?? null, [user?.activeSocietyId]);
  const memberId = useMemo(() => user?.activeMemberId ?? null, [user?.activeMemberId]);

  // Boot: ensure signed in + ensure users/{uid} exists + subscribe to it
  const boot = async () => {
    setLoading(true);
    setError(null);

    try {
      if (typeof userRepo.subscribeUserDoc !== "function") {
        throw new Error(
          `subscribeUserDoc export missing. Exports: ${Object.keys(userRepo).join(", ")}`
        );
      }

      const uid = await ensureSignedIn();
      await userRepo.ensureUserDoc(uid);

      const unsubUser = userRepo.subscribeUserDoc(
        uid,
        (doc) => {
          setUser(doc);
          setLoading(false);
        },
        (err: any) => {
          console.error("subscribeUserDoc error", err);
          setError(err?.message ?? String(err));
          setLoading(false);
        }
      );

      return unsubUser;
    } catch (e: any) {
      console.error("bootstrap failed", e);
      setError(e?.message ?? String(e));
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    let unsubUser: null | (() => void) = null;

    (async () => {
      unsubUser = await boot();
    })();

    return () => {
      if (unsubUser) unsubUser();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe society doc whenever societyId changes
  useEffect(() => {
    let unsub: null | (() => void) = null;

    // Reset when switching
    setSociety(null);

    if (!societyId) return;

    unsub = subscribeSocietyDoc(
      societyId,
      (doc) => setSociety(doc),
      (err) => {
        console.error("subscribeSocietyDoc error", err);
        setError(err?.message ?? String(err));
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [societyId]);

  // Subscribe member doc whenever memberId changes
  useEffect(() => {
    let unsub: null | (() => void) = null;

    // Reset when switching
    setMember(null);

    if (!memberId) return;

    unsub = subscribeMemberDoc(
      memberId,
      (doc) => setMember(doc),
      (err) => {
        console.error("subscribeMemberDoc error", err);
        setError(err?.message ?? String(err));
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [memberId]);

  const refresh = async () => {
    // Re-run user bootstrap; society/member subscriptions auto-update based on user doc
    await boot();
  };

  return (
    <BootstrapContext.Provider
      value={{
        user,
        societyId,
        memberId,
        society,
        member,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
