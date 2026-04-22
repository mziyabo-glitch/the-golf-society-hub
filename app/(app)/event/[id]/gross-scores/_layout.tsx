import { Slot } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember, isCaptain, isSecretary } from "@/lib/rbac";

export default function GrossScoresLayout() {
  const { member, loading } = useBootstrap();
  const permissions = getPermissionsForMember(member);
  const canAccessScorecardUi =
    permissions.canManageHandicaps || isCaptain(member) || isSecretary(member);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading..." />
      </Screen>
    );
  }

  if (!canAccessScorecardUi) {
    return (
      <Screen>
        <EmptyState title="Scorecard" message="This feature is temporarily unavailable." />
      </Screen>
    );
  }

  return <Slot />;
}
