import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import OOMShareCard, { type OOMShareRow } from "@/components/oom/OOMShareCard";
import OOMResultsLogShareCard, { type EventLogData } from "@/components/oom/OOMResultsLogShareCard";
import { spacing } from "@/lib/ui/theme";
import { captureAndShare } from "@/lib/share/captureAndShare";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { getOrderOfMeritTotals, getOrderOfMeritLog } from "@/lib/db_supabase/resultsRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

type ExportStatus = "loading" | "ready" | "error" | "success";

export default function OomShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ societyId?: string; view?: string }>();
  const shareRef = useRef<View>(null);

  const societyId = useMemo(() => {
    const raw = Array.isArray(params.societyId) ? params.societyId[0] : params.societyId;
    return raw || null;
  }, [params.societyId]);

  const view = params.view === "log" ? "log" : "leaderboard";

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<FormattedError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [societyName, setSocietyName] = useState("Golf Society");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [leaderboardRows, setLeaderboardRows] = useState<OOMShareRow[]>([]);
  const [logEvent, setLogEvent] = useState<EventLogData | null>(null);

  useEffect(() => {
    if (!societyId) {
      setStatus("error");
      setError({ message: "Missing society ID." });
      return;
    }

    let mounted = true;

    (async () => {
      setStatus("loading");
      setError(null);

      try {
        assertPngExportOnly("OOM export");

        const [society, totals, log] = await Promise.all([
          getSociety(societyId),
          getOrderOfMeritTotals(societyId),
          getOrderOfMeritLog(societyId),
        ]);

        if (!mounted) return;

        const name = society?.name || "Golf Society";
        setSocietyName(name);

        const eventCount = new Set(log.map((entry) => entry.eventId)).size;
        const year = new Date().getFullYear();
        setSeasonLabel(`${year} Season - ${eventCount} event${eventCount !== 1 ? "s" : ""}`);

        const rawLogoUrl = getSocietyLogoUrl(society);
        const logoDataUri = rawLogoUrl
          ? await getSocietyLogoDataUri(societyId, { logoUrl: rawLogoUrl })
          : null;
        setLogoSrc(logoDataUri);

        if (view === "leaderboard") {
          if (totals.length === 0) {
            throw new Error("No standings to share.");
          }

          const rows: OOMShareRow[] = totals.map((entry) => ({
            position: entry.rank,
            name: entry.memberName,
            points: entry.totalPoints,
            eventsPlayed: entry.eventsPlayed,
          }));
          setLeaderboardRows(rows);
          setLogEvent(null);
        } else {
          if (log.length === 0) {
            throw new Error("No results to share.");
          }

          const grouped: EventLogData[] = [];
          let currentEventId: string | null = null;
          for (const entry of log) {
            if (entry.eventId !== currentEventId) {
              grouped.push({
                eventName: entry.eventName,
                eventDate: entry.eventDate,
                format: entry.format,
                results: [],
              });
              currentEventId = entry.eventId;
            }
            grouped[grouped.length - 1].results.push({
              memberName: entry.memberName,
              dayValue: entry.dayValue,
              position: entry.position,
              points: entry.points,
            });
          }

          const latest = grouped[0];
          if (!latest) {
            throw new Error("No results to share.");
          }
          setLogEvent(latest);
          setLeaderboardRows([]);
        }

        setStatus("ready");

        // Give layout a moment before capture
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!mounted) return;

        await captureAndShare(shareRef, {
          dialogTitle: view === "log" ? "OOM Results Log" : "Order of Merit",
        });

        if (!mounted) return;
        setStatus("success");
        setTimeout(() => router.back(), 400);
      } catch (err) {
        if (!mounted) return;
        setError(formatError(err, "Couldn't generate OOM share."));
        setStatus("error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [societyId, view, retryKey, router]);

  const shouldRenderCard = status === "ready" || status === "loading";

  return (
    <Screen scrollable={false}>
      <View style={styles.centered}>
        {status === "loading" && (
          <LoadingState message="Generating OOM share..." />
        )}

        {status === "success" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Share ready" />
          </AppCard>
        )}

        {status === "error" && (
          <AppCard style={styles.noticeCard}>
            <InlineNotice
              variant="error"
              message={error?.message ?? "Couldn't generate share."}
              detail={error?.detail}
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.noticeActions}>
              <SecondaryButton onPress={() => router.back()} style={{ flex: 1 }}>
                Close
              </SecondaryButton>
              {societyId ? (
                <PrimaryButton onPress={() => setRetryKey((k) => k + 1)} style={{ flex: 1 }}>
                  Try Again
                </PrimaryButton>
              ) : null}
            </View>
          </AppCard>
        )}
      </View>

      {shouldRenderCard && (
        <View style={styles.captureRoot} pointerEvents="none">
          {view === "leaderboard" ? (
            <OOMShareCard
              ref={shareRef}
              societyName={societyName}
              seasonLabel={seasonLabel}
              rows={leaderboardRows}
              logoUrl={logoSrc}
            />
          ) : logEvent ? (
            <OOMResultsLogShareCard
              ref={shareRef}
              societyName={societyName}
              event={logEvent}
              isLatestOnly
              logoUrl={logoSrc}
            />
          ) : null}
        </View>
      )}
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
  captureRoot: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
});
