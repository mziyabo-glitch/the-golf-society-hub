import { memo, useCallback } from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getColors } from "@/lib/ui/theme";
import { useSlowCommitLog } from "@/lib/perf/perf";
import { formatPoints } from "./formatPoints";
import type { LeaderboardStyles } from "./leaderboardStyles";

export type GroupedOomEvent = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  format: string | null;
  results: {
    memberId: string;
    memberName: string;
    points: number;
    dayValue: number | null;
    position: number | null;
  }[];
};

type MatrixResult = GroupedOomEvent["results"][number];

type Props = {
  styles: LeaderboardStyles;
  groupedResultsLog: GroupedOomEvent[];
  expandedEvents: Set<string>;
  onToggleEventExpanded: (eventId: string) => void;
  formatEventDate: (dateStr: string | null) => string;
  onCreateOomEvent: () => void;
};

/** Memoized row: only re-renders when this row’s data or stripe/last flags change. */
const MatrixResultRow = memo(function MatrixResultRow({
  styles,
  result,
  isAlt,
  isLast,
}: {
  styles: LeaderboardStyles;
  result: MatrixResult;
  isAlt: boolean;
  isLast: boolean;
}) {
  const pos = result.position;
  const showMedal = pos != null && pos <= 3;

  return (
    <View
      style={[
        styles.accordionRow,
        isAlt ? styles.accordionRowAlt : null,
        isLast ? styles.accordionRowLast : null,
      ]}
    >
      <View style={styles.accordionPosition}>
        {showMedal ? (
          <AppText style={styles.accordionPositionMedal}>
            {pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉"}
          </AppText>
        ) : (
          <AppText style={styles.accordionPositionText}>{pos ?? "–"}</AppText>
        )}
      </View>
      <AppText style={styles.accordionPlayerName} numberOfLines={2}>
        {result.memberName}
      </AppText>
      <AppText style={styles.accordionScore}>{result.dayValue ?? "–"}</AppText>
      <AppText style={styles.accordionPoints}>{formatPoints(result.points)}</AppText>
    </View>
  );
});

/** One event panel: header always mounts; body only when expanded (lazy). */
const AccordionEventCard = memo(function AccordionEventCard({
  styles,
  colors,
  event,
  eventNumber,
  isExpanded,
  onToggleEventExpanded,
  formatEventDate,
}: {
  styles: LeaderboardStyles;
  colors: ReturnType<typeof getColors>;
  event: GroupedOomEvent;
  eventNumber: number;
  isExpanded: boolean;
  onToggleEventExpanded: (eventId: string) => void;
  formatEventDate: (dateStr: string | null) => string;
}) {
  const handleHeaderPress = useCallback(() => {
    onToggleEventExpanded(event.eventId);
  }, [event.eventId, onToggleEventExpanded]);

  const metaLine = `${formatEventDate(event.eventDate)}${event.format ? ` • ${event.format}` : ""} • ${event.results.length} player${event.results.length !== 1 ? "s" : ""}`;

  return (
    <Card variant={isExpanded ? "elevated" : "default"} padding={0} style={styles.accordionCard}>
      <Pressable style={styles.accordionHeader} onPress={handleHeaderPress}>
        <View style={styles.accordionEventInfo}>
          <View style={styles.accordionEventBadge}>
            <AppText style={styles.accordionEventNumber}>E{eventNumber}</AppText>
          </View>
          <View style={styles.accordionEventDetails}>
            <AppText style={styles.accordionEventName} numberOfLines={1}>
              {event.eventName}
            </AppText>
            <AppText style={styles.accordionEventMeta}>{metaLine}</AppText>
          </View>
        </View>
        <View style={styles.accordionChevron}>
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textTertiary} />
        </View>
      </Pressable>

      {isExpanded ? (
        <View style={styles.accordionContent}>
          <View style={styles.accordionTableHeader}>
            <AppText style={[styles.accordionColHeader, styles.accordionColPos]}>Pos</AppText>
            <AppText style={[styles.accordionColHeader, styles.accordionColPlayer]}>Player</AppText>
            <AppText style={[styles.accordionColHeader, styles.accordionColScore]}>Score</AppText>
            <AppText style={[styles.accordionColHeader, styles.accordionColOom]}>OOM</AppText>
          </View>

          {event.results.map((result, resultIdx) => (
            <MatrixResultRow
              key={result.memberId}
              styles={styles}
              result={result}
              isAlt={resultIdx % 2 === 1}
              isLast={resultIdx === event.results.length - 1}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
});

export function LeaderboardMatrixSection({
  styles,
  groupedResultsLog,
  expandedEvents,
  onToggleEventExpanded,
  formatEventDate,
  onCreateOomEvent,
}: Props) {
  useSlowCommitLog("LeaderboardMatrixView", 120);
  const colors = getColors();

  if (groupedResultsLog.length === 0) {
    return (
      <EmptyState
        icon={<Feather name="calendar" size={32} color={colors.textTertiary} />}
        title="No results in the matrix yet"
        message="Saved scores from Order of Merit events will show here, grouped by round."
        action={{
          label: "Create OOM event",
          onPress: onCreateOomEvent,
        }}
        style={styles.emptyCard}
      />
    );
  }

  const eventCount = groupedResultsLog.length;

  return (
    <View style={styles.accordionContainer}>
      {groupedResultsLog.map((event, eventIdx) => (
        <AccordionEventCard
          key={event.eventId}
          styles={styles}
          colors={colors}
          event={event}
          eventNumber={eventCount - eventIdx}
          isExpanded={expandedEvents.has(event.eventId)}
          onToggleEventExpanded={onToggleEventExpanded}
          formatEventDate={formatEventDate}
        />
      ))}
    </View>
  );
}
