import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";
import { captureAndShareMultiple, type ShareTarget } from "@/lib/share/captureAndShare";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { getSocietyLogoDataUri } from "@/lib/societyLogo";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import {
  calcCourseHandicap,
  calcPlayingHandicap,
  formatHandicap,
  selectTeeByGender,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import {
  groupPlayers,
  formatHoleNumbers,
  type GroupedPlayer,
  type PlayerGroup,
} from "@/lib/teeSheetGrouping";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { useBootstrap } from "@/lib/useBootstrap";

type ExportStatus = "loading" | "ready" | "error" | "success";

type PlayerWithCalcs = GroupedPlayer & {
  gender: "male" | "female" | null;
  playingHandicap: number | null;
};

type GroupWithTime = PlayerGroup & { teeTime: string };

export default function TeeSheetShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const { societyId: activeSocietyId } = useBootstrap();

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<FormattedError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [pages, setPages] = useState<GroupWithTime[][]>([]);

  const pageRefs = useRef<React.RefObject<View>[]>([]);

  const payload = useMemo(() => {
    const raw = Array.isArray(params.payload) ? params.payload[0] : params.payload;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as TeeSheetData;
      return {
        ...parsed,
        societyId: parsed.societyId ?? activeSocietyId ?? undefined,
      };
    } catch (err) {
      console.warn("[tee-sheet-share] Failed to parse payload", err);
      return null;
    }
  }, [params.payload, activeSocietyId]);

  useEffect(() => {
    if (!payload) {
      setStatus("error");
      setError({ message: "Tee sheet unavailable", detail: "Missing export data." });
      return;
    }

    let mounted = true;

    (async () => {
      setStatus("loading");
      setError(null);

      try {
        assertPngExportOnly("Tee Sheet export");

        const computedPages = buildTeeSheetPages(payload);
        if (computedPages.length === 0) {
          throw new Error("No player groups to share.");
        }

        const refs = computedPages.map(
          (_, index) => pageRefs.current[index] ?? React.createRef<View>()
        );
        pageRefs.current = refs;
        setPages(computedPages);

        const logoDataUri = payload.societyId
          ? await getSocietyLogoDataUri(payload.societyId, { logoUrl: payload.logoUrl ?? null })
          : null;
        setLogoSrc(logoDataUri);

        setStatus("ready");

        // Give layout a moment before capture
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!mounted) return;

        const targets: ShareTarget[] = refs.map((ref, index) => ({
          ref,
          title: `Tee Sheet ${index + 1}`,
        }));

        await captureAndShareMultiple(targets, {
          dialogTitle: `Tee Sheet - ${payload.eventName || "Event"}`,
        });

        if (!mounted) return;
        setStatus("success");
        setTimeout(() => router.back(), 400);
      } catch (err) {
        if (!mounted) return;
        setError(formatError(err, "Couldn't generate tee sheet."));
        setStatus("error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [payload, retryKey, router]);

  const shouldRenderPages = status === "ready" || status === "loading";

  return (
    <Screen scrollable={false}>
      <View style={styles.centered}>
        {status === "loading" && (
          <LoadingState message="Generating tee sheet..." />
        )}

        {status === "success" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Tee sheet shared" />
          </AppCard>
        )}

        {status === "error" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="error"
              message={error?.message ?? "Couldn't generate tee sheet."}
              detail={error?.detail}
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => router.back()} style={{ flex: 1 }}>
                Close
              </SecondaryButton>
              {payload ? (
                <PrimaryButton onPress={() => setRetryKey((k) => k + 1)} style={{ flex: 1 }}>
                  Try Again
                </PrimaryButton>
              ) : null}
            </View>
          </AppCard>
        )}
      </View>

      {shouldRenderPages && payload ? (
        <View style={styles.captureRoot} pointerEvents="none">
          {pages.map((groups, pageIndex) => (
            <TeeSheetPage
              key={`page-${pageIndex}`}
              ref={pageRefs.current[pageIndex]}
              data={payload}
              groups={groups}
              pageIndex={pageIndex}
              pageCount={pages.length}
              logoSrc={logoSrc}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const TeeSheetPage = React.forwardRef<View, {
  data: TeeSheetData;
  groups: GroupWithTime[];
  pageIndex: number;
  pageCount: number;
  logoSrc: string | null;
}>(({ data, groups, pageIndex, pageCount, logoSrc }, ref) => {
  const leftGroups = groups.slice(0, 6);
  const rightGroups = groups.slice(6, 12);

  const allowance = data.handicapAllowance ?? DEFAULT_ALLOWANCE;
  const dateStr = data.eventDate
    ? new Date(data.eventDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Date TBC";
  const formatLabel = data.format
    ? data.format.charAt(0).toUpperCase() + data.format.slice(1).replace(/_/g, " ")
    : "";

  const hasCompetitions =
    (data.nearestPinHoles && data.nearestPinHoles.length > 0) ||
    (data.longestDriveHoles && data.longestDriveHoles.length > 0);

  const competitionsText = [
    data.nearestPinHoles && data.nearestPinHoles.length > 0
      ? `Nearest the Pin: Hole${data.nearestPinHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(data.nearestPinHoles)}`
      : null,
    data.longestDriveHoles && data.longestDriveHoles.length > 0
      ? `Longest Drive: Hole${data.longestDriveHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(data.longestDriveHoles)}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const teeInfoLines = [
    data.teeSettings
      ? `Male (${data.teeName || "Men's"}): Par ${data.teeSettings.par} | SR ${data.teeSettings.slopeRating} | CR ${data.teeSettings.courseRating}`
      : "Male: tee info not set",
    data.ladiesTeeSettings
      ? `Female (${data.ladiesTeeName || "Ladies'"}): Par ${data.ladiesTeeSettings.par} | SR ${data.ladiesTeeSettings.slopeRating} | CR ${data.ladiesTeeSettings.courseRating}`
      : "Female: tee info not set",
    `Allowance: ${Math.round(allowance * 100)}%`,
  ];

  return (
    <View ref={ref} style={styles.page} collapsable={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {logoSrc ? (
            <Image source={{ uri: logoSrc }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoInitials}>{getInitials(data.societyName)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.societyName}>{data.societyName}</Text>
            <Text style={styles.headerSubtitle}>Tee Sheet</Text>
          </View>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.eventTitle}>{data.eventName}</Text>
          <Text style={styles.eventMeta}>
            {dateStr}
            {data.courseName ? ` | ${data.courseName}` : ""}
            {formatLabel ? ` | ${formatLabel}` : ""}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.teeBox}>
            <Text style={styles.teeTitle}>Tee Information</Text>
            {teeInfoLines.map((line) => (
              <Text key={line} style={styles.teeLine}>{line}</Text>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.column}>
          {leftGroups.length > 0 ? leftGroups.map((group) => (
            <GroupTable key={`left-${group.groupNumber}`} group={group} />
          )) : (
            <Text style={styles.emptyColumn}>No groups</Text>
          )}
        </View>
        <View style={styles.column}>
          {rightGroups.length > 0 ? rightGroups.map((group) => (
            <GroupTable key={`right-${group.groupNumber}`} group={group} />
          )) : (
            <Text style={styles.emptyColumn}> </Text>
          )}
        </View>
      </View>

      <View style={styles.specialInfo}>
        <Text style={styles.specialTitle}>Special Information</Text>
        <Text style={styles.specialBody}>
          {hasCompetitions ? competitionsText : "No competition holes set."}
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
        <Text style={styles.footerText}>Page {pageIndex + 1} of {pageCount}</Text>
      </View>
    </View>
  );
});

TeeSheetPage.displayName = "TeeSheetPage";

function GroupTable({ group }: { group: GroupWithTime }) {
  return (
    <View style={styles.groupTable}>
      <View style={styles.timeCell}>
        <Text style={styles.timeText}>{group.teeTime}</Text>
      </View>
      <View style={styles.groupBody}>
        <View style={styles.groupHeaderRow}>
          <Text style={[styles.groupHeaderCell, styles.nameCol]}>Name</Text>
          <Text style={[styles.groupHeaderCell, styles.hiCol]}>HI</Text>
          <Text style={[styles.groupHeaderCell, styles.phCol]}>PH</Text>
        </View>
        {Array.from({ length: 4 }).map((_, idx) => {
          const player = group.players[idx];
          return (
            <View key={`${group.groupNumber}-${idx}`} style={styles.groupRow}>
              <Text style={[styles.groupCell, styles.nameCol]} numberOfLines={1}>
                {player?.name ?? ""}
              </Text>
              <Text style={[styles.groupCell, styles.hiCol]}>
                {formatHandicap(player?.handicapIndex ?? null, 1)}
              </Text>
              <Text style={[styles.groupCell, styles.phCol]}>
                {formatHandicap(player?.playingHandicap ?? null)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function buildTeeSheetPages(data: TeeSheetData): GroupWithTime[][] {
  const allowance = data.handicapAllowance ?? DEFAULT_ALLOWANCE;

  const playersWithHandicaps: PlayerWithCalcs[] = data.players.map((player, idx) => {
    const gender = player.gender ?? null;
    const playerTee = selectTeeByGender(gender, data.teeSettings, data.ladiesTeeSettings);
    const courseHandicap = calcCourseHandicap(player.handicapIndex, playerTee);
    const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

    return {
      id: player.id || String(idx),
      name: player.name,
      handicapIndex: player.handicapIndex ?? null,
      courseHandicap,
      playingHandicap,
      gender,
    };
  });

  let groups: PlayerGroup[];
  if (data.preGrouped) {
    const groupMap = new Map<number, PlayerWithCalcs[]>();
    data.players.forEach((player, idx) => {
      const groupNum = player.group ?? 1;
      const playerWithCalcs = playersWithHandicaps[idx];
      if (!groupMap.has(groupNum)) groupMap.set(groupNum, []);
      groupMap.get(groupNum)!.push(playerWithCalcs);
    });

    groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupNumber, groupPlayers]) => ({
        groupNumber,
        players: groupPlayers,
        teeTime: undefined,
      }));
  } else {
    groups = groupPlayers(playersWithHandicaps, true);
  }

  const baseStartTime = isValidTime(data.startTime) ? data.startTime! : "08:00";
  const intervalMinutes =
    Number.isFinite(data.teeTimeInterval) && data.teeTimeInterval! > 0
      ? data.teeTimeInterval!
      : 8;

  const groupsWithTimes: GroupWithTime[] = groups.map((group, index) => ({
    ...group,
    teeTime: buildTeeTime(baseStartTime, intervalMinutes, index),
  }));

  return chunkArray(groupsWithTimes, 12);
}

function isValidTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  return Number.isFinite(hours) && Number.isFinite(minutes);
}

function buildTeeTime(startTime: string, intervalMinutes: number, index: number): string {
  const [hoursStr, minutesStr] = startTime.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const baseMinutes = hours * 60 + minutes + intervalMinutes * index;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;
  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const PAGE_WIDTH = 1120;
const PAGE_HEIGHT = 792;

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
  captureRoot: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  page: {
    width: PAGE_WIDTH,
    minHeight: PAGE_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: 260,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  societyName: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6B7280",
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  eventMeta: {
    fontSize: 11,
    color: "#6B7280",
  },
  headerRight: {
    width: 320,
  },
  teeBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 8,
    borderRadius: 6,
  },
  teeTitle: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#6B7280",
    marginBottom: 4,
    fontWeight: "700",
  },
  teeLine: {
    fontSize: 10,
    color: "#374151",
    marginBottom: 2,
  },
  grid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  column: {
    flex: 1,
    gap: 8,
  },
  emptyColumn: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  groupTable: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  timeCell: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  timeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  groupBody: {
    flex: 1,
  },
  groupHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingVertical: 3,
  },
  groupHeaderCell: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    paddingHorizontal: 4,
  },
  groupRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  groupCell: {
    fontSize: 10,
    color: "#111827",
    paddingHorizontal: 4,
  },
  nameCol: {
    flex: 1,
  },
  hiCol: {
    width: 40,
    textAlign: "right",
    fontFamily: "monospace",
  },
  phCol: {
    width: 40,
    textAlign: "right",
    fontFamily: "monospace",
    fontWeight: "700",
    color: "#0B6E4F",
  },
  specialInfo: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 6,
    marginTop: 6,
  },
  specialTitle: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#6B7280",
    fontWeight: "700",
    marginBottom: 2,
  },
  specialBody: {
    fontSize: 10,
    color: "#374151",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 6,
    marginTop: 8,
  },
  footerText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
});
