// lib/db/userRepo.ts
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";

/**
 * User document shape
 */
export type UserDoc = {
  uid: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/**
 * Ensure users/{uid} exists
 * Called during bootstrap
 */
export async function ensureUserDoc(uid: string): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      activeSocietyId: null,
      activeMemberId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * ✅ REQUIRED for app load:
 * Subscribe to users/{uid}
 */
export function subscribeUserDoc(
  uid: string,
  onNext: (user: UserDoc | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const ref = doc(db, "users", uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onNext(null);
        return;
      }
      onNext(snap.data() as UserDoc);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeUserDoc error", err);
    }
  );
}

/**
 * Safe upsert for user updates
 * --------------------------------
 * updateDoc FAILS if the doc does not exist.
 * This guarantees writes always succeed.
 */
export async function updateUserDoc(
  uid: string,
  updates: Partial<UserDoc>
): Promise<void> {
  const ref = doc(db, "users", uid);

  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: serverTimestamp(),
  };

  // Firestore rejects undefined
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  try {
    await updateDoc(ref, payload);
  } catch {
    await setDoc(
      ref,
      {
        uid,
        ...payload,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

/**
 * Set active society + member
 * Called after Create Society or Join Society
 */
export async function setActiveSocietyAndMember(
  uid: string,
  societyId: string,
  memberId: string
): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId: societyId,
    activeMemberId: memberId,
  });
}

/**
 * Reset society (leave / reset flow)
 */
export async function clearActiveSociety(uid: string): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId: null,
    activeMemberId: null,
  });
}

/**
 * ✅ Convenience wrappers used by Settings reset flow
 */
export async function setActiveSociety(uid: string, societyId: string | null) {
  await updateUserDoc(uid, { activeSocietyId: societyId ?? null });
}

export async function setActiveMember(uid: string, memberId: string | null) {
  await updateUserDoc(uid, { activeMemberId: memberId ?? null });
}
