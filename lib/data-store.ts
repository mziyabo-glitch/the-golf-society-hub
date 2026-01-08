/**
 * Unified Data Store for Golf Society Hub
 * 
 * All app data is stored under a single key "GSH_DATA_V1" for reliability.
 * This prevents data loss between deployments and makes export/import easy.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "./storage";

// Root storage key - never change this without migration logic
export const DATA_STORE_KEY = "GSH_DATA_V1";

// Current data version - increment when schema changes
export const DATA_VERSION = 1;

/**
 * Unified app data structure
 */
export interface AppData {
  version: number;
  society: SocietyData | null;
  members: MemberData[];
  events: EventData[];
  courses: CourseData[];
  scores: Record<string, any>;
  finance: FinanceData;
  settings: SettingsData;
}

export interface SocietyData {
  name: string;
  homeCourse?: string;
  country?: string;
  scoringMode?: "Stableford" | "Strokeplay" | "Both";
  handicapRule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
}

export interface MemberData {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  roles?: string[];
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
}

export interface EventData {
  id: string;
  name: string;
  date: string;
  courseName: string;
  courseId?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowance?: 0.9 | 1.0;
  handicapAllowancePct?: number;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: Record<string, number>;
  playingHandicapSnapshot?: Record<string, number>;
  rsvps?: Record<string, string>;
  guests?: GuestData[];
  eventFee?: number;
  payments?: Record<string, PaymentData>;
  teeSheet?: TeeSheetData;
  teeSheetNotes?: string;
  nearestToPinHoles?: number[];
  longestDriveHoles?: number[];
  results?: Record<string, ResultData>;
}

export interface GuestData {
  id: string;
  name: string;
  sex: "male" | "female";
  handicapIndex?: number;
  included: boolean;
}

export interface PaymentData {
  paid: boolean;
  paidAtISO?: string;
  method?: "cash" | "bank" | "other";
}

export interface TeeSheetData {
  startTimeISO: string;
  intervalMins: number;
  groups: Array<{
    timeISO: string;
    players: string[];
  }>;
}

export interface ResultData {
  grossScore: number;
  netScore?: number;
  stableford?: number;
  strokeplay?: number;
}

export interface CourseData {
  id: string;
  name: string;
  address?: string;
  postcode?: string;
  notes?: string;
  googlePlaceId?: string;
  mapsUrl?: string;
  teeSets: TeeSetData[];
}

export interface TeeSetData {
  id: string;
  courseId: string;
  teeColor: string;
  par: number;
  courseRating: number;
  slopeRating: number;
  appliesTo: "male" | "female";
}

export interface FinanceData {
  balance?: number;
  transactions?: any[];
}

export interface SettingsData {
  adminPin?: string;
  themeMode?: "light" | "dark" | "system";
}

/**
 * Create empty app data structure
 */
export function createEmptyAppData(): AppData {
  return {
    version: DATA_VERSION,
    society: null,
    members: [],
    events: [],
    courses: [],
    scores: {},
    finance: {},
    settings: {},
  };
}

/**
 * Load all app data from storage
 * Returns existing data or creates new empty structure
 */
export async function loadAppData(): Promise<AppData> {
  try {
    // First check if unified data exists
    const stored = await AsyncStorage.getItem(DATA_STORE_KEY);
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        
        // Validate version
        if (typeof parsed.version !== "number") {
          console.warn("[DataStore] Data missing version field, adding it");
          parsed.version = DATA_VERSION;
        }
        
        // Future: Add migration logic here when version changes
        // if (parsed.version < DATA_VERSION) {
        //   parsed = migrateData(parsed);
        // }
        
        return parsed as AppData;
      } catch (parseError) {
        console.error("[DataStore] Failed to parse stored data:", parseError);
        console.warn("[DataStore] Data may be corrupted. Creating backup and starting fresh.");
        
        // Backup corrupted data
        await AsyncStorage.setItem(`${DATA_STORE_KEY}_CORRUPTED_${Date.now()}`, stored);
        return createEmptyAppData();
      }
    }
    
    // No unified data - check for legacy keys and migrate
    const migrated = await migrateFromLegacyKeys();
    if (migrated) {
      console.log("[DataStore] Successfully migrated from legacy keys");
      return migrated;
    }
    
    // No data at all - return empty structure
    console.log("[DataStore] No existing data found, starting fresh");
    return createEmptyAppData();
    
  } catch (error) {
    console.error("[DataStore] Error loading app data:", error);
    return createEmptyAppData();
  }
}

