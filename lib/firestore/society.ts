/**
 * Firestore Read Helpers for Society Data
 * 
 * These functions read from Firestore first, falling back to AsyncStorage
 * if Firestore is empty or errors. This enables gradual migration from
 * local storage to cloud storage.
 * 
 * Schema:
 * societies/{societyId}
 *   ├─ name
 *   ├─ season
 *   ├─ joinCode
 *   ├─ createdAt
 *   ├─ members/{memberId}
 *   └─ events/{eventId}
 */

import { db, getActiveSocietyId, isFirebaseConfigured } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../storage";
import type { MemberData, EventData } from "../models";

/**
 * Society data structure from Firestore
 */
export interface SocietyData {
  id: string;
  name: string;
  season?: string;
  joinCode?: string;
  createdAt?: string;
  logoUrl?: string | null;
}

/**
 * Get society data
 * Reads from Firestore first, falls back to AsyncStorage
 */
export async function getSociety(): Promise<SocietyData | null> {
  try {
    // Try Firestore first (if configured)
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
    console.warn("[Firestore] Error reading society, falling back to AsyncStorage:", error);
  }

  // Fall back to AsyncStorage
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

/**
 * Get members list
 * Reads from Firestore first, falls back to AsyncStorage
 */
export async function getMembers(): Promise<MemberData[]> {
  try {
    // Try Firestore first (if configured)
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
    console.warn("[Firestore] Error reading members, falling back to AsyncStorage:", error);
  }

  // Fall back to AsyncStorage
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

/**
 * Get events list
 * Reads from Firestore first, falls back to AsyncStorage
 */
export async function getEvents(): Promise<EventData[]> {
  try {
    // Try Firestore first (if configured)
    if (isFirebaseConfigured()) {
      const societyId = getActiveSocietyId();
      const eventsRef = collection(db, "societies", societyId, "events");
      const eventsSnap = await getDocs(eventsRef);

      if (!eventsSnap.empty) {
        const events: EventData[] = eventsSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "Unnamed Event",
            date: data.date || new Date().toISOString(),
            courseName: data.courseName || "",
            courseId: data.courseId,
            maleTeeSetId: data.maleTeeSetId,
            femaleTeeSetId: data.femaleTeeSetId,
            handicapAllowance: data.handicapAllowance,
            handicapAllowancePct: data.handicapAllowancePct,
            format: data.format || "Stableford",
            playerIds: data.playerIds || [],
            teeSheet: data.teeSheet,
            isCompleted: data.isCompleted,
            completedAt: data.completedAt,
            resultsStatus: data.resultsStatus,
            publishedAt: data.publishedAt,
            resultsUpdatedAt: data.resultsUpdatedAt,
            isOOM: data.isOOM,
            winnerId: data.winnerId,
            winnerName: data.winnerName,
            handicapSnapshot: data.handicapSnapshot,
            playingHandicapSnapshot: data.playingHandicapSnapshot,
            rsvps: data.rsvps,
            guests: data.guests || [],
            eventFee: data.eventFee,
            payments: data.payments,
            teeSheetNotes: data.teeSheetNotes,
            nearestToPinHoles: data.nearestToPinHoles || [],
            longestDriveHoles: data.longestDriveHoles || [],
            results: data.results,
          };
        });
        console.log(`[Firestore] Loaded ${events.length} events`);
        return events;
      }
      console.log("[Firestore] No events found, falling back to AsyncStorage");
    }
  } catch (error) {
    console.warn("[Firestore] Error reading events, falling back to AsyncStorage:", error);
  }

  // Fall back to AsyncStorage
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
