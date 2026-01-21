import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, ensureSignedIn } from "@/lib/firebase";

type BootUser = {
  uid: string;
  activeSocietyId: string | null;
};

type BootstrapCtx = {
  user: BootUser | null;
  activeSocietyId: string | null; // convenience
  loading: boolean;
};

const BootstrapContext = createContext<BootstrapCtx>({
  user: null,
  activeSocietyId: null,
  loading: true,
});

export const BootstrapProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<BootUser | null>(null);
  const [activeSocietyId, setActiveSocietyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    ensureSignedIn()
      .then((uid) => {
        // Start in loading until first snapshot arrives
        setLoading(true);

        const userRef = doc(db, "users", uid);

        unsub = onSnapshot(
          userRef,
          (snap) => {
            const data = snap.exists() ? (snap.data() as any) : null;
            const socId = data?.activeSocietyId ?? null;

            setActiveSocietyId(socId);
            setUser({ uid, activeSocietyId: socId });
            setLoading(false);
          },
          () => {
            // snapshot error
            setUser({ uid, activeSocietyId: null });
            setActiveSocietyId(null);
            setLoading(false);
          }
        );
      })
      .catch(() => {
        setUser(null);
        setActiveSocietyId(null);
        setLoading(false);
      });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <BootstrapContext.Provider value={{ user, activeSocietyId, loading }}>
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
