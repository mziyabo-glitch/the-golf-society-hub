import { invalidateCache, invalidateCachePrefix } from "@/lib/cache/clientCache";

/**
 * Invalidate client caches that embed member identity (names, handicaps, registrations).
 * Society prefix covers dashboard/members/tee-sheet/payments/RSVP list caches.
 */
export async function invalidatePersonRelatedCaches(opts: {
  activeSocietyId: string | null;
  includeAllSocieties?: boolean;
}): Promise<void> {
  await invalidateCachePrefix("event:");
  if (opts.includeAllSocieties) {
    await invalidateCachePrefix("society:");
  } else if (opts.activeSocietyId) {
    await invalidateCachePrefix(`society:${opts.activeSocietyId}:`);
  }
  await invalidateCache("app:activeSociety");
}
