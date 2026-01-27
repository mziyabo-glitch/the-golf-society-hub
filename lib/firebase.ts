// lib/firebase.ts
// DISABLED: Firebase has been replaced by Supabase.
// This file exports stubs to prevent import errors from legacy code.
// All new code should use Supabase via @/lib/supabase.

export const firebaseEnvMissingKeys: string[] = [];
export const firebaseEnvReady = false;
export const auth = null;
export const db = null;
export const firebaseApp = null;

export async function ensureSignedIn(): Promise<string> {
  throw new Error("Firebase is disabled. Use Supabase auth instead.");
}

export function onAuthChange(_callback: (user: any) => void): () => void {
  return () => {};
}
