/**
 * Order of Merit Dashboard
 * Glassmorphism design with podium, trend indicators, and accordion results log
 */

import { useCallback, useContext, useEffect, useState, useMemo } from "react";
import { View, Modal, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { OomSegmentedControl, type OomSegmentId } from "@/components/leaderboard/OomSegmentedControl";
import { LeaderboardOverviewSection } from "@/components/leaderboard/LeaderboardOverviewSection";
import { LeaderboardMatrixSection } from "@/components/leaderboard/LeaderboardMatrixSection";
import { makeLeaderboardStyles } from "@/components/leaderboard/leaderboardStyles";
import { Toast } from "@/components/ui/Toast";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getEventsBySocietyId } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  getOrderOfMeritLog,
  type OrderOfMeritEntry,
  type ResultsLogEntry,
} from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, iconSize } from "@/lib/ui/theme";
import { interaction, webFocusRingStyle, webPointerStyle } from "@/lib/ui/interaction";
import { useScaledTypography } from "@/lib/ui/fontScaleContext";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { exportOomPdf, exportOomResultsLogPdf } from "@/lib/pdf/oomPdf";
import { measureAsync, useSlowCommitLog } from "@/lib/perf/perf";


// ============================================================================
// HELPERS
// ============================================================================

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeaderboardScreen() {
  useSlowCommitLog("LeaderboardScreen", 120);
  const scaledTypography = useScaledTypography();
  const colors = getColors();
  const styles = useMemo(() => makeLeaderboardStyles(scaledTypography, colors), [scaledTypography, colors]);

  const { society, societyId, loading: bootstrapLoading } = useBootstrap();
  const { needsLicence, guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const router = useRouter();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { width: screenWidth } = useWindowDimensions();
  const logoSize = screenWidth < 600 ? 72 : 64;

  const params = useLocalSearchParams<{ view?: string }>();
  const initialSegment: OomSegmentId = params.view === "log" ? "eventPoints" : "leaderboard";

  const [activeSegment, setActiveSegment] = useState<OomSegmentId>(initialSegment);
  const [standings, setStandings] = useState<OrderOfMeritEntry[]>([]);
  const [resultsLog, setResultsLog] = useState<ResultsLogEntry[]>([]);
  // Events are fetched in loadData but only used implicitly via standings/log
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  /** In-app share format picker (Alert is unreliable on web / can leave `exporting` stuck). */
  const [shareTarget, setShareTarget] = useState<null | "leaderboard" | "matrix">(null);

  // Track which events are expanded in the accordion
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Get logo URL
  const logoUrl = getSocietyLogoUrl(society);

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const [totals, , logData] = await measureAsync("leaderboard.load", () =>
        Promise.all([
          getOrderOfMeritTotals(societyId),
          getEventsBySocietyId(societyId),
          getOrderOfMeritLog(societyId),
        ]),
      );
      setStandings(totals);
      setResultsLog(logData);
    } catch (err: any) {
      console.error("[leaderboard] Failed to load data:", err);
      setFetchError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  // Group results by event
  const groupedResultsLog = useMemo(() => {
    const groups: {
      eventId: string;
      eventName: string;
      eventDate: string | null;
      format: string | null;
      results: {
        memberId: string;
        memberName: string;
        points: number;
        dayValue: number | null;
        position: number | null;
      }[];
    }[] = [];

    let currentEventId: string | null = null;

    for (const entry of resultsLog) {
      if (entry.eventId !== currentEventId) {
        groups.push({
          eventId: entry.eventId,
          eventName: entry.eventName,
          eventDate: entry.eventDate,
          format: entry.format,
          results: [],
        });
        currentEventId = entry.eventId;
      }
      const bucket = groups[groups.length - 1].results;
      if (bucket.some((r) => r.memberId === entry.memberId)) {
        if (__DEV__) {
          console.warn("[oom-matrix-debug] skipped duplicate member row in UI group", {
            eventId: entry.eventId,
            memberId: entry.memberId,
            memberName: entry.memberName,
          });
        }
        continue;
      }
      bucket.push({
        memberId: entry.memberId,
        memberName: entry.memberName,
        points: entry.points,
        dayValue: entry.dayValue,
        position: entry.position,
      });
    }

    return groups;
  }, [resultsLog]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (params.view === "log") setActiveSegment("eventPoints");
    if (params.view === "honour") router.replace("/(app)/roll-of-honour");
  }, [params.view, router]);

  /** Drop expanded accordion state when leaving Event Points (memory + avoids stale IDs after refresh). */
  useEffect(() => {
    if (activeSegment !== "eventPoints") {
      setExpandedEvents((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [activeSegment]);

  /** Remove expansion keys for events that no longer exist after reload. */
  useEffect(() => {
    const validIds = new Set(groupedResultsLog.map((g) => g.eventId));
    setExpandedEvents((prev) => {
      let removed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else removed = true;
      }
      if (!removed && next.size === prev.size) return prev;
      return next;
    });
  }, [groupedResultsLog]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) loadData();
      setExporting(false);
    }, [societyId, loadData])
  );

  const uniqueOOMEventIds = new Set(resultsLog.map((r) => r.eventId));
  const oomEventCount = uniqueOOMEventIds.size;

  const seasonLabel = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year} Season • ${oomEventCount} event${oomEventCount !== 1 ? "s" : ""}`;
  }, [oomEventCount]);

  // Toggle event accordion expansion
  const toggleEventExpanded = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  // Format event date for display (stable for matrix memoization)
  const formatEventDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  }, []);

  const navigateToCreateOomEvent = useCallback(() => {
    router.push({
      pathname: "/(app)/(tabs)/events",
      params: { create: "1", classification: "oom" },
    });
  }, [router]);

  const handleSharePress = () => {
    if (!guardPaidAction()) return;
    if (!societyId) {
      setToast({ visible: true, message: "Missing society — try again after refresh.", type: "error" });
      return;
    }
    if (activeSegment === "leaderboard") {
      if (standings.length === 0) {
        setToast({ visible: true, message: "No standings to share yet.", type: "info" });
        return;
      }
      setShareTarget("leaderboard");
      return;
    }
    if (activeSegment === "eventPoints") {
      if (resultsLog.length === 0) {
        setToast({ visible: true, message: "No matrix results to share yet.", type: "info" });
        return;
      }
      setShareTarget("matrix");
    }
  };

  const closeShareSheet = () => {
    if (!exporting) setShareTarget(null);
  };

  const runSharePng = () => {
    if (!societyId || !shareTarget) return;
    const kind = shareTarget;
    setShareTarget(null);
    if (kind === "leaderboard") {
      router.push({ pathname: "/(share)/oom-share", params: { societyId, view: "leaderboard" } });
    } else {
      router.push({ pathname: "/(share)/oom-share", params: { societyId, view: "log" } });
    }
  };

  const runSharePdf = async () => {
    if (!societyId || !shareTarget) return;
    const kind = shareTarget;
    setShareTarget(null);
    setExporting(true);
    try {
      if (kind === "leaderboard") {
        await exportOomPdf(societyId);
      } else {
        await exportOomResultsLogPdf(societyId);
      }
    } catch (e: any) {
      setToast({
        visible: true,
        message: e?.message ?? "Couldn't create PDF. Try again.",
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  // ============================================================================
  // LOADING / ERROR / EMPTY STATES
  // ============================================================================

  if (bootstrapLoading || loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <LoadingState message="Loading standings and results matrix…" />
        </View>
      </SafeAreaView>
    );
  }

  if (fetchError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={fetchError}
            action={{ label: "Try Again", onPress: loadData }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!societyId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society Selected"
            message="Please select or join a golf society."
          />
        </View>
      </SafeAreaView>
    );
  }

  const canShare = standings.length > 0 && !needsLicence;
  const top3 = standings.slice(0, 3);
  const theField = standings.slice(3);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: spacing.md, paddingBottom: tabBarHeight + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== HEADER WITH LOGO ========== */}
        <View style={styles.headerRow}>
          <SocietyLogoImage
            logoUrl={logoUrl}
            size={logoSize}
            variant="hero"
            placeholderText={getInitials(society?.name || "GS")}
          />

          <View style={{ flex: 1 }} />

          {/* Share Button */}
          {canShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share standings or matrix"
              style={({ pressed }) => [
                styles.shareButton,
                {
                  opacity: exporting ? 0.5 : pressed ? interaction.pressOpacity : 1,
                },
                webPointerStyle(),
                webFocusRingStyle(colors.primary),
              ]}
              onPress={handleSharePress}
              disabled={exporting}
            >
              <Feather name="share" size={iconSize.md} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Header: Order of Merit 26 bold, meta 12 secondary */}
        <View style={styles.titleSection}>
          <AppText variant="title" color="default">
            Order of Merit
          </AppText>
          <AppText variant="subheading" color="secondary" style={styles.seasonText}>
            {seasonLabel}
          </AppText>
          {!needsLicence ? (
            <AppText variant="bodySmall" color="muted" style={styles.tabHint}>
              {activeSegment === "leaderboard" ? "Season standings" : "Per-event scores and OOM points"}
            </AppText>
          ) : null}
        </View>

        {/* Leaderboard | Event Points + Roll of Honour (secondary) */}
        {!needsLicence && (
          <View style={styles.oomSegmentRow}>
            <View style={styles.oomSegmentControlWrap}>
              <OomSegmentedControl selectedId={activeSegment} onSelect={setActiveSegment} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Roll of Honour"
              style={({ pressed }) => [
                styles.honourLink,
                {
                  opacity: pressed ? interaction.pressOpacity : 1,
                },
                webPointerStyle(),
                webFocusRingStyle(colors.primary),
              ]}
              onPress={() => router.push("/(app)/roll-of-honour")}
            >
              <Feather name="award" size={16} color={colors.primary} />
              <AppText variant="bodySmall" color="primary" style={{ fontWeight: "600" }}>
                Honour
              </AppText>
            </Pressable>
          </View>
        )}

        {(needsLicence || activeSegment === "leaderboard") && (
          <LeaderboardOverviewSection
            styles={styles}
            standings={standings}
            top3={top3}
            theField={theField}
            needsLicence={needsLicence}
            onCreateOomEvent={navigateToCreateOomEvent}
            onUnlockFullLeaderboard={() => setModalVisible(true)}
          />
        )}

        {!needsLicence && activeSegment === "eventPoints" && (
          <LeaderboardMatrixSection
            styles={styles}
            groupedResultsLog={groupedResultsLog}
            expandedEvents={expandedEvents}
            onToggleEventExpanded={toggleEventExpanded}
            formatEventDate={formatEventDate}
            onCreateOomEvent={navigateToCreateOomEvent}
          />
        )}

        {/* Subtle footer */}
        <View style={styles.footer}>
          <AppText variant="small" color="muted">
            The Golf Society Hub
          </AppText>
        </View>
      </ScrollView>

      <Modal
        visible={shareTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeShareSheet}
      >
        <View style={styles.shareModalRoot}>
          <Pressable
            style={styles.shareModalBackdrop}
            onPress={closeShareSheet}
            accessibilityLabel="Dismiss"
          />
          <Card variant="elevated" padding="lg" style={styles.shareModalCard}>
            <AppText variant="heading" color="default">
              {shareTarget === "matrix" ? "Share results matrix" : "Share leaderboard"}
            </AppText>
            <AppText variant="bodySmall" color="secondary" style={styles.shareModalBody}>
              {shareTarget === "matrix"
                ? "Image (PNG) shows the latest event only. PDF includes every OOM event in the matrix."
                : "Image (PNG) works well for WhatsApp and social. PDF is best for printing and email."}
            </AppText>
            <View style={styles.shareModalActions}>
              <PrimaryButton onPress={runSharePng} disabled={exporting} size="md">
                Image (PNG)
              </PrimaryButton>
              <PrimaryButton onPress={runSharePdf} disabled={exporting} size="md">
                PDF
              </PrimaryButton>
              <SecondaryButton onPress={closeShareSheet} disabled={exporting} size="md">
                Cancel
              </SecondaryButton>
            </View>
          </Card>
        </View>
      </Modal>

      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
    </SafeAreaView>
  );
}
