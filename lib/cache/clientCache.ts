import AsyncStorage from "@react-native-async-storage/async-storage";

export type CacheEnvelope<T> = {
  value: T;
  updatedAt: number;
  ttlMs?: number;
  version?: number;
};

type CacheGetOptions = {
  maxAgeMs?: number;
};

const KEY_PREFIX = "gsh:cache:";

function toStorageKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export function isCacheStale(updatedAt: number, ttlMs?: number): boolean {
  if (!ttlMs || ttlMs <= 0) return false;
  return Date.now() - updatedAt > ttlMs;
}

export async function getCache<T>(
  key: string,
  options?: CacheGetOptions,
): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(toStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("updatedAt" in parsed)) return null;
    if (options?.maxAgeMs && Date.now() - parsed.updatedAt > options.maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  metadata?: { ttlMs?: number; version?: number },
): Promise<void> {
  try {
    const payload: CacheEnvelope<T> = {
      value,
      updatedAt: Date.now(),
      ttlMs: metadata?.ttlMs,
      version: metadata?.version,
    };
    await AsyncStorage.setItem(toStorageKey(key), JSON.stringify(payload));
  } catch {
    // non-fatal cache failure
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(toStorageKey(key));
  } catch {
    // non-fatal cache failure
  }
}

export async function invalidateCachePrefix(prefix: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const fullPrefix = toStorageKey(prefix);
    const toRemove = allKeys.filter((k) => k.startsWith(fullPrefix));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // non-fatal cache failure
  }
}
