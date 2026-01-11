/**
 * Firestore Helpers for Events
 * 
 * FIRESTORE-ONLY: No AsyncStorage for events data.
 * 
 * Schema:
 * societies/{societyId}/events/{eventId}
 *   ├─ name: string
 *   ├─ date: Timestamp
 *   ├─ courseName: string
 *   ├─ courseId: string (optional)
 *   ├─ format: "Stableford" | "Strokeplay" | "Both"
 *   ├─ isOOM: boolean
 *   ├─ status: "open" | "completed"
 *   ├─ handicapAllowancePct: number (default 100)
 *   ├─ maleTeeSetId: string (optional)
 *   ├─ femaleTeeSetId: string (optional)
 *   ├─ societyId: string (redundant but useful)
 *   ├─ createdAt: Timestamp (serverTimestamp)
 *   ├─ updatedAt: Timestamp
 */

import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  addDoc,
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db, getActiveSocietyId, isFirebaseConfigured, logFirestoreOp } from "../firebase";
import { logDataSanity, handleFirestoreError, checkOperationReady } from "./errors";
import type { EventData } from "../models";

// ============================================================================
// TYPES
// ============================================================================

export interface CreateEventInput {
  name: string;
  date: Date; // Must be a JS Date object
  courseName?: string;
  courseId?: string;
  format?: "Stableford" | "Strokeplay" | "Both";
  isOOM?: boolean;
  handicapAllowancePct?: number;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
}

export interface EventWithParsedDate extends EventData {
  dateAsDate: Date | null; // Parsed date for comparisons
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Firestore Timestamp or string to JS Date
 */
function parseEventDate(dateField: unknown): Date | null {
  if (!dateField) return null;
  
  // Handle Firestore Timestamp
  if (dateField instanceof Timestamp) {
    return dateField.toDate();
  }
  
  // Handle object with seconds (Firestore Timestamp serialized)
  if (typeof dateField === "object" && dateField !== null && "seconds" in dateField) {
    const ts = dateField as { seconds: number; nanoseconds?: number };
    return new Date(ts.seconds * 1000);
  }
  
  // Handle ISO string
  if (typeof dateField === "string") {
    const parsed = new Date(dateField);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Map Firestore document to EventData
 */
function mapFirestoreEvent(id: string, data: Record<string, unknown>): EventData {
  const dateAsDate = parseEventDate(data.date);
  
  return {
    id,
    name: (data.name as string) || "Unnamed Event",
    date: dateAsDate?.toISOString() || "",
    courseName: (data.courseName as string) || "",
    courseId: data.courseId as string | undefined,
    format: (data.format as "Stableford" | "Strokeplay" | "Both") || "Stableford",
    isOOM: Boolean(data.isOOM),
    isCompleted: Boolean(data.isCompleted),
    playerIds: (data.playerIds as string[]) || [],
    results: data.results as EventData["results"],
    resultsStatus: data.resultsStatus as "draft" | "published" | undefined,
    teeSheet: data.teeSheet as EventData["teeSheet"],
    eventFee: data.eventFee as number | undefined,
    payments: data.payments as EventData["payments"],
    rsvps: data.rsvps as EventData["rsvps"],
    handicapAllowancePct: (data.handicapAllowancePct as number) ?? 100,
    maleTeeSetId: data.maleTeeSetId as string | undefined,
    femaleTeeSetId: data.femaleTeeSetId as string | undefined,
  };
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * List all events for a society, ordered by date ascending
 */
export async function listEvents(societyId?: string): Promise<EventData[]> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const collectionPath = `societies/${effectiveSocietyId}/events`;
  
  if (!effectiveSocietyId) {
    console.error("[Events] No society ID provided or available");
    return [];
  }

  if (!isFirebaseConfigured()) {
    console.error("[Events] Firebase not configured");
    return [];
  }

  try {
    logFirestoreOp("read", collectionPath);
    
    const eventsRef = collection(db, "societies", effectiveSocietyId, "events");
    const q = query(eventsRef, orderBy("date", "asc"));
    const snapshot = await getDocs(q);

    const events: EventData[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return mapFirestoreEvent(docSnap.id, data);
    });

    logDataSanity("listEvents", {
      societyId: effectiveSocietyId,
      eventCount: events.length,
      path: collectionPath,
    });

    return events;
  } catch (error) {
    handleFirestoreError(error, "listEvents", collectionPath, false);
    return [];
  }
}

/**
 * Get a single event by ID
 */
export async function getEventById(eventId: string, societyId?: string): Promise<EventData | null> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const docPath = `societies/${effectiveSocietyId}/events/${eventId}`;
  
  if (!effectiveSocietyId || !eventId) {
    console.error("[Events] Missing societyId or eventId");
    return null;
  }

  if (!isFirebaseConfigured()) {
    console.error("[Events] Firebase not configured");
    return null;
  }

  try {
    logFirestoreOp("read", docPath);
    
    const eventRef = doc(db, "societies", effectiveSocietyId, "events", eventId);
    const snapshot = await getDoc(eventRef);

    if (!snapshot.exists()) {
      console.log(`[Events] Event not found: ${eventId}`);
      return null;
    }

    return mapFirestoreEvent(snapshot.id, snapshot.data());
  } catch (error) {
    handleFirestoreError(error, "getEventById", docPath, false);
    return null;
  }
}

/**
 * Subscribe to events collection with real-time updates
 */
export function subscribeEvents(
  callback: (events: EventData[]) => void,
  onError?: (error: Error) => void,
  societyId?: string
): Unsubscribe {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    console.error("[Events] No society ID provided or available");
    if (onError) onError(new Error("No society ID available"));
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    console.error("[Events] Firebase not configured");
    if (onError) onError(new Error("Firebase not configured"));
    return () => {};
  }

