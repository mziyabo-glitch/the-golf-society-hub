// lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  type Firestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

// -------------------------
// Environment / Config
// (accept common key variants)
// -------------------------
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  // allow both variants:
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

// -------------------------
// App init (safe singleton)
// -------------------------
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig as any);
} else {
  app = getApp();
}

// -------------------------
// Auth init (web + native)
// IMPORTANT: do NOT statically import firebase/auth/react-native
// -------------------------
let auth: Auth | null = null;

function dynamicRequire(moduleName: string) {
  // Avoid web bundler resolving RN-only modules
  // eslint-disable-next-line no-eval
  const req = eval("require");
  return req(moduleName);
}

function initAuth(): Auth {
  if (auth) return auth;

  const baseAuth = getAuth(app);

  if (Platform.OS !== "web") {
    try {
      const rnAuth = dynamicRequire("firebase/auth/react-native");
      const initializeAuth = rnAuth.initializeAuth as (app: FirebaseApp, opts: any) => Auth;
      const getReactNativePersistence = rnAuth.getReactNativePersistence as (storage: any) => any;
      const AsyncStorage = dynamicRequire("@react-native-async-storage/async-storage").default;

      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
      return auth;
    } catch {
      auth = baseAuth;
      return auth;
    }
  }

  auth = baseAuth;
  return auth;
}

export const getFirebaseApp = () => app;
export const getFirebaseAuth = () => initAuth();
export const db: Firestore = getFirestore(app);

// -------------------------
// Active society helpers
// ONLINE (Firestore) + local cache (web + native)
// -------------------------
const ACTIVE_SOCIETY_KEY = "gsh_active_society_id";

async function cacheActiveSocietyIdLocal(id: string | null) {
  try {
    if (Platform.OS === "web") {
      if (id) window?.localStorage?.setItem(ACTIVE_SOCIETY_KEY, id);
      else window?.localStorage?.removeItem(ACTIVE_SOCIETY_KEY);
      return;
    }
    const AsyncStorage = dynamicRequire("@react-native-async-storage/async-storage").default;
    if (id) await AsyncStorage.setItem(ACTIVE_SOCIETY_KEY, id);
    else await AsyncStorage.removeItem(ACTIVE_SOCIETY_KEY);
  } catch {
    // ignore cache failures
  }
}

export function getActiveSocietyId(): string | null {
  // Synchronous read (web only). Native should use init/getActiveSocietyIdAsync.
  if (Platform.OS !== "web") return null;
  try {
    return window?.localStorage?.getItem(ACTIVE_SOCIETY_KEY) ?? null;
  } catch {
    return null;
  }
}

export async function getActiveSocietyIdAsync(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return window?.localStorage?.getItem(ACTIVE_SOCIETY_KEY) ?? null;
    const AsyncStorage = dynamicRequire("@react-native-async-storage/async-storage").default;
    return await AsyncStorage.getItem(ACTIVE_SOCIETY_KEY);
  } catch {
    return null;
  }
}

export async function ensureSignedIn(): Promise<User> {
  const a = initAuth();
  if (a.currentUser) return a.currentUser;
  const cred = await signInAnonymously(a);
  return cred.user;
}

export async function setActiveSocietyId(societyId: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");

  const user = await ensureSignedIn();
  const uid = user.uid;

  await setDoc(
    doc(db, "users", uid),
    { activeSocietyId: societyId, updatedAt: serverTimestamp() },
    { merge: true }
  );

  await cacheActiveSocietyIdLocal(societyId);
}

/**
 * ✅ This is what your app is calling (RootLayout/startup)
 * It hydrates activeSocietyId from Firestore into local cache.
 */
export async function initActiveSocietyId(): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    console.warn("[firebase] Not configured. Missing EXPO_PUBLIC_FIREBASE_* env vars.");
    return null;
  }

  const user = await ensureSignedIn();
  const uid = user.uid;

  const snap = await getDoc(doc(db, "users", uid));
  const activeSocietyId =
    (snap.exists() ? (snap.data() as any).activeSocietyId : null) ?? null;

  await cacheActiveSocietyIdLocal(activeSocietyId);
  return activeSocietyId;
}
