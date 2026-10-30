import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { spacing } from "@/lib/ui/theme";
import { captureAndShare } from "@/lib/share/captureAndShare";
import {
  buildEventResultsPdfPayload,
  type EventResultsPdfPayload,
} from "@/lib/pdf/eventResultsPdf";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { showAlert } from "@/lib/ui/alert";

type ExportStatus = "loading" | "ready" | "error" | "success";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const MAX_ROWS = 32;

export default function EventResultsShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string; societyId?: string }>();
  const shareRef = useRef<View>(null);

  const eventId = useMemo(() => {
    const raw = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
    return raw || null;
  }, [params.eventId]);

  const societyId = useMemo(() => {
    const raw = Array.isArray(params.societyId) ? params.societyId[0] : params.societyId;
    return raw || null;
  }, [params.societyId]);

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<FormattedError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [payload, setPayload] = useState<EventResultsPdfPayload | null>(null);

  useEffect(() => {
    if (!eventId || !societyId) {
      setStatus("error");
      setError({ message: "Missing event or society." });
      return;
    }

    let mounted = true;

    (async () => {
      setStatus("loading");
      setError(null);

      try {
        const data = await buildEventResultsPdfPayload(eventId, societyId);
        if (!mounted) return;
        if (data.results.length === 0) {
          throw new Error("No saved results to export for this society.");
        }
        setPayload(data);
        setStatus("ready");

        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!mounted) return;

        const shareResult = await captureAndShare(shareRef, {
          dialogTitle: "Event Results",
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
        });
        if (shareResult.completedVia === "download") {
          showAlert(
            "Download complete",
            "On iPhone Safari, automatic file sharing may be blocked. Your image has been downloaded instead.",
          );
        }

        if (!mounted) return;
        setStatus("success");
        setTimeout(() => goBack(router, "/(app)/(tabs)/events"), 400);
      } catch (err) {
        if (!mounted) return;
        setError(formatError(err, "Couldn't generate Event Results image."));
        setStatus("error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [eventId, societyId, retryKey, router]);

  const shouldRenderSheet = (status === "ready" || status === "loading") && payload;

  return (
    <Screen scrollable={false}>
      <View style={styles.centered}>
        {status === "loading" && <LoadingState message="Generating Event Results image..." />}
        {status === "success" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Event Results ready" />
          </AppCard>
        )}
        {status === "error" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="error"
              message={error?.message ?? "Couldn't generate Event Results image."}
              detail={error?.detail}
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} style={{ flex: 1 }}>
                Close
              </SecondaryButton>
              {eventId && societyId ? (
                <PrimaryButton onPress={() => setRetryKey((k) => k + 1)} style={{ flex: 1 }}>
                  Try Again
                </PrimaryButton>
              ) : null}
            </View>
          </AppCard>
        )}
      </View>

      {shouldRenderSheet ? (
        <View style={styles.captureRoot} pointerEvents="none">
          <EventResultsSheet ref={shareRef} payload={payload} />
        </View>
      ) : null}
    </Screen>
  );
}

const EventResultsSheet = forwardRef<View, { payload: EventResultsPdfPayload }>(({ payload }, ref) => {
  const rows = payload.results.slice(0, MAX_ROWS);
  const isStableford = payload.formatKind === "stableford";
  const rowStyle =
    rows.length >= 30 ? styles.rowDense : rows.length >= 24 ? styles.rowMid : styles.rowComfortable;

  const dateLabel = payload.eventDate
    ? new Date(payload.eventDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date TBC";

  return (
    <View ref={ref} style={styles.sheet} collapsable={false}>
      <View style={styles.header}>
        <SocietyLogoImage
          logoUrl={payload.logoUrl ?? null}
          size="medium"
          variant="default"
          placeholderText={(payload.societyName || "GS").slice(0, 2).toUpperCase()}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Event Results</Text>
          <Text style={styles.eventName} numberOfLines={1}>
            {payload.eventName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {payload.societyName} • {dateLabel} • {payload.formatLabel}
          </Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.posCol]}>Pos</Text>
          <Text style={[styles.headerCell, styles.nameCol]}>Player</Text>
          <Text style={[styles.headerCell, styles.phCol]}>PH</Text>
          {isStableford ? (
            <Text style={[styles.headerCell, styles.scoreCol]}>Stableford</Text>
          ) : (
            <>
              <Text style={[styles.headerCell, styles.scoreCol]}>Gross</Text>
              <Text style={[styles.headerCell, styles.scoreCol]}>Net</Text>
            </>
          )}
          <Text style={[styles.headerCell, styles.oomCol]}>OOM</Text>
        </View>

        {rows.map((row, idx) => (
          <View
            key={`${row.playerName}-${idx}`}
            style={[styles.tableRow, rowStyle, idx % 2 === 1 && styles.altRow]}
          >
            <Text style={[styles.cell, styles.posCol]}>{row.position ?? "-"}</Text>
            <Text style={[styles.cell, styles.nameCol]} numberOfLines={1}>
              {row.playerName}
            </Text>
            <Text style={[styles.cell, styles.phCol]}>{row.playingHandicap ?? "-"}</Text>
            {isStableford ? (
              <Text style={[styles.cell, styles.scoreCol]}>{row.stableford ?? "-"}</Text>
            ) : (
              <>
                <Text style={[styles.cell, styles.scoreCol]}>{row.gross ?? "-"}</Text>
                <Text style={[styles.cell, styles.scoreCol]}>{row.net ?? "-"}</Text>
              </>
            )}
            <Text style={[styles.cell, styles.oomCol, styles.oomValue]}>{row.oomPoints ?? "-"}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
      </View>
    </View>
  );
});

EventResultsSheet.displayName = "EventResultsSheet";

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
  sheet: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 50,
    paddingTop: 42,
    paddingBottom: 26,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingBottom: 14,
    marginBottom: 12,
  },
  title: {
    fontSize: 56,
    lineHeight: 58,
    fontWeight: "700",
    color: "#166534",
  },
  eventName: {
    fontSize: 24,
    lineHeight: 26,
    color: "#111827",
    fontWeight: "600",
    marginTop: 2,
  },
  meta: {
    fontSize: 18,
    lineHeight: 21,
    color: "#6B7280",
    marginTop: 4,
  },
  table: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  headerCell: {
    fontSize: 16,
    lineHeight: 18,
    textTransform: "uppercase",
    fontWeight: "700",
    color: "#374151",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 8,
  },
  rowComfortable: {
    minHeight: 46,
    paddingVertical: 6,
  },
  rowMid: {
    minHeight: 40,
    paddingVertical: 5,
  },
  rowDense: {
    minHeight: 36,
    paddingVertical: 4,
  },
  altRow: {
    backgroundColor: "#FAFAFA",
  },
  cell: {
    fontSize: 19,
    lineHeight: 21,
    color: "#111827",
  },
  posCol: {
    width: 68,
    textAlign: "center",
    fontWeight: "700",
  },
  nameCol: {
    flex: 1,
    paddingRight: 8,
  },
  phCol: {
    width: 72,
    textAlign: "center",
  },
  scoreCol: {
    width: 110,
    textAlign: "right",
  },
  oomCol: {
    width: 110,
    textAlign: "right",
  },
  oomValue: {
    fontWeight: "700",
  },
  footer: {
    paddingTop: 10,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    lineHeight: 16,
    color: "#9CA3AF",
  },
});
