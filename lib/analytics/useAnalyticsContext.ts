import { useCallback, useEffect } from "react";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { setAnalyticsContext } from "@/lib/analytics/trackEvent";

/** Sync bootstrap identity into the fire-and-forget analytics context. */
export function useAnalyticsContext(): void {
  const { userId, societyId, member } = useBootstrap();

  const sync = useCallback(() => {
    const role = member?.role ?? member?.roles?.[0] ?? null;
    const permissions = getPermissionsForMember(member);
    const userRole = permissions.canGenerateTeeSheet
      ? "manco"
      : role
        ? String(role)
        : null;
    setAnalyticsContext({
      userId: userId ?? null,
      societyId: societyId ?? null,
      userRole,
    });
  }, [userId, societyId, member]);

  useEffect(() => {
    sync();
  }, [sync]);
}
