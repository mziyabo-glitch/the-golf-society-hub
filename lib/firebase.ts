// lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// -------------------------
// Environment / Config
// -------------------------
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER,
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
  if (!isFirebaseConfigured()) {
    // Don't throw here - let UI show your "not configured" screen.
    console.warn("[firebase] Not configured. Missing EXPO_PUBLIC_FIREBASE_* env vars.");
  }
  app = initializeApp(firebaseConfig as any);
} else {
  app = getApp();
}

// -------------------------
// Auth init (web + native)
// IMPORTANT: DO NOT statically import firebase/auth/react-native
// because web builds will fail.
// -------------------------
let auth: Auth | null = null;

function dynamicRequire(moduleName: string) {
  // Avoid bundlers trying to resolve the module at build time (web).
  // eslint-disable-next-line no-eval
  const req = eval("require");
  return req(moduleName);
}

function initAuth(): Auth {
  if (auth) return auth;

  // Default safe auth (works everywhere)
  const baseAuth = getAuth(app);

  // On native, attempt to use react-native persistence if available.
  // If anything fails, keep baseAuth.
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
    } catch (e) {
      console.warn("[firebase] Native persistence not enabled, falling back to default auth.", e);
      auth = baseAuth;
      return auth;
    }
  }

  // Web: default auth persistence works fine (IndexedDB/localStorage)
  auth = baseAuth;
  return auth;
}

export const getFirebaseApp = () => app;
export const getFirebaseAuth = () => initAuth();

export const db: Firestore = getFirestore(app);

// -------------------------
// "Active society" helpers
// You want it ONLINE for persistence, but many screens need a quick
// synchronous value for routing. We'll store both:
//  - Firestore: users/{uid}.activeSocietyId
//  - Local cache: for immediate app startup routing
// -------------------------
const ACTIVE_SOCIETY_KEY = "gsh_active_society_id";

function setLocalActiveSocietyId(id: string) {
  try {
    if (Platform.OS === "web") {
      window?.localStorage?.setItem(ACTIVE_SOCIETY_KEY, id);
      return;
    }
    // Native: avoid importing AsyncStorage in web bundle paths.
    const AsyncStorage = dynamicRequire("@react-native-async-storage/async-storage").default;
    AsyncStorage.setItem(ACTIVE_SOCIETY_KEY, id);
  } catch (e) {
    console.warn("[firebase] Failed to cache activeSocietyId locally", e);
  }
}

export function getActiveSocietyId(): string | null {
  try {
    if (Platform.OS === "web") {
      return window?.localStorage?.getItem(ACTIVE_SOCIETY_KEY) ?? null;
    }
    // Native sync read isn't possible with AsyncStorage, so return null here.
    // (Your screens currently call this synchronously; web is the main case.)
    return null;
  } catch {
    return null;
  }
}

// If you need native to get it, use this async helper:
export async function getActiveSocietyIdAsync(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return window?.localStorage?.getItem(ACTIVE_SOCIETY_KEY) ?? null;
    }
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

/**
 * Persists active society ONLINE (Firestore) + caches locally for routing.
 */
export async function setActiveSocietyId(societyId: string): Promise<void> {
  const user = await ensureSignedIn();
  const uid = user.uid;

  // Online persistence
  await setDoc(
    doc(db, "users", uid),
    {
      activeSocietyId: societyId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Local cache (helps routing/boot)
  setLocalActiveSocietyId(societyId);
}
