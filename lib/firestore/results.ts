/**
 * Firestore Helpers for Event Results Subcollection
 * 
 * CANONICAL RESULTS STRUCTURE:
 * societies/{societyId}/events/{eventId}/results/{memberId}
 *   ├─ memberId: string
 *   ├─ memberName: string
 *   ├─ points: number (OOM points based on position)
 *   ├─ position: number (1st, 2nd, etc.)
 *   ├─ score: number (stableford or strokeplay)
 *   ├─ scoreType: "stableford" | "strokeplay"
 *   ├─ updatedAt: Timestamp
 * 
 * This structure is used for Season Leaderboard / Order of Merit.
 */

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db, getActiveSocietyId, isFirebaseConfigured, logFirestoreOp } from "../firebase";
import { getPointsForPosition, calculateEventLeaderboard } from "../oom";
import type { EventData, MemberData } from "../models";

// ============================================================================
// TYPES
// ============================================================================

export interface EventResultDoc {
  memberId: string;
  memberName: string;
  points: number;
  position: number;
  score: number;
  scoreType: "stableford" | "strokeplay";
  updatedAt?: unknown;
}

export interface AggregatedMemberPoints {
  memberId: string;
  memberName: string;
  totalPoints: number;
  wins: number;
  played: number;
  handicap?: number;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Write event results to the canonical subcollection.
 * Called when an event is published.
 * 
 * @param event - The event with results to write
 * @param members - Members array for name lookup
 * @param societyId - Society ID (uses active if not provided)
 */
export async function writeEventResultsToSubcollection(
  event: EventData,
  members: MemberData[],
  societyId?: string
): Promise<{ success: boolean; error?: string; resultsWritten: number }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const collectionPath = `societies/${effectiveSocietyId}/events/${event.id}/results`;
  
  if (!effectiveSocietyId || !event.id) {
    return { success: false, error: "Missing societyId or eventId", resultsWritten: 0 };
  }
  
  if (!isFirebaseConfigured()) {
    return { success: false, error: "Firebase not configured", resultsWritten: 0 };
  }
  
  if (!event.results || Object.keys(event.results).length === 0) {
    if (__DEV__) {
      console.log("[Results] No results to write for event:", event.id);
    }
    return { success: true, resultsWritten: 0 };
  }
  
  try {
    // Calculate positions and points using OOM logic
    const leaderboard = calculateEventLeaderboard(event);
    
    if (leaderboard.length === 0) {
      if (__DEV__) {
        console.log("[Results] No valid leaderboard entries for event:", event.id);
      }
      return { success: true, resultsWritten: 0 };
    }
    
    // Build member lookup for names
    const memberLookup = new Map<string, MemberData>();
    members.forEach((m) => {
      if (m?.id) {
        memberLookup.set(m.id, m);
      }
    });
    
    // Use batch write for atomicity
    const batch = writeBatch(db);
    let resultsWritten = 0;
    
    for (const entry of leaderboard) {
      const member = memberLookup.get(entry.memberId);
      const points = getPointsForPosition(entry.position);
      
      const resultDoc: EventResultDoc = {
        memberId: entry.memberId,
        memberName: member?.name || "Unknown",
        points,
        position: entry.position,
        score: entry.score,
        scoreType: entry.scoreType,
        updatedAt: serverTimestamp(),
      };
      
      const docRef = doc(db, "societies", effectiveSocietyId, "events", event.id, "results", entry.memberId);
      batch.set(docRef, resultDoc);
      resultsWritten++;
    }
    
    logFirestoreOp("write", collectionPath, undefined, { count: resultsWritten });
    await batch.commit();
    
    if (__DEV__) {
      console.log("[Results] Wrote results subcollection:", {
        eventId: event.id,
        societyId: effectiveSocietyId,
        resultsWritten,
      });
    }
    
    return { success: true, resultsWritten };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Results] Error writing results subcollection:", error, {
      eventId: event.id,
      societyId: effectiveSocietyId,
    });
    return { success: false, error: errorMessage, resultsWritten: 0 };
  }
}

/**
 * Clear event results subcollection (e.g., when unpublishing)
 */
