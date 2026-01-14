import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  collection,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

/**
 * RULES for this project:
 * - NO localStorage
 * - NO AsyncStorage
 * - NO firebase/auth/react-native
 * - Active society persisted ONLINE at: users/{uid}.activeSocietyId
 */

type FirebaseEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function readFirebaseEnv(): FirebaseEnv | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId) return null;

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

// IN-MEMORY ONLY
let activeSocietyIdCache: string | null = null;

export function getFirebaseApp(): FirebaseApp {
  const env = readFirebaseEnv();
  if (!env) {
    throw new Error("Firebase not configured");
  }
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(env);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}

export const app = getFirebaseApp();
export const auth = getFirebaseAuth();
export const db = getFirebaseDb();

/**
 * Ensures the user is signed in.
 * FIX: This version waits for the initial Auth check to complete.
 * It prevents creating a NEW anonymous user on every page refresh.
 */
export async function ensureSignedIn(): Promise<User> {
  const a = getFirebaseAuth();
  
  // 1. If already loaded, return immediately
  if (a.currentUser) return a.currentUser;

  // 2. Wait for the initial auth state to resolve
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(a, (user) => {
      if (user) {
        // Session restored successfully
        unsub();
        resolve(user);
      } else {
        // No session found (truly a new user), so sign in anonymously
        console.log("No user session found. creating new anonymous user...");
        signInAnonymously(a).then((cred) => {
          unsub();
          resolve(cred.user);
        });
      }
    });
  });
}

async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      { createdAt: serverTimestamp(), updatedAt: serverTimestamp(), activeSocietyId: null },
      { merge: true }
    );
  }
}

export async function initActiveSocietyId(): Promise<string | null> {
  const user = await ensureSignedIn();
  await ensureUserDoc(user.uid);

  const snap = await getDoc(doc(db, "users", user.uid));
  activeSocietyIdCache = (snap.data()?.activeSocietyId as string | null) ?? null;
  return activeSocietyIdCache;
}

/**
 * Waits for the initial auth/database load to complete.
 * Returns the activeSocietyId (string or null).
 * CRITICAL for Dashboard loading.
 */
export async function waitForActiveSociety(): Promise<string | null> {
  // If we already have a value (or explicitly null after load), return it.
  if (activeSocietyIdCache !== null) return activeSocietyIdCache;

  // Otherwise, force the load
  return await initActiveSocietyId(); 
}

export function getActiveSocietyId(): string | null {
  return activeSocietyIdCache;
}

export async function setActiveSocietyId(societyId: string | null) {
  const user = await ensureSignedIn();
  await ensureUserDoc(user.uid);

  await setDoc(
    doc(db, "users", user.uid),
    { activeSocietyId: societyId ?? null, updatedAt: serverTimestamp() },
    { merge: true }
  );

  activeSocietyIdCache = societyId ?? null;
}

export function requireActiveSocietyId(): string {
  if (!activeSocietyIdCache) {
    throw new Error("No active society loaded");
  }
  return activeSocietyIdCache;
}

// --- SOCIETY MANAGEMENT FUNCTIONS ---

/**
 * Creates a new Society, adds the creator as the first Admin/Captain,
 * and sets it as the user's active society.
 * * USES BATCH WRITE to prevent permission errors and invalid states.
 */
export async function createSociety(societyName: string) {
  const user = await ensureSignedIn();
  
  // 1. Start a Batch (All or Nothing)
  const batch = writeBatch(db);
  
  // 2. Create the Society Reference
  const societyRef = doc(collection(db, "societies"));
  
  // 3. Queue Society Creation
  // RULES CHECK: request.resource.data.createdBy == request.auth.uid
  batch.set(societyRef, {
    name: societyName,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });

  // 4. Queue Member Creation (The Creator)
  // RULES CHECK: matches allow create: if isOwner(memberId)
  const memberRef = doc(db, `societies/${societyRef.id}/members/${user.uid}`);
  batch.set(memberRef, {
    name: "Captain", // You can pass a real name if you have it
    roles: ["captain", "admin"],
    joinedAt: serverTimestamp(),
    handicapIndex: 0,
  });

  // 5. Queue User Profile Update
  // RULES CHECK: matches allow write: if isOwner(userId)
  const userRef = doc(db, `users/${user.uid}`);
  batch.set(userRef, { 
    activeSocietyId: societyRef.id,
    updatedAt: serverTimestamp() 
  }, { merge: true }); 

  // 6. Commit the Batch
  await batch.commit();

  // 7. Update local cache immediately so the UI doesn't wait for a refetch
  activeSocietyIdCache = societyRef.id;

  return societyRef.id;
}

/**
 * Updates society details.
 * Security Rules will only allow this if the current user is an 'admin' or 'captain'.
 */
export async function updateSocietyDetails(societyId: string, updates: { name?: string; homeCourse?: string; country?: string }) {
  const user = await ensureSignedIn(); // Safety check
  
  const societyRef = doc(db, "societies", societyId);
  
  await updateDoc(societyRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
