import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing, typography } from "@/lib/ui/theme";
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
import { showAlert } from "@/lib/ui/alert";

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
  const [jointLogoSrcs, setJointLogoSrcs] = useState<{ src: string | null; name: string }[]>([]);
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
        if (__DEV__) {
          const sourceIsJoint = /^Joint:/i.test(payload.societyName || "");
          console.log("[png] joint mode decision", {
            source: "app/(share)/tee-sheet.tsx::useEffect",
            eventId: payload.eventName || null,
            uiToggleValue: null,
            event_is_joint_event: sourceIsJoint,
            linkedSocietiesCount: null,
            participantSocietiesCount: sourceIsJoint
              ? (payload.societyName?.replace(/^Joint:\s*/i, "").split("&").map((x) => x.trim()).filter(Boolean).length ?? null)
              : 1,
          });
        }

        const computedPages = buildTeeSheetPages(payload);
        if (__DEV__) {
          const flatPlayerIds = computedPages.flatMap((groups) =>
            groups.flatMap((g) => g.players.map((p) => p.id)),
          );
          const flatNames = computedPages.flatMap((groups) =>
            groups.flatMap((g) => g.players.map((p) => p.name)),
          );
          console.log("[png] snapshot source", {
            source: "app/(share)/tee-sheet.tsx::buildTeeSheetPages",
            eventId: payload.eventName || null,
            isJoint: /^Joint:/i.test(payload.societyName || ""),
            sourceUsed: payload.preGrouped ? "canonical preGrouped payload" : "computed grouping payload",
            playerIds: flatPlayerIds,
            displayNames: flatNames,
            societiesRepresented: payload.societyName ? [payload.societyName] : [],
          });
        }
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
        if ((payload.jointSocieties?.length ?? 0) > 1) {
          const logos = await Promise.all(
            (payload.jointSocieties ?? []).slice(0, 2).map(async (s) => {
              const src = await getSocietyLogoDataUri(s.societyId, { logoUrl: s.logoUrl ?? null });
              return { src: src ?? s.logoUrl ?? null, name: s.societyName };
            }),
          );
          setJointLogoSrcs(logos);
        } else {
          setJointLogoSrcs([]);
        }

        setStatus("ready");

        // Give layout a moment before capture
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!mounted) return;

        const targets: ShareTarget[] = refs.map((ref, index) => ({
          ref,
          title: `Tee Sheet ${index + 1}`,
          width: PAGE_WIDTH * 3,
          height: PAGE_HEIGHT * 3,
        }));

        const shareResult = await captureAndShareMultiple(targets, {
          dialogTitle: `Tee Sheet - ${payload.eventName || "Event"}`,
        });
        if (shareResult.completedVia === "download") {
          showAlert(
            "Download complete",
            "On iPhone Safari, automatic file sharing may be blocked. Your image has been downloaded instead.",
          );
        }

        if (!mounted) return;
        setStatus("success");
        setTimeout(() => goBack(router, "/(app)/(tabs)"), 400);
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
              <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)")} style={{ flex: 1 }}>
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
              jointLogoSrcs={jointLogoSrcs}
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
  jointLogoSrcs: { src: string | null; name: string }[];
}>(({ data, groups, pageIndex, pageCount, logoSrc, jointLogoSrcs }, ref) => {
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

  const jointMatch = data.societyName?.match(/^Joint:\s*(.+)$/i);
  const jointLine = jointMatch ? jointMatch[1].trim() : null;

  const hasCompetitions =
    (data.nearestPinHoles && data.nearestPinHoles.length > 0) ||
    (data.longestDriveHoles && data.longestDriveHoles.length > 0);

  const competitionLines = [
    data.nearestPinHoles && data.nearestPinHoles.length > 0
      ? `Nearest the Pin (NTP): Hole${data.nearestPinHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(data.nearestPinHoles)}`
      : null,
    data.longestDriveHoles && data.longestDriveHoles.length > 0
      ? `Longest Drive (LD): Hole${data.longestDriveHoles.length > 1 ? "s" : ""} ${formatHoleNumbers(data.longestDriveHoles)}`
      : null,
  ].filter(Boolean) as string[];

  const teeInfoLines = [
    data.teeSettings
      ? `Men: ${data.teeName || "White"} — Par ${data.teeSettings.par} | CR ${data.teeSettings.courseRating} | SR ${data.teeSettings.slopeRating}`
      : "Men: tee not set",
    data.ladiesTeeSettings
      ? `Ladies: ${data.ladiesTeeName || "Red"} — Par ${data.ladiesTeeSettings.par} | CR ${data.ladiesTeeSettings.courseRating} | SR ${data.ladiesTeeSettings.slopeRating}`
      : "Ladies: tee not set",
    `Allowance: ${Math.round(allowance * 100)}%`,
  ];

  return (
    <View ref={ref} style={styles.page} collapsable={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {jointLogoSrcs.length > 1 ? (
            <View style={styles.jointLogoStack}>
              {jointLogoSrcs.slice(0, 2).map((l, idx) => (
                <SocietyLogoImage
                  key={`${l.name}-${idx}`}
                  logoUrl={l.src}
                  size="small"
                  variant="hero"
                  placeholderText={getInitials(l.name)}
                />
              ))}
            </View>
          ) : (
            <SocietyLogoImage
              logoUrl={logoSrc}
              size="medium"
              variant="hero"
              placeholderText={getInitials(data.societyName)}
            />
          )}
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.eventTitle}>{data.eventName}</Text>
          <Text style={styles.eventMeta}>
            {dateStr}
            {data.courseName ? ` · ${data.courseName}` : ""}
            {formatLabel ? ` · ${formatLabel}` : ""}
          </Text>
          {jointLine ? (
            <Text style={styles.jointLine}>JOINT · {jointLine}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.teeBox}>
            {teeInfoLines.map((line) => (
              <Text key={line} style={styles.teeLine}>
                {line}
              </Text>
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
        {hasCompetitions ? (
          <View>
            {competitionLines.map((line) => (
              <Text key={line} style={styles.specialBody}>
                {line}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.specialBodyMuted}>Competition holes: not set</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
        <Text style={styles.footerTextMuted}>Page {pageIndex + 1} of {pageCount}</Text>
      </View>
    </View>
  );
});

TeeSheetPage.displayName = "TeeSheetPage";

const GroupTable = React.memo(function GroupTable({ group }: { group: GroupWithTime }) {
  return (
    <View style={styles.groupTable}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{group.teeTime}</Text>
      </View>
      <View style={styles.groupBody}>
        <View style={styles.groupHeaderRow}>
          <Text style={[styles.groupHeaderCell, styles.nameCol]}>NAME</Text>
          <Text style={[styles.groupHeaderCell, styles.hiCol]}>HI</Text>
          <Text style={[styles.groupHeaderCell, styles.phCol]}>PH</Text>
        </View>
        {Array.from({ length: 4 }).map((_, idx) => {
          const player = group.players[idx];
          const empty = !player;
          return (
            <View
              key={`${group.groupNumber}-${idx}`}
              style={[styles.groupRow, idx === 3 ? styles.groupRowLast : null]}
            >
              <Text
                style={[styles.groupCell, styles.nameCol, empty ? styles.groupCellEmpty : null]}
                numberOfLines={1}
              >
                {player?.name || "\u00A0"}
              </Text>
              <Text style={[styles.groupCell, styles.hiCol, empty ? styles.groupCellEmpty : null]}>
                {player ? formatHandicap(player.handicapIndex, 1) : "\u00A0"}
              </Text>
              <Text style={[styles.groupCell, styles.phCol, empty ? styles.groupCellEmpty : null]}>
                {player ? formatHandicap(player.playingHandicap) : "\u00A0"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

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
    const groupMap = new Map<number, { players: PlayerWithCalcs[]; teeTime?: string | null }>();
    data.players.forEach((player, idx) => {
      const groupNum = player.group ?? 1;
      const playerWithCalcs = playersWithHandicaps[idx];
      if (!groupMap.has(groupNum)) groupMap.set(groupNum, { players: [], teeTime: player.teeTime ?? null });
      const row = groupMap.get(groupNum)!;
      row.players.push(playerWithCalcs);
      if (!row.teeTime && player.teeTime) row.teeTime = player.teeTime;
    });

    groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupNumber, grouped]) => ({
        groupNumber,
        players: grouped.players,
        teeTime: grouped.teeTime ?? undefined,
      }));
  } else {
    groups = groupPlayers(playersWithHandicaps, true);
  }

  const baseStartTime = isValidTime(data.startTime) ? data.startTime! : "08:00";
  const intervalMinutes =
    Number.isFinite(data.teeTimeInterval) && data.teeTimeInterval! > 0
      ? data.teeTimeInterval!
      : 8;

  // Cap to 12 groups per page; pad to exactly 12 for consistent PNG dimensions.
  const capped = groups.slice(0, 12);
  const groupsWithTimes: GroupWithTime[] = capped.map((group, index) => ({
    ...group,
    teeTime: isValidTime(group.teeTime) ? group.teeTime : buildTeeTime(baseStartTime, intervalMinutes, index),
  }));

  while (groupsWithTimes.length < 12) {
    const idx = groupsWithTimes.length;
    groupsWithTimes.push({
      groupNumber: idx + 1,
      players: [],
      teeTime: buildTeeTime(baseStartTime, intervalMinutes, idx),
    });
  }

  return [groupsWithTimes];
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

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const PAGE_WIDTH = 900;
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    minHeight: 88,
  },
  headerLeft: {
    width: 88,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  jointLogoStack: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 15,
  },
  jointLine: {
    marginTop: 10,
    fontSize: 8,
    letterSpacing: 0.9,
    color: "#c4c4c4",
    textAlign: "center",
    fontWeight: "500",
  },
  headerRight: {
    width: 268,
    alignItems: "flex-end",
  },
  teeBox: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fafafa",
  },
  teeLine: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 14,
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  column: {
    flex: 1,
    gap: 6,
  },
  emptyColumn: {
    fontSize: typography.small.fontSize,
    color: "#6b7280",
  },
  groupTable: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#efefef",
  },
  timeColumn: {
    width: 48,
    paddingTop: 20,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: "#e2e2e2",
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  timeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  groupBody: {
    flex: 1,
    paddingLeft: 8,
  },
  groupHeaderRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
    marginBottom: 2,
  },
  groupHeaderCell: {
    fontSize: 8,
    letterSpacing: 0.85,
    color: "#4b5563",
    fontWeight: "700",
  },
  groupRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  groupRowLast: {
    borderBottomWidth: 0,
  },
  groupCell: {
    fontSize: 12,
    color: "#111827",
    lineHeight: 15,
  },
  groupCellEmpty: {
    color: "#e8e8e8",
    opacity: 0.85,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    fontWeight: "500",
  },
  hiCol: {
    width: 40,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    color: "#374151",
  },
  phCol: {
    width: 40,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    color: "#374151",
  },
  specialInfo: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    marginTop: 4,
  },
  specialBody: {
    fontSize: 9,
    color: "#6b7280",
    lineHeight: 13,
  },
  specialBodyMuted: {
    fontSize: 8,
    color: "#c4c4c4",
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    marginTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  footerTextMuted: {
    fontSize: 8,
    color: "#d1d5db",
  },
});