  try {
    const eventsRef = collection(db, "societies", effectiveSocietyId, "events");
    const q = query(eventsRef, orderBy("date", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const events: EventData[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return mapFirestoreEvent(docSnap.id, data);
        });
        
        if (__DEV__) {
          console.log(`[Events] Real-time update: ${events.length} events`);
        }
        
        callback(events);
      },
      (error) => {
        console.error("[Events] Subscription error:", error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("[Events] Error setting up subscription:", error);
    if (onError) onError(error instanceof Error ? error : new Error(String(error)));
    return () => {};
  }
}

// ============================================================================
// COMPUTED HELPERS
// ============================================================================

/**
 * Get next upcoming event (date >= today start of day)
 */
export function getNextEvent(events: EventData[]): EventData | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcomingEvents = events
    .map((e) => ({ ...e, dateAsDate: parseEventDate(e.date) }))
    .filter((e) => e.dateAsDate && e.dateAsDate.getTime() >= today.getTime())
    .sort((a, b) => {
      const aTime = a.dateAsDate?.getTime() ?? Infinity;
      const bTime = b.dateAsDate?.getTime() ?? Infinity;
      return aTime - bTime;
    });
  
  return upcomingEvents[0] || null;
}

/**
 * Get last completed event (date < today start of day)
 */
export function getLastEvent(events: EventData[]): EventData | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pastEvents = events
    .map((e) => ({ ...e, dateAsDate: parseEventDate(e.date) }))
    .filter((e) => e.dateAsDate && e.dateAsDate.getTime() < today.getTime())
    .sort((a, b) => {
      const aTime = a.dateAsDate?.getTime() ?? 0;
      const bTime = b.dateAsDate?.getTime() ?? 0;
      return bTime - aTime; // Most recent first
    });
  
