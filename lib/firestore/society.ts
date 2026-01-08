/**
 * Firestore Helpers for Society Data
 * 
 * Schema:
 * societies/{societyId}
 *   ├─ name, season, joinCode, createdAt, logoUrl
 *   ├─ members/{memberId}
 *   ├─ events/{eventId}
 *   └─ courses/{courseId}
 *       └─ teeSets/{teeSetId}
 */

import { db, getActiveSocietyId, isFirebaseConfigured } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../storage";
import type { MemberData, EventData, Course, TeeSet, GuestData } from "../models";

// ============================================================================
// TYPES
// ============================================================================

export interface SocietyData {
  id: string;
  name: string;
  season?: string;
  joinCode?: string;
  createdAt?: string;
  logoUrl?: string | null;
}

export interface TeeSheetData {
  startTimeISO: string;
  intervalMins: number;
  groups: Array<{
    timeISO: string;
    players: string[];
  }>;
}

// ============================================================================
// SOCIETY
// ============================================================================

/**
 * Get society data from Firestore (with AsyncStorage fallback)
 */
export async function getSociety(): Promise<SocietyData | null> {
  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const societyRef = doc(db, "societies", societyId);
      const societySnap = await getDoc(societyRef);

      if (societySnap.exists()) {
        const data = societySnap.data();
        console.log("[Firestore] Loaded society:", societyId);
        return {
          id: societySnap.id,
          name: data.name || "Golf Society",
          season: data.season,
          joinCode: data.joinCode,
          createdAt: data.createdAt,
          logoUrl: data.logoUrl,
        };
      }
      console.log("[Firestore] Society not found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading society:", error);
  }

  // Fallback to AsyncStorage
  try {
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
    if (localData) {
      const parsed = JSON.parse(localData);
      console.log("[AsyncStorage] Loaded society from local storage");
      return {
        id: "local",
        name: parsed.name || "Golf Society",
        season: parsed.season,
        joinCode: parsed.joinCode,
        createdAt: parsed.createdAt,
        logoUrl: parsed.logoUrl,
      };
    }
  } catch (error) {
    console.warn("[AsyncStorage] Error reading society:", error);
  }

  return null;
}

// ============================================================================
// MEMBERS
// ============================================================================

/**
 * Get all members from Firestore (with AsyncStorage fallback)
 */
export async function getMembers(): Promise<MemberData[]> {
  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const membersRef = collection(db, "societies", societyId, "members");
      const membersSnap = await getDocs(membersRef);

      if (!membersSnap.empty) {
        const members: MemberData[] = membersSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "Unknown",
            handicap: data.handicap,
            sex: data.sex || "male",
            roles: data.roles || ["member"],
            paid: data.paid,
            amountPaid: data.amountPaid,
            paidDate: data.paidDate,
          };
        });
        console.log(`[Firestore] Loaded ${members.length} members`);
        return members;
      }
      console.log("[Firestore] No members found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading members:", error);
  }

  // Fallback to AsyncStorage
  try {
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
    if (localData) {
      const members: MemberData[] = JSON.parse(localData);
      console.log(`[AsyncStorage] Loaded ${members.length} members from local storage`);
      return members;
    }
  } catch (error) {
    console.warn("[AsyncStorage] Error reading members:", error);
  }

  return [];
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Get all events from Firestore (with AsyncStorage fallback)
 */
export async function getEvents(): Promise<EventData[]> {
  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const eventsRef = collection(db, "societies", societyId, "events");
      const eventsSnap = await getDocs(eventsRef);

      if (!eventsSnap.empty) {
        const events: EventData[] = eventsSnap.docs.map((docSnap) => {
          const data = docSnap.data();
          return mapFirestoreEvent(docSnap.id, data);
        });
        console.log(`[Firestore] Loaded ${events.length} events`);
        return events;
      }
      console.log("[Firestore] No events found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading events:", error);
  }

  // Fallback to AsyncStorage
  try {
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
    if (localData) {
      const events: EventData[] = JSON.parse(localData);
      console.log(`[AsyncStorage] Loaded ${events.length} events from local storage`);
      return events;
    }
  } catch (error) {
    console.warn("[AsyncStorage] Error reading events:", error);
  }

  return [];
}

/**
 * Get a single event by ID from Firestore
 */
