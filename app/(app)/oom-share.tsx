/**
 * OOM Export Screen (guardrail)
 *
 * Executes deterministic HTML export (PDF) and never captures app UI.
 * Route: /(app)/oom-share?societyId=...&view=log
 */

import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";
import { exportOomPdf, exportOomResultsLogPdf } from "@/lib/pdf/oomPdf";
import { wrapExportErrors } from "@/lib/pdf/exportContract";

type ExportStatus = "loading" | "error" | "success";

export default function OomShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ societyId?: string; view?: string }>();
  const societyId = Array.isArray(params.societyId)
    ? params.societyId[0]
    : params.societyId;
  const exportMode = params.view === "log" ? "log" : "leaderboard";

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const exportLabel = useMemo(
    () => (exportMode === "log" ? "results log PDF" : "leaderboard PDF"),
    [exportMode]
  );

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
        if (exportMode === "log") {
          await exportOomResultsLogPdf(societyId);
        } else {
          await exportOomPdf(societyId);
        }
        if (!mounted) return;
        setStatus("success");
        setTimeout(() => router.back(), 500);
      } catch (err: any) {
        if (!mounted) return;
        const failure = wrapExportErrors(err, exportLabel);
        setError(failure);
        setStatus("error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [societyId, exportMode, retryKey, router, exportLabel]);

  if (status === "loading") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Generating export..." />
        </View>
      </Screen>
    );
  }

  if (status === "success") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Exported Order of Merit PDF" />
          </AppCard>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable={false}>
      <View style={styles.centered}>
        <AppCard style={styles.noticeCard}>
          <InlineNotice
            variant="error"
            message={error?.message ?? "Couldn't export Order of Merit."}
            detail={error?.detail}
            style={{ marginBottom: spacing.sm }}
          />
          <View style={styles.noticeActions}>
            <SecondaryButton onPress={() => router.back()} style={{ flex: 1 }}>
              Close
            </SecondaryButton>
            <PrimaryButton onPress={() => setRetryKey((k) => k + 1)} style={{ flex: 1 }}>
              Try Again
            </PrimaryButton>
          </View>
        </AppCard>
      </View>
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
});
