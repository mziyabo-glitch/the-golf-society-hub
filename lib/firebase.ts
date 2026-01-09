/**
 * Firebase Client Setup
 * 
 * Initializes Firebase SDK for Expo and exports Firestore database instance.
 * This is the single source of truth for Firebase configuration.
 * 
 * WEB-ONLY PERSISTENCE:
 * - Active society ID is stored in localStorage (via active-society-web.ts)
 * - All other business data comes from Firestore only
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";
import { getActiveSocietyIdWeb } from "./active-society-web";

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

// Default society ID for migration/testing
const DEFAULT_SOCIETY_ID = "m4-golf-society";

/**
 * Get the active society ID
 * 
 * On web: reads from localStorage
 * On native: uses default (will be replaced with AsyncStorage later)
 * 
 * @returns The active society document ID
 */
export function getActiveSocietyId(): string {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    return webSocietyId || DEFAULT_SOCIETY_ID;
  }
  
  // Native platforms use default for now
  // TODO: Replace with AsyncStorage-based retrieval for native
  return DEFAULT_SOCIETY_ID;
}

/**
 * Check if Firebase is properly configured
 * Returns true if using real config, false if using dummy values
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== "AIzaSyDummyKey";
}

/**
 * Check if Firebase configuration is missing in production
 * Returns true if we're in production but using dummy config
 */
export function isFirebaseConfigMissing(): boolean {
  // Check if we're in production (not __DEV__)
  const isProduction = typeof __DEV__ !== "undefined" ? !__DEV__ : true;
  return isProduction && !isFirebaseConfigured();
}

/**
 * Throw a controlled error if Firebase is not configured in production.
 */
export function assertFirebaseConfigured(): void {
  const isProd = process.env.NODE_ENV === "production";
  if (!isFirebaseConfigured() && isProd) {
    console.error(
      "[Firebase] Firebase is not configured for production. " +
        "Set EXPO_PUBLIC_FIREBASE_* environment variables (apiKey, projectId, etc.)."
    );
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

/**
 * Initialize the active society id (async).
 * On web, this reads from localStorage.
 * Returns the society ID or null if not set.
 */
export async function initActiveSocietyId(): Promise<string | null> {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId) {
      console.log("[Firebase] Initialized active society from localStorage:", webSocietyId);
      return webSocietyId;
    }
  }
  
  // Return default for now
  console.log("[Firebase] Using default society ID:", DEFAULT_SOCIETY_ID);
  return DEFAULT_SOCIETY_ID;
}
