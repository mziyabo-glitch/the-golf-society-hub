// lib/db/memberRepo.ts
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";

export type MemberDoc = {
  id: string;
  societyId: string;
  userId?: string;

  displayName?: string;
  name?: string;
  email?: string;

  roles?: string[]; // e.g. ["captain","treasurer"]
  createdAt?: any;
  updatedAt?: any;

  // Treasurer MVP
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string | null;
};

function stripUndefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out as T;
}

export function memberRef(memberId: string) {
  return doc(db, "members", memberId);
}

/**
 * ✅ Used by create-society / add-member flows
 * Creates a new member in top-level "members" collection and returns the new memberId.
 *
 * IMPORTANT: data is optional because some callers pass nothing.
 */
export async function createMember(
  societyId: string,
  data?: Partial<Omit<MemberDoc, "id" | "societyId">> & {
    displayName?: string;
    name?: string;
    roles?: string[];
  }
): Promise<string> {
  if (!societyId) throw new Error("createMember: missing societyId");

  const safe = data ?? {};

  const roles =
    Array.isArray(safe.roles) && safe.roles.length > 0 ? safe.roles : ["member"];

  const payload = stripUndefined({
    societyId,
    userId: auth.currentUser?.uid,
    displayName: safe.displayName ?? safe.name ?? "Member",
    name: safe.name,
    email: safe.email,
    roles,
    paid: safe.paid ?? false,
    amountPaid: safe.amountPaid ?? 0,
    paidDate: safe.paidDate ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(db, "members"), payload);
  return ref.id;
}

/**
 * Subscribe a single member doc by ID (used by bootstrap).
 */
export function subscribeMemberDoc(
  memberId: string,
  onNext: (doc: MemberDoc | null) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const ref = memberRef(memberId);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onNext(null);
        return;
      }
      onNext({ id: snap.id, ...(snap.data() as any) });
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeMemberDoc error", err);
    }
  );
}

/**
 * Subscribe members for a society (efficient with where()).
 */
export function subscribeMembersBySociety(
  societyId: string,
  onNext: (docs: MemberDoc[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const q = query(
    collection(db, "members"),
    where("societyId", "==", societyId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: MemberDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      onNext(rows);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeMembersBySociety error", err);
    }
  );
}

/**
 * One-shot fetch.
 */
export async function getMembersBySocietyId(societyId: string): Promise<MemberDoc[]> {
  const q = query(
    collection(db, "members"),
    where("societyId", "==", societyId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/**
 * Update member document safely.
 */
export async function updateMemberDoc(
  societyId: string,
  memberId: string,
  updates: Partial<Omit<MemberDoc, "id">>
) {
  const ref = memberRef(memberId);

  const payload = stripUndefined({
    ...updates,
    societyId,
    updatedAt: serverTimestamp(),
  } as any);

  try {
    await updateDoc(ref, payload);
  } catch {
    await setDoc(ref, payload, { merge: true });
  }
}

/**
 * ✅ Captain/Treasurer can remove a member.
 */
export async function deleteMember(memberId: string) {
  if (!memberId) throw new Error("deleteMember: missing memberId");
  await deleteDoc(memberRef(memberId));
}

/**
 * Helper: read a member.
 */
export async function getMember(memberId: string): Promise<MemberDoc | null> {
  const snap = await getDoc(memberRef(memberId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}
