import { useCallback, useEffect, useState, useRef } from "react";
import { StyleSheet, View, Platform, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEventsBySocietyId, type EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  type OrderOfMeritEntry,
} from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function LeaderboardScreen() {
  const { society, societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [totals, eventsData] = await Promise.all([
        getOrderOfMeritTotals(societyId),
        getEventsBySocietyId(societyId),
      ]);
      setStandings(totals);
      setEvents(eventsData);
    } catch (err) {
      console.error("Failed to load leaderboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refetch on focus to pick up changes after entering points
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
  );

  // Count OOM events
  const oomEventCount = events.filter(
    (e) => e.classification === "oom" || e.isOOM === true
  ).length;

  // Generate HTML for PDF
  const generateHTML = () => {
    const societyName = society?.name || "Golf Society";
    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const rows = standings
      .map(
        (entry, index) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: ${
          index < 3 ? "bold" : "normal"
        }; color: ${index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : "#333"};">
          ${index + 1}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${entry.memberName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${entry.eventsPlayed}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #0A7C4A;">${entry.totalPoints}</td>
      </tr>
    `
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Order of Merit - ${societyName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              color: #333;
            }
            h1 {
              color: #0A7C4A;
              margin-bottom: 8px;
            }
            h2 {
              color: #666;
              font-weight: normal;
              margin-top: 0;
            }
            .date {
              color: #999;
              margin-bottom: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th {
              background: #0A7C4A;
              color: white;
              padding: 12px;
              text-align: left;
            }
            th:first-child, th:last-child {
              text-align: center;
            }
            th:nth-child(3) {
              text-align: center;
            }
            .footer {
              margin-top: 32px;
              padding-top: 16px;
              border-top: 1px solid #eee;
              color: #999;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <h1>${societyName}</h1>
          <h2>Season Leaderboard - Order of Merit</h2>
          <p class="date">${date} | ${oomEventCount} Order of Merit event${oomEventCount !== 1 ? "s" : ""}</p>

          ${
            standings.length > 0
              ? `
            <table>
              <thead>
                <tr>
                  <th style="text-align: center;">Rank</th>
                  <th>Player</th>
                  <th style="text-align: center;">Events</th>
                  <th style="text-align: right;">Points</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          `
              : `<p>No Order of Merit results yet.</p>`
          }

          <div class="footer">
            Generated by Golf Society Hub
          </div>
        </body>
      </html>
    `;
  };

  const handleShare = async () => {
    try {
      setSharing(true);

      const html = generateHTML();

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      console.log("[Leaderboard] PDF generated:", uri);

      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Order of Merit",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Sharing Unavailable",
          "Sharing is not available on this device."
        );
      }
    } catch (err: any) {
      console.error("[Leaderboard] Share error:", err);
      Alert.alert("Error", err?.message || "Failed to share leaderboard");
    } finally {
      setSharing(false);
    }
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading leaderboard..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Season Leaderboard</AppText>
          <AppText variant="caption" color="secondary">
            {oomEventCount} Order of Merit event{oomEventCount !== 1 ? "s" : ""}
          </AppText>
        </View>
        {standings.length > 0 && (
          <SecondaryButton onPress={handleShare} size="sm" disabled={sharing}>
            <Feather name="share" size={16} color={colors.text} />
            {sharing ? " Sharing..." : " Share"}
          </SecondaryButton>
        )}
      </View>

      {/* Order of Merit Section */}
      <AppText variant="h2" style={styles.sectionTitle}>
        Order of Merit
      </AppText>

      {standings.length === 0 ? (
        <EmptyState
          icon={<Feather name="award" size={24} color={colors.textTertiary} />}
          title="No Order of Merit Points Yet"
          message="Enter points for Order of Merit events to see the leaderboard. Create an event with 'Order of Merit' classification, then add players and enter their points."
        />
      ) : (
        <View style={styles.list}>
          {standings.map((entry, index) => {
            const isTop3 = index < 3;
            const medalColors = [colors.warning, "#C0C0C0", "#CD7F32"];

            return (
              <AppCard key={entry.memberId} style={styles.standingCard}>
                <View style={styles.standingRow}>
                  {/* Position */}
                  <View
                    style={[
                      styles.positionBadge,
                      {
                        backgroundColor: isTop3
                          ? medalColors[index] + "20"
                          : colors.backgroundTertiary,
                      },
                    ]}
                  >
                    {isTop3 ? (
                      <Feather
                        name="award"
                        size={16}
                        color={medalColors[index]}
                      />
                    ) : (
                      <AppText variant="captionBold" color="secondary">
                        {index + 1}
                      </AppText>
                    )}
                  </View>

                  {/* Member Info */}
                  <View style={styles.memberInfo}>
                    <AppText variant="bodyBold">{entry.memberName}</AppText>
                    <AppText variant="caption" color="secondary">
                      {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? "s" : ""}
                    </AppText>
                  </View>

                  {/* Points */}
                  <View style={styles.pointsContainer}>
                    <AppText variant="h1" color="primary">
                      {entry.totalPoints}
                    </AppText>
                    <AppText variant="small" color="tertiary">
                      pts
                    </AppText>
                  </View>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Info card */}
      <AppCard style={styles.infoCard}>
        <View style={styles.infoContent}>
          <Feather name="info" size={16} color={colors.textTertiary} />
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            Points are entered manually for each Order of Merit event. Go to an OOM event and tap "Enter Points" to add results.
          </AppText>
        </View>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  standingCard: {
    marginBottom: 0,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  pointsContainer: {
    alignItems: "center",
  },
  infoCard: {
    marginTop: spacing.sm,
  },
  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
});
