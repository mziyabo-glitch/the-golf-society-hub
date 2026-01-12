import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Guard so failures are loud and obvious
const missing = Object.entries(firebaseConfig)
  .filter(([_, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("Missing Firebase env vars:", missing);
  throw new Error("FIREBASE_NOT_CONFIGURED");
}

// Important: avoid re-initialising Firebase on hot reload / web
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Single shared instances
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
