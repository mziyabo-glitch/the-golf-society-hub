import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

// We intentionally avoid importing firebase/auth/react-native at top-level,
// because it can break web bundling. We require it only on native.
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ---- AUTH (with persistence on native) ----
function initAuth() {
  if (Platform.OS === "web") {
    // Web already persists auth by default (IndexedDB/localStorage)
    return getAuth(app);
  }

  // Native: make anonymous auth persistent across app restarts.
  // Requires: @react-native-async-storage/async-storage (you already have it)
  // Uses: firebase/auth/react-native (required only on native)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { initializeAuth, getReactNativePersistence } = require("firebase/auth/react-native");

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // If initializeAuth was already called (hot reload), fallback.
    return getAuth(app);
  }
}

export const auth = initAuth();
export const db = getFirestore(app);

export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  const existing = await new Promise<string | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user?.uid ?? null);
    });
  });

  if (existing) return existing;

  const result = await signInAnonymously(auth);
  return result.user.uid;
}

