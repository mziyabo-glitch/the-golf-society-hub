import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ensureSignedIn } from "@/lib/firebase";
import { subscribeUserDoc } from "@/lib/firebase/firestore";
import { runAsyncStorageMigration } from "@/lib/migrations/asyncToFirestore";

type BootstrapCtx = {
  loading: boolean;
  uid: string | null;
  user: any | null;
  societyId: string | null;
};

const Ctx = createContext<BootstrapCtx>({
  loading: true,
  uid: null,
  user: null,
  societyId: null,
});

export function useBootstrap() {
  return useContext(Ctx);
}

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: null | (() => void) = null;
    let cancelled = false;

    (async () => {
      try {
        const myUid = await ensureSignedIn();
        if (cancelled) return;

        setUid(myUid);

        // Run migration (native-only inside the function).
        await runAsyncStorageMigration();
        if (cancelled) return;

        // Wait for FIRST user snapshot before dropping loading.
        const firstSnapshot = await new Promise<void>((resolve) => {
          let resolved = false;

          unsub = subscribeUserDoc(myUid, (u) => {
            if (cancelled) return;

            setUser(u);
            setSocietyId(u?.activeSocietyId ?? null);

            if (!resolved) {
              resolved = true;
              resolve();
            }
          });
        });

        void firstSnapshot;
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error("bootstrap error", e);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  const value = useMemo(
    () => ({ loading, uid, user, societyId }),
    [loading, uid, user, societyId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
