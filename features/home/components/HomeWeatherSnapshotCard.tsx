import { StyleSheet, View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DashboardPlayabilityMiniCard } from "@/components/dashboard/DashboardPlayabilityMiniCard";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  nextEvent: EventDoc | null;
  enabled: boolean;
  onOpenWeatherDetail: () => void;
  preferredTeeTimeLocal: string | null | undefined;
};

export function HomeWeatherSnapshotCard({
  nextEvent,
  enabled,
  onOpenWeatherDetail,
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
      <DashboardPlayabilityMiniCard
        nextEvent={nextEvent}
        enabled={enabled}
        onOpenWeatherTab={onOpenWeatherDetail}
        preferredTeeTimeLocal={preferredTeeTimeLocal}
      />
      <AppText variant="caption" color="tertiary" style={{ marginTop: 6, paddingHorizontal: 2 }}>
        Powered by FairwayWeather. Tap for full detail, course switching, and the complete forecast.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
});

