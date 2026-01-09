/**
 * Firebase Client Setup
 * 
 * Initializes Firebase SDK for Expo and exports Firestore database instance.
 * This is the single source of truth for Firebase configuration.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "./storage";

// Firebase configuration
// In production, these should come from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKey",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "golf-society-hub.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "golf-society-hub",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "golf-society-hub.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abc123",
};

// Initialize Firebase (prevent re-initialization in hot reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Export Firestore database instance
export const db = getFirestore(app);

/**
 * Check if Firebase is properly configured
 * Returns true if using real config, false if using dummy values
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== "AIzaSyDummyKey";
}

/**
 * Throw a controlled error if Firebase is not configured in production.
 */
export function assertFirebaseConfigured(): void {
  const isProd = process.env.NODE_ENV === "production";
  if (!isFirebaseConfigured() && isProd) {
    // Clear, actionable log
    console.error(
      "[Firebase] Firebase is not configured for production. " +
        "Set EXPO_PUBLIC_FIREBASE_* environment variables (apiKey, projectId, etc.)."
    );
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

// ---------------------------------------------------------------------------
// Active society id guard (cached, async-initialized)
// ---------------------------------------------------------------------------

let activeSocietyIdCache: string | null = null;
let activeSocietyIdInitialized = false;
let activeSocietyIdInitPromise: Promise<string | null> | null = null;

function parseSocietyIdFromActiveSocietyJson(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as any;
    const candidate =
      (typeof parsed?.id === "string" && parsed.id) ||
      (typeof parsed?.societyId === "string" && parsed.societyId) ||
      (typeof parsed?.docId === "string" && parsed.docId) ||
      null;
    return candidate && candidate.trim() ? candidate.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Initialize the active society id cache from AsyncStorage/env.
 * Safe to call multiple times.
 */
export async function initActiveSocietyId(): Promise<string | null> {
  if (activeSocietyIdInitPromise) return activeSocietyIdInitPromise;

  activeSocietyIdInitPromise = (async () => {
    // 1) Explicit ID key
    try {
      const storedId = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE_ID);
      if (storedId && storedId.trim()) {
        activeSocietyIdCache = storedId.trim();
        activeSocietyIdInitialized = true;
        return activeSocietyIdCache;
      }
    } catch (e) {
      console.warn("[Firebase] Failed reading SOCIETY_ACTIVE_ID from storage:", e);
    }

    // 2) Try extracting from SOCIETY_ACTIVE object (if it contains id)
    try {
      const activeSociety = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
      if (activeSociety) {
        const derived = parseSocietyIdFromActiveSocietyJson(activeSociety);
        if (derived) {
          activeSocietyIdCache = derived;
          activeSocietyIdInitialized = true;
          return activeSocietyIdCache;
        }
      }
    } catch (e) {
      console.warn("[Firebase] Failed reading SOCIETY_ACTIVE from storage:", e);
    }

    // 3) Env fallback
    const envDefault = process.env.EXPO_PUBLIC_DEFAULT_SOCIETY_ID;
    if (envDefault && envDefault.trim()) {
      activeSocietyIdCache = envDefault.trim();
      activeSocietyIdInitialized = true;
      return activeSocietyIdCache;
    }

    // 4) Final fallback: dev-only hardcoded ID, warn loudly
    if (__DEV__) {
      console.warn(
        "[Firebase] No active society id found. Falling back to dev default 'm4-golf-society'. " +
          "Set EXPO_PUBLIC_DEFAULT_SOCIETY_ID or store STORAGE_KEYS.SOCIETY_ACTIVE_ID."
      );
      activeSocietyIdCache = "m4-golf-society";
      activeSocietyIdInitialized = true;
      return activeSocietyIdCache;
    }

    activeSocietyIdCache = null;
    activeSocietyIdInitialized = true;
    return null;
  })();

  return activeSocietyIdInitPromise;
}

/**
 * Get the active society ID.
 *
 * Resolution order:
 * - Cached AsyncStorage id (initActiveSocietyId)
 * - EXPO_PUBLIC_DEFAULT_SOCIETY_ID
 * - __DEV__ fallback to "m4-golf-society" (warns)
 *
 * In production, throws a controlled error if missing.
 */
export function getActiveSocietyId(): string {
  if (activeSocietyIdInitialized && activeSocietyIdCache && activeSocietyIdCache.trim()) {
    return activeSocietyIdCache.trim();
  }

  const envDefault = process.env.EXPO_PUBLIC_DEFAULT_SOCIETY_ID;
  if (envDefault && envDefault.trim()) return envDefault.trim();

  if (__DEV__) {
    console.warn(
      "[Firebase] getActiveSocietyId() called before initActiveSocietyId() resolved. Using dev fallback 'm4-golf-society'."
    );
    return "m4-golf-society";
  }

  throw new Error("MISSING_ACTIVE_SOCIETY_ID");
}
