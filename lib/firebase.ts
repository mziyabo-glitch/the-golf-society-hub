// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

/**
 * RULES for this project:
 * - NO localStorage
 * - NO AsyncStorage
 * - NO firebase/auth/react-native (breaks Expo Web/Vercel)
 * - Active society persisted ONLINE at: users/{uid}.activeSocietyId
 */

type FirebaseEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function readFirebaseEnv(): FirebaseEnv | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId) return null;

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function isFirebaseConfigured(): boolean {
  return !!readFirebaseEnv();
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

// in-memory cache only (NOT persisted locally)
let activeSocietyIdCache: string | null = null;

export function getFirebaseApp(): FirebaseApp {
  const env = readFirebaseEnv();
  if (!env) {
    throw new Error(
      "Firebase not configured: missing EXPO_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID"
    );
  }
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(env);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}

// Export SINGLETONS once (NO duplicates)
export const app = getFirebaseApp();
export const auth = getFirebaseAuth();
export const db = getFirebaseDb();

/**
 * Ensure user is signed in (anonymous is fine).
 * Returns Firebase User (callers can safely do user.uid).
 */
export async function ensureSignedIn(): Promise<User> {
  const a = getFirebaseAuth();

  if (a.currentUser) return a.currentUser;

  const userFromState = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(a, (u) => {
      unsub();
      resolve(u);
    });
    setTimeout(() => resolve(null), 800);
  });

  if (userFromState) return userFromState;

  const cred = await signInAnonymously(a);
  return cred.user;
}

export function getCurrentUserUid(): string | null {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

async function ensureUserDoc(uid: string) {
  const ref = doc(getFirebaseDb(), "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      { createdAt: serverTimestamp(), updatedAt: serverTimestamp(), activeSocietyId: null },
      { merge: true }
    );
  }
}

/**
 * Loads activeSocietyId from Firestore into memory cache.
 */
export async function initActiveSocietyId(): Promise<string | null> {
  const user = await ensureSignedIn();
  const uid = user.uid;

  await ensureUserDoc(uid);

  const ref = doc(getFirebaseDb(), "users", uid);
  const snap = await getDoc(ref);
  const data = snap.data() as any;

  activeSocietyIdCache = (data?.activeSocietyId as string | null) ?? null;
  return activeSocietyIdCache;
}

export function getActiveSocietyId(): string | null {
  return activeSocietyIdCache;
}

export function hasActiveSociety(): boolean {
  return !!activeSocietyIdCache;
}

export async function setActiveSocietyId(societyId: string | null): Promise<void> {
  const user = await ensureSignedIn();
  const uid = user.uid;

  await ensureUserDoc(uid);

  const ref = doc(getFirebaseDb(), "users", uid);
  await setDoc(
    ref,
    { activeSocietyId: societyId ?? null, updatedAt: serverTimestamp() },
    { merge: true }
  );

  activeSocietyIdCache = societyId ?? null;
}

export async function clearActiveSocietyId(): Promise<void> {
  await setActiveSocietyId(null);
}
