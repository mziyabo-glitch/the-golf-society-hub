import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type MemberDoc = {
  id: string;
  societyId: string;
  name: string;
  handicap?: number | null;
  sex?: "male" | "female";
  roles?: string[];
  status?: string;
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
};

type MemberInput = Omit<MemberDoc, "id">;

export async function createMember(input: MemberInput): Promise<MemberDoc> {
  const payload = {
    societyId: input.societyId,
    name: input.name,
    handicap: input.handicap ?? null,
    sex: input.sex,
    roles: input.roles ?? ["member"],
    status: input.status ?? "active",
    paid: input.paid,
    amountPaid: input.amountPaid,
    paidDate: input.paidDate,
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "members"), payload);
  return { id: ref.id, ...payload };
}

export async function getMemberDoc(id: string): Promise<MemberDoc | null> {
  const ref = doc(db, "members", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<MemberDoc, "id">) };
}

export function subscribeMemberDoc(
  id: string,
  onChange: (member: MemberDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  const ref = doc(db, "members", id);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: snap.id, ...(snap.data() as Omit<MemberDoc, "id">) });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function updateMemberDoc(id: string, updates: Partial<MemberDoc>): Promise<void> {
  const ref = doc(db, "members", id);
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}

export async function deleteMemberDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, "members", id));
}

export async function listMembersBySociety(societyId: string): Promise<MemberDoc[]> {
  const q = query(collection(db, "members"), where("societyId", "==", societyId));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemberDoc, "id">) }));
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function subscribeMembersBySociety(
  societyId: string,
  onChange: (members: MemberDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, "members"), where("societyId", "==", societyId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberDoc, "id">),
      }));
      onChange(items.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}
