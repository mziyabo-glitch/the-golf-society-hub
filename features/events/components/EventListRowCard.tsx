import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { EVENT_FORMATS } from "@/lib/db_supabase/eventRepo";
import { JOINT_EVENT_CHIP_SHORT } from "@/lib/eventModuleUi";
import { eventListRowMeta, type EventsListSegment } from "@/lib/events/eventsListScreenModel";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { pressableSurfaceStyle } from "@/lib/ui/interaction";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isEventPastForList } from "@/lib/eventListGrouping";

type Props = {
  event: EventDoc;
  segment: EventsListSegment;
  registration?: EventRegistration | null;
  isHero?: boolean;
  onPress: () => void;
};

export const EventListRowCard = memo(function EventListRowCard({
  event,
  segment,
  registration,
  isHero,
  onPress,
}: Props) {
  const colors = getColors();
  const reduceMotion = useReducedMotion();
  const isPast = isEventPastForList(event);
  const meta = eventListRowMeta(event, registration, segment);
  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event.format)?.label ?? event.format ?? null;

  const statusColor = event.isCompleted
    ? colors.success
    : event.status === "cancelled"
      ? colors.error
      : event.status === "in_progress"
        ? colors.warning
        : colors.primary;

  const statusLabel = event.isCompleted
    ? "Completed"
    : event.status === "cancelled"
      ? "Cancelled"
      : event.status === "in_progress"
        ? "In progress"
        : "Scheduled";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressableSurfaceStyle({ pressed }, { reduceMotion, scale: "card" })]}
    >
      <AppCard
        style={[
          styles.card,
          isHero && { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary + "0C" },
          isPast && { opacity: 0.94, backgroundColor: colors.backgroundTertiary },
        ]}
      >
        {isHero ? (
          <View style={[styles.nextUpBadge, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="flag" size={12} color={colors.primary} />
            <AppText variant="captionBold" color="primary" style={{ marginLeft: 4 }}>
              Next up
            </AppText>
          </View>
        ) : null}

        <View style={styles.row}>
          <View
            style={[
              styles.dateBadge,
              { backgroundColor: isPast ? colors.borderLight : colors.backgroundTertiary },
            ]}
          >
            {event.date ? (
              <>
                <AppText variant="captionBold" color={isPast ? "secondary" : "primary"}>
                  {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric" })}
                </AppText>
                <AppText variant="small" color="secondary">
                  {new Date(event.date).toLocaleDateString("en-GB", { month: "short" })}
                </AppText>
              </>
            ) : (
              <AppText variant="caption" color="tertiary">
                TBD
              </AppText>
            )}
          </View>

          <View style={styles.info}>
            <AppText
              variant="bodyBold"
              numberOfLines={2}
              style={[styles.title, isPast && { color: colors.textSecondary }]}
            >
              {event.name}
            </AppText>
            {event.courseName ? (
              <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.course}>
                {event.courseName}
              </AppText>
            ) : null}

            <View style={styles.meta}>
              {meta.playingLabel ? (
                <StatusBadge
                  label={meta.playingLabel}
                  tone={registration?.status === "in" ? "success" : "neutral"}
                />
              ) : null}
              {registration?.status === "in" ? (
                <StatusBadge
                  label={registration.paid ? "Paid" : "Unpaid"}
                  tone={registration.paid ? "success" : "warning"}
                />
              ) : null}
              {!meta.showScheduledStatus && statusLabel !== "Scheduled" ? (
                <View style={[styles.chip, { backgroundColor: statusColor + "20" }]}>
                  <AppText variant="small" style={{ color: statusColor }}>
                    {statusLabel}
                  </AppText>
                </View>
              ) : null}
              {event.classification === "oom" ? (
                <View style={[styles.chip, { backgroundColor: colors.warning + "20" }]}>
                  <AppText variant="small" style={{ color: colors.warning }}>
                    OOM
                  </AppText>
                </View>
              ) : null}
              {event.is_joint_event === true ? (
                <View style={[styles.chip, { backgroundColor: colors.info + "16" }]}>
                  <AppText variant="small" style={{ color: colors.info }} numberOfLines={1}>
                    {JOINT_EVENT_CHIP_SHORT}
                  </AppText>
                </View>
              ) : null}
              {meta.emphasizeResults && event.winnerName?.trim() ? (
                <AppText variant="small" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                  Winner: {event.winnerName}
                </AppText>
              ) : null}
              {!isPast && formatLabel && segment === "upcoming" ? (
                <AppText variant="small" color="tertiary" numberOfLines={1}>
                  {formatLabel}
                </AppText>
              ) : null}
            </View>
          </View>

          <Feather name="chevron-right" size={20} color={colors.textTertiary} style={styles.chevron} />
        </View>
      </AppCard>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
  },
  nextUpBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dateBadge: {
    width: 52,
    minWidth: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    lineHeight: 20,
  },
  course: {
    marginTop: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  chevron: {
    marginTop: 2,
  },
});
