/**
 * Firestore Helpers for Society Data
 * 
 * WEB-ONLY PERSISTENCE: All business data from Firestore only.
 * NO AsyncStorage fallback on web for: societies, members, events, courses, tee sheets.
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
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import { Platform } from "react-native";
import type { MemberData, EventData, Course, TeeSet, GuestData } from "../models";

// ============================================================================
// PLATFORM CHECK - Skip AsyncStorage on web
// ============================================================================

const IS_WEB = Platform.OS === "web";

/**
 * Safe import of AsyncStorage (only used on native)
 * Returns null on web to prevent any local storage usage
 */
async function getAsyncStorage() {
  if (IS_WEB) {
    return null;
  }
  try {
    const AsyncStorage = await import("@react-native-async-storage/async-storage");
    return AsyncStorage.default;
  } catch {
    return null;
  }
}

// Storage keys for native fallback only
const STORAGE_KEYS = {
  SOCIETY_ACTIVE: "GSOCIETY_ACTIVE",
  MEMBERS: "GSOCIETY_MEMBERS",
  EVENTS: "GSOCIETY_EVENTS",
  COURSES: "GSOCIETY_COURSES",
};

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
 * Get society data from Firestore
 * On web: Firestore only (no fallback)
 * On native: Firestore with AsyncStorage fallback
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
      
      if (IS_WEB) {
        console.log("[Firestore] Society not found (web - no fallback)");
        return null;
      }
      
      console.log("[Firestore] Society not found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading society:", error);
    if (IS_WEB) {
      return null; // No fallback on web
    }
  }

  // Native-only fallback to AsyncStorage
  if (!IS_WEB) {
    try {
      const AsyncStorage = await getAsyncStorage();
      if (AsyncStorage) {
        const localData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
        if (localData) {
          const parsed = JSON.parse(localData);
          console.log("[AsyncStorage] Loaded society from local storage (native)");
          return {
            id: "local",
            name: parsed.name || "Golf Society",
            season: parsed.season,
            joinCode: parsed.joinCode,
            createdAt: parsed.createdAt,
            logoUrl: parsed.logoUrl,
          };
        }
      }
    } catch (error) {
      console.warn("[AsyncStorage] Error reading society:", error);
    }
  }

  return null;
}

// ============================================================================
// MEMBERS
// ============================================================================

/**
 * Get all members from Firestore
 * On web: Firestore only (no fallback)
 * On native: Firestore with AsyncStorage fallback
 * Automatically filters out ghost "Owner" member if other real members exist
 */
export async function getMembers(): Promise<MemberData[]> {
  let members: MemberData[] = [];
  
  try {
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const membersRef = collection(db, "societies", societyId, "members");
      const membersSnap = await getDocs(membersRef);

      if (!membersSnap.empty) {
        members = membersSnap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || "Unknown",
            email: data.email,
            handicap: data.handicap,
            sex: data.sex || "male",
            roles: normalizeRoles(data.roles),
            paid: data.paid,
            amountPaid: data.amountPaid,
            paidDate: data.paidDate,
          };
        });
        console.log(`[Firestore] Loaded ${members.length} members`);
        return filterGhostOwner(members);
      }
      
      if (IS_WEB) {
        console.log("[Firestore] No members found (web - no fallback)");
        return [];
      }
      
      console.log("[Firestore] No members found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading members:", error);
    if (IS_WEB) {
      return []; // No fallback on web
    }
  }

  // Native-only fallback to AsyncStorage
  if (!IS_WEB && members.length === 0) {
    try {
      const AsyncStorage = await getAsyncStorage();
      if (AsyncStorage) {
        const localData = await AsyncStorage.getItem(STORAGE_KEYS.MEMBERS);
        if (localData) {
          members = JSON.parse(localData);
          // Normalize roles for local data
          members = members.map(m => ({
            ...m,
            roles: normalizeRoles(m.roles),
          }));
          console.log(`[AsyncStorage] Loaded ${members.length} members from local storage (native)`);
        }
      }
    } catch (error) {
      console.warn("[AsyncStorage] Error reading members:", error);
    }
  }

  // Filter out ghost "Owner" member if other real members exist
  return filterGhostOwner(members);
}

