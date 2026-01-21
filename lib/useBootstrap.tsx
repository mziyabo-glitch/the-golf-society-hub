import React, { createContext, useContext, useEffect, useState } from "react";
import { ensureSignedIn } from "@/lib/firebase";
import { ensureUserDoc, subscribeUserDoc, type UserDoc } from "@/lib/db/userRepo";

type BootstrapCtx = {
  user: UserDoc | null;
  loading: boolean;
};

const BootstrapContext = createContext<BootstrapCtx>({
  user: null,
  loading: true,
});

export const BootstrapProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        // ✅ ensureSignedIn returns a UID string in YOUR repo
        const uid = await ensureSignedIn();
        if (cancelled) return;

        // ✅ Make sure users/{uid} exists so bootstrap can resolve deterministically
        await ensureUserDoc(uid);
        if (cancelled) return;

        unsub = subscribeUserDoc(
          uid,
          (doc) => {
            if (cancelled) return;
            setUser(doc);
            setLoading(false);
          },
          (err) => {
            console.error("bootstrap: subscribeUserDoc error", err);
            if (cancelled) return;
            setUser(null);
            setLoading(false);
          }
        );
      } catch (e) {
        console.error("bootstrap: failed", e);
        if (cancelled) return;
        setUser(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  return (
    <BootstrapContext.Provider value={{ user, loading }}>
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
