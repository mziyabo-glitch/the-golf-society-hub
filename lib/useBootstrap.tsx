// lib/useBootstrap.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { ensureSignedIn } from "@/lib/firebase";
import * as userRepo from "@/lib/db/userRepo";

type BootstrapCtx = {
  user: userRepo.UserDoc | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const BootstrapContext = createContext<BootstrapCtx>({
  user: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export const BootstrapProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<userRepo.UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const boot = async () => {
    setLoading(true);
    setError(null);

    try {
      // ✅ HARD GUARD: if this fails, we show the real problem instead of blank screen
      if (typeof userRepo.subscribeUserDoc !== "function") {
        throw new Error(
          `subscribeUserDoc export missing. Exports: ${Object.keys(userRepo).join(
            ", "
          )}`
        );
      }

      const uid = await ensureSignedIn();

      await userRepo.ensureUserDoc(uid);

      // Subscribe user doc
      const unsub = userRepo.subscribeUserDoc(
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

      return unsub;
    } catch (e: any) {
      console.error("bootstrap failed", e);
      setError(e?.message ?? String(e));
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    let unsub: null | (() => void) = null;

    (async () => {
      unsub = await boot();
    })();

    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    // Reboot (safe)
    await boot();
  };

  return (
    <BootstrapContext.Provider value={{ user, loading, error, refresh }}>
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