  return pastEvents[0] || null;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new event
 * Uses addDoc to auto-generate Firestore doc ID
 * Stores date as proper Firestore Timestamp
 */
export async function createEvent(
  input: CreateEventInput,
  societyId?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const collectionPath = `societies/${effectiveSocietyId}/events`;
  
  // Pre-flight checks
  const readyError = checkOperationReady("createEvent");
  if (readyError) {
    return { success: false, error: readyError.message };
  }
  
  if (!effectiveSocietyId) {
    return { success: false, error: "No society ID available" };
  }

  // Validate required fields
  if (!input.name || input.name.trim().length < 1) {
    return { success: false, error: "Event name is required" };
  }

  if (!input.date || !(input.date instanceof Date) || isNaN(input.date.getTime())) {
    return { success: false, error: "Valid event date is required" };
  }

  try {
    const eventsRef = collection(db, "societies", effectiveSocietyId, "events");
    
    const eventData: Record<string, unknown> = {
      name: input.name.trim(),
      date: Timestamp.fromDate(input.date),
      courseName: input.courseName?.trim() || "",
      courseId: input.courseId || null,
      format: input.format || "Stableford",
      isOOM: input.isOOM ?? false,
      isCompleted: false,
      status: "open",
      handicapAllowancePct: input.handicapAllowancePct ?? 100,
      maleTeeSetId: input.maleTeeSetId || null,
      femaleTeeSetId: input.femaleTeeSetId || null,
      societyId: effectiveSocietyId,
      playerIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    logFirestoreOp("write", collectionPath, undefined, { name: input.name });
    
    const docRef = await addDoc(eventsRef, eventData);

    logDataSanity("createEvent", {
      societyId: effectiveSocietyId,
      path: `${collectionPath}/${docRef.id}`,
    });

    console.log(`[Events] Created event: ${docRef.id} (${input.name})`);
    
    return { success: true, eventId: docRef.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handleFirestoreError(error, "createEvent", collectionPath, false);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update an existing event
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<EventData>,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const docPath = `societies/${effectiveSocietyId}/events/${eventId}`;
  
  if (!effectiveSocietyId || !eventId) {
    return { success: false, error: "Missing societyId or eventId" };
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: "Firebase not configured" };
  }

  try {
    const eventRef = doc(db, "societies", effectiveSocietyId, "events", eventId);
    
    const updateData: Record<string, unknown> = { ...updates };
    
    // Convert date string to Timestamp if present
    if (updates.date && typeof updates.date === "string") {
      const dateObj = new Date(updates.date);
      if (!isNaN(dateObj.getTime())) {
        updateData.date = Timestamp.fromDate(dateObj);
      }
    }
    
    updateData.updatedAt = serverTimestamp();

    logFirestoreOp("write", docPath, eventId);
    await setDoc(eventRef, updateData, { merge: true });

    console.log(`[Events] Updated event: ${eventId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handleFirestoreError(error, "updateEvent", docPath, false);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(
  eventId: string,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const docPath = `societies/${effectiveSocietyId}/events/${eventId}`;
  
  if (!effectiveSocietyId || !eventId) {
    return { success: false, error: "Missing societyId or eventId" };
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: "Firebase not configured" };
  }

  try {
    const eventRef = doc(db, "societies", effectiveSocietyId, "events", eventId);
    
    logFirestoreOp("delete", docPath, eventId);
    await deleteDoc(eventRef);

    console.log(`[Events] Deleted event: ${eventId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handleFirestoreError(error, "deleteEvent", docPath, false);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete an event AND its results subcollection (best-effort cascade).
 *
 * Firestore does not cascade deletes automatically, so we explicitly delete:
 * societies/{societyId}/events/{eventId}/results/*
 * then delete the event doc itself.
 */
export async function deleteEventCascade(
  eventId: string,
  societyId?: string
): Promise<{ success: boolean; error?: string; deletedResultsCount?: number }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const resultsPath = `societies/${effectiveSocietyId}/events/${eventId}/results`;

  if (!effectiveSocietyId || !eventId) {
    return { success: false, error: "Missing societyId or eventId" };
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: "Firebase not configured" };
  }

  try {
    // Delete results subcollection docs first (if any)
    const resultsRef = collection(db, "societies", effectiveSocietyId, "events", eventId, "results");
    const resultsSnap = await getDocs(resultsRef);

    let deletedResultsCount = 0;
    for (const docSnap of resultsSnap.docs) {
      await deleteDoc(docSnap.ref);
      deletedResultsCount += 1;
    }

    // Then delete the event doc using the existing helper
    const res = await deleteEvent(eventId, effectiveSocietyId);
    if (!res.success) return res;

    return { success: true, deletedResultsCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handleFirestoreError(error, "deleteEventCascade", resultsPath, false);
    return { success: false, error: errorMessage };
  }
}
