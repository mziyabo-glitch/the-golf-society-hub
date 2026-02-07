import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing, radius } from "@/lib/ui/theme";
import { formatHandicap } from "@/lib/whs";
import { captureAndShare } from "@/lib/share/captureAndShare";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

type TeeSheetPrintPlayer = {
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
};

type TeeSheetPrintGroup = {
  groupNumber: number;
  players: TeeSheetPrintPlayer[];
};

type TeeBlock = {
  par: number;
  courseRating: number;
  slopeRating: number;
};

type TeeSheetPrintPayload = {
  societyName: string;
  logoUrl: string | null;
  eventName: string;
  eventDate: string | null;
  courseName: string | null;
  startTime: string | null;
  teeTimeInterval: number;
  groups: TeeSheetPrintGroup[];
  // Extra context
  manCo?: { captain: string | null; secretary: string | null; treasurer: string | null; handicapper: string | null } | null;
  nearestPinHoles?: number[] | null;
  longestDriveHoles?: number[] | null;
  teeName?: string | null;
  ladiesTeeName?: string | null;
  teeSettings?: TeeBlock | null;
  ladiesTeeSettings?: TeeBlock | null;
  handicapAllowance?: number | null;
};

export default function TeeSheetPrintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const [layoutReady, setLayoutReady] = useState(false);
  const [shareError, setShareError] = useState<FormattedError | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [generating, setGenerating] = useState(false);
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
    Image.prefetch(payload.logoUrl)
      .then(() => setLogoReady(true))
      .catch(() => setLogoReady(true));
  }, [payload?.logoUrl]);

  const runShare = useCallback(async () => {
    if (!payload) return;
    setGenerating(true);
    setShareError(null);
    setShareSuccess(false);
    hasCaptured.current = true;

    try {
      // Small delay to ensure the logo image has rendered after prefetch
      await new Promise((r) => setTimeout(r, 400));

      await captureAndShare(scrollRef, {
        dialogTitle: "Share Tee Sheet",
      });
      setShareSuccess(true);
      setTimeout(() => {
        router.back();
      }, 500);
    } catch (err: any) {
      console.error("[tee-sheet-print] share error:", err);
      setShareError(formatError(err));
      setShareSuccess(false);
      hasCaptured.current = false;
    } finally {
      setGenerating(false);
    }
  }, [payload, router]);

  useEffect(() => {
    if (!payload || !layoutReady || !logoReady || shareError || generating || hasCaptured.current) return;
    runShare();
  }, [layoutReady, logoReady, payload, shareError, generating, runShare]);

  if (!payload) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="error"
              message="Tee sheet unavailable"
              detail="Unable to load the tee sheet for sharing."
              style={{ marginBottom: spacing.sm }}
            />
            <PrimaryButton onPress={() => router.back()}>Go Back</PrimaryButton>
          </AppCard>
        </View>
      </Screen>
    );
  }

  const formattedDate = formatEventDate(payload.eventDate);
  const manCo = payload.manCo;
  const hasNtp = payload.nearestPinHoles && payload.nearestPinHoles.length > 0;
  const hasLd = payload.longestDriveHoles && payload.longestDriveHoles.length > 0;
  const hasTeeInfo = payload.teeSettings || payload.ladiesTeeSettings;
  const allowancePct = payload.handicapAllowance != null
    ? Math.round(payload.handicapAllowance * 100)
    : null;

  return (
    <Screen scrollable={false}>
      <ScrollView
        ref={scrollRef}
        onLayout={() => setLayoutReady(true)}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: "#FFFFFF" },
        ]}
        testID="share-target"
      >
        {/* Header with logo */}
        <View style={styles.headerCenter}>
          {payload.logoUrl ? (
            <Image
              source={{ uri: payload.logoUrl }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : null}
          <AppText variant="h1" style={styles.eventTitle}>{payload.eventName}</AppText>
          <AppText variant="body" color="secondary">
            {formattedDate || ""}
            {payload.courseName ? ` | ${payload.courseName}` : ""}
          </AppText>
        </View>

        {/* ManCo roles */}
        {manCo && (manCo.captain || manCo.secretary || manCo.treasurer || manCo.handicapper) && (
          <View style={styles.manCoSection}>
            {manCo.captain ? <AppText variant="caption" color="secondary">Captain: {manCo.captain}</AppText> : null}
            {manCo.secretary ? <AppText variant="caption" color="secondary">Secretary: {manCo.secretary}</AppText> : null}
            {manCo.treasurer ? <AppText variant="caption" color="secondary">Treasurer: {manCo.treasurer}</AppText> : null}
            {manCo.handicapper ? <AppText variant="caption" color="secondary">Handicapper: {manCo.handicapper}</AppText> : null}
          </View>
        )}

        {/* Produced by branding */}
        <AppText variant="small" style={styles.producedBy}>
          Produced by The Golf Society Hub
        </AppText>

        {/* Tee Information */}
        {hasTeeInfo && (
          <AppCard style={styles.infoCard}>
            <AppText variant="bodyBold" style={{ marginBottom: 4 }}>Tee Information</AppText>
            {payload.teeSettings && (
              <AppText variant="caption" color="secondary">
                <AppText variant="caption" style={{ fontWeight: "700" }}>Male: </AppText>
                {payload.teeName || "Men's"}{"\n"}
                Par: {payload.teeSettings.par} | CR: {payload.teeSettings.courseRating} | SR: {payload.teeSettings.slopeRating}
              </AppText>
            )}
            {payload.ladiesTeeSettings && (
              <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                <AppText variant="caption" style={{ fontWeight: "700" }}>Female: </AppText>
                {payload.ladiesTeeName || "Ladies'"}{"\n"}
                Par: {payload.ladiesTeeSettings.par} | CR: {payload.ladiesTeeSettings.courseRating} | SR: {payload.ladiesTeeSettings.slopeRating}
              </AppText>
            )}
            {allowancePct != null && (
              <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                Allowance: {allowancePct}%
              </AppText>
            )}
          </AppCard>
        )}

        {/* NTP / LD */}
        {(hasNtp || hasLd) && (
          <AppCard style={styles.infoCard}>
            <AppText variant="bodyBold" style={{ marginBottom: 4 }}>Competitions</AppText>
            {hasNtp && (
              <AppText variant="caption" color="secondary">
                Nearest the Pin: Hole{payload.nearestPinHoles!.length > 1 ? "s" : ""} {payload.nearestPinHoles!.join(", ")}
              </AppText>
            )}
            {hasLd && (
              <AppText variant="caption" color="secondary">
                Longest Drive: Hole{payload.longestDriveHoles!.length > 1 ? "s" : ""} {payload.longestDriveHoles!.join(", ")}
              </AppText>
            )}
          </AppCard>
        )}

        {/* Player Groups */}
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

      {generating ? (
        <View style={styles.overlay} pointerEvents="auto">
          <AppCard style={styles.overlayCard}>
            <LoadingState message="Generating share..." />
          </AppCard>
        </View>
      ) : null}

      {shareError ? (
        <View style={styles.overlay} pointerEvents="auto">
          <AppCard style={styles.overlayCard}>
            <InlineNotice
              variant="error"
              message={shareError.message}
              detail={shareError.detail}
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => router.back()} style={{ flex: 1 }}>
                Close
              </SecondaryButton>
              <PrimaryButton onPress={runShare} style={{ flex: 1 }}>
                Try Again
              </PrimaryButton>
            </View>
          </AppCard>
        </View>
      ) : null}

      {shareSuccess ? (
        <View style={styles.overlay} pointerEvents="auto">
          <AppCard style={styles.overlayCard}>
            <InlineNotice variant="success" message="Shared" />
          </AppCard>
        </View>
      ) : null}
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
  noticeCard: {
    width: "100%",
    maxWidth: 420,
  },
  noticeActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  overlayCard: {
    width: "100%",
    maxWidth: 420,
  },
  container: {
    padding: spacing.lg,
  },
  headerCenter: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  eventTitle: {
    textAlign: "center",
    marginBottom: 2,
  },
  manCoSection: {
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  producedBy: {
    textAlign: "right",
    color: "#9CA3AF",
    fontStyle: "italic",
    marginBottom: spacing.sm,
    fontSize: 10,
  },
  infoCard: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
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
