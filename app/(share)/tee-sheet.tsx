import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";
import { captureAndShareMultiple, type ShareTarget } from "@/lib/share/captureAndShare";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { logShareError } from "@/lib/share/logShareError";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import {
  calcCourseHandicap,
  calcPlayingHandicap,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import {
  groupPlayers,
  type PlayerGroup,
} from "@/lib/teeSheetGrouping";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { useBootstrap } from "@/lib/useBootstrap";
import { showAlert } from "@/lib/ui/alert";
import { TeeSheetPoster, type PosterGroup, type PosterPlayer } from "@/lib/teeSheet/TeeSheetPoster";
import { resolveTeeAssignment, teeSettingsForAssignment } from "@/lib/teeSheet/teeAssignment";

type ExportStatus = "loading" | "ready" | "sharing" | "error" | "success";

type GroupWithTime = PosterGroup;

export default function TeeSheetShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const { societyId: activeSocietyId } = useBootstrap();

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<FormattedError | null>(null);

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

  const prepareExport = useCallback(async () => {
    if (!payload) {
      setStatus("error");
      setError({ message: "Tee sheet unavailable", detail: "Missing export data." });
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      assertPngExportOnly("Tee Sheet export");

      const computedPages = buildTeeSheetPages(payload);
      if (computedPages.length === 0) {
        throw new Error("No player groups to share.");
      }

      const refs = computedPages.map(
        (_, index) => pageRefs.current[index] ?? React.createRef<View>(),
      );
      pageRefs.current = refs;
      setPages(computedPages);

      setStatus("ready");
    } catch (err) {
      logShareError(err, {
        action: "export",
        screen: "tee-sheet-share",
        eventId: payload.eventName ?? null,
      });
      setError(formatError(err, "Couldn't prepare tee sheet for export."));
      setStatus("error");
    }
  }, [payload]);

  useEffect(() => {
    void prepareExport();
  }, [prepareExport]);

  const runShare = async () => {
    if (!payload || pages.length === 0) return;

    setStatus("sharing");
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

      const targets: ShareTarget[] = pageRefs.current.map((ref, index) => ({
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
          Platform.OS === "web"
            ? "On iPhone Safari, use this download or tap Share again after the file saves. If sharing was blocked, attach the downloaded PNG manually."
            : "Your tee sheet image was saved.",
        );
      }

      setStatus("success");
      setTimeout(() => goBack(router, "/(app)/(tabs)"), 600);
    } catch (err) {
      logShareError(err, {
        action: "share",
        screen: "tee-sheet-share",
        eventId: payload.eventName ?? null,
      });
      setError(formatError(err, "Couldn't export tee sheet. Try again or use Download on the next screen."));
      setStatus("error");
    }
  };

  const shouldRenderPages = status === "ready" || status === "sharing" || status === "loading";

  return (
    <Screen scrollable={false}>
      <View style={styles.centered}>
        {status === "loading" && (
          <LoadingState message="Preparing tee sheet..." />
        )}

        {status === "ready" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="info"
              message="Ready to export"
              detail="Tap below to create a PNG you can share or save. On iPhone Safari this must be a tap (not automatic)."
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)")} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={() => void runShare()} style={{ flex: 1 }}>
                Share / Download
              </PrimaryButton>
            </View>
          </AppCard>
        )}

        {status === "sharing" && (
          <LoadingState message="Generating image..." />
        )}

        {status === "success" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Tee sheet exported" />
          </AppCard>
        )}

        {status === "error" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="error"
              message={error?.message ?? "Couldn't export tee sheet."}
              detail={error?.detail}
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)")} style={{ flex: 1 }}>
                Close
              </SecondaryButton>
              {payload ? (
                <PrimaryButton onPress={() => void prepareExport()} style={{ flex: 1 }}>
                  Try Again
                </PrimaryButton>
              ) : null}
            </View>
          </AppCard>
        )}
      </View>

      {shouldRenderPages && payload ? (
        <View style={styles.captureRoot} pointerEvents="none" data-testid="share-target">
          {pages.map((groups, pageIndex) => (
            <TeeSheetPage
              key={`page-${pageIndex}`}
              ref={pageRefs.current[pageIndex]}
              data={payload}
              groups={groups}
              pageIndex={pageIndex}
              pageCount={pages.length}
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
}>(({ data, groups, pageIndex, pageCount }, ref) => (
  <TeeSheetPoster
    ref={ref}
    data={data}
    groups={groups}
    pageIndex={pageIndex}
    pageCount={pageCount}
  />
));

TeeSheetPage.displayName = "TeeSheetPage";

function buildTeeSheetPages(data: TeeSheetData): GroupWithTime[][] {
  const allowance = data.handicapAllowance ?? DEFAULT_ALLOWANCE;

  const playersWithHandicaps: PosterPlayer[] = data.players.map((player, idx) => {
    const gender = player.gender ?? null;
    const teeAssignment = resolveTeeAssignment(player);
    const playerTee = teeSettingsForAssignment(data, teeAssignment);
    const courseHandicap = calcCourseHandicap(player.handicapIndex, playerTee);
    const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

    return {
      id: player.id || String(idx),
      name: player.name,
      handicapIndex: player.handicapIndex ?? null,
      courseHandicap,
      playingHandicap: player.playingHandicapSnapshot ?? playingHandicap,
      gender,
      teeAssignment,
      manualOverride: player.manualOverride === true,
    };
  });

  let groups: PlayerGroup[];
  if (data.preGrouped) {
    const groupMap = new Map<number, { players: PosterPlayer[]; teeTime?: string | null }>();
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

  const nonEmptyGroups = groups.filter((group) => group.players.length > 0);
  const capped = nonEmptyGroups.slice(0, 12);
  const groupsWithTimes: GroupWithTime[] = capped.map((group, index) => ({
    ...group,
    teeTime: isValidTime(group.teeTime) ? group.teeTime! : buildTeeTime(baseStartTime, intervalMinutes, index),
  }));

  return groupsWithTimes.length > 0 ? [groupsWithTimes] : [];
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

const PAGE_WIDTH = 900;
const PAGE_HEIGHT = 792;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  noticeCard: {
    width: "100%",
    maxWidth: 420,
  },
  noticeActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  captureRoot: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
});
