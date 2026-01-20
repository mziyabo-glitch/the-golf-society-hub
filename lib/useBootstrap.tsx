import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { ensureSignedIn } from "@/lib/firebase";
import { ensureUserDoc, subscribeUserDoc, type UserDoc } from "@/lib/db/userRepo";
import { runAsyncStorageMigration } from "@/lib/migrations/asyncToFirestore";
import { repairActiveProfile } from "@/lib/migrations/repairActiveProfile";

type BootstrapState = {
  user: UserDoc | null;
  loading: boolean;
  error: Error | null;
};

const BootstrapContext = createContext<BootstrapState | undefined>(undefined);

let migrationPromise: Promise<void> | null = null;

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootstrapState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const bootstrap = async () => {
      try {
        const uid = await ensureSignedIn();
        if (!migrationPromise) {
          migrationPromise = runAsyncStorageMigration();
        }
        await migrationPromise;
        await ensureUserDoc(uid);

        // Defensive repair: older AsyncStorage migration sometimes wrote an auth uid into
        // users/{uid}.activeMemberId (instead of a member document id). That breaks RBAC.
        await repairActiveProfile(uid);

        unsubscribe = subscribeUserDoc(uid, (user) => {
          if (!mounted) return;
          setState({ user, loading: false, error: null });
        });
      } catch (error) {
        if (!mounted) return;
        setState({ user: null, loading: false, error: error as Error });
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapState {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error("useBootstrap must be used within BootstrapProvider");
  }
  return context;
}
