import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
};

// Log missing vars in dev mode only (no throw)
if (__DEV__) {
  const missing = Object.entries(firebaseConfig)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.warn("Missing Firebase env vars:", missing);
  }
}

// Important: avoid re-initialising Firebase on hot reload / web
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Single shared instances
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

// ============================================================================
// STUB FUNCTIONS - for compatibility with existing code
// ============================================================================

/** Stub - always returns true */
export function isFirebaseConfigured(): boolean {
  return true;
}

/** Stub - for compatibility */
export type AuthStatus = "initializing" | "signedIn" | "needsLogin" | "error";

/** Get current user UID */
export function getCurrentUserUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/** Wait for auth state to be determined */
let _authReadyPromise: Promise<User | null> | null = null;
export function waitForAuthState(): Promise<User | null> {
  if (_authReadyPromise) return _authReadyPromise;
  _authReadyPromise = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ?? null);
    });
  });
  return _authReadyPromise;
}

/** Ensure user is signed in (anonymous if needed) */
export async function ensureSignedIn(): Promise<{ success: boolean; status: AuthStatus }> {
  try {
    if (auth.currentUser) {
      return { success: true, status: "signedIn" };
    }
    await waitForAuthState();
    if (auth.currentUser) {
      return { success: true, status: "signedIn" };
    }
    await signInAnonymously(auth);
    return { success: true, status: "signedIn" };
  } catch (e) {
    console.error("[Auth] Sign-in failed:", e);
    return { success: false, status: "error" };
  }
}

// ============================================================================
// ACTIVE SOCIETY
// ============================================================================

export const DEFAULT_SOCIETY_ID = "m4-golf-society";
const ACTIVE_SOCIETY_STORAGE_KEY = "activeSocietyId";

function getActiveSocietyIdWeb(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_SOCIETY_STORAGE_KEY);
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
  }
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
  return true;
}

export async function initActiveSocietyId(): Promise<string | null> {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId) return webSocietyId;
  }
  return DEFAULT_SOCIETY_ID;
}

/** Log Firestore operation in dev mode */
export function logFirestoreOp(
  operation: "read" | "write" | "delete" | "subscribe",
  collection: string,
  docId?: string,
  data?: unknown
): void {
  if (!__DEV__) return;
  const path = docId ? `${collection}/${docId}` : collection;
  console.log(`[Firestore] ${operation.toUpperCase()} ${path}`, data ? { data } : "");
}
