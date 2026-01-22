// lib/db/memberRepo.ts
import { db } from "@/lib/firebase";
import {
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
  type Unsubscribe,
} from "firebase/firestore";

export type MemberDoc = {
  id: string;
  societyId: string;

  displayName?: string;
  name?: string;
  email?: string;

  roles?: string[]; // ["captain","treasurer",...]
  createdAt?: any;

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

export function societyMembersCol(societyId: string) {
  // members are stored in top-level collection with societyId field
  return collection(db, "members");
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
      const data = snap.data() as any;
      onNext({ id: snap.id, ...(data as Omit<MemberDoc, "id">) });
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeMemberDoc error", err);
    }
  );
}

/**
 * Subscribe members for a society (used by Members screen, Finance screens).
 */
export function subscribeMembersBySociety(
  societyId: string,
  onNext: (docs: MemberDoc[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  // NOTE: members are in top-level collection with societyId field
  const q = query(
    collection(db, "members"),
    // orderBy needs an indexed field; displayName may be missing, so we order by createdAt
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: MemberDoc[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data?.societyId !== societyId) return;
        rows.push({ id: d.id, ...(data as Omit<MemberDoc, "id">) });
      });
      onNext(rows);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("subscribeMembersBySociety error", err);
    }
  );
}

/**
 * One-shot fetch (used by some screens)
 */
export async function getMembersBySocietyId(societyId: string): Promise<MemberDoc[]> {
  const q = query(collection(db, "members"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const rows: MemberDoc[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data?.societyId !== societyId) return;
    rows.push({ id: d.id, ...(data as Omit<MemberDoc, "id">) });
  });
  return rows;
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

  // safety: prevent moving member to another society accidentally
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
 * ✅ REQUIRED FEATURE:
 * Captain/Treasurer can remove a member.
 *
 * IMPORTANT:
 * - We do NOT attempt to also delete users/{uid} here because you don't have a guaranteed mapping.
 * - It only deletes the members/{memberId} record.
 * - If the deleted member is someone's activeMemberId, their bootstrap will show "Profile not linked" and you can ask them to re-join.
 */
export async function deleteMember(memberId: string) {
  if (!memberId) throw new Error("Missing memberId");
  await deleteDoc(memberRef(memberId));
}

/**
 * Optional: helper to prevent deleting yourself by mistake in UI.
 */
export async function getMember(memberId: string): Promise<MemberDoc | null> {
  const snap = await getDoc(memberRef(memberId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return { id: snap.id, ...(data as Omit<MemberDoc, "id">) };
}
