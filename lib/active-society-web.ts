/**
 * Web-only Active Society Persistence
 * 
 * Uses localStorage (not AsyncStorage) to persist the active society ID.
 * This is the ONLY business-related data stored locally on web.
 * All other data comes from Firestore.
 * 
 * Usage:
 * - Call setActiveSocietyIdWeb() when user selects/creates a society
 * - Call getActiveSocietyIdWeb() on app load to determine which society to load
 * - If null, redirect to society picker/onboarding
 */

import { Platform } from "react-native";

const ACTIVE_SOCIETY_KEY = "ACTIVE_SOCIETY_ID";
const DEFAULT_SOCIETY_ID = "m4-golf-society"; // Fallback during migration

/**
 * Get the active society ID from localStorage (web only)
 * Returns null if not set (should trigger onboarding)
 */
export function getActiveSocietyIdWeb(): string | null {
  if (Platform.OS !== "web") {
    console.warn("[ActiveSociety] getActiveSocietyIdWeb called on non-web platform");
    return DEFAULT_SOCIETY_ID;
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(ACTIVE_SOCIETY_KEY);
      if (stored) {
        console.log("[ActiveSociety] Loaded from localStorage:", stored);
        return stored;
      }
    }
  } catch (error) {
    console.warn("[ActiveSociety] Error reading from localStorage:", error);
  }

  // Return default during migration phase
  // In production, this would return null to trigger onboarding
  console.log("[ActiveSociety] No stored society ID, using default:", DEFAULT_SOCIETY_ID);
  return DEFAULT_SOCIETY_ID;
}

/**
 * Set the active society ID in localStorage (web only)
 */
export function setActiveSocietyIdWeb(societyId: string): boolean {
  if (Platform.OS !== "web") {
    console.warn("[ActiveSociety] setActiveSocietyIdWeb called on non-web platform");
    return false;
  }

  if (!societyId || societyId.trim().length === 0) {
    console.error("[ActiveSociety] Cannot set empty society ID");
    return false;
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ACTIVE_SOCIETY_KEY, societyId.trim());
      console.log("[ActiveSociety] Saved to localStorage:", societyId);
      return true;
    }
  } catch (error) {
    console.error("[ActiveSociety] Error writing to localStorage:", error);
  }

  return false;
}

/**
 * Clear the active society ID from localStorage (web only)
 * Call this on logout or when switching societies
 */
export function clearActiveSocietyIdWeb(): boolean {
  if (Platform.OS !== "web") {
    return false;
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_SOCIETY_KEY);
      console.log("[ActiveSociety] Cleared from localStorage");
      return true;
    }
  } catch (error) {
    console.error("[ActiveSociety] Error clearing localStorage:", error);
  }

  return false;
}

/**
 * Check if a society ID is stored
 */
export function hasActiveSocietyWeb(): boolean {
  if (Platform.OS !== "web") {
    return true; // Non-web platforms use different mechanism
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(ACTIVE_SOCIETY_KEY) !== null;
    }
  } catch {
    // Ignore
  }

  return false;
}
