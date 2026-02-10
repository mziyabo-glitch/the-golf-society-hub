// lib/firebase.ts
// DISABLED: Firebase has been replaced by Supabase.
// This file exports stubs to prevent import errors from legacy code.
// All new code should use Supabase via @/lib/supabase.

import type { Firestore } from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";

export const firebaseEnvMissingKeys: string[] = [];
export const firebaseEnvReady = false;
export const auth: Auth | null = null;
export const db: Firestore | null = null;
export const firebaseApp: FirebaseApp | null = null;

/**
 * Returns the Firestore instance, throwing if Firebase is disabled.
 * Use this in repo files instead of importing `db` directly.
 */
export function getDb(): Firestore {
  if (!db) {
    throw new Error("Firebase is disabled. Use Supabase instead.");
  }
  return db;
}

export async function ensureSignedIn(): Promise<string> {
  throw new Error("Firebase is disabled. Use Supabase auth instead.");
}

export function onAuthChange(_callback: (user: any) => void): () => void {
  return () => {};
}
