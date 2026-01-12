// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Firebase config (Expo public env vars)
 */
type FirebaseConfigStatus =
  | { ok: true; config: Record<string, string> }
  | { ok: false; missing: string[] };

const ENV_KEYS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const missing: string[] = [];
  const config: Record<string, string> = {};

  for (const k of ENV_KEYS) {
    const v = (process.env as any)?.[k];
    if (!v || typeof v !== "string" || !v.trim()) missing.push(k);
    else config[k] = v.trim();
  }

  if (missing.length) return { ok: false, missing };
  return { ok: true, config };
}

function buildFirebaseConfig(config: Record<string, string>) {
  return {
    apiKey: config.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: config.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: config.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: config.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: config.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: config.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * Singletons
 */
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/**
 * Active Society persistence
 * - Web: localStorage
 * - Native: AsyncStorage
 */
const ACTIVE_SOCIETY_KEY = "activeSocietyId";
let activeSocietyIdCache: string | null = null;

function readActiveSocietyIdWeb(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_SOCIETY_KEY);
  } catch {
    return null;
  }
}

function writeActiveSocietyIdWeb(id: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (!id) window.localStorage.removeItem(ACTIVE_SOCIETY_KEY);
    else window.localStorage.setItem(ACTIVE_SOCIETY_KEY, id);
  } catch {
    // ignore
  }
}

async function readActiveSocietyIdNative(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_SOCIETY_KEY);
  } catch {
    return null;
  }
}

function writeActiveSocietyIdNative(id: string | null) {
  (async () => {
    try {
      if (!id) await AsyncStorage.removeItem(ACTIVE_SOCIETY_KEY);
      else await AsyncStorage.setItem(ACTIVE_SOCIETY_KEY, id);
    } catch {
      // ignore
    }
  })();
}

export async function initActiveSocietyCache(): Promise<void> {
  if (Platform.OS === "web") {
    activeSocietyIdCache = readActiveSocietyIdWeb();
    return;
  }
  activeSocietyIdCache = await readActiveSocietyIdNative();
}

export function getActiveSocietyId(): string | null {
  if (Platform.OS === "web") {
    if (activeSocietyIdCache == null) activeSocietyIdCache = readActiveSocietyIdWeb();
    return activeSocietyIdCache;
  }
  return activeSocietyIdCache;
}

export function hasRealActiveSociety(): boolean {
  return !!getActiveSocietyId();
}

export function setActiveSocietyId(societyId: string): boolean {
  activeSocietyIdCache = societyId;

  if (Platform.OS === "web") writeActiveSocietyIdWeb(societyId);
  else writeActiveSocietyIdNative(societyId);

  return true;
}

export function clearActiveSocietyId(): boolean {
  activeSocietyIdCache = null;

  if (Platform.OS === "web") writeActiveSocietyIdWeb(null);
  else writeActiveSocietyIdNative(null);

  return true;
}

/**
 * Firebase init
 * IMPORTANT:
 * - Do not import "firebase/auth/react-native" at top-level (breaks web build).
 * - Use default web Auth on web.
 * - On native, we can still run without RN persistence if the submodule isn't available,
 *   but we try to enable it via dynamic import (safe for Vercel).
 */
async function initFirebase() {
  const status = getFirebaseConfigStatus();
  if (!status.ok) {
    console.error("FIREBASE_NOT_CONFIGURED. Missing:", status.missing);
    app = null;
    auth = null;
    db = null;
    return;
  }

  const firebaseConfig = buildFirebaseConfig(status.config);

  // App
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // Auth
  if (Platform.OS === "web") {
    auth = getAuth(app);
  } else {
    // Native: try to enable persistence via dynamic import (won't be bundled on web)
    try {
      const mod = await import("firebase/auth/react-native");
      const { getReactNativePersistence } = mod as any;

      const { initializeAuth } = await import("firebase/auth");
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (e) {
      // Fallback: still works, just less persistent across app restarts until we have RN persistence
      console.warn("RN auth persistence not available, falling back to default auth:", e);
      auth = getAuth(app);
    }
  }

  // Firestore
  db = getFirestore(app);
}

// Kick off init immediately (but don't block module import)
void initFirebase();

export { app, auth, db };

/**
 * Ensure signed in (anonymous is fine)
 */
export async function ensureSignedIn(): Promise<void> {
  if (!auth) {
    // Wait a tick in case initFirebase hasn't completed yet
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!auth) throw new Error("FIREBASE_NOT_CONFIGURED");

  if (auth.currentUser) return;

  await new Promise<void>((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth!,
      async (user) => {
        unsub();
        try {
          if (user) return resolve();
          await signInAnonymously(auth!);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
}

/**
 * Dev logging helper (keep)
 */
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
