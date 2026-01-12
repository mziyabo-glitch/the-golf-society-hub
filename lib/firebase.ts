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
 * IMPORTANT:
 * - No localStorage
 * - No AsyncStorage
 * - No firebase/auth/react-native (breaks Vercel/Expo web builds)
 * - Active society is stored online: users/{uid}.activeSocietyId
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

  // optional but recommended
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId) return null;

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function isFirebaseConfigured(): boolean {
  return !!readFirebaseEnv();
}

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// in-memory cache (NOT persisted locally)
let activeSocietyIdCache: string | null = null;

export function getFirebaseApp(): FirebaseApp {
  const env = readFirebaseEnv();
  if (!env) {
    throw new Error(
      "Firebase not configured: missing EXPO_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID"
    );
  }

  if (firebaseApp) return firebaseApp;
  firebaseApp = getApps().length ? getApp() : initializeApp(env);
  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}

// Named exports used across the app
export const app = getFirebaseApp();
export const db = getFirebaseDb();

/**
 * Ensure user is signed in (anonymous is fine).
 * Returns the Firebase User (so callers can do user.uid safely).
 */
export async function ensureSignedIn(): Promise<User> {
  const a = getFirebaseAuth();

  // If already signed in, return immediately
  const existing = a.currentUser;
  if (existing) return existing;

  // Wait briefly for auth state (in case it’s restoring)
  const userFromState = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(a, (u) => {
      unsub();
      resolve(u);
    });
    // if nothing happens quickly, resolve null and we sign in anon
    setTimeout(() => resolve(null), 800);
  });

  if (userFromState) return userFromState;

  // Otherwise sign in anonymously
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

/**
 * Online persistence:
 * users/{uid}.activeSocietyId
 */
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