export async function clearEventResultsSubcollection(
  eventId: string,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const collectionPath = `societies/${effectiveSocietyId}/events/${eventId}/results`;
  
  if (!effectiveSocietyId || !eventId) {
    return { success: false, error: "Missing societyId or eventId" };
  }
  
  if (!isFirebaseConfigured()) {
    return { success: false, error: "Firebase not configured" };
  }
  
  try {
    const resultsRef = collection(db, "societies", effectiveSocietyId, "events", eventId, "results");
    const snapshot = await getDocs(resultsRef);
    
    if (snapshot.empty) {
      return { success: true };
    }
    
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    
    await batch.commit();
    
    if (__DEV__) {
      console.log("[Results] Cleared results subcollection:", {
        eventId,
        societyId: effectiveSocietyId,
        deletedCount: snapshot.docs.length,
      });
    }
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Results] Error clearing results subcollection:", error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Read results subcollection for a single event
 */
export async function getEventResultsSubcollection(
  eventId: string,
  societyId?: string
): Promise<EventResultDoc[]> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const collectionPath = `societies/${effectiveSocietyId}/events/${eventId}/results`;
  
  if (!effectiveSocietyId || !eventId) {
    if (__DEV__) {
      console.log("[Results] Missing societyId or eventId");
    }
    return [];
  }
  
  if (!isFirebaseConfigured()) {
    if (__DEV__) {
      console.log("[Results] Firebase not configured");
    }
    return [];
  }
  
  try {
    logFirestoreOp("read", collectionPath);
    
    const resultsRef = collection(db, "societies", effectiveSocietyId, "events", eventId, "results");
    const q = query(resultsRef, orderBy("position", "asc"));
    const snapshot = await getDocs(q);
    
    const results: EventResultDoc[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        memberId: data.memberId || docSnap.id,
        memberName: data.memberName || "Unknown",
        points: data.points ?? 0,
        position: data.position ?? 0,
        score: data.score ?? 0,
        scoreType: data.scoreType || "stableford",
      };
    });
    
    return results;
  } catch (error) {
    console.error("[Results] Error reading results subcollection:", error, { eventId, societyId: effectiveSocietyId });
    return [];
  }
}

/**
 * Aggregate points across all published events for a season.
 * Returns sorted array of members with total points.
 * 
 * @param events - All events (will filter to published only)
 * @param members - All members for metadata lookup
 * @param seasonYear - Optional year to filter by
 * @param societyId - Society ID
 */
export async function aggregateSeasonPoints(
  events: EventData[],
  members: MemberData[],
  seasonYear?: number,
  societyId?: string
): Promise<AggregatedMemberPoints[]> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    if (__DEV__) {
      console.log("[Results] No society ID for aggregation");
    }
    return [];
  }
  
  if (!Array.isArray(events) || events.length === 0) {
    if (__DEV__) {
      console.log("[Results] No events for aggregation");
    }
    return [];
  }
  
  try {
    // Filter to published events only
    let publishedEvents = events.filter((e) => e && e.resultsStatus === "published");
    
    // Filter by season year if specified
    if (seasonYear !== undefined) {
      publishedEvents = publishedEvents.filter((e) => {
        if (!e.date) return false;
        const eventDate = new Date(e.date);
        return !isNaN(eventDate.getTime()) && eventDate.getFullYear() === seasonYear;
      });
    }
    
    if (__DEV__) {
      console.log("[Results] Aggregating season points:", {
        societyId: effectiveSocietyId,
        totalEvents: events.length,
        publishedEvents: publishedEvents.length,
        seasonYear,
      });
    }
    
    if (publishedEvents.length === 0) {
      return [];
    }
    
    // Aggregate points from results subcollections
    const memberStats: Record<string, { points: number; wins: number; played: number }> = {};
    let totalResultsAggregated = 0;
    
    for (const event of publishedEvents) {
      const results = await getEventResultsSubcollection(event.id, effectiveSocietyId);
      
      for (const result of results) {
        if (!memberStats[result.memberId]) {
          memberStats[result.memberId] = { points: 0, wins: 0, played: 0 };
        }
        
        memberStats[result.memberId].points += result.points || 0;
        memberStats[result.memberId].played += 1;
        
        if (result.position === 1) {
          memberStats[result.memberId].wins += 1;
        }
        
        totalResultsAggregated++;
      }
    }
    
    // Build member lookup for metadata (defensive: handle non-array)
    const memberLookup = new Map<string, MemberData>();
    const safeMembers = Array.isArray(members) ? members : [];
    safeMembers.forEach((m) => {
      if (m?.id) {
        memberLookup.set(m.id, m);
      }
    });
    
    // Convert to array and filter out members with 0 points
    const aggregated: AggregatedMemberPoints[] = Object.entries(memberStats)
      .map(([memberId, stats]) => {
        const member = memberLookup.get(memberId);
        return {
          memberId,
          memberName: member?.name || "Unknown",
          totalPoints: stats.points,
          wins: stats.wins,
          played: stats.played,
          handicap: member?.handicap,
        };
      })
      .filter((entry) => entry.totalPoints > 0);
    
    // Sort: points desc, wins desc, played asc, name asc
    aggregated.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      if (a.played !== b.played) {
        return a.played - b.played;
      }
      return (a.memberName || "").localeCompare(b.memberName || "");
    });
    
    if (__DEV__) {
      console.log("[Results] Season aggregation complete:", {
        societyId: effectiveSocietyId,
        eventsProcessed: publishedEvents.length,
        totalResultsAggregated,
        membersWithPoints: aggregated.length,
      });
    }
    
    return aggregated;
  } catch (error) {
    console.error("[Results] Error aggregating season points:", error);
    return [];
  }
}
