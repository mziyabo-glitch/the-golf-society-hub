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
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { useBootstrap } from "@/lib/useBootstrap";
import { showAlert } from "@/lib/ui/alert";
import { buildTeeSheetPages } from "@/lib/teeSheet/buildTeeSheetPages";
import { TeeSheetPoster, type PosterGroup } from "@/lib/teeSheet/TeeSheetPoster";
import { resolveTeeSheetPosterLogos, type PosterLogo } from "@/lib/teeSheet/resolveTeeSheetPosterLogos";

type ExportStatus = "loading" | "ready" | "sharing" | "error" | "success";

type GroupWithTime = PosterGroup;

export default function TeeSheetShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const { societyId: activeSocietyId } = useBootstrap();

  const [status, setStatus] = useState<ExportStatus>("loading");
  const [error, setError] = useState<FormattedError | null>(null);

  const [pages, setPages] = useState<GroupWithTime[][]>([]);
  const [posterLogos, setPosterLogos] = useState<PosterLogo[]>([]);

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

      const logos = await resolveTeeSheetPosterLogos(payload);
      setPosterLogos(logos);

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
              detail={
                pages.length > 1
                  ? `This tee sheet spans ${pages.length} images (12 tee times per page). Tap below to share or save. On iPhone Safari this must be a tap (not automatic).`
                  : "Tap below to create a PNG you can share or save. On iPhone Safari this must be a tap (not automatic)."
              }
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
              logos={posterLogos}
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
  logos: PosterLogo[];
}>(({ data, groups, pageIndex, pageCount, logos }, ref) => (
  <TeeSheetPoster
    ref={ref}
    data={data}
    groups={groups}
    pageIndex={pageIndex}
    pageCount={pageCount}
    logos={logos}
  />
));

TeeSheetPage.displayName = "TeeSheetPage";

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
