import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type Auth,
} from "firebase/auth";

import { app } from "./app";

/**
 * Web Auth
 *
 * Goal: keep the same anonymous Firebase user between sessions.
 * Some mobile browsers can be fickle about the default persistence,
 * so we explicitly set a durable persistence (IndexedDB preferred,
 * then browserLocalPersistence fallback).
 */

export const auth: Auth = getAuth(app);

let persistencePromise: Promise<void> | null = null;
async function ensureWebPersistence(): Promise<void> {
  // During Expo Router static export, this file can be evaluated in Node.
  if (typeof window === "undefined") return;
  if (persistencePromise) return persistencePromise;

  persistencePromise = (async () => {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      return;
    } catch {
      // Some environments (private mode) may block IndexedDB.
    }
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {
      // If this fails, Firebase will fall back to in-memory persistence.
      // That can cause a new anon user each reload (and make data "disappear").
    }
  })();

  return persistencePromise;
}

export async function ensureSignedIn(): Promise<string> {
  await ensureWebPersistence();

  // If already signed in, reuse existing uid.
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  // Wait briefly for Firebase to restore a persisted session.
  const existing = await new Promise<string | null>((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user?.uid ?? null);
    });
  });
  if (existing) return existing;

  // Otherwise, create an anonymous user.
  const result = await signInAnonymously(auth);
  return result.user.uid;
}
