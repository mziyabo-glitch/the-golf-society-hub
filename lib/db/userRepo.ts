// lib/db/userRepo.ts
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
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
 * ✅ REQUIRED by bootstrap: subscribe to user doc changes
 * Returns Firestore unsubscribe function.
 */
export function subscribeUserDoc(
  uid: string,
  onData: (doc: UserDoc | null) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const ref = getUserDocRef(uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as UserDoc);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeUserDoc error", err);
    }
  );
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
 * Set active member ID for current user.
 */
export async function setActiveMember(uid: string, memberId: string | null) {
  const ref = getUserDocRef(uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, {
    activeMemberId: memberId ?? null,
    updatedAt: serverTimestamp(),
  });
}
