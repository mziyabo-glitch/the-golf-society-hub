import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToUser, UserDocFields } from "@/lib/db/userRepo";

type BootstrapState =
  | "loading"
  | "noAuth"
  | "noSociety"
  | "ready";

export function useBootstrap() {
  const [state, setState] = useState<BootstrapState>("loading");
  const [user, setUser] = useState<UserDocFields | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUid(null);
        setUser(null);
        setState("noAuth");
        return;
      }

      setUid(firebaseUser.uid);

      const unsubUser = subscribeToUser(firebaseUser.uid, (doc) => {
        if (!doc) {
          // Firestore not resolved yet
          setState("loading");
          return;
        }

        setUser(doc);

        if (!doc.activeSocietyId) {
          setState("noSociety");
        } else {
          setState("ready");
        }
      });

      return () => unsubUser();
    });

    return () => unsubAuth();
  }, []);

  return {
    state,
    user,
    uid,
    isLoading: state === "loading",
    hasSociety: state === "ready",
    needsSociety: state === "noSociety",
  };
}
