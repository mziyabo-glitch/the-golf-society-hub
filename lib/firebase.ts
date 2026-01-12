/**
 * Firebase Client Setup
 *
 * Initializes Firebase SDK...
 * Uses Firestore as the canonical store.
 * Anonymous auth is used for now, user docs keyed by auth.uid for consistent access control
 */

import { Platform } from "react-native";
import {
  initializeApp,
  type FirebaseApp,
  getApps,
  getApp,
} from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  type Firestore,
  doc,
  getDoc,
} from "firebase/firestore";

/**
 * Firebase environment variables (Expo / Vercel)
 * NOTE: these are read from process.env for web builds.
 */
const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const FIREBASE_STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
const FIREBASE_MESSAGING_SENDER_ID =
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const FIREBASE_APP_ID = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

// Dev fallback for older builds / convenience only
const DEFAULT_SOCIETY_ID = "m4-golf-society";

// Storage key used on web
const ACTIVE_SOCIETY_STORAGE_KEY = "activeSocietyId";

export type AuthStatus =
  | "initializing" // Auth state not yet determined
  | "signedIn" // Signed in (anon or real)
  | "signedOut" // Explicitly signed out
  | "needsLogin" // Anonymous auth disabled / requires login
  | "configError"; // Firebase config missing/invalid

export interface FirebaseConfigStatus {
  configured: boolean;
  usingDummyConfig: boolean;
  missingVars: string[];
}

/**
 * Get detailed Firebase config status (used in RootLayout to show helpful UI)
 */
export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const missingVars: string[] = [];
  const required = [
    ["EXPO_PUBLIC_FIREBASE_API_KEY", FIREBASE_API_KEY],
    ["EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", FIREBASE_AUTH_DOMAIN],
    ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", FIREBASE_PROJECT_ID],
    ["EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", FIREBASE_STORAGE_BUCKET],
    ["EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", FIREBASE_MESSAGING_SENDER_ID],
    ["EXPO_PUBLIC_FIREBASE_APP_ID", FIREBASE_APP_ID],
  ] as const;

  for (const [name, value] of required) {
    if (!value || value.trim().length === 0) missingVars.push(name);
  }

  const usingDummyConfig =
    (FIREBASE_API_KEY || "").includes("dummy") ||
    (FIREBASE_PROJECT_ID || "").includes("dummy") ||
    (FIREBASE_APP_ID || "").includes("dummy");

  return {
    configured: missingVars.length === 0 && !usingDummyConfig,
    usingDummyConfig,
    missingVars,
  };
}

/**
 * Throws if Firebase is not configured (legacy helper)
 */
