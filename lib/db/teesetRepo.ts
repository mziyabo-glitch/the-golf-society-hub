import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type TeeSetDoc = {
  id: string;
  societyId: string;
  courseId: string;
  name: string;
  teeColor: string;
  appliesTo: "male" | "female";
  par: number;
  courseRating: number;
  slopeRating: number;
  updatedAt?: unknown;
};

type TeeSetInput = Omit<TeeSetDoc, "id" | "updatedAt">;

export async function createTeeSet(input: TeeSetInput): Promise<TeeSetDoc> {
  const payload = {
    societyId: input.societyId,
    courseId: input.courseId,
    name: input.name,
    teeColor: input.teeColor,
    appliesTo: input.appliesTo,
    par: input.par,
    courseRating: input.courseRating,
    slopeRating: input.slopeRating,
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "teesets"), payload);
  return { id: ref.id, ...payload };
}

export function subscribeTeesetsBySociety(
  societyId: string,
  onChange: (teesets: TeeSetDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, "teesets"), where("societyId", "==", societyId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeeSetDoc, "id">) }));
      onChange(items);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function listTeesetsBySociety(societyId: string): Promise<TeeSetDoc[]> {
  const q = query(collection(db, "teesets"), where("societyId", "==", societyId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeeSetDoc, "id">) }));
}

export async function listTeesetsByCourse(courseId: string): Promise<TeeSetDoc[]> {
  const q = query(collection(db, "teesets"), where("courseId", "==", courseId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeeSetDoc, "id">) }));
}

export async function updateTeeSetDoc(id: string, updates: Partial<TeeSetDoc>): Promise<void> {
  const ref = doc(db, "teesets", id);
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}

export async function deleteTeeSetDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, "teesets", id));
}