export async function getEvent(eventId: string): Promise<EventData | null> {
  if (!eventId) {
    console.error("[Firestore] getEvent: eventId is required");
    return null;
  }

  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const eventRef = doc(db, "societies", societyId, "events", eventId);
      const eventSnap = await getDoc(eventRef);

      if (eventSnap.exists()) {
        const event = mapFirestoreEvent(eventSnap.id, eventSnap.data());
        console.log(`[Firestore] Loaded event: ${eventId}`);
        return event;
      }
      console.log(`[Firestore] Event not found: ${eventId}`);
    }
  } catch (error) {
    console.error("[Firestore] Error reading event:", error);
  }

  return null;
}

/**
 * Map Firestore document data to EventData type
 */
function mapFirestoreEvent(id: string, data: Record<string, unknown>): EventData {
  return {
    id,
    name: (data.name as string) || "Unnamed Event",
    date: (data.date as string) || new Date().toISOString(),
    courseName: (data.courseName as string) || "",
    courseId: data.courseId as string | undefined,
    maleTeeSetId: data.maleTeeSetId as string | undefined,
    femaleTeeSetId: data.femaleTeeSetId as string | undefined,
    handicapAllowance: data.handicapAllowance as 0.9 | 1.0 | undefined,
    handicapAllowancePct: data.handicapAllowancePct as number | undefined,
    format: (data.format as "Stableford" | "Strokeplay" | "Both") || "Stableford",
    playerIds: (data.playerIds as string[]) || [],
    teeSheet: data.teeSheet as EventData["teeSheet"],
    isCompleted: data.isCompleted as boolean | undefined,
    completedAt: data.completedAt as string | undefined,
    resultsStatus: data.resultsStatus as "draft" | "published" | undefined,
    publishedAt: data.publishedAt as string | undefined,
    resultsUpdatedAt: data.resultsUpdatedAt as string | undefined,
    isOOM: data.isOOM as boolean | undefined,
    winnerId: data.winnerId as string | undefined,
    winnerName: data.winnerName as string | undefined,
    handicapSnapshot: data.handicapSnapshot as Record<string, number> | undefined,
    playingHandicapSnapshot: data.playingHandicapSnapshot as Record<string, number> | undefined,
    rsvps: data.rsvps as Record<string, string> | undefined,
    guests: (data.guests as GuestData[]) || [],
    eventFee: data.eventFee as number | undefined,
    payments: data.payments as EventData["payments"],
    teeSheetNotes: data.teeSheetNotes as string | undefined,
    nearestToPinHoles: (data.nearestToPinHoles as number[]) || [],
    longestDriveHoles: (data.longestDriveHoles as number[]) || [],
    results: data.results as EventData["results"],
  };
}

/**
 * Update event's tee sheet in Firestore
 */
export async function updateEventTeeSheet(
  eventId: string,
  teeSheet: TeeSheetData,
  guests: GuestData[],
  options?: {
    teeSheetNotes?: string;
    nearestToPinHoles?: number[];
    longestDriveHoles?: number[];
    playingHandicapSnapshot?: Record<string, number>;
  }
): Promise<boolean> {
  if (!eventId) {
    console.error("[Firestore] updateEventTeeSheet: eventId is required");
    return false;
  }

  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const eventRef = doc(db, "societies", societyId, "events", eventId);

      const updateData: Record<string, unknown> = {
        teeSheet,
        guests,
        teeSheetUpdatedAt: new Date().toISOString(),
      };

      if (options?.teeSheetNotes !== undefined) {
        updateData.teeSheetNotes = options.teeSheetNotes || null;
      }
      if (options?.nearestToPinHoles !== undefined) {
        updateData.nearestToPinHoles = options.nearestToPinHoles;
      }
      if (options?.longestDriveHoles !== undefined) {
        updateData.longestDriveHoles = options.longestDriveHoles;
      }
      if (options?.playingHandicapSnapshot !== undefined) {
        updateData.playingHandicapSnapshot = options.playingHandicapSnapshot;
      }

      await updateDoc(eventRef, updateData);
      console.log(`[Firestore] Updated tee sheet for event: ${eventId}`);
      return true;
    }
    console.error("[Firestore] Firebase not configured");
    return false;
  } catch (error) {
    console.error("[Firestore] Error updating tee sheet:", error);
    return false;
  }
}

// ============================================================================
// COURSES
// ============================================================================

/**
 * Get all courses from Firestore (with AsyncStorage fallback)
 */
