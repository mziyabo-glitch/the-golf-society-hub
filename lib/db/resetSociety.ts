import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase";

/**
 * Best-effort client-side reset.
 *
 * WARNING:
 * - Firestore does not cascade-delete subcollections.
 * - This function deletes a society's top-level docs (society, members, courses,
 *   teesets, events) plus event expenses subcollections.
 * - If a society has very large datasets, you should eventually move this to a
 *   privileged backend (Cloud Function).
 */

async function deleteInBatches(refs: Array<ReturnType<typeof doc>>, batchSize = 400) {
  const db = getDb();
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + batchSize);
    chunk.forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

export async function resetSocietyData(societyId: string): Promise<void> {
  const db = getDb();

  // 1) Load all events for this society (we need their ids for subcollection deletes).
  const eventsSnap = await getDocs(
    query(collection(db, "events"), where("societyId", "==", societyId), limit(2000))
  );
  const eventIds = eventsSnap.docs.map((d) => d.id);

  // 2) Delete event expenses subcollections.
  // Note: expenses are stored at: events/{eventId}/expenses
  for (const eventId of eventIds) {
    const expSnap = await getDocs(query(collection(db, "events", eventId, "expenses"), limit(2000)));
    const expRefs = expSnap.docs.map((d) => doc(db, "events", eventId, "expenses", d.id));
    await deleteInBatches(expRefs);
  }

  // 3) Delete top-level docs filtered by societyId.
  const [membersSnap, coursesSnap, teesSnap] = await Promise.all([
    getDocs(query(collection(db, "members"), where("societyId", "==", societyId), limit(5000))),
    getDocs(query(collection(db, "courses"), where("societyId", "==", societyId), limit(5000))),
    getDocs(query(collection(db, "teesets"), where("societyId", "==", societyId), limit(5000))),
  ]);

  const memberRefs = membersSnap.docs.map((d) => doc(db, "members", d.id));
  const courseRefs = coursesSnap.docs.map((d) => doc(db, "courses", d.id));
  const teeRefs = teesSnap.docs.map((d) => doc(db, "teesets", d.id));
  const eventRefs = eventIds.map((id) => doc(db, "events", id));

  await deleteInBatches([...memberRefs, ...courseRefs, ...teeRefs, ...eventRefs]);

  // 4) Delete the society doc itself.
  await deleteDoc(doc(db, "societies", societyId));
}
