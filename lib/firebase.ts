// lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
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
  } else {
    // Native: attempt persistence if available, fallback to standard auth
    try {
      // NOTE: if you later decide to enforce "no AsyncStorage", remove this block.
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
}

export const auth = authInstance ?? (null as unknown as Auth);
export const db = dbInstance ?? (null as unknown as Firestore);
export const firebaseApp = app;

export async function ensureSignedIn(): Promise<string> {
  if (!firebaseEnvReady) {
    throw new Error(
      `Missing environment variable(s): ${firebaseEnvMissingKeys.join(", ")}`
    );
  }
  if (!authInstance) {
    throw new Error("Firebase auth is not initialized.");
  }
  if (authInstance.currentUser?.uid) return authInstance.currentUser.uid;

  const existing = await new Promise<string | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      unsubscribe();
      resolve(user?.uid ?? null);
    });
  });

  if (existing) return existing;

  const result = await signInAnonymously(authInstance);
  return result.user.uid;
}