export async function getCourses(): Promise<Course[]> {
  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const coursesRef = collection(db, "societies", societyId, "courses");
      const coursesSnap = await getDocs(coursesRef);

      if (!coursesSnap.empty) {
        const courses: Course[] = await Promise.all(
          coursesSnap.docs.map(async (courseDoc) => {
            const data = courseDoc.data();
            
            // Load tee sets for this course
            const teeSetsRef = collection(db, "societies", societyId, "courses", courseDoc.id, "teeSets");
            const teeSetsSnap = await getDocs(teeSetsRef);
            
            const teeSets: TeeSet[] = teeSetsSnap.docs.map((teeSetDoc) => {
              const tsData = teeSetDoc.data();
              return {
                id: teeSetDoc.id,
                courseId: courseDoc.id,
                teeColor: tsData.teeColor || "Unknown",
                par: tsData.par || 72,
                courseRating: tsData.courseRating || 72.0,
                slopeRating: tsData.slopeRating || 113,
                appliesTo: tsData.appliesTo || "male",
              };
            });

            return {
              id: courseDoc.id,
              name: data.name || "Unknown Course",
              address: data.address,
              postcode: data.postcode,
              notes: data.notes,
              googlePlaceId: data.googlePlaceId,
              mapsUrl: data.mapsUrl,
              teeSets,
            };
          })
        );
        console.log(`[Firestore] Loaded ${courses.length} courses`);
        return courses;
      }
      console.log("[Firestore] No courses found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading courses:", error);
  }

  // Fallback to AsyncStorage
  try {
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
    if (localData) {
      const courses: Course[] = JSON.parse(localData);
      console.log(`[AsyncStorage] Loaded ${courses.length} courses from local storage`);
      return courses;
    }
  } catch (error) {
    console.warn("[AsyncStorage] Error reading courses:", error);
  }

  return [];
}

/**
 * Get a single course by ID from Firestore
 */
export async function getCourse(courseId: string): Promise<Course | null> {
  if (!courseId) {
    console.error("[Firestore] getCourse: courseId is required");
    return null;
  }

  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const courseRef = doc(db, "societies", societyId, "courses", courseId);
      const courseSnap = await getDoc(courseRef);

      if (courseSnap.exists()) {
        const data = courseSnap.data();
        
        // Load tee sets for this course
        const teeSetsRef = collection(db, "societies", societyId, "courses", courseId, "teeSets");
        const teeSetsSnap = await getDocs(teeSetsRef);
        
        const teeSets: TeeSet[] = teeSetsSnap.docs.map((teeSetDoc) => {
          const tsData = teeSetDoc.data();
          return {
            id: teeSetDoc.id,
            courseId: courseId,
            teeColor: tsData.teeColor || "Unknown",
            par: tsData.par || 72,
            courseRating: tsData.courseRating || 72.0,
            slopeRating: tsData.slopeRating || 113,
            appliesTo: tsData.appliesTo || "male",
          };
        });

        const course: Course = {
          id: courseSnap.id,
          name: data.name || "Unknown Course",
          address: data.address,
          postcode: data.postcode,
          notes: data.notes,
          googlePlaceId: data.googlePlaceId,
          mapsUrl: data.mapsUrl,
          teeSets,
        };

        console.log(`[Firestore] Loaded course: ${courseId} with ${teeSets.length} tee sets`);
        return course;
      }
      console.log(`[Firestore] Course not found: ${courseId}`);
    }
  } catch (error) {
    console.error("[Firestore] Error reading course:", error);
  }

  return null;
}

/**
 * Get a specific tee set by ID from Firestore
 */
export async function getTeeSet(courseId: string, teeSetId: string): Promise<TeeSet | null> {
  if (!courseId || !teeSetId) {
    console.error("[Firestore] getTeeSet: courseId and teeSetId are required");
    return null;
  }

  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const teeSetRef = doc(db, "societies", societyId, "courses", courseId, "teeSets", teeSetId);
      const teeSetSnap = await getDoc(teeSetRef);

      if (teeSetSnap.exists()) {
        const data = teeSetSnap.data();
        const teeSet: TeeSet = {
          id: teeSetSnap.id,
          courseId,
          teeColor: data.teeColor || "Unknown",
          par: data.par || 72,
          courseRating: data.courseRating || 72.0,
          slopeRating: data.slopeRating || 113,
          appliesTo: data.appliesTo || "male",
        };
        console.log(`[Firestore] Loaded tee set: ${teeSetId} (${teeSet.teeColor})`);
        return teeSet;
      }
      console.log(`[Firestore] Tee set not found: ${teeSetId}`);
    }
  } catch (error) {
    console.error("[Firestore] Error reading tee set:", error);
  }

  return null;
}
