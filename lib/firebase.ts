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

// ============================================================================
// REQUIRED ENVIRONMENT VARIABLES
// ============================================================================

const REQUIRED_ENV_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================

// Firebase configuration
// In production, these MUST come from environment variables
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

// ============================================================================
// CONFIGURATION CHECKS
// ============================================================================

export interface FirebaseConfigStatus {
  configured: boolean;
  missingVars: string[];
  usingDummyConfig: boolean;
}

/**
 * Get detailed Firebase configuration status
 * Returns which env vars are missing and whether using dummy config
 */
export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const missingVars: string[] = [];
  
  // Check each required env var
  if (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY === "AIzaSyDummyKey") {
    missingVars.push("EXPO_PUBLIC_FIREBASE_API_KEY");
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) {
    missingVars.push("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN");
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    missingVars.push("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    missingVars.push("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET");
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) {
    missingVars.push("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  }
  if (!process.env.EXPO_PUBLIC_FIREBASE_APP_ID) {
    missingVars.push("EXPO_PUBLIC_FIREBASE_APP_ID");
  }
  
  const usingDummyConfig = firebaseConfig.apiKey === "AIzaSyDummyKey";
  
  return {
    configured: missingVars.length === 0 && !usingDummyConfig,
    missingVars,
    usingDummyConfig,
  };
}

/**
 * Check if Firebase is properly configured
 * Returns true if ALL required env vars are set with real values
 */
export function isFirebaseConfigured(): boolean {
  const status = getFirebaseConfigStatus();
  return status.configured;
}

/**
 * Check if Firebase configuration is missing in production
 * Returns true if we're in production but using dummy config
 */
export function isFirebaseConfigMissing(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  return isProduction && !isFirebaseConfigured();
}

/**
 * Throw a controlled error if Firebase is not configured in production.
 * Logs which specific env vars are missing for debugging.
 */
export function assertFirebaseConfigured(): void {
  const isProd = process.env.NODE_ENV === "production";
  const status = getFirebaseConfigStatus();
  
  if (!status.configured && isProd) {
    console.error(
      "[Firebase] Firebase is not configured for production.\n" +
      "Missing environment variables: " + status.missingVars.join(", ") + "\n" +
      "Using dummy config: " + status.usingDummyConfig
    );
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
  
  // Log warning in dev if using dummy config
  if (__DEV__ && status.usingDummyConfig) {
    console.warn(
      "[Firebase] Using dummy configuration. Set EXPO_PUBLIC_FIREBASE_* env vars for production."
    );
  }
}

// ============================================================================
// ACTIVE SOCIETY
// ============================================================================

/**
 * Get the active society ID
 * 
 * On web: reads from localStorage
 * On native: uses default (will be replaced with AsyncStorage later)
 * 
 * @returns The active society document ID (always returns a string, defaults to DEFAULT_SOCIETY_ID)
 */
export function getActiveSocietyId(): string {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    if (webSocietyId) {
      return webSocietyId;
    }
    // Fall back to default during migration
    if (__DEV__) {
      console.log("[Firebase] Using default society ID on web:", DEFAULT_SOCIETY_ID);
    }
    return DEFAULT_SOCIETY_ID;
  }
  
  // Native platforms use default for now
  return DEFAULT_SOCIETY_ID;
}

/**
 * Check if a real active society is selected (not just the default)
 */
export function hasRealActiveSociety(): boolean {
  if (Platform.OS === "web") {
    const webSocietyId = getActiveSocietyIdWeb();
    return !!webSocietyId;
  }
  // On native, we always have a default
  return true;
}

/**
 * Check if an active society is selected
 */
export function hasActiveSociety(): boolean {
  const societyId = getActiveSocietyId();
  return societyId !== null && societyId.length > 0;
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
      if (__DEV__) {
        console.log("[Firebase] Initialized active society from localStorage:", webSocietyId);
      }
      return webSocietyId;
    }
  }
  
  // Return default for now
  if (__DEV__) {
    console.log("[Firebase] Using default society ID:", DEFAULT_SOCIETY_ID);
  }
  return DEFAULT_SOCIETY_ID;
}

// ============================================================================
// DEV MODE LOGGING
// ============================================================================

/**
 * Log Firestore operation in dev mode
 * Helps track what's being written/read
 */
export function logFirestoreOp(
  operation: "read" | "write" | "delete" | "subscribe",
  collection: string,
  docId?: string,
  data?: unknown
): void {
  if (!__DEV__) return;
  
  const path = docId ? `${collection}/${docId}` : collection;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  
  console.log(`[Firestore ${timestamp}] ${operation.toUpperCase()} ${path}`, data ? { data } : "");
}
