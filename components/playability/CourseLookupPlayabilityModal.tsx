/**
 * Quick playability peek when browsing GolfCourseAPI search results (create event flow).
 */

import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { ApiCourseSearchResult } from "@/lib/golfApi";
import { usePlayabilityBundle } from "@/lib/playability/usePlayabilityBundle";
import { PlayabilityCard } from "./PlayabilityCard";
import { CourseActionRow } from "./CourseActionRow";
import { HourlyForecastStrip } from "./HourlyForecastStrip";
import { DailyForecastBlock } from "./DailyForecastBlock";
import { getColors, spacing, radius } from "@/lib/ui/theme";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  hit: ApiCourseSearchResult | null;
};

export function CourseLookupPlayabilityModal({ visible, onClose, hit }: Props) {
  const colors = getColors();
  const name = hit?.name?.trim() || "Course";
  const bundle = usePlayabilityBundle(
    visible && !!hit,
    todayYmd(),
    null,
    hit?.id ?? null,
    name,
  );

  const contact =
    bundle.contact ?? ({
      courseName: name,
      lat: null,
      lng: null,
      phone: null,
      websiteUrl: null,
    } as const);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.header}>
            <AppText variant="h2" numberOfLines={2} style={{ flex: 1 }}>
              Playability
            </AppText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
              {name}
              {hit?.location ? ` · ${hit.location}` : ""}
            </AppText>

            <PlayabilityCard
              loading={bundle.loading}
              error={bundle.error}
              insight={bundle.insight}
              coordsHint={
                bundle.coords
                  ? `${bundle.coords.label} · ${bundle.coords.source === "golf_api" ? "Directory" : bundle.coords.source}`
                  : null
              }
              onRefresh={bundle.refetch}
              noLocationMessage="Could not resolve map position for this listing. Try again or pick the course to load coordinates."
            />

            {!bundle.loading && !bundle.error && bundle.insight ? (
              <>
                <HourlyForecastStrip slots={bundle.insight.playTimeline} hours={bundle.hourlyStrip} />
                <DailyForecastBlock days={bundle.dailyOutlook} />
              </>
            ) : null}

            <CourseActionRow contact={contact} insight={bundle.insight} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    maxHeight: "88%",
  },
  scroll: {
    maxHeight: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
