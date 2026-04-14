import { StyleSheet, View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DashboardPlayabilityMiniCard } from "@/components/dashboard/DashboardPlayabilityMiniCard";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  nextEvent: EventDoc | null;
  enabled: boolean;
  onOpenWeatherTab: () => void;
  preferredTeeTimeLocal: string | null | undefined;
};

export function HomeWeatherSnapshotCard({
  nextEvent,
  enabled,
  onOpenWeatherTab,
  preferredTeeTimeLocal,
}: Props) {
  const colors = getColors();
  if (!nextEvent) {
    return (
      <AppCard style={[styles.emptyCard, { borderColor: colors.borderLight }]}>
        <AppText variant="bodyBold">Weather</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
          Weather unavailable.
        </AppText>
      </AppCard>
    );
  }
  return (
    <View>
      <AppText variant="captionBold" color="secondary" style={styles.label}>
        Weather
      </AppText>
      <DashboardPlayabilityMiniCard
        nextEvent={nextEvent}
        enabled={enabled}
        onOpenWeatherTab={onOpenWeatherTab}
        preferredTeeTimeLocal={preferredTeeTimeLocal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs,
  },
  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
});

