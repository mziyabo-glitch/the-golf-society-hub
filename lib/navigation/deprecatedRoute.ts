/**
 * Helpers for Phase 2 deprecated-route redirects and analytics metadata.
 * Metadata must not include names, emails, or phone numbers.
 */

export type DeprecatedRedirectInput = {
  feature: string;
  oldRoute: string;
  destinationRoute: string;
  societyId?: string | null;
  platform?: string | null;
};

export function buildDeprecatedRedirectMetadata(input: DeprecatedRedirectInput): Record<string, string> {
  const meta: Record<string, string> = {
    feature: input.feature,
    old_route: input.oldRoute,
    destination_route: input.destinationRoute,
  };
  if (input.societyId) meta.society_id = input.societyId;
  if (input.platform) meta.platform = input.platform;
  return meta;
}

/** Bare ManCo tee-sheet URL without eventId is no longer a standalone generator entry. */
export function shouldRedirectBareTeeSheetRoute(eventId: string | string[] | null | undefined): boolean {
  if (eventId == null) return true;
  if (Array.isArray(eventId)) return eventId.filter(Boolean).length === 0;
  return String(eventId).trim().length === 0;
}

/** Course Data Editor is platform-admin only (ManCo roles are not enough). */
export function shouldRedirectCourseDataForNonPlatformAdmin(isPlatformAdminUser: boolean): boolean {
  return !isPlatformAdminUser;
}
