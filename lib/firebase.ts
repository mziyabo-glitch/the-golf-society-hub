import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
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

// --- CONFIGURATION ---

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

  if (!apiKey || !authDomain || !projectId) return null;

  return { apiKey, authDomain, projectId, 
           storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, 
           messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, 
           appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID 
         };
}

// --- SINGLETONS ---
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let activeSocietyIdCache: string | null = null; // In-memory cache

// --- INITIALIZATION HELPERS ---

export function isFirebaseConfigured(): boolean {
  return readFirebaseEnv() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  const env = readFirebaseEnv();
  if (!env) throw new Error("Firebase not configured");
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

// --- AUTHENTICATION (The Loop Fix) ---

export async function ensureSignedIn(): Promise<User> {
  const a = getFirebaseAuth();
  
  if (a.currentUser) return a.currentUser;

  // Set persistence to LOCAL to ensure user stays logged in across refreshes
  await setPersistence(a, browserLocalPersistence);

  return new Promise((resolve) => {
    // We use a listener to wait for the INITIAL auth state from storage
    const unsub = onAuthStateChanged(a, (user) => {
      if (user) {
        unsub();
        resolve(user);
      } else {
        // Only create a new user if we are 100% sure storage is empty
        console.log("No session found. Creating new anonymous user...");
        signInAnonymously(a).then((cred) => {
          unsub();
          resolve(cred.user);
        });
      }
    });
  });
}

// --- USER PROFILE & CACHE ---

async function ensureUserDoc(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { 
      createdAt: serverTimestamp(), 
      updatedAt: serverTimestamp(), 
      activeSocietyId: null 
    }, { merge: true });
  }
}

export async function initActiveSocietyId(): Promise<string | null> {
  const user = await ensureSignedIn();
  await ensureUserDoc(user.uid);

  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data();
  // Update cache
  activeSocietyIdCache = (data?.activeSocietyId as string | null) ?? null;
  return activeSocietyIdCache;
}

/**
 * Waits for the initial auth/database load to complete.
 * Returns the activeSocietyId (string or null).
 */
export async function waitForActiveSociety(): Promise<string | null> {
  // If we already have a value, return it.
  if (activeSocietyIdCache !== null) return activeSocietyIdCache;
  // Otherwise, load from DB
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

// --- SOCIETY FUNCTIONS ---

export async function createSociety(societyName: string) {
  const user = await ensureSignedIn();
  const batch = writeBatch(db);
  
  const societyRef = doc(collection(db, "societies"));
  
  // 1. Create Society
  batch.set(societyRef, {
    name: societyName,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });

  // 2. Create Member
  const memberRef = doc(db, `societies/${societyRef.id}/members/${user.uid}`);
  batch.set(memberRef, {
    name: "Captain", 
    roles: ["captain", "admin"],
    joinedAt: serverTimestamp(),
    handicapIndex: 0,
  });

  // 3. Update User
  const userRef = doc(db, `users/${user.uid}`);
  batch.set(userRef, { 
    activeSocietyId: societyRef.id,
    updatedAt: serverTimestamp() 
  }, { merge: true }); 

  await batch.commit();
  activeSocietyIdCache = societyRef.id;
  return societyRef.id;
}

export async function updateSocietyDetails(societyId: string, updates: any) {
  const user = await ensureSignedIn();
  const societyRef = doc(db, "societies", societyId);
  await updateDoc(societyRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
