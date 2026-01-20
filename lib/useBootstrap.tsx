import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { ensureSignedIn, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

type BootstrapCtx = {
  userId: string | null;
  activeSocietyId: string | null;
  loading: boolean;
};

const BootstrapContext = createContext<BootstrapCtx>({
  userId: null,
  activeSocietyId: null,
  loading: true,
});

export const BootstrapProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSocietyId, setActiveSocietyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;

    ensureSignedIn()
      .then((user) => {
        setUserId(user.uid);

        const userRef = doc(db, "users", user.uid);
        unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
          const data = snap.data();
          setActiveSocietyId(data?.activeSocietyId ?? null);
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));

    return () => unsubscribeUserDoc?.();
  }, []);

  return (
    <BootstrapContext.Provider
      value={{ userId, activeSocietyId, loading }}
    >
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