export function assertFirebaseConfigured(): void {
  const status = getFirebaseConfigStatus();
  if (!status.configured) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

/**
 * Initialize Firebase safely (idempotent for web hot reload)
 */
export function getFirebaseApp(): FirebaseApp {
  assertFirebaseConfigured();

  if (!app) {
    const apps = getApps();
    app = apps.length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

// Backward-compatible named exports
export const firebaseApp = () => getFirebaseApp();
export const firebaseAuth = () => getFirebaseAuth();
export const dbInstance = () => getFirebaseDb();

// Common exports used throughout your repo
export const db = getFirebaseDb();
export const authInstance = getFirebaseAuth();

/**
 * Wait for Firebase Auth state to be ready.
 * Used during startup to prevent race conditions.
 */
export function waitForAuthState(): Promise<User | null> {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * Ensure user is signed in.
 * This does NOT throw on failure; returns status instead.
 */
export async function ensureSignedIn(): Promise<{
  success: boolean;
  status: AuthStatus;
  error?: any;
}> {
  try {
    assertFirebaseConfigured();

    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      return { success: true, status: "signedIn" };
    }

    // Attempt anonymous sign-in
    try {
      await signInAnonymously(auth);
      return { success: true, status: "signedIn" };
    } catch (err: any) {
      // If anonymous auth not enabled, Firebase throws operation-not-allowed
      if (err?.code === "auth/operation-not-allowed") {
        return { success: false, status: "needsLogin", error: err };
      }
      return { success: false, status: "signedOut", error: err };
    }
  } catch (err: any) {
    return { success: false, status: "configError", error: err };
  }
}

/**
 * Active Society Helpers (Web localStorage + future AsyncStorage)
 */

// Web storage helpers
function getActiveSocietyIdWeb(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(ACTIVE_SOCIETY_STORAGE_KEY);
    return v && v.trim().length > 0 ? v : null;
  } catch {
    return null;
  }
}

function setActiveSocietyIdWeb(id: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(ACTIVE_SOCIETY_STORAGE_KEY, id);
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

/**
 * Get active society id.
 *
 * IMPORTANT CHANGE:
 * - Production must NOT force DEFAULT_SOCIETY_ID when nothing is selected.
 * - To keep compatibility (existing code expects string), return "" when none selected.
 * - Dev-only convenience fallback to DEFAULT_SOCIETY_ID is allowed.
 */
export function getActiveSocietyId(): string {
  // Web: prefer persisted value in localStorage
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId && webSocietyId.trim().length > 0) {
      return webSocietyId;
    }

    // Dev-only convenience fallback
    if (__DEV__) {
      console.log(
        "[Firebase] No active society on web, using dev default:",
        DEFAULT_SOCIETY_ID
      );
      return DEFAULT_SOCIETY_ID;
    }

    // Production: no society selected yet
    return "";
  }

  // Native: until AsyncStorage is wired, avoid forcing a default in production
  if (__DEV__) {
    console.log(
      "[Firebase] No active society on native, using dev default:",
      DEFAULT_SOCIETY_ID
    );
    return DEFAULT_SOCIETY_ID;
  }
  return "";
}

/**
 * Check if a real active society is selected (not just dev default)
 */
export function hasRealActiveSociety(): boolean {
  const societyId = getActiveSocietyId();
  return societyId.length > 0 && societyId !== DEFAULT_SOCIETY_ID;
}

/**
 * Check if an active society is selected
 */
export function hasActiveSociety(): boolean {
  return getActiveSocietyId().length > 0;
}

/**
 * Set the active society ID
 * On web: saves to localStorage
 * Empty string clears the society ID
 */
export function setActiveSocietyId(societyId: string): boolean {
  if (Platform.OS === "web") {
    if (!societyId || societyId.trim().length === 0) {
      return clearActiveSocietyIdWeb();
    }
    return setActiveSocietyIdWeb(societyId);
  }

  // On native, this would be handled differently (AsyncStorage)
  // For now, just log
  console.log("[Firebase] setActiveSocietyId on native:", societyId);
  return true;
}

/**
 * Initialize the active society id (async).
 * On web, this reads from localStorage.
 * Returns the society ID or "" if not set (production).
 */
export async function initActiveSocietyId(): Promise<string> {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId && webSocietyId.trim().length > 0) {
      if (__DEV__) {
        console.log(
          "[Firebase] Initialized active society from localStorage:",
          webSocietyId
        );
      }
      return webSocietyId;
    }

    // Production/web: no society selected yet is expected during onboarding
    if (!__DEV__) {
      console.log("[ActiveSociety] No active society yet (expected)");
      return "";
    }

    // Dev-only fallback
    console.log("[Firebase] Using dev default society ID:", DEFAULT_SOCIETY_ID);
    return DEFAULT_SOCIETY_ID;
  }

  // Native: until AsyncStorage is wired, match the same behavior
  return __DEV__ ? DEFAULT_SOCIETY_ID : "";
}

/**
 * Helper: read the active society doc (safe)
 * Returns null if no active society selected, or if doc missing.
 */
export async function getActiveSocietyDoc(): Promise<any | null> {
  const societyId = getActiveSocietyId();
  if (!societyId || societyId.trim().length === 0) {
    return null;
  }

  try {
    const ref = doc(getFirebaseDb(), "societies", societyId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error("[Firestore] getActiveSocietyDoc failed", err);
    return null;
  }
}
