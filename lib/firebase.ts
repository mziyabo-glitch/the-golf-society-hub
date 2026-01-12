/**
 * Firebase Client Setup
 * Stable version – no forced society, no duplicate exports
 */

import { Platform } from "react-native";
import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
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
  doc,
  getDoc,
  type Firestore,
} from "firebase/firestore";

/* ───────────────────────────────────────────── */
/* ENV CONFIG                                    */
/* ───────────────────────────────────────────── */

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const FIREBASE_AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!;
const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const FIREBASE_STORAGE_BUCKET =
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const FIREBASE_MESSAGING_SENDER_ID =
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!;
const FIREBASE_APP_ID = process.env.EXPO_PUBLIC_FIREBASE_APP_ID!;

export const DEFAULT_SOCIETY_ID = "m4-golf-society";
const ACTIVE_SOCIETY_STORAGE_KEY = "activeSocietyId";

/* ───────────────────────────────────────────── */
/* TYPES                                        */
/* ───────────────────────────────────────────── */

export type AuthStatus =
  | "initializing"
  | "signedIn"
  | "signedOut"
  | "needsLogin"
  | "configError";

export interface FirebaseConfigStatus {
  configured: boolean;
  usingDummyConfig: boolean;
  missingVars: string[];
}

/* ───────────────────────────────────────────── */
/* CONFIG CHECK                                 */
/* ───────────────────────────────────────────── */

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const missingVars: string[] = [];

  if (!FIREBASE_API_KEY) missingVars.push("EXPO_PUBLIC_FIREBASE_API_KEY");
  if (!FIREBASE_AUTH_DOMAIN)
    missingVars.push("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!FIREBASE_PROJECT_ID)
    missingVars.push("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
  if (!FIREBASE_STORAGE_BUCKET)
    missingVars.push("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (!FIREBASE_MESSAGING_SENDER_ID)
    missingVars.push("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (!FIREBASE_APP_ID) missingVars.push("EXPO_PUBLIC_FIREBASE_APP_ID");

  const usingDummyConfig =
    FIREBASE_PROJECT_ID?.includes("dummy") ||
    FIREBASE_API_KEY?.includes("dummy");

  return {
    configured: missingVars.length === 0 && !usingDummyConfig,
    usingDummyConfig,
    missingVars,
  };
}

export function assertFirebaseConfigured() {
  const status = getFirebaseConfigStatus();
  if (!status.configured) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

/* ───────────────────────────────────────────── */
/* INITIALISATION                               */
/* ───────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp;
let firebaseAuth: Auth;
let firestoreDb: Firestore;

export function getFirebaseApp(): FirebaseApp {
  assertFirebaseConfigured();
  if (!firebaseApp) {
    firebaseApp = getApps().length
      ? getApp()
      : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseApp());
  }
  return firebaseAuth;
}

export function getFirebaseDb(): Firestore {
  if (!firestoreDb) {
    firestoreDb = getFirestore(getFirebaseApp());
  }
  return firestoreDb;
}

/* ───────────────────────────────────────────── */
/* PUBLIC EXPORTS                               */
/* ───────────────────────────────────────────── */

export const db = getFirebaseDb();
export const authInstance = getFirebaseAuth();

/* ───────────────────────────────────────────── */
/* AUTH HELPERS                                 */
/* ───────────────────────────────────────────── */

export function waitForAuthState(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function ensureSignedIn(): Promise<{
  success: boolean;
  status: AuthStatus;
  error?: any;
}> {
  try {
    assertFirebaseConfigured();

    if (getFirebaseAuth().currentUser) {
      return { success: true, status: "signedIn" };
    }

    try {
      await signInAnonymously(getFirebaseAuth());
      return { success: true, status: "signedIn" };
    } catch (err: any) {
      if (err?.code === "auth/operation-not-allowed") {
        return { success: false, status: "needsLogin", error: err };
      }
      return { success: false, status: "signedOut", error: err };
    }
  } catch (err) {
    return { success: false, status: "configError", error: err };
  }
}

/* ───────────────────────────────────────────── */
/* ACTIVE SOCIETY                               */
/* ───────────────────────────────────────────── */

function getActiveSocietyIdWeb(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ACTIVE_SOCIETY_STORAGE_KEY);
  return v && v.trim() ? v : null;
}

function setActiveSocietyIdWeb(id: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_SOCIETY_STORAGE_KEY, id);
  }
}

function clearActiveSocietyIdWeb() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACTIVE_SOCIETY_STORAGE_KEY);
  }
}

export function getActiveSocietyId(): string {
  if (Platform.OS === "web") {
    const id = getActiveSocietyIdWeb();
    if (id) return id;
    return __DEV__ ? DEFAULT_SOCIETY_ID : "";
  }
  return __DEV__ ? DEFAULT_SOCIETY_ID : "";
}

export function hasRealActiveSociety(): boolean {
  const id = getActiveSocietyId();
  return !!id && id !== DEFAULT_SOCIETY_ID;
}

export function hasActiveSociety(): boolean {
  return !!getActiveSocietyId();
}

export function setActiveSocietyId(id: string) {
  if (!id) {
    clearActiveSocietyIdWeb();
    return;
  }
  if (Platform.OS === "web") {
    setActiveSocietyIdWeb(id);
  }
}

export async function initActiveSocietyId(): Promise<string> {
  if (Platform.OS === "web") {
    const id = getActiveSocietyIdWeb();
    if (id) return id;
    console.log("[ActiveSociety] No active society yet (expected)");
    return __DEV__ ? DEFAULT_SOCIETY_ID : "";
  }
  return __DEV__ ? DEFAULT_SOCIETY_ID : "";
}

/* ───────────────────────────────────────────── */
/* SAFE READ                                   */
/* ───────────────────────────────────────────── */

export async function getActiveSocietyDoc(): Promise<any | null> {
  const societyId = getActiveSocietyId();
  if (!societyId) return null;

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
