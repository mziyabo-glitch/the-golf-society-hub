/**
 * Firebase Client Setup
 * 
 * Initializes Firebase SDK for Expo and exports Firestore database instance.
 * This is the single source of truth for Firebase configuration.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
 * Get the active society ID
 * 
 * During migration phase, this returns a hardcoded value.
 * In production, this will read from user session/auth context.
 * 
 * @returns The active society document ID
 */
export function getActiveSocietyId(): string {
  // TODO: Replace with dynamic society ID from user session
  // For now, return hardcoded value for migration testing
  return "m4-golf-society";
}

/**
 * Check if Firebase is properly configured
 * Returns true if using real config, false if using dummy values
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== "AIzaSyDummyKey";
}
