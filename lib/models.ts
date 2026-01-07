/**
 * Data models for golf society app
 */

export type Course = {
  id: string;
  name: string;
  address?: string;
  postcode?: string;
  notes?: string;
  googlePlaceId?: string;
  mapsUrl?: string;
  teeSets: TeeSet[];
};

export type TeeSet = {
  id: string;
  courseId: string;
  teeColor: string;
  par: number;
  courseRating: number;
  slopeRating: number;
  appliesTo: "male" | "female";
};

export type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  roles?: string[];
  // Payment fields (Treasurer-managed)
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
};

export type GuestData = {
  id: string;
  name: string;
  sex: "male" | "female";
  handicapIndex?: number;
  included: boolean;
};

export type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string; // Legacy field, kept for backward compatibility
  courseId?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowance?: 0.9 | 1.0;
  handicapAllowancePct?: number;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  teeSheet?: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{
      timeISO: string;
      players: string[]; // memberIds, max 4
    }>;
  };
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: { [memberId: string]: number };
  playingHandicapSnapshot?: { [memberId: string]: number };
  rsvps?: { [memberId: string]: string };
  guests?: GuestData[];
  // Event fee and payment tracking (Treasurer-managed)
  eventFee?: number; // Competition fee for this event
  payments?: {
    [memberId: string]: {
      paid: boolean;
      paidAtISO?: string; // ISO date string
      method?: "cash" | "bank" | "other";
    };
  };
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
};