/**
 * Normalize role strings to lowercase
 */
function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return ["member"];
  return roles.map((r) => (typeof r === "string" ? r.toLowerCase() : "member"));
}

/**
 * Filter out ghost "Owner" member if other real members exist
 */
function filterGhostOwner(members: MemberData[]): MemberData[] {
  if (members.length <= 1) return members;
  
  const hasOwner = members.some(
    (m) => m.name.toLowerCase() === "owner"
  );
  
  if (!hasOwner) return members;
  
  // Remove Owner since we have other real members
  const filtered = members.filter(
    (m) => m.name.toLowerCase() !== "owner"
  );
  
  if (filtered.length < members.length) {
    console.log("[Firestore] Filtered out ghost Owner member");
  }
  
  return filtered;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Get all events from Firestore
 * On web: Firestore only (no fallback)
 * On native: Firestore with AsyncStorage fallback
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
      
      if (IS_WEB) {
        console.log("[Firestore] No events found (web - no fallback)");
        return [];
      }
      
      console.log("[Firestore] No events found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading events:", error);
    if (IS_WEB) {
      return []; // No fallback on web
    }
  }

  // Native-only fallback to AsyncStorage
  if (!IS_WEB) {
    try {
      const AsyncStorage = await getAsyncStorage();
      if (AsyncStorage) {
        const localData = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
        if (localData) {
          const events: EventData[] = JSON.parse(localData);
          console.log(`[AsyncStorage] Loaded ${events.length} events from local storage (native)`);
          return events;
        }
      }
    } catch (error) {
      console.warn("[AsyncStorage] Error reading events:", error);
    }
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
 * Result of a tee sheet save operation
 */
export interface TeeSheetSaveResult {
  success: boolean;
  verified: boolean;
  error?: string;
  savedGroupCount?: number;
  savedPlayerCount?: number;
}

/**
 * Update event's tee sheet in Firestore with verification
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
  const result = await saveAndVerifyTeeSheet(eventId, teeSheet, guests, options);
  return result.success && result.verified;
}

/**
 * Save tee sheet to Firestore and verify it was persisted
 * Returns detailed result including verification status
 */
export async function saveAndVerifyTeeSheet(
  eventId: string,
  teeSheet: TeeSheetData,
  guests: GuestData[],
  options?: {
    teeSheetNotes?: string;
    nearestToPinHoles?: number[];
    longestDriveHoles?: number[];
    playingHandicapSnapshot?: Record<string, number>;
  }
): Promise<TeeSheetSaveResult> {
  if (!eventId) {
    console.error("[Firestore] saveAndVerifyTeeSheet: eventId is required");
    return { success: false, verified: false, error: "Event ID is required" };
  }

  if (!teeSheet || !teeSheet.groups || teeSheet.groups.length === 0) {
    console.error("[Firestore] saveAndVerifyTeeSheet: teeSheet.groups is empty");
    return { success: false, verified: false, error: "Tee sheet groups are empty" };
  }

  // Validate that player IDs look like IDs (not names)
  const allPlayerIds = teeSheet.groups.flatMap((g) => g.players);
  const suspiciousIds = allPlayerIds.filter((id) => id.includes(" ") || id.length > 50);
  if (suspiciousIds.length > 0) {
    console.warn("[Firestore] Suspicious player IDs (may be names instead of IDs):", suspiciousIds);
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return { success: false, verified: false, error: "Firebase not configured" };
    }

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

    // Perform the save using setDoc with merge:true (as per locked schema)
    await setDoc(eventRef, updateData, { merge: true });
    console.log(`[Firestore] Saved tee sheet for event: ${eventId}`, {
      groups: teeSheet.groups.length,
      players: allPlayerIds.length,
    });

    // VERIFICATION: Immediately reload and confirm teeSheet exists
    const verifiedEvent = await getEvent(eventId);
    
    if (!verifiedEvent) {
      console.error("[Firestore] VERIFICATION FAILED: Event not found after save");
      return { 
        success: true, 
        verified: false, 
        error: "Event not found after save" 
      };
    }

    if (!verifiedEvent.teeSheet || !verifiedEvent.teeSheet.groups) {
      console.error("[Firestore] VERIFICATION FAILED: teeSheet.groups missing after save");
      return { 
        success: true, 
        verified: false, 
        error: "Tee sheet not found after save" 
      };
    }

    const savedGroupCount = verifiedEvent.teeSheet.groups.length;
    const savedPlayerCount = verifiedEvent.teeSheet.groups.reduce(
      (sum, g) => sum + (g.players?.length || 0), 
      0
    );

    if (savedGroupCount === 0) {
      console.error("[Firestore] VERIFICATION FAILED: Saved teeSheet has 0 groups");
      return { 
        success: true, 
        verified: false, 
        error: "Saved tee sheet has no groups" 
      };
    }

    console.log(`[Firestore] VERIFIED: Tee sheet saved with ${savedGroupCount} groups, ${savedPlayerCount} players`);
    
    return { 
      success: true, 
      verified: true,
      savedGroupCount,
      savedPlayerCount,
    };
  } catch (error) {
    console.error("[Firestore] Error saving tee sheet:", error);
    return { 
      success: false, 
      verified: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================================================
// COURSES
// ============================================================================

/**
 * Get all courses from Firestore
 * On web: Firestore only (no fallback)
 * On native: Firestore with AsyncStorage fallback
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
      
      if (IS_WEB) {
        console.log("[Firestore] No courses found (web - no fallback)");
        return [];
      }
      
      console.log("[Firestore] No courses found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading courses:", error);
    if (IS_WEB) {
      return []; // No fallback on web
    }
  }

  // Native-only fallback to AsyncStorage
  if (!IS_WEB) {
    try {
      const AsyncStorage = await getAsyncStorage();
      if (AsyncStorage) {
        const localData = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
        if (localData) {
          const courses: Course[] = JSON.parse(localData);
          console.log(`[AsyncStorage] Loaded ${courses.length} courses from local storage (native)`);
          return courses;
        }
      }
    } catch (error) {
      console.warn("[AsyncStorage] Error reading courses:", error);
    }
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

/**
 * Find a tee set in a course by ID (case-insensitive)
 * 
 * This handles mismatches like:
 * - event.maleTeeSetId = "white" but doc.id = "White"
 * - event.femaleTeeSetId = "RED" but doc.id = "red"
 */
export function findTeeSetById(
  course: Course | null,
  teeSetId: string | undefined
): TeeSet | null {
  if (!course || !teeSetId) {
    return null;
  }
  
  // First try exact match
  const exactMatch = course.teeSets.find((t) => t.id === teeSetId);
  if (exactMatch) {
    return exactMatch;
  }
  
  // Try case-insensitive match
  const lowerTeeSetId = teeSetId.toLowerCase();
  const caseInsensitiveMatch = course.teeSets.find(
    (t) => t.id.toLowerCase() === lowerTeeSetId
  );
  
  if (caseInsensitiveMatch) {
    console.log(
      `[Firestore] Matched tee set case-insensitively: "${teeSetId}" -> "${caseInsensitiveMatch.id}"`
    );
    return caseInsensitiveMatch;
  }
  
  console.warn(`[Firestore] Tee set not found (case-insensitive): ${teeSetId}`);
  return null;
}

/**
 * Find male and female tee sets for an event (case-insensitive matching)
 */
export function findTeeSetsForEvent(
  course: Course | null,
  event: { maleTeeSetId?: string; femaleTeeSetId?: string } | null
): { maleTeeSet: TeeSet | null; femaleTeeSet: TeeSet | null } {
  if (!course || !event) {
    return { maleTeeSet: null, femaleTeeSet: null };
  }
  
  return {
    maleTeeSet: findTeeSetById(course, event.maleTeeSetId),
    femaleTeeSet: findTeeSetById(course, event.femaleTeeSetId),
  };
}

// ============================================================================
// WRITE HELPERS
// ============================================================================

/**
 * Save or update a member in Firestore
 * Uses setDoc with merge:true to support partial updates
 */
export async function saveMember(member: MemberData): Promise<boolean> {
  if (!member.id) {
    console.error("[Firestore] saveMember: member.id is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const memberRef = doc(db, "societies", societyId, "members", member.id);

    // Ensure roles is always an array of lowercase strings
    const roles = Array.isArray(member.roles) 
      ? member.roles.map(r => typeof r === "string" ? r.toLowerCase() : "member")
      : ["member"];

    await setDoc(memberRef, {
      name: member.name,
      email: member.email || null,
      handicap: member.handicap ?? null,
      sex: member.sex || "male",
      roles,
      paid: member.paid ?? false,
      amountPaid: member.amountPaid ?? 0,
      paidDate: member.paidDate || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`[Firestore] Saved member: ${member.id} (${member.name})`);
    return true;
  } catch (error) {
    console.error("[Firestore] Error saving member:", error);
    return false;
  }
}

/**
 * Delete a member from Firestore
 */
export async function deleteMember(memberId: string): Promise<boolean> {
  if (!memberId) {
    console.error("[Firestore] deleteMember: memberId is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const memberRef = doc(db, "societies", societyId, "members", memberId);
    await deleteDoc(memberRef);

    console.log(`[Firestore] Deleted member: ${memberId}`);
    return true;
  } catch (error) {
    console.error("[Firestore] Error deleting member:", error);
    return false;
  }
}

/**
 * Save or update an event in Firestore
 * Uses setDoc with merge:true to support partial updates
 */
export async function saveEvent(event: Partial<EventData> & { id: string }): Promise<boolean> {
  if (!event.id) {
    console.error("[Firestore] saveEvent: event.id is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const eventRef = doc(db, "societies", societyId, "events", event.id);

    // Build update data, converting date to Timestamp if it's a string
    const updateData: Record<string, unknown> = { ...event };
    
    // Ensure date is stored as Firestore Timestamp
    if (event.date) {
      if (typeof event.date === "string") {
        updateData.date = Timestamp.fromDate(new Date(event.date));
      }
      // Note: EventData.date is always string, so no need for Date instanceof check
    }
    
    updateData.updatedAt = new Date().toISOString();

    await setDoc(eventRef, updateData, { merge: true });

    console.log(`[Firestore] Saved event: ${event.id}`);
    return true;
  } catch (error) {
    console.error("[Firestore] Error saving event:", error);
    return false;
  }
}

/**
 * Update specific fields on an event
 */
export async function updateEventFields(
  eventId: string,
  fields: Partial<EventData>
): Promise<boolean> {
  if (!eventId) {
    console.error("[Firestore] updateEventFields: eventId is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const eventRef = doc(db, "societies", societyId, "events", eventId);

    const updateData: Record<string, unknown> = { ...fields };
    
    // Ensure date is stored as Firestore Timestamp if provided
    if (fields.date) {
      if (typeof fields.date === "string") {
        updateData.date = Timestamp.fromDate(new Date(fields.date));
      }
    }
    
    updateData.updatedAt = new Date().toISOString();

    await setDoc(eventRef, updateData, { merge: true });

    console.log(`[Firestore] Updated event fields: ${eventId}`, Object.keys(fields));
    return true;
  } catch (error) {
    console.error("[Firestore] Error updating event:", error);
    return false;
  }
}

/**
 * Save society data to Firestore
 */
export async function saveSociety(society: Partial<SocietyData> & { id: string }): Promise<boolean> {
  if (!society.id) {
    console.error("[Firestore] saveSociety: society.id is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyRef = doc(db, "societies", society.id);

    await setDoc(societyRef, {
      name: society.name || "Golf Society",
      season: society.season || null,
      joinCode: society.joinCode || null,
      logoUrl: society.logoUrl || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`[Firestore] Saved society: ${society.id}`);
    return true;
  } catch (error) {
    console.error("[Firestore] Error saving society:", error);
    return false;
  }
}

/**
 * Save event results to Firestore
 * 
 * When publishing (resultsStatus === "published"), also writes to the
 * results subcollection for Season Leaderboard aggregation.
 */
export async function saveEventResults(
  eventId: string,
  results: EventData["results"],
  options?: {
    isCompleted?: boolean;
    resultsStatus?: "draft" | "published";
    winnerId?: string;
    winnerName?: string;
  }
): Promise<boolean> {
  if (!eventId) {
    console.error("[Firestore] saveEventResults: eventId is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const eventRef = doc(db, "societies", societyId, "events", eventId);

    const updateData: Record<string, unknown> = {
      results,
      resultsUpdatedAt: new Date().toISOString(),
    };

    if (options?.isCompleted !== undefined) {
      updateData.isCompleted = options.isCompleted;
      if (options.isCompleted) {
        updateData.completedAt = new Date().toISOString();
      }
    }

    if (options?.resultsStatus) {
      updateData.resultsStatus = options.resultsStatus;
      if (options.resultsStatus === "published") {
        updateData.publishedAt = new Date().toISOString();
      }
    }

    if (options?.winnerId) {
      updateData.winnerId = options.winnerId;
    }
    if (options?.winnerName) {
      updateData.winnerName = options.winnerName;
    }

    await setDoc(eventRef, updateData, { merge: true });

    console.log(`[Firestore] Saved event results: ${eventId}`);
    
    // When publishing, also write to results subcollection for Season Leaderboard
    if (options?.resultsStatus === "published" && results) {
      try {
        // Import results helpers dynamically to avoid circular dependency
        const { writeEventResultsToSubcollection } = await import("./results");
        
        // Get the full event data and members for subcollection write
        const eventSnap = await getDoc(eventRef);
        if (eventSnap.exists()) {
          const eventData = eventSnap.data();
          const fullEvent: EventData = {
            id: eventId,
            name: eventData.name || "",
            date: eventData.date?.toDate?.()?.toISOString?.() || eventData.date || "",
            courseName: eventData.courseName || "",
            format: eventData.format || "Stableford",
            results,
          };
          
          // Get members for name lookup
          const members = await getMembers();
          
          // Write to subcollection
          const subcollectionResult = await writeEventResultsToSubcollection(
            fullEvent,
            members,
            societyId
          );
          
          if (subcollectionResult.success) {
            console.log(`[Firestore] Wrote ${subcollectionResult.resultsWritten} results to subcollection`);
          } else {
            console.warn(`[Firestore] Failed to write results subcollection: ${subcollectionResult.error}`);
          }
        }
      } catch (subcollectionError) {
        // Log but don't fail - the main event update succeeded
        console.warn("[Firestore] Error writing results subcollection:", subcollectionError);
      }
    }
    
    return true;
  } catch (error) {
    console.error("[Firestore] Error saving event results:", error);
    return false;
  }
}

/**
 * Save payment status for an event
 */
export async function saveEventPayments(
  eventId: string,
  payments: EventData["payments"]
): Promise<boolean> {
  if (!eventId) {
    console.error("[Firestore] saveEventPayments: eventId is required");
    return false;
  }

  try {
    if (!isFirebaseConfigured()) {
      console.error("[Firestore] Firebase not configured");
      return false;
    }

    const societyId = getActiveSocietyId();
    const eventRef = doc(db, "societies", societyId, "events", eventId);

    await setDoc(eventRef, {
      payments,
      paymentsUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`[Firestore] Saved event payments: ${eventId}`);
    return true;
  } catch (error) {
    console.error("[Firestore] Error saving event payments:", error);
    return false;
  }
}