/**
 * Save all app data to storage
 */
export async function saveAppData(data: AppData): Promise<boolean> {
  try {
    // Ensure version is set
    data.version = DATA_VERSION;
    
    const json = JSON.stringify(data);
    await AsyncStorage.setItem(DATA_STORE_KEY, json);
    return true;
  } catch (error) {
    console.error("[DataStore] Error saving app data:", error);
    return false;
  }
}

/**
 * Migrate from legacy individual storage keys to unified structure
 */
async function migrateFromLegacyKeys(): Promise<AppData | null> {
  try {
    // Check if any legacy keys exist
    const legacyKeys = [
      STORAGE_KEYS.SOCIETY_ACTIVE,
      STORAGE_KEYS.MEMBERS,
      STORAGE_KEYS.EVENTS,
      STORAGE_KEYS.COURSES,
      STORAGE_KEYS.SCORES,
      STORAGE_KEYS.ADMIN_PIN,
    ];
    
    const values = await AsyncStorage.multiGet(legacyKeys);
    const hasLegacyData = values.some(([_, value]) => value !== null);
    
    if (!hasLegacyData) {
      return null;
    }
    
    console.log("[DataStore] Found legacy data, migrating...");
    
    // Parse legacy values
    const getValue = (key: string): any => {
      const item = values.find(([k]) => k === key);
      if (!item || !item[1]) return null;
      try {
        return JSON.parse(item[1]);
      } catch {
        return item[1]; // Return as string if not JSON
      }
    };
    
    // Build unified structure
    const appData: AppData = {
      version: DATA_VERSION,
      society: getValue(STORAGE_KEYS.SOCIETY_ACTIVE) as SocietyData | null,
      members: (getValue(STORAGE_KEYS.MEMBERS) as MemberData[]) || [],
      events: (getValue(STORAGE_KEYS.EVENTS) as EventData[]) || [],
      courses: (getValue(STORAGE_KEYS.COURSES) as CourseData[]) || [],
      scores: getValue(STORAGE_KEYS.SCORES) || {},
      finance: {},
      settings: {
        adminPin: getValue(STORAGE_KEYS.ADMIN_PIN) as string | undefined,
      },
    };
    
    // Save unified data
    await saveAppData(appData);
    
    // Delete legacy keys after successful migration
    await AsyncStorage.multiRemove(legacyKeys);
    console.log("[DataStore] Migration complete, legacy keys removed");
    
    return appData;
    
  } catch (error) {
    console.error("[DataStore] Error during migration:", error);
    return null;
  }
}

/**
 * Export app data as JSON string
 */
export async function exportAppData(): Promise<string> {
  const data = await loadAppData();
  return JSON.stringify(data, null, 2);
}

/**
 * Validate imported data structure
 */
