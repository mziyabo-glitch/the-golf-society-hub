import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { SocietyLogo } from "@/components/ui/SocietyLogo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatHandicap } from "@/lib/whs";

const captureRef =
  Platform.OS !== "web" ? require("react-native-view-shot").captureRef : null;

type TeeSheetPrintPlayer = {
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
};

type TeeSheetPrintGroup = {
  groupNumber: number;
  players: TeeSheetPrintPlayer[];
};

type TeeSheetPrintPayload = {
  societyName: string;
  logoUrl: string | null;
  eventName: string;
  eventDate: string | null;
  startTime: string | null;
  teeTimeInterval: number;
  groups: TeeSheetPrintGroup[];
};

export default function TeeSheetPrintScreen() {
  const router = useRouter();
  const colors = getColors();
  const params = useLocalSearchParams<{ payload?: string }>();
  const [layoutReady, setLayoutReady] = useState(false);
  const hasCaptured = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const payload: TeeSheetPrintPayload | null = useMemo(() => {
    const raw = Array.isArray(params.payload) ? params.payload[0] : params.payload;
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as TeeSheetPrintPayload;
    } catch (err) {
      console.warn("[tee-sheet-print] Failed to parse payload", err);
      return null;
    }
  }, [params.payload]);

  // Track whether the logo has loaded (or there is no logo)
  const [logoReady, setLogoReady] = useState(!payload?.logoUrl);

  useEffect(() => {
    if (!payload?.logoUrl) {
      setLogoReady(true);
      return;
    }
    // Prefetch the logo so it's available before capture
    Image.prefetch(payload.logoUrl)
      .then(() => setLogoReady(true))
      .catch(() => setLogoReady(true)); // proceed even if prefetch fails
  }, [payload?.logoUrl]);

  useEffect(() => {
    if (!payload || !layoutReady || !logoReady || hasCaptured.current) return;
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

        // Small delay to ensure the logo image has rendered after prefetch
        await new Promise((r) => setTimeout(r, 200));

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
            dialogTitle: "Share Tee Sheet",
          });
        }
      } catch (err: any) {
        console.error("[tee-sheet-print] share error:", err);
        Alert.alert("Error", err?.message || "Failed to share tee sheet.");
      } finally {
        router.back();
      }
    };

    run();
  }, [layoutReady, logoReady, payload, router]);

  if (!payload) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <AppCard>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
              Tee sheet unavailable
            </AppText>
            <AppText variant="body" color="secondary">
              Unable to load the tee sheet for sharing.
            </AppText>
          </AppCard>
        </View>
      </Screen>
    );
  }

  const formattedDate = formatEventDate(payload.eventDate);

  return (
    <Screen scrollable={false}>
      <ScrollView
        ref={scrollRef}
        onLayout={() => setLayoutReady(true)}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={styles.header}>
          <SocietyLogo logoUrl={payload.logoUrl} size={56} />
          <View style={styles.headerText}>
            <AppText variant="h1">{payload.eventName}</AppText>
            <AppText variant="body" color="secondary">
              {payload.societyName}
              {formattedDate ? ` • ${formattedDate}` : ""}
            </AppText>
          </View>
        </View>

        <View style={styles.groups}>
          {payload.groups.map((group, index) => {
            const teeTime = buildTeeTime(
              payload.startTime,
              payload.teeTimeInterval,
              index
            );
            return (
              <AppCard key={group.groupNumber} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <AppText variant="bodyBold">Group {group.groupNumber}</AppText>
                  {teeTime && (
                    <AppText variant="caption" color="secondary">
                      {teeTime}
                    </AppText>
                  )}
                </View>
                <View style={styles.tableHeader}>
                  <AppText variant="caption" color="secondary" style={styles.nameCol}>
                    Name
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.hiCol}>
                    HI
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.phCol}>
                    PH
                  </AppText>
                </View>
                {group.players.map((player, playerIndex) => (
                  <View
                    key={`${group.groupNumber}-${playerIndex}`}
                    style={[
                      styles.tableRow,
                      playerIndex === group.players.length - 1 && styles.tableRowLast,
                    ]}
                  >
                    <AppText variant="body" numberOfLines={1} style={styles.nameCol}>
                      {player.name}
                    </AppText>
                    <AppText variant="body" color="secondary" style={styles.hiCol}>
                      {formatHandicap(player.handicapIndex, 1)}
                    </AppText>
                    <AppText variant="bodyBold" color="primary" style={styles.phCol}>
                      {formatHandicap(player.playingHandicap)}
                    </AppText>
                  </View>
                ))}
              </AppCard>
            );
          })}
        </View>

        <View style={{ height: spacing.xl }} />
        {Platform.OS !== "web" && !layoutReady && (
          <View style={styles.centered}>
            <LoadingState message="Preparing tee sheet..." />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return "";
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

function buildTeeTime(
  startTime: string | null,
  intervalMinutes: number,
  index: number
): string | null {
  if (!startTime) return null;
  const [hours, minutes] = startTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const baseMinutes = hours * 60 + minutes + intervalMinutes * index;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;
  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.base,
  },
  headerText: {
    flex: 1,
  },
  groups: {
    gap: spacing.base,
  },
  groupCard: {
    marginBottom: 0,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  nameCol: {
    flex: 1,
  },
  hiCol: {
    width: 50,
    textAlign: "right",
  },
  phCol: {
    width: 50,
    textAlign: "right",
  },
});
