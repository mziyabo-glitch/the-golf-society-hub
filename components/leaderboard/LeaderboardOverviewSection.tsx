import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton } from "@/components/ui/Button";
import type { OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import { getColors } from "@/lib/ui/theme";
import { useSlowCommitLog } from "@/lib/perf/perf";
import { formatPoints } from "./formatPoints";
import type { LeaderboardStyles } from "./leaderboardStyles";

type Props = {
  styles: LeaderboardStyles;
  standings: OrderOfMeritEntry[];
  top3: OrderOfMeritEntry[];
  theField: OrderOfMeritEntry[];
  needsLicence: boolean;
  onCreateOomEvent: () => void;
  onUnlockFullLeaderboard: () => void;
};

export function LeaderboardOverviewSection({
  styles,
  standings,
  top3,
  theField,
  needsLicence,
  onCreateOomEvent,
  onUnlockFullLeaderboard,
}: Props) {
  useSlowCommitLog("LeaderboardView", 120);
  const colors = getColors();

  if (standings.length === 0) {
    return (
      <EmptyState
        icon={<Feather name="award" size={32} color={colors.textTertiary} />}
        title="No Order of Merit yet"
        message="When you run OOM events and save results, standings and the matrix will appear here."
        action={{
          label: "Create OOM event",
          onPress: onCreateOomEvent,
        }}
        style={styles.emptyCard}
      />
    );
  }

  return (
    <>
      {top3.length >= 3 && (
        <View style={styles.podiumContainer}>
          <View style={styles.podiumPosition}>
            <Card variant="elevated" style={[styles.podiumCard, styles.podiumSecond]}>
              <View style={styles.podiumMedal}>
                <AppText style={styles.podiumMedalText}>🥈</AppText>
              </View>
              <AppText style={styles.podiumName} numberOfLines={2}>
                {top3[1]?.memberName}
              </AppText>
              <AppText style={styles.podiumPoints}>{formatPoints(top3[1]?.totalPoints || 0)}</AppText>
              <AppText style={styles.podiumPtsLabel}>pts</AppText>
            </Card>
            <View style={[styles.podiumBase, styles.podiumBaseSecond]} />
          </View>

          <View style={styles.podiumPosition}>
            <Card variant="elevated" style={[styles.podiumCard, styles.podiumFirst]}>
              <View style={[styles.podiumMedal, styles.podiumMedalGold]}>
                <AppText style={styles.podiumMedalText}>🥇</AppText>
              </View>
              <AppText style={styles.podiumName} numberOfLines={2}>
                {top3[0]?.memberName}
              </AppText>
              <AppText style={[styles.podiumPoints, styles.podiumPointsGold]}>
                {formatPoints(top3[0]?.totalPoints || 0)}
              </AppText>
              <AppText style={styles.podiumPtsLabel}>pts</AppText>
            </Card>
            <View style={[styles.podiumBase, styles.podiumBaseFirst]} />
          </View>

          <View style={styles.podiumPosition}>
            <Card variant="elevated" style={[styles.podiumCard, styles.podiumThird]}>
              <View style={styles.podiumMedal}>
                <AppText style={styles.podiumMedalText}>🥉</AppText>
              </View>
              <AppText style={styles.podiumName} numberOfLines={2}>
                {top3[2]?.memberName}
              </AppText>
              <AppText style={styles.podiumPoints}>{formatPoints(top3[2]?.totalPoints || 0)}</AppText>
              <AppText style={styles.podiumPtsLabel}>pts</AppText>
            </Card>
            <View style={[styles.podiumBase, styles.podiumBaseThird]} />
          </View>
        </View>
      )}

      {needsLicence && standings.length > 0 && (
        <Card variant="default" style={[styles.fieldCard, { alignItems: "center", paddingVertical: 24 }]}>
          <Feather name="lock" size={24} color={colors.textTertiary} style={{ marginBottom: 8 }} />
          <AppText style={[styles.fieldTitle, { textAlign: "center", marginBottom: 4 }]}>Full leaderboard</AppText>
          <AppText variant="body" color="secondary" style={{ textAlign: "center", marginBottom: 16 }}>
            Get a licence to see the full standings and results matrix.
          </AppText>
          <PrimaryButton onPress={onUnlockFullLeaderboard} size="sm">
            Unlock full leaderboard
          </PrimaryButton>
        </Card>
      )}

      {!needsLicence && theField.length > 0 && (
        <Card variant="default" style={styles.fieldCard}>
          <AppText style={styles.fieldTitle}>The Field</AppText>
          {theField.map((entry, idx) => {
            const trend = idx % 3 === 0 ? "up" : idx % 3 === 1 ? "down" : "same";

            return (
              <View
                key={entry.memberId}
                style={[styles.fieldRow, idx === theField.length - 1 && { borderBottomWidth: 0 }]}
              >
                <AppText style={styles.fieldPosition}>{entry.rank}</AppText>

                <View style={styles.trendContainer}>
                  {trend === "up" && <Feather name="trending-up" size={12} color={colors.success} />}
                  {trend === "down" && <Feather name="trending-down" size={12} color={colors.error} />}
                  {trend === "same" && <Feather name="minus" size={12} color={colors.divider} />}
                </View>

                <AppText style={styles.fieldName} numberOfLines={2}>
                  {entry.memberName}
                </AppText>

                <AppText style={styles.fieldEvents}>{entry.eventsPlayed}</AppText>

                <AppText style={styles.fieldPoints}>{formatPoints(entry.totalPoints)}</AppText>
              </View>
            );
          })}
        </Card>
      )}

      {!needsLicence && theField.length === 0 && top3.length < 3 && (
        <Card variant="default" style={styles.fieldCard}>
          {standings.map((entry, idx) => (
            <View
              key={entry.memberId}
              style={[styles.fieldRow, idx === standings.length - 1 && { borderBottomWidth: 0 }]}
            >
              <AppText style={styles.fieldPosition}>{entry.rank}</AppText>
              <View style={styles.trendContainer}>
                <Feather name="minus" size={12} color={colors.divider} />
              </View>
              <AppText style={styles.fieldName} numberOfLines={2}>
                {entry.memberName}
              </AppText>
              <AppText style={styles.fieldEvents}>{entry.eventsPlayed}</AppText>
              <AppText style={styles.fieldPoints}>{formatPoints(entry.totalPoints)}</AppText>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
