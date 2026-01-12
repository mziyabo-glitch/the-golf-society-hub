import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
} from "firebase/firestore";
import {
  getAuth,
  Auth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import { Platform } from "react-native";

/* ------------------------------------------------------------------ */
/* ENV + CONFIG                                                        */
/* ------------------------------------------------------------------ */

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

/* ------------------------------------------------------------------ */
/* APP INIT                                                           */
/* ------------------------------------------------------------------ */

function getFirebaseApp() {
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function getFirebaseDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getFirebaseApp());
  }
  return _db;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
  }
  return _auth;
}

export const db = getFirebaseDb();
export const authInstance = getFirebaseAuth();

/* ------------------------------------------------------------------ */
/* AUTH BOOTSTRAP                                                     */
/* ------------------------------------------------------------------ */

export async function waitForAuthState(): Promise<void> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(authInstance, () => {
      unsub();
      resolve();
    });
  });
}

export async function ensureSignedIn() {
  try {
    if (!authInstance.currentUser) {
      await signInAnonymously(authInstance);
    }
    return { success: true, status: "signedIn" as const };
  } catch (error: any) {
    return {
      success: false,
      status: "configError" as const,
      error,
    };
  }
}

/* ------------------------------------------------------------------ */
/* ACTIVE SOCIETY (WEB-ONLY, SAFE)                                    */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "activeSocietyId";
const DEFAULT_SOCIETY_ID = "m4_golf_society";

export function getActiveSocietyId(): string {
  if (Platform.OS === "web") {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) return v;
  }
  return DEFAULT_SOCIETY_ID;
}

export function hasActiveSociety(): boolean {
  if (Platform.OS === "web") {
    return !!localStorage.getItem(STORAGE_KEY);
  }
  return true;
}

export function setActiveSocietyId(id: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(STORAGE_KEY, id);
  }
}

export async function initActiveSocietyId(): Promise<string | null> {
  return getActiveSocietyId();
}
