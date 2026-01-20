import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { app } from "./app";

export const auth = getAuth(app);

export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  const existing = await new Promise<string | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user?.uid ?? null);
    });
  });

  if (existing) return existing;

  const result = await signInAnonymously(auth);
  return result.user.uid;
}
