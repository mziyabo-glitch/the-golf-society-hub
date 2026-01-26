// lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  browserLocalPersistence,
  setPersistence,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * IMPORTANT:
 * Firestore 400 / WebChannel "Listen" transport errors on web are commonly caused by
 * missing EXPO_PUBLIC_FIREBASE_* env vars (projectId becomes "undefined").
 *
 * This file avoids throwing during module import so Expo static rendering
 * can complete. Missing env vars are surfaced via UI and runtime checks.
 */

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

const firebaseEnv = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const requiredEnv = [
  { key: "EXPO_PUBLIC_FIREBASE_API_KEY", value: firebaseEnv.apiKey },
  { key: "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", value: firebaseEnv.authDomain },
  { key: "EXPO_PUBLIC_FIREBASE_PROJECT_ID", value: firebaseEnv.projectId },
  { key: "EXPO_PUBLIC_FIREBASE_APP_ID", value: firebaseEnv.appId },
];

export const firebaseEnvMissingKeys = requiredEnv
  .filter((entry) => !entry.value || String(entry.value).trim().length === 0)
  .map((entry) => entry.key);

export const firebaseEnvReady = firebaseEnvMissingKeys.length === 0;

if (!firebaseEnvReady) {
  console.warn(
    `[firebase] Missing env vars: ${firebaseEnvMissingKeys.join(", ")}`
  );
}

const firebaseConfig: FirebaseConfig = {
  apiKey: firebaseEnv.apiKey ?? "",
  authDomain: firebaseEnv.authDomain ?? "",
  projectId: firebaseEnv.projectId ?? "",
  storageBucket: firebaseEnv.storageBucket,
  messagingSenderId: firebaseEnv.messagingSenderId,
  appId: firebaseEnv.appId ?? "",
};

let app: FirebaseApp | null = null;
if (firebaseEnvReady) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (app) {
  if (Platform.OS === "web") {
    authInstance = getAuth(app);
    // Set persistence for web to ensure auth state persists across page reloads
    setPersistence(authInstance, browserLocalPersistence).catch((err) => {
      console.error("[firebase] setPersistence error:", err?.code, err?.message);
    });
  } else {
    // Native: attempt persistence if available, fallback to standard auth
    try {
      const { getReactNativePersistence } = require("firebase/auth/react-native");
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      authInstance = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      authInstance = getAuth(app);
    }
  }

  dbInstance = getFirestore(app);

  // Debug log once
  console.log(`[firebase] initialized projectId=${app.options.projectId}`);
}

export const auth = authInstance ?? (null as unknown as Auth);
export const db = dbInstance ?? (null as unknown as Firestore);
export const firebaseApp = app;

/**
 * Wait for auth state to resolve, then sign in anonymously if needed.
 * Returns the user's uid.
 */
export async function ensureSignedIn(): Promise<string> {
  if (!firebaseEnvReady) {
    throw new Error(
      `Missing environment variable(s): ${firebaseEnvMissingKeys.join(", ")}`
    );
  }
  if (!authInstance) {
    throw new Error("Firebase auth is not initialized.");
  }

  // Wait for auth state to be determined
  const user = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(authInstance, (u) => {
      unsubscribe();
      resolve(u);
    });
  });

  if (user?.uid) {
    console.log(`[firebase] AUTH uid=${user.uid}, projectId=${app?.options.projectId}`);
    return user.uid;
  }

  // No user, sign in anonymously
  try {
    const result = await signInAnonymously(authInstance);
    console.log(`[firebase] AUTH uid=${result.user.uid}, projectId=${app?.options.projectId}`);
    return result.user.uid;
  } catch (err: any) {
    console.error("[firebase] signInAnonymously failed:", err?.code, err?.message, err);
    throw err;
  }
}

/**
 * Listen for auth state changes. Returns unsubscribe function.
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    console.error("[firebase] onAuthChange called but auth not initialized");
    return () => {};
  }
  return onAuthStateChanged(authInstance, callback);
}
