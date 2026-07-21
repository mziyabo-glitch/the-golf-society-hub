/**
 * Root-layout route exemptions used to prevent signed-in redirects.
 */

export function isToolRoute(pathname?: string, seg0?: string): boolean {
  if (seg0 === "(share)") return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname.startsWith("/(share)") ||
    pathname.startsWith("/tee-sheet") ||
    pathname.startsWith("/(app)/tee-sheet")
  );
}

/** Platform-admin stack — must not be bounced back to app tabs. */
export function isAdminRoute(pathname?: string, seg0?: string): boolean {
  if (seg0 === "(admin)") return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname.startsWith("/(admin)") ||
    pathname.startsWith("/usage-report") ||
    pathname.startsWith("/course-domains")
  );
}
