import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, InteractionManager, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Sharing from "expo-sharing";

import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { SocietyLogo } from "@/components/ui/SocietyLogo";
import { radius, spacing } from "@/lib/ui/theme";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import {
  getOrderOfMeritTotals,
  getOrderOfMeritLog,
  type OrderOfMeritEntry,
  type ResultsLogEntry,
} from "@/lib/db_supabase/resultsRepo";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

type PrintView = "leaderboard" | "resultsLog";

export default function OOMPrintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    societyId?: string;
    view?: PrintView;
    auto?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [societyName, setSocietyName] = useState("Golf Society");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hasCaptured = useRef(false);
  const printRef = useRef<View | null>(null);

  const societyId = Array.isArray(params.societyId)
    ? params.societyId[0]
    : params.societyId;
  const view: PrintView = params.view === "resultsLog" ? "resultsLog" : "leaderboard";
  const auto = (Array.isArray(params.auto) ? params.auto[0] : params.auto) === "1";

  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    const eventCount = new Set(resultsLog.map((r) => r.eventId)).size;
    return `${year} Season • ${eventCount} event${eventCount !== 1 ? "s" : ""}`;
  }, [resultsLog]);

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.rank - b.rank;
    });
  }, [standings]);

  const groupedResults = useMemo(() => {
    const groups: Array<{
      eventId: string;
      eventName: string;
      eventDate: string | null;
      format: string | null;
      results: Array<{
        memberName: string;
        points: number;
        dayValue: number | null;
        position: number | null;
      }>;
    }> = [];

    let currentEventId: string | null = null;
    for (const entry of resultsLog) {
      if (entry.eventId !== currentEventId) {
        groups.push({
          eventId: entry.eventId,
          eventName: entry.eventName,
          eventDate: entry.eventDate,
          format: entry.format,
          results: [],
        });
        currentEventId = entry.eventId;
      }

      groups[groups.length - 1].results.push({
        memberName: entry.memberName,
        points: entry.points,
        dayValue: entry.dayValue,
        position: entry.position,
      });
    }

    return groups;
  }, [resultsLog]);

  const latestEvent = groupedResults[0];

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [society, totals, logData] = await Promise.all([
        getSociety(societyId),
        getOrderOfMeritTotals(societyId),
        getOrderOfMeritLog(societyId),
      ]);
      setSocietyName(society?.name || "Golf Society");
      setLogoUrl((society as any)?.logo_url || (society as any)?.logoUrl || null);
      setStandings(totals);
      setResultsLog(logData);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to load Order of Merit.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    if (!auto || !isFocused || !layoutReady || loading || hasCaptured.current) return;
    if (!printRef.current) return;

    hasCaptured.current = true;

    const run = () => {
      requestAnimationFrame(async () => {
        try {
          if (Platform.OS === "web") {
            if (typeof window !== "undefined" && typeof window.print === "function") {
              const handleAfterPrint = () => {
                window.removeEventListener("afterprint", handleAfterPrint);
                router.back();
              };
              window.addEventListener("afterprint", handleAfterPrint);
              window.print();
              return;
            }
            router.back();
            return;
          }

          if (!captureRef || !printRef.current) {
            throw new Error("Print view not ready.");
          }

          const uri = await captureRef(printRef.current, {
            format: "png",
            quality: 1,
            result: "tmpfile",
          });

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(uri, {
              mimeType: "image/png",
              dialogTitle: "Share Order of Merit",
            });
          }
        } catch (err: any) {
          Alert.alert("Error", err?.message || "Failed to export Order of Merit.");
        } finally {
          router.back();
        }
      });
    };

    InteractionManager.runAfterInteractions(run);
  }, [auto, isFocused, layoutReady, loading, router]);

  if (loading) {
    return (
      <View style={[styles.page, { backgroundColor: "#FFFFFF" }]}>
        <View style={styles.centered}>
          <LoadingState message="Preparing document..." />
        </View>
      </View>
    );
  }

  if (!societyId) {
    return (
      <View style={[styles.page, { backgroundColor: "#FFFFFF" }]}>
        <View style={styles.centered}>
          <AppText variant="body" color="secondary">
            Missing society information.
          </AppText>
        </View>
      </View>
    );
  }

  const topThree = sortedStandings.slice(0, 3);

  return (
    <ScrollView
      onLayout={() => setLayoutReady(true)}
      contentContainerStyle={[styles.page, { backgroundColor: "#FFFFFF" }]}
      showsVerticalScrollIndicator={false}
    >
      <View ref={printRef} collapsable={false} style={styles.a4Container}>
        <View style={styles.header}>
          <SocietyLogo logoUrl={logoUrl} size={56} />
          <View style={styles.headerText}>
            <AppText variant="h1">
              {view === "resultsLog" ? "Order of Merit Results" : "Order of Merit"}
            </AppText>
            <AppText variant="body" color="secondary">
              {societyName}
            </AppText>
            <AppText variant="caption" color="tertiary">
              {seasonLabel}
            </AppText>
          </View>
        </View>

        {view === "leaderboard" && topThree.length > 0 && (
          <View style={styles.podiumRow}>
            {topThree.map((entry, index) => (
              <View key={`${entry.memberName}-${index}`} style={styles.podiumBlock}>
                <AppText variant="caption" color="tertiary" style={styles.podiumRank}>
                  #{index + 1}
                </AppText>
                <AppText variant="bodyBold" numberOfLines={1}>
                  {entry.memberName}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {formatPoints(entry.totalPoints)} pts
                </AppText>
              </View>
            ))}
          </View>
        )}

        {view === "leaderboard" ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <AppText variant="caption" color="secondary" style={styles.colPos}>
                Position
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colPlayer}>
                Player
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colEvents}>
                Events Played
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colPoints}>
                Total Points
              </AppText>
            </View>
            {sortedStandings.map((entry, index) => (
              <View
                key={`${entry.memberName}-${index}`}
                style={[
                  styles.tableRow,
                  index === sortedStandings.length - 1 && styles.tableRowLast,
                ]}
              >
                <AppText variant="body" style={styles.colPos}>
                  {entry.rank ?? index + 1}
                </AppText>
                <AppText variant="body" numberOfLines={1} style={styles.colPlayer}>
                  {entry.memberName}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.colEvents}>
                  {entry.eventsPlayed}
                </AppText>
                <AppText variant="bodyBold" style={styles.colPoints}>
                  {formatPoints(entry.totalPoints)}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.table}>
            <View style={styles.resultsHeader}>
              <AppText variant="bodyBold">{latestEvent?.eventName || "Event Results"}</AppText>
              {latestEvent?.eventDate && (
                <AppText variant="caption" color="secondary">
                  {formatEventDate(latestEvent.eventDate)}
                </AppText>
              )}
            </View>
            <View style={styles.tableHeader}>
              <AppText variant="caption" color="secondary" style={styles.colPos}>
                Position
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colPlayer}>
                Player
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colEvents}>
                Score
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.colPoints}>
                OOM Points
              </AppText>
            </View>
            {(latestEvent?.results || []).map((entry, index) => (
              <View
                key={`${entry.memberName}-${index}`}
                style={[
                  styles.tableRow,
                  index === (latestEvent?.results?.length || 0) - 1 && styles.tableRowLast,
                ]}
              >
                <AppText variant="body" style={styles.colPos}>
                  {entry.position ?? "–"}
                </AppText>
                <AppText variant="body" numberOfLines={1} style={styles.colPlayer}>
                  {entry.memberName}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.colEvents}>
                  {entry.dayValue ?? "–"}
                </AppText>
                <AppText variant="bodyBold" style={styles.colPoints}>
                  {formatPoints(entry.points)}
                </AppText>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <AppText variant="caption" color="tertiary">
            Produced by The Golf Society Hub
          </AppText>
        </View>
      </View>
    </ScrollView>
  );
}

function formatPoints(points: number): string {
  if (points === Math.floor(points)) return points.toString();
  return points.toFixed(1);
}

function formatEventDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  page: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  a4Container: {
    width: "100%",
    maxWidth: 794,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.base,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerText: {
    flex: 1,
  },
  podiumRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.base,
  },
  podiumBlock: {
    flex: 1,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
    backgroundColor: "#F9FAFB",
  },
  podiumRank: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  resultsHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.xs,
  },
  table: {
    marginTop: spacing.base,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  colPos: {
    width: 70,
  },
  colPlayer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  colEvents: {
    width: 110,
    textAlign: "right",
  },
  colPoints: {
    width: 110,
    textAlign: "right",
  },
  footer: {
    marginTop: spacing.lg,
    alignItems: "center",
  },
});
