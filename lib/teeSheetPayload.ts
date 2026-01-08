/**
 * Tee Sheet Payload Encoding/Decoding
 * 
 * Used to pass tee sheet data directly to the print page
 * as a fallback when Firestore data might not be saved yet.
 */

import type { GuestData } from "./models";
import { getActiveSocietyId } from "./firebase";

/**
 * Payload structure for passing tee sheet data to print page
 */
export interface TeeSheetPayload {
  // Identity
  eventId: string;
  societyId: string;
  
  // Event info
  eventName: string;
  eventDate: string;
  courseName: string;
  
  // Course/Tee info
  courseId?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowancePct: number;
  
  // Tee set details for PH calculation
  maleTeeSet?: {
    id: string;
    teeColor: string;
    par: number;
    courseRating: number;
    slopeRating: number;
  };
  femaleTeeSet?: {
    id: string;
    teeColor: string;
    par: number;
    courseRating: number;
    slopeRating: number;
  };
  
  // Tee Sheet data
  teeSheet: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{
      timeISO: string;
      players: string[];
    }>;
  };
  
  // Additional fields
  teeSheetNotes?: string;
  nearestToPinHoles?: number[];
  longestDriveHoles?: number[];
  guests?: GuestData[];
  
  // Society info
  societyName?: string;
  societyLogoUrl?: string | null;
}

/**
 * Encode payload to URL-safe string
 */
export function encodeTeeSheetPayload(payload: TeeSheetPayload): string {
  try {
    const json = JSON.stringify(payload);
    // Use base64 encoding for URL safety
    if (typeof btoa !== "undefined") {
      return btoa(encodeURIComponent(json));
    }
    // Node.js fallback
    return Buffer.from(json).toString("base64");
  } catch (error) {
    console.error("[Payload] Error encoding:", error);
    return "";
  }
}

/**
 * Decode payload from URL-safe string
 */
export function decodeTeeSheetPayload(encoded: string): TeeSheetPayload | null {
  try {
    if (!encoded) return null;
    
    let json: string;
    if (typeof atob !== "undefined") {
      json = decodeURIComponent(atob(encoded));
    } else {
      // Node.js fallback
      json = Buffer.from(encoded, "base64").toString("utf-8");
    }
    
    const payload = JSON.parse(json) as TeeSheetPayload;
    
    // Validate required fields
    if (!payload.eventId || !payload.teeSheet?.groups) {
      console.warn("[Payload] Invalid payload - missing required fields");
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error("[Payload] Error decoding:", error);
    return null;
  }
}

/**
 * Build payload from current tee sheet screen state
 */
export function buildTeeSheetPayload(options: {
  event: { id: string; name: string; date: string; courseName?: string; courseId?: string; maleTeeSetId?: string; femaleTeeSetId?: string };
  society?: { name: string; logoUrl?: string | null } | null;
  course?: { id: string; name: string } | null;
  maleTeeSet?: { id: string; teeColor: string; par: number; courseRating: number; slopeRating: number } | null;
  femaleTeeSet?: { id: string; teeColor: string; par: number; courseRating: number; slopeRating: number } | null;
  handicapAllowancePct: number;
  teeSheet: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{ timeISO: string; players: string[] }>;
  };
  teeSheetNotes?: string;
  nearestToPinHoles?: number[];
  longestDriveHoles?: number[];
  guests?: GuestData[];
}): TeeSheetPayload {
  const societyId = getActiveSocietyId();
  
  return {
    eventId: options.event.id,
    societyId,
    eventName: options.event.name,
    eventDate: options.event.date,
    courseName: options.course?.name || options.event.courseName || "",
    courseId: options.event.courseId,
    maleTeeSetId: options.event.maleTeeSetId,
    femaleTeeSetId: options.event.femaleTeeSetId,
    handicapAllowancePct: options.handicapAllowancePct,
    maleTeeSet: options.maleTeeSet ? {
      id: options.maleTeeSet.id,
      teeColor: options.maleTeeSet.teeColor,
      par: options.maleTeeSet.par,
      courseRating: options.maleTeeSet.courseRating,
      slopeRating: options.maleTeeSet.slopeRating,
    } : undefined,
    femaleTeeSet: options.femaleTeeSet ? {
      id: options.femaleTeeSet.id,
      teeColor: options.femaleTeeSet.teeColor,
      par: options.femaleTeeSet.par,
      courseRating: options.femaleTeeSet.courseRating,
      slopeRating: options.femaleTeeSet.slopeRating,
    } : undefined,
    teeSheet: options.teeSheet,
    teeSheetNotes: options.teeSheetNotes,
    nearestToPinHoles: options.nearestToPinHoles,
    longestDriveHoles: options.longestDriveHoles,
    guests: options.guests,
    societyName: options.society?.name,
    societyLogoUrl: options.society?.logoUrl,
  };
}
