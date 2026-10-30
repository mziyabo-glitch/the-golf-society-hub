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

/** Platform-admin screens live under /(app)/admin/* (inside the app stack).
 * Also recognize legacy /(admin)/* paths during transition. */
export function isAdminRoute(pathname?: string, seg0?: string): boolean {
  if (seg0 === "(admin)") return true;
  if (typeof pathname !== "string") return false;
  return (
    pathname.startsWith("/(admin)") ||
    pathname.startsWith("/(app)/admin") ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin" ||
    pathname.startsWith("/usage-report") ||
    pathname.startsWith("/course-domains")
  );
}
