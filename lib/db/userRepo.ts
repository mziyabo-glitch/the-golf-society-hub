import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Shape of the user document
 */
export type UserDocFields = {
  uid: string;
  activeSocietyId?: string | null;
  activeMemberId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/**
 * Get user document once
 */
export async function getUserDoc(uid: string): Promise<UserDocFields | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserDocFields;
}

/**
 * Subscribe to user document
 */
export function subscribeToUser(
  uid: string,
  cb: (user: UserDocFields | null) => void
) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb(snap.data() as UserDocFields);
  });
}

/**
 * SAFE UPSERT for user document
 * ----------------------------------------------------
 * updateDoc() FAILS if the document does not exist.
 * This happens for brand-new anonymous users when
 * creating their first society.
 *
 * We attempt updateDoc first, then fall back to
 * setDoc(..., { merge: true }) if needed.
 */
async function updateUserDoc(
  uid: string,
  updates: Partial<UserDocFields>
): Promise<void> {
  const ref = doc(db, "users", uid);

  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: serverTimestamp(),
  };

  // Remove undefined values (Firestore rejects them)
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  try {
    // Works if doc already exists
    await updateDoc(ref, payload);
  } catch {
    // First-time user → doc does not exist yet
    await setDoc(
      ref,
      {
        uid,
        createdAt: serverTimestamp(),
        ...payload,
      },
      { merge: true }
    );
  }
}

/**
 * Set active society + member for user
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
 * Clear active society (Reset Society flow)
 */
export async function clearActiveSociety(uid: string): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId: null,
    activeMemberId: null,
  });
}
