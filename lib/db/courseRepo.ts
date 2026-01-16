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

export type CourseDoc = {
  id: string;
  societyId: string;
  name: string;
  address?: string;
  postcode?: string;
  status?: string;
  notes?: string;
  mapsUrl?: string;
  googlePlaceId?: string;
  updatedAt?: unknown;
};

type CourseInput = Omit<CourseDoc, "id" | "updatedAt">;

export async function createCourse(input: CourseInput): Promise<CourseDoc> {
  const payload = {
    societyId: input.societyId,
    name: input.name,
    address: input.address,
    postcode: input.postcode,
    status: input.status ?? "active",
    notes: input.notes,
    mapsUrl: input.mapsUrl,
    googlePlaceId: input.googlePlaceId,
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "courses"), payload);
  return { id: ref.id, ...payload };
}

export async function getCourseDoc(id: string): Promise<CourseDoc | null> {
  const ref = doc(db, "courses", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<CourseDoc, "id">) };
}

export function subscribeCoursesBySociety(
  societyId: string,
  onChange: (courses: CourseDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, "courses"), where("societyId", "==", societyId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseDoc, "id">) }));
      onChange(items.sort((a, b) => a.name.localeCompare(b.name)));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function listCoursesBySociety(societyId: string): Promise<CourseDoc[]> {
  const q = query(collection(db, "courses"), where("societyId", "==", societyId));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseDoc, "id">) }));
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateCourseDoc(id: string, updates: Partial<CourseDoc>): Promise<void> {
  const ref = doc(db, "courses", id);
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(ref, payload);
}

export async function deleteCourseDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, "courses", id));
}
