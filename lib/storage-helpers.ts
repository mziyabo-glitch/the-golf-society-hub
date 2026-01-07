/**
 * Safe AsyncStorage helpers with error handling
 * Prevents crashes from malformed JSON or missing data
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Safely get JSON from AsyncStorage
 * @param key - Storage key
 * @param fallback - Default value if key doesn't exist or parse fails
 * @returns Parsed JSON or fallback
 */
export async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    if (!data) return fallback;
    
    const parsed = JSON.parse(data);
    return parsed as T;
  } catch (error) {
    console.error(`[Storage] Error reading ${key}:`, error);
    return fallback;
  }
}

/**
 * Safely set JSON to AsyncStorage
 * @param key - Storage key
 * @param value - Value to store (will be JSON.stringify'd)
 * @returns true if successful, false otherwise
 */
export async function setJson<T>(key: string, value: T): Promise<boolean> {
  try {
    const json = JSON.stringify(value);
    await AsyncStorage.setItem(key, json);
    return true;
  } catch (error) {
    console.error(`[Storage] Error writing ${key}:`, error);
    return false;
  }
}

/**
 * Safely get array from AsyncStorage
 * @param key - Storage key
 * @param fallback - Default array if key doesn't exist or parse fails
 * @returns Array or fallback
 */
export async function getArray<T>(key: string, fallback: T[] = []): Promise<T[]> {
  try {
    const data = await AsyncStorage.getItem(key);
    if (!data) return fallback;
    
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn(`[Storage] ${key} is not an array, returning fallback`);
      return fallback;
    }
    return parsed as T[];
  } catch (error) {
    console.error(`[Storage] Error reading array ${key}:`, error);
    return fallback;
  }
}

/**
 * Validate array before mapping/iterating
 * @param arr - Array to validate
 * @param fallback - Default array if invalid
 * @returns Valid array
 */
export function ensureArray<T>(arr: unknown, fallback: T[] = []): T[] {
  if (!Array.isArray(arr)) return fallback;
  return arr as T[];
}





