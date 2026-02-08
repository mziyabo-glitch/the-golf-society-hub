import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { spacing } from "@/lib/ui/theme";
import { generateTeeSheetPdf, type TeeSheetData } from "@/lib/teeSheetPdf";
import { wrapExportErrors } from "@/lib/pdf/exportContract";
import { useBootstrap } from "@/lib/useBootstrap";

type ExportStatus = "loading" | "error" | "success";

export default function TeeSheetPrintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const { societyId } = useBootstrap();
  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const payload = useMemo(() => {
    const raw = Array.isArray(params.payload) ? params.payload[0] : params.payload;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<TeeSheetData>;
      return {
        ...parsed,
        societyId: parsed.societyId ?? societyId ?? undefined,
        manCo: parsed.manCo ?? { captain: null, secretary: null, treasurer: null, handicapper: null },
      } as TeeSheetData;
    } catch (err) {
      console.warn("[tee-sheet-print] Failed to parse payload", err);
      return null;
    }
  }, [params.payload, societyId]);

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
        await generateTeeSheetPdf(payload);
        if (!mounted) return;
        setStatus("success");
        setTimeout(() => router.back(), 500);
      } catch (err: any) {
        if (!mounted) return;
        const failure = wrapExportErrors(err, "tee sheet PDF");
        setError(failure);
        setStatus("error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [payload, retryKey, router]);

  if (status === "loading") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Generating tee sheet..." />
        </View>
      </Screen>
    );
  }

  if (status === "success") {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <AppCard style={styles.noticeCard}>
            <InlineNotice variant="success" message="Tee sheet exported" />
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
            message={error?.message ?? "Couldn't export tee sheet."}
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
