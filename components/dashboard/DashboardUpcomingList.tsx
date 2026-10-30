/**
 * Compact list of upcoming events after the hero “next” event.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { dashboardShell } from "./dashboardCardStyles";

type Props = {
  events: EventDoc[];
  formatShortDate: (dateStr?: string) => string;
  onOpenEvent: (eventId: string) => void;
};

export function DashboardUpcomingList({ events, formatShortDate, onOpenEvent }: Props) {
  const colors = getColors();

  if (events.length === 0) return null;

  return (
    <View style={[dashboardShell.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
      <View style={dashboardShell.sectionEyebrow}>
        <Feather name="layers" size={16} color={colors.primary} />
        <AppText variant="captionBold" color="primary">
          Coming up
        </AppText>
      </View>

      {events.map((ev, idx) => (
        <Pressable
          key={ev.id}
          onPress={() => onOpenEvent(ev.id)}
          style={({ pressed }) => [
            styles.row,
            idx > 0 && [styles.rowBorder, { borderTopColor: colors.borderLight }],
            pressed && styles.rowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${ev.name}`}
        >
          <View style={[styles.dateBadge, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="captionBold" color="primary" style={styles.dateBadgeText}>
              {formatShortDate(typeof ev.date === "string" ? ev.date : undefined)}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="bodyBold" numberOfLines={1}>
              {String(ev.name ?? "Event")}
            </AppText>
            {ev.courseName ? (
              <AppText variant="small" color="secondary" numberOfLines={1}>
                {String(ev.courseName)}
              </AppText>
            ) : null}
          </View>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    opacity: 0.92,
  },
  dateBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBadgeText: {
    textAlign: "center",
  },
});
