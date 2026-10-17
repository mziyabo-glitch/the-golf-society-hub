import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import {
  EVENTS_LIST_SEGMENT_LABELS,
  type EventsListSegment,
} from "@/lib/events/eventsListScreenModel";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { pressOpacityStyle } from "@/lib/ui/interaction";

const SEGMENTS: EventsListSegment[] = ["upcoming", "my_events", "past_results"];

type Props = {
  value: EventsListSegment;
  onChange: (segment: EventsListSegment) => void;
};

export const EventsSegmentTabs = memo(function EventsSegmentTabs({ value, onChange }: Props) {
  const colors = getColors();
  return (
    <View
      style={[
        styles.shell,
        { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary },
      ]}
    >
      {SEGMENTS.map((segment) => {
        const selected = segment === value;
        return (
          <Pressable
            key={segment}
            onPress={() => onChange(segment)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: selected ? colors.primary : "transparent",
                borderColor: selected ? colors.primary : "transparent",
              },
              pressOpacityStyle(pressed, selected),
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <AppText
              variant="captionBold"
              style={{ color: selected ? colors.textInverse : colors.textSecondary }}
              numberOfLines={1}
            >
              {EVENTS_LIST_SEGMENT_LABELS[segment]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
});
