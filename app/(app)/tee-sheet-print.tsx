import { createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { captureAndShareMultiple } from "@/lib/share/captureAndShare";
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

const PAGE_WIDTH = 1100;
const PAGE_HEIGHT = Math.round(PAGE_WIDTH / 1.414);
const GROUPS_PER_PAGE = 12;
const GROUPS_PER_COLUMN = 6;
const DEFAULT_START_TIME = "08:00";
const DEFAULT_INTERVAL = 8;

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function chunkGroups(groups: TeeSheetPrintGroup[], size: number): TeeSheetPrintGroup[][] {
  const chunks: TeeSheetPrintGroup[][] = [];
  for (let i = 0; i < groups.length; i += size) {
    chunks.push(groups.slice(i, i + size));
  }
  return chunks;
}

function parseTime(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (!value) return null;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return { hours, minutes };
}

function buildTeeTime(startTime: string | null, intervalMinutes: number, index: number): string {
  const parsedStart = parseTime(startTime);
  const base = parsedStart ?? parseTime(DEFAULT_START_TIME);
  const interval = parsedStart
    ? (Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_INTERVAL)
    : DEFAULT_INTERVAL;

  if (!base) return "";

  const baseMinutes = base.hours * 60 + base.minutes + interval * index;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;
  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
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

export default function TeeSheetPrintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const [pageLayouts, setPageLayouts] = useState<Record<number, boolean>>({});
  const [shareError, setShareError] = useState<FormattedError | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [generating, setGenerating] = useState(false);
  const hasCaptured = useRef(false);

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

  const pages = useMemo(() => {
    if (!payload) return [];
    return chunkGroups(payload.groups || [], GROUPS_PER_PAGE);
  }, [payload]);

  const pageRefs = useMemo(
    () => pages.map(() => createRef<View>()),
    [pages.length]
  );

  useEffect(() => {
    setPageLayouts({});
  }, [pages.length]);

  const allPagesReady =
    pages.length > 0 && pages.every((_, index) => pageLayouts[index]);

  // Track whether the logo has loaded (or there is no logo)
  const [logoReady, setLogoReady] = useState(!payload?.logoUrl);

  useEffect(() => {
    setLogoReady(!payload?.logoUrl);
  }, [payload?.logoUrl]);

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
    if (!payload || pages.length === 0) return;
    setGenerating(true);
    setShareError(null);
    setShareSuccess(false);
    hasCaptured.current = true;

    try {
      // Small delay to ensure the logo image has rendered after prefetch
      await new Promise((r) => setTimeout(r, 400));

      const targets = pageRefs.map((ref, index) => ({
        ref,
        title: pages.length > 1 ? `Tee Sheet - Page ${index + 1}` : "Share Tee Sheet",
        fallbackSelector: `[data-testid='tee-sheet-page-${index + 1}']`,
      }));

      await captureAndShareMultiple(targets, {
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
  }, [payload, pages.length, pageRefs, router]);

  useEffect(() => {
    if (!payload || !allPagesReady || !logoReady || shareError || generating || hasCaptured.current) return;
    runShare();
  }, [allPagesReady, logoReady, payload, shareError, generating, runShare]);

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
  const allowancePct =
    payload.handicapAllowance != null
      ? Math.round(payload.handicapAllowance * 100)
      : null;

  const hasNtp = payload.nearestPinHoles && payload.nearestPinHoles.length > 0;
  const hasLd = payload.longestDriveHoles && payload.longestDriveHoles.length > 0;
  const competitionLine = [
    hasNtp ? `NTP: ${payload.nearestPinHoles!.join(", ")}` : null,
    hasLd ? `LD: ${payload.longestDriveHoles!.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("   •   ");

  const teeInfoLines: string[] = [];
  if (payload.teeSettings) {
    teeInfoLines.push(
      `${payload.teeName || "Men's"} — Par ${payload.teeSettings.par} • CR ${payload.teeSettings.courseRating} • Slope ${payload.teeSettings.slopeRating}`
    );
  }
  if (payload.ladiesTeeSettings) {
    teeInfoLines.push(
      `${payload.ladiesTeeName || "Ladies'"} — Par ${payload.ladiesTeeSettings.par} • CR ${payload.ladiesTeeSettings.courseRating} • Slope ${payload.ladiesTeeSettings.slopeRating}`
    );
  }
  if (allowancePct != null) {
    teeInfoLines.push(`Allowance ${allowancePct}%`);
  }
  if (teeInfoLines.length === 0) {
    teeInfoLines.push("Tee details not set");
  }

  const instructions = "Please report to the starter 10 minutes before your tee time.";

  return (
    <Screen scrollable={false}>
      <ScrollView
        contentContainerStyle={styles.previewContainer}
        showsVerticalScrollIndicator={false}
      >
        {pages.map((pageGroups, pageIndex) => {
          const leftGroups = pageGroups.slice(0, GROUPS_PER_COLUMN);
          const rightGroups = pageGroups.slice(GROUPS_PER_COLUMN, GROUPS_PER_PAGE);

          return (
            <View
              key={`page-${pageIndex}`}
              ref={pageRefs[pageIndex]}
              onLayout={() =>
                setPageLayouts((prev) =>
                  prev[pageIndex] ? prev : { ...prev, [pageIndex]: true }
                )
              }
              collapsable={false}
              testID={`tee-sheet-page-${pageIndex + 1}`}
              style={styles.page}
            >
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  {payload.logoUrl ? (
                    <Image
                      source={{ uri: payload.logoUrl }}
                      style={styles.logo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.logoPlaceholder}>
                      <AppText variant="captionBold" style={styles.logoInitials}>
                        {getInitials(payload.societyName)}
                      </AppText>
                    </View>
                  )}
                  <View>
                    <AppText variant="bodyBold" style={styles.societyName}>
                      {payload.societyName}
                    </AppText>
                    <AppText variant="small" color="tertiary">
                      Tee Sheet
                    </AppText>
                  </View>
                </View>

                <View style={styles.headerCenter}>
                  <AppText variant="h2" style={styles.eventName}>
                    {payload.eventName}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {formattedDate}
                    {payload.courseName ? ` • ${payload.courseName}` : ""}
                  </AppText>
                </View>

                <View style={styles.headerRight}>
                  <View style={styles.teeInfoBox}>
                    <AppText variant="captionBold" style={styles.teeInfoTitle}>
                      Course / Tee Info
                    </AppText>
                    {teeInfoLines.map((line, idx) => (
                      <AppText key={idx} variant="small" color="secondary" style={styles.teeInfoLine}>
                        {line}
                      </AppText>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.grid}>
                <View style={styles.gridColumn}>
                  {leftGroups.map((group, index) => {
                    const globalIndex = pageIndex * GROUPS_PER_PAGE + index;
                    const teeTime = buildTeeTime(
                      payload.startTime,
                      payload.teeTimeInterval,
                      globalIndex
                    );
                    const players = group.players ?? [];
                    return (
                      <View key={`group-left-${group.groupNumber}`} style={styles.timeBlock}>
                        <View style={styles.timeHeader}>
                          <AppText variant="captionBold" style={styles.timeText}>
                            {teeTime}
                          </AppText>
                          <AppText variant="small" color="tertiary">
                            Group {globalIndex + 1}
                          </AppText>
                        </View>
                        <View style={styles.tableHeader}>
                          <AppText variant="small" color="tertiary" style={styles.nameCol}>
                            Name
                          </AppText>
                          <AppText variant="small" color="tertiary" style={styles.hiCol}>
                            HI
                          </AppText>
                          <AppText variant="small" color="tertiary" style={styles.phCol}>
                            PH
                          </AppText>
                        </View>
                        {Array.from({ length: 4 }).map((_, rowIndex) => {
                          const player = players[rowIndex];
                          return (
                            <View key={`left-${group.groupNumber}-${rowIndex}`} style={styles.tableRow}>
                              <AppText variant="small" numberOfLines={1} style={styles.nameCol}>
                                {player?.name ?? ""}
                              </AppText>
                              <AppText variant="small" color="secondary" style={styles.hiCol}>
                                {player ? formatHandicap(player.handicapIndex, 1) : ""}
                              </AppText>
                              <AppText variant="captionBold" color="primary" style={styles.phCol}>
                                {player ? formatHandicap(player.playingHandicap) : ""}
                              </AppText>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>

                <View style={styles.gridColumn}>
                  {rightGroups.map((group, index) => {
                    const globalIndex = pageIndex * GROUPS_PER_PAGE + GROUPS_PER_COLUMN + index;
                    const teeTime = buildTeeTime(
                      payload.startTime,
                      payload.teeTimeInterval,
                      globalIndex
                    );
                    const players = group.players ?? [];
                    return (
                      <View key={`group-right-${group.groupNumber}`} style={styles.timeBlock}>
                        <View style={styles.timeHeader}>
                          <AppText variant="captionBold" style={styles.timeText}>
                            {teeTime}
                          </AppText>
                          <AppText variant="small" color="tertiary">
                            Group {globalIndex + 1}
                          </AppText>
                        </View>
                        <View style={styles.tableHeader}>
                          <AppText variant="small" color="tertiary" style={styles.nameCol}>
                            Name
                          </AppText>
                          <AppText variant="small" color="tertiary" style={styles.hiCol}>
                            HI
                          </AppText>
                          <AppText variant="small" color="tertiary" style={styles.phCol}>
                            PH
                          </AppText>
                        </View>
                        {Array.from({ length: 4 }).map((_, rowIndex) => {
                          const player = players[rowIndex];
                          return (
                            <View key={`right-${group.groupNumber}-${rowIndex}`} style={styles.tableRow}>
                              <AppText variant="small" numberOfLines={1} style={styles.nameCol}>
                                {player?.name ?? ""}
                              </AppText>
                              <AppText variant="small" color="secondary" style={styles.hiCol}>
                                {player ? formatHandicap(player.handicapIndex, 1) : ""}
                              </AppText>
                              <AppText variant="captionBold" color="primary" style={styles.phCol}>
                                {player ? formatHandicap(player.playingHandicap) : ""}
                              </AppText>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.extraSection}>
                <View style={styles.extraLeft}>
                  <AppText variant="captionBold" style={styles.extraTitle}>
                    Competitions
                  </AppText>
                  <AppText variant="small" color="secondary">
                    {competitionLine || "No competition holes set"}
                  </AppText>
                </View>
                <View style={styles.extraRight}>
                  <AppText variant="captionBold" style={styles.extraTitle}>
                    Playing Instructions
                  </AppText>
                  <AppText variant="small" color="secondary">
                    {instructions}
                  </AppText>
                </View>
              </View>

              <View style={styles.footer}>
                <AppText variant="small" color="tertiary" style={styles.footerText}>
                  Produced by The Golf Society Hub
                </AppText>
                <AppText variant="small" color="tertiary">
                  Page {pageIndex + 1} of {pages.length}
                </AppText>
              </View>
            </View>
          );
        })}

        {Platform.OS !== "web" && !allPagesReady && (
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
  previewContainer: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: "#F3F4F6",
  },
  page: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: spacing.lg,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    width: 240,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  headerRight: {
    width: 320,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 8,
  },
  logoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  logoInitials: {
    color: "#0B6E4F",
  },
  societyName: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  eventName: {
    textAlign: "center",
  },
  teeInfoBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  teeInfoTitle: {
    marginBottom: 4,
  },
  teeInfoLine: {
    marginBottom: 2,
  },
  grid: {
    flexDirection: "row",
    gap: spacing.base,
    marginTop: spacing.sm,
    flex: 1,
  },
  gridColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  timeBlock: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  timeText: {
    fontSize: 12,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    minHeight: 18,
  },
  nameCol: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  hiCol: {
    width: 38,
    textAlign: "right",
  },
  phCol: {
    width: 38,
    textAlign: "right",
  },
  extraSection: {
    flexDirection: "row",
    gap: spacing.base,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: spacing.sm,
  },
  extraLeft: {
    flex: 1,
  },
  extraRight: {
    flex: 1,
  },
  extraTitle: {
    marginBottom: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: spacing.xs,
  },
  footerText: {
    fontStyle: "italic",
  },
});