export function validateAppData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data || typeof data !== "object") {
    errors.push("Data must be an object");
    return { valid: false, errors };
  }
  
  if (typeof data.version !== "number") {
    errors.push("Missing or invalid version field");
  }
  
  if (data.society !== null && typeof data.society !== "object") {
    errors.push("Invalid society field");
  }
  
  if (!Array.isArray(data.members)) {
    errors.push("Members must be an array");
  }
  
  if (!Array.isArray(data.events)) {
    errors.push("Events must be an array");
  }
  
  if (!Array.isArray(data.courses)) {
    errors.push("Courses must be an array");
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Import app data from JSON string
 */
export async function importAppData(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString);
    
    const validation = validateAppData(data);
    if (!validation.valid) {
      return { success: false, error: `Invalid data: ${validation.errors.join(", ")}` };
    }
    
    // Ensure version is set
    data.version = data.version || DATA_VERSION;
    
    // Ensure all required fields exist
    const appData: AppData = {
      version: data.version,
      society: data.society || null,
      members: data.members || [],
      events: data.events || [],
      courses: data.courses || [],
      scores: data.scores || {},
      finance: data.finance || {},
      settings: data.settings || {},
    };
    
    const saved = await saveAppData(appData);
    if (!saved) {
      return { success: false, error: "Failed to save imported data" };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error("[DataStore] Import error:", error);
    return { success: false, error: `Parse error: ${error}` };
  }
}

/**
 * Reset all app data
 */
export async function resetAppData(): Promise<boolean> {
  try {
    // Clear unified data
    await AsyncStorage.removeItem(DATA_STORE_KEY);
    
    // Clear any remaining legacy keys
    const legacyKeys = [
      STORAGE_KEYS.SOCIETY_ACTIVE,
      STORAGE_KEYS.SOCIETY_DRAFT,
      STORAGE_KEYS.MEMBERS,
      STORAGE_KEYS.EVENTS,
      STORAGE_KEYS.COURSES,
      STORAGE_KEYS.SCORES,
      STORAGE_KEYS.ADMIN_PIN,
      STORAGE_KEYS.SESSION_USER_ID,
      STORAGE_KEYS.SESSION_ROLE,
      STORAGE_KEYS.THEME_MODE,
    ];
    await AsyncStorage.multiRemove(legacyKeys);
    
    console.log("[DataStore] All data reset successfully");
    return true;
  } catch (error) {
    console.error("[DataStore] Error resetting data:", error);
    return false;
  }
}

// ============================================
// Convenience functions for accessing specific data
// These maintain backward compatibility with existing code
// ============================================

/**
 * Get society data
 */
export async function getSociety(): Promise<SocietyData | null> {
  const data = await loadAppData();
  return data.society;
}

/**
 * Save society data
 */
export async function saveSociety(society: SocietyData | null): Promise<boolean> {
  const data = await loadAppData();
  data.society = society;
  return saveAppData(data);
}

/**
 * Get members array
 */
export async function getMembers(): Promise<MemberData[]> {
  const data = await loadAppData();
  return data.members || [];
}

/**
 * Save members array
 */
export async function saveMembers(members: MemberData[]): Promise<boolean> {
  const data = await loadAppData();
  data.members = members;
  return saveAppData(data);
}

/**
 * Get events array
 */
export async function getEvents(): Promise<EventData[]> {
  const data = await loadAppData();
  return data.events || [];
}

/**
 * Save events array
 */
export async function saveEvents(events: EventData[]): Promise<boolean> {
  const data = await loadAppData();
  data.events = events;
  return saveAppData(data);
}

/**
 * Get courses array
 */
export async function getCourses(): Promise<CourseData[]> {
  const data = await loadAppData();
  return data.courses || [];
}

/**
 * Save courses array
 */
export async function saveCourses(courses: CourseData[]): Promise<boolean> {
  const data = await loadAppData();
  data.courses = courses;
  return saveAppData(data);
}

/**
 * Get admin PIN
 */
export async function getAdminPin(): Promise<string | undefined> {
  const data = await loadAppData();
  return data.settings?.adminPin;
}

/**
 * Save admin PIN
 */
export async function saveAdminPin(pin: string): Promise<boolean> {
  const data = await loadAppData();
  if (!data.settings) data.settings = {};
  data.settings.adminPin = pin;
  return saveAppData(data);
}

/**
 * Check if society exists (for backward compatibility)
 */
export async function hasSociety(): Promise<boolean> {
  const data = await loadAppData();
  return data.society !== null;
}
