// lib/db/userRepo.ts
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

export type UserDoc = {
  uid: string;
  activeSocietyId?: string | null;
  activeMemberId?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

export const getUserDocRef = (uid: string) => doc(db, "users", uid);

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(getUserDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as UserDoc;
}

/**
 * Ensure a user doc exists.
 */
export async function ensureUserDoc(uid: string): Promise<void> {
  const ref = getUserDocRef(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    uid,
    activeSocietyId: null,
    activeMemberId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies UserDoc);
}

/**
 * Set active society for current user.
 */
export async function setActiveSociety(uid: string, societyId: string | null) {
  const ref = getUserDocRef(uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, {
    activeSocietyId: societyId ?? null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * ✅ FIX: This function was imported by the UI but missing in the repo.
 * Set active member ID for current user (used after joining/creating a society).
 */
export async function setActiveMember(uid: string, memberId: string | null) {
  const ref = getUserDocRef(uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, {
    activeMemberId: memberId ?? null,
    updatedAt: serverTimestamp(),
  });
}
