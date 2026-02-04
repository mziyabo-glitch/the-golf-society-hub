import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SocietyLogo } from "@/components/ui/SocietyLogo";
import { LoadingState } from "@/components/ui/LoadingState";
import { spacing, radius } from "@/lib/ui/theme";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

type OOMPrintEntry = {
  rank?: number | null;
  memberName: string;
  eventsPlayed: number;
  totalPoints: number;
};

type OOMPrintPayload = {
  societyName: string;
  logoUrl: string | null;
  seasonLabel: string;
  entries: OOMPrintEntry[];
};

export default function OOMPrintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const [layoutReady, setLayoutReady] = useState(false);
  const hasCaptured = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const payload: OOMPrintPayload | null = useMemo(() => {
    const raw = Array.isArray(params.payload) ? params.payload[0] : params.payload;
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as OOMPrintPayload;
    } catch (err) {
      console.warn("[oom-print] Failed to parse payload", err);
      return null;
    }
  }, [params.payload]);

  const sortedEntries = useMemo(() => {
    if (!payload) return [];
    return [...payload.entries].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      const rankA = a.rank ?? 0;
      const rankB = b.rank ?? 0;
      return rankA - rankB;
    });
  }, [payload]);

  useEffect(() => {
    if (!payload || !layoutReady || hasCaptured.current) return;
    hasCaptured.current = true;

    const run = async () => {
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

        if (!scrollRef.current || !captureRef) {
          throw new Error("Share view not ready.");
        }

        const uri = await captureRef(scrollRef, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          snapshotContentContainer: true,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share Order of Merit",
          });
        }
      } catch (err: any) {
        console.error("[oom-print] share error:", err);
        Alert.alert("Error", err?.message || "Failed to share Order of Merit.");
      } finally {
        router.back();
      }
    };

    run();
  }, [layoutReady, payload, router]);

  if (!payload) {
    return (
      <Screen scrollable={false}>
        <View style={[styles.centered, { backgroundColor: "#FFFFFF" }]}>
          <AppText variant="body" color="secondary">
            Unable to load the Order of Merit for sharing.
          </AppText>
        </View>
      </Screen>
    );
  }

  const topThree = sortedEntries.slice(0, 3);

  return (
    <Screen scrollable={false}>
      <ScrollView
        ref={scrollRef}
        onLayout={() => setLayoutReady(true)}
        contentContainerStyle={[styles.page, { backgroundColor: "#FFFFFF" }]}
      >
        <View style={styles.a4Container}>
          <View style={styles.header}>
            <SocietyLogo logoUrl={payload.logoUrl} size={56} />
            <View style={styles.headerText}>
              <AppText variant="h1">Order of Merit</AppText>
              <AppText variant="body" color="secondary">
                {payload.societyName}
              </AppText>
              <AppText variant="caption" color="tertiary">
                {payload.seasonLabel}
              </AppText>
            </View>
          </View>

          {topThree.length > 0 && (
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
            {sortedEntries.map((entry, index) => (
              <View
                key={`${entry.memberName}-${index}`}
                style={[
                  styles.tableRow,
                  index === sortedEntries.length - 1 && styles.tableRowLast,
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

          <View style={styles.footer}>
            <AppText variant="caption" color="tertiary">
              Produced by The Golf Society Hub
            </AppText>
          </View>
        </View>

        {Platform.OS !== "web" && !layoutReady && (
          <View style={styles.centered}>
            <LoadingState message="Preparing share..." />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function formatPoints(points: number): string {
  if (points === Math.floor(points)) return points.toString();
  return points.toFixed(1);
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  page: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
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
