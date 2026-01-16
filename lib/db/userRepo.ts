import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export type UserDoc = {
  id: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
  migratedFromAsyncStorageV1: boolean;
  themeMode?: "light" | "dark";
  updatedAt?: unknown;
};

type UserDocFields = Omit<UserDoc, "id">;

const DEFAULT_USER: UserDocFields = {
  activeSocietyId: null,
  activeMemberId: null,
  migratedFromAsyncStorageV1: false,
};

function normalizeUser(id: string, data?: Partial<UserDocFields>): UserDoc {
  return {
    id,
    ...DEFAULT_USER,
    ...data,
    activeSocietyId: data?.activeSocietyId ?? null,
    activeMemberId: data?.activeMemberId ?? null,
    migratedFromAsyncStorageV1: data?.migratedFromAsyncStorageV1 ?? false,
  };
}

export async function ensureUserDoc(uid: string): Promise<UserDoc> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, { ...DEFAULT_USER, updatedAt: serverTimestamp() });
    return normalizeUser(uid);
  }

  const data = snap.data() as Partial<UserDocFields> | undefined;
  const needsPatch =
    data?.activeSocietyId === undefined ||
    data?.activeMemberId === undefined ||
    data?.migratedFromAsyncStorageV1 === undefined;

  if (needsPatch) {
    await updateDoc(ref, {
      activeSocietyId: data?.activeSocietyId ?? null,
      activeMemberId: data?.activeMemberId ?? null,
      migratedFromAsyncStorageV1: data?.migratedFromAsyncStorageV1 ?? false,
      updatedAt: serverTimestamp(),
    });
  }

  return normalizeUser(uid, data);
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return normalizeUser(uid, snap.data() as Partial<UserDocFields>);
}

export function subscribeUserDoc(
  uid: string,
  onChange: (user: UserDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  const ref = doc(db, "users", uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(normalizeUser(uid, snap.data() as Partial<UserDocFields>));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function updateUserDoc(uid: string, updates: Partial<UserDocFields>): Promise<void> {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function setActiveSocietyAndMember(
  uid: string,
  activeSocietyId: string | null,
  activeMemberId: string | null
): Promise<void> {
  await updateUserDoc(uid, {
    activeSocietyId,
    activeMemberId,
  });
}

export async function setActiveMember(uid: string, activeMemberId: string | null): Promise<void> {
  await updateUserDoc(uid, { activeMemberId });
}
