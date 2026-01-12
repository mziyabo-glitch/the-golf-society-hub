import { Platform } from "react-native";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type AuthError,
  type User,
} from "firebase/auth";

/**
 * Active society defaults
 * NOTE: This keeps your app working even if the user hasn't selected/created a society yet.
 * You can remove the fallback later when onboarding is complete.
 */
export const DEFAULT_SOCIETY_ID = "m4-golf-society";
const ACTIVE_SOCIETY_STORAGE_KEY = "activeSocietyId";

/**
 * Used by RootLayout
 */
export type AuthStatus = "initializing" | "signedIn" | "needsLogin" | "configError" | "error";

/**
 * Firebase config validation
 */
const REQUIRED_ENV_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

export function getFirebaseConfigStatus(): {
  configured: boolean;
  missingVars: string[];
  usingDummyConfig: boolean;
} {
  const missingVars = REQUIRED_ENV_VARS.filter((k) => {
    const v = process.env[k];
    return !v || String(v).trim().length === 0;
  });

  const usingDummyConfig =
    Boolean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.includes("demo")) ||
    Boolean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.includes("demo")) ||
    Boolean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.includes("placeholder"));

  return {
    configured: missingVars.length === 0 && !usingDummyConfig,
    missingVars: [...missingVars],
    usingDummyConfig,
  };
}

/**
 * Backwards-compatible helper used across the repo
 */
export function isFirebaseConfigured(): boolean {
  return getFirebaseConfigStatus().configured;
}

export function assertFirebaseConfigured(): void {
  if (!isFirebaseConfigured()) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

/**
 * Firebase singletons (app/auth/db)
 */
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  assertFirebaseConfigured();

  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  };

  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  const app = getFirebaseApp();
  _auth = getAuth(app);
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  _db = getFirestore(app);
  return _db;
}

/**
 * Common exports used throughout the repo
 * IMPORTANT: only declared ONCE (prevents "db already declared" build error)
 */
export const db = getFirebaseDb();
export const authInstance = getFirebaseAuth();

/**
 * Auth bootstrap helpers
 */
let _authReadyPromise: Promise<User | null> | null = null;

export function waitForAuthState(): Promise<User | null> {
  if (_authReadyPromise) return _authReadyPromise;

  const auth = getFirebaseAuth();
  _authReadyPromise = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ?? null);
    });
  });

  return _authReadyPromise;
}

export async function ensureSignedIn(): Promise<{
  success: boolean;
  status: AuthStatus;
  error?: AuthError;
}> {
  try {
    if (!isFirebaseConfigured()) {
      return { success: false, status: "configError" };
    }

    const auth = getFirebaseAuth();

    // already signed in
    if (auth.currentUser) {
      return { success: true, status: "signedIn" };
    }

    // wait for initial auth resolution
    await waitForAuthState();

    // might now exist
    if (auth.currentUser) {
      return { success: true, status: "signedIn" };
    }

    // attempt anonymous sign-in
    await signInAnonymously(auth);
    return { success: true, status: "signedIn" };
  } catch (e) {
    const err = e as AuthError;

    // common when Anonymous auth is disabled in Firebase Console
    if (err?.code === "auth/operation-not-allowed") {
      return { success: false, status: "needsLogin", error: err };
    }

    return { success: false, status: "error", error: err };
  }
}

export function getCurrentUserUid(): string | null {
  try {
    const auth = getFirebaseAuth();
    return auth.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/**
 * Active society helpers
 * Web uses localStorage. Native currently falls back to DEFAULT.
 */
function getActiveSocietyIdWeb(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(ACTIVE_SOCIETY_STORAGE_KEY);
    return v && v.trim().length > 0 ? v : null;
  } catch {
    return null;
  }
}

function setActiveSocietyIdWeb(societyId: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(ACTIVE_SOCIETY_STORAGE_KEY, societyId);
    return true;
  } catch {
    return false;
  }
}

function clearActiveSocietyIdWeb(): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.removeItem(ACTIVE_SOCIETY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getActiveSocietyId(): string {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId) return webSocietyId;

    // fallback to keep app usable
    if (__DEV__) {
      console.log("[ActiveSociety] Using default society ID on web:", DEFAULT_SOCIETY_ID);
    }
    return DEFAULT_SOCIETY_ID;
  }

  // Native platforms: keep behaviour simple for now
  return DEFAULT_SOCIETY_ID;
}

export function hasRealActiveSociety(): boolean {
  if (Platform.OS === "web") {
    return !!getActiveSocietyIdWeb();
  }
  return true;
}

export function hasActiveSociety(): boolean {
  const id = getActiveSocietyId();
  return !!id && id.trim().length > 0;
}

export function setActiveSocietyId(societyId: string): boolean {
  if (Platform.OS === "web") {
    if (!societyId || societyId.trim().length === 0) {
      return clearActiveSocietyIdWeb();
    }
    return setActiveSocietyIdWeb(societyId);
  }

  // Native: placeholder until AsyncStorage is added
  console.log("[ActiveSociety] setActiveSocietyId on native:", societyId);
  return true;
}

export async function initActiveSocietyId(): Promise<string | null> {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId) {
      if (__DEV__) console.log("[ActiveSociety] Loaded from localStorage:", webSocietyId);
      return webSocietyId;
    }
  }

  // fallback default (keeps app working)
  if (__DEV__) console.log("[ActiveSociety] Using default society ID:", DEFAULT_SOCIETY_ID);
  return DEFAULT_SOCIETY_ID;
}
