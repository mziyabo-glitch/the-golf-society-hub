// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

function getFirebaseConfig(): FirebaseConfig {
  const cfg: FirebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
  };

  // Hard fail early with a clear message (prevents “FIREBASE_NOT_CONFIGURED” mystery errors)
  const missing = Object.entries(cfg)
    .filter(([k, v]) => (k === "storageBucket" || k === "messagingSenderId" ? false : !v))
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `FIREBASE_NOT_CONFIGURED: Missing env vars: ${missing.join(", ")}. ` +
        `Check Vercel Environment Variables + Expo env.`
    );
  }

  return cfg;
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(getFirebaseConfig());
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

/**
 * Ensures we always have a signed-in user (anonymous is fine).
 * This keeps Firestore writes consistent and allows per-user prefs (like activeSocietyId).
 */
export async function ensureSignedIn(): Promise<User> {
  const existing = auth.currentUser;
  if (existing) return existing;

  // Wait briefly for auth to hydrate, otherwise sign in anonymously
  const hydrated = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u ?? null);
    });
  });

  if (hydrated) return hydrated;

  const res = await signInAnonymously(auth);
  return res.user;
}

/**
 * Store activeSocietyId ONLINE (Firestore) — no AsyncStorage.
 * Path: users/{uid}
 */
export async function setActiveSocietyId(societyId: string): Promise<void> {
  const user = await ensureSignedIn();
  const ref = doc(db, "users", user.uid);

  await setDoc(
    ref,
    {
      activeSocietyId: societyId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Read activeSocietyId ONLINE (Firestore) — no AsyncStorage.
 * Returns null if not set.
 */
export async function getActiveSocietyId(): Promise<string | null> {
  const user = await ensureSignedIn();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return typeof data.activeSocietyId === "string" ? data.activeSocietyId : null;
}
