/**
 * Member Home Screen — route orchestration only.
 * Domain logic: `features/home/useHomeDashboard`
 * UI: `features/home/components/HomeSocietyDashboardView`, `features/home/PersonalModeHome`
 */

import { Screen } from "@/components/ui/Screen";
import { HomeDashboardSkeleton } from "@/components/ui/Skeleton";
import { homeDashboardStyles as styles } from "@/features/home/homeDashboardStyles";
import { PersonalModeHome } from "@/features/home/PersonalModeHome";
import { HomeSocietyDashboardView } from "@/features/home/components/HomeSocietyDashboardView";
import { useHomeDashboard } from "@/features/home/useHomeDashboard";
import { useSlowCommitLog } from "@/lib/perf/perf";

export default function HomeScreen() {
  useSlowCommitLog("HomeScreen", 96);
  const state = useHomeDashboard();

  if (state.phase === "loading") {
    return (
      <Screen
        scrollable
        style={{ backgroundColor: state.colors.backgroundSecondary }}
        contentStyle={[styles.screenContent, state.tabContentStyle]}
      >
        <HomeDashboardSkeleton />
      </Screen>
    );
  }

  if (state.phase === "personal") {
    return (
      <PersonalModeHome
        colors={state.colors}
        router={state.router}
        tabContentStyle={state.tabContentStyle}
      />
    );
  }

  const { phase: _phase, ...vm } = state;
  return <HomeSocietyDashboardView {...vm} />;
}

