// lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * IMPORTANT:
 * Firestore 400 / WebChannel "Listen" transport errors on web are commonly caused by
 * missing EXPO_PUBLIC_FIREBASE_* env vars (projectId becomes "undefined").
 *
 * This file now HARD-FAILS with a clear message if config is missing.
 */

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

function requireEnv(name: string): string {
  const v = (process.env as any)?.[name];
  if (!v || String(v).trim().length === 0) {
    // Throwing here prevents silent init with undefined projectId (causes Firestore 400)
    throw new Error(
      `Missing environment variable: ${name}\n` +
        `Fix: set ${name} in your Expo/Vercel environment variables (must be EXPO_PUBLIC_*)`
    );
  }
  return String(v);
}

const firebaseConfig: FirebaseConfig = {
  apiKey: requireEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requireEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: (process.env as any)?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: (process.env as any)?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: requireEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;

if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  // Native: attempt persistence if available, fallback to standard auth
  try {
    // NOTE: if you later decide to enforce "no AsyncStorage", remove this block.
    const { getReactNativePersistence } = require("firebase/auth/react-native");
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }
}

export { auth };
export const db = getFirestore(app);

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
