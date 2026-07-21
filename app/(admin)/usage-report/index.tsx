import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { isPlatformAdmin } from "@/lib/db_supabase/adminRepo";
import {
  classifyAnalyticsEventName,
  fetchAdminProductEventsSummary,
  type AnalyticsSummary,
} from "@/lib/db_supabase/analyticsReportRepo";
import { useScreenView } from "@/lib/analytics/useScreenView";
import { getColors, spacing } from "@/lib/ui/theme";
import { goBack } from "@/lib/navigation";

const WINDOWS = [7, 30, 90] as const;

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <AppText variant="small" color="secondary">
        {label}
      </AppText>
      <AppText variant="bodyBold">{value}</AppText>
    </View>
  );
}

export default function AdminUsageReportPage() {
  const router = useRouter();
  const colors = getColors();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useScreenView("admin-usage-report", "/(admin)/usage-report");

  useEffect(() => {
    void isPlatformAdmin().then(setAllowed);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminProductEventsSummary(days);
      setSummary(data);
    } catch (e: unknown) {
      setSummary(null);
      setError(e instanceof Error ? e.message : "Could not load usage report.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (allowed !== true) return;
    void load();
  }, [allowed, load]);

  if (allowed === null) {
    return (
      <Screen>
        <LoadingState message="Checking access…" />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/more")} size="sm" style={{ alignSelf: "flex-start", marginBottom: spacing.md }}>
          Back
        </SecondaryButton>
        <InlineNotice variant="error" message="Platform administrator access is required." />
      </Screen>
    );
  }

  const screenViews = (summary?.by_event_name ?? []).filter(
    (r) => classifyAnalyticsEventName(r.event_name) === "screen_view",
  );
  const actions = (summary?.by_event_name ?? []).filter(
    (r) => classifyAnalyticsEventName(r.event_name) === "action",
  );

  return (
    <Screen scrollable={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/more")} size="sm" style={{ alignSelf: "flex-start", marginBottom: spacing.md }}>
          Back
        </SecondaryButton>
        <AppText variant="title" style={{ marginBottom: spacing.xs }}>
          Product usage report
        </AppText>
        <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
          Screen views, completed actions, and errors from product analytics — not database row counts.
        </AppText>

        <View style={styles.windowRow}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w}
              onPress={() => setDays(w)}
              style={[
                styles.windowChip,
                {
                  backgroundColor: days === w ? colors.primary : colors.backgroundSecondary,
                  borderColor: days === w ? colors.primary : colors.border,
                },
              ]}
            >
              <AppText variant="captionBold" color={days === w ? "inverse" : "default"}>
                {w}d
              </AppText>
            </Pressable>
          ))}
        </View>

        {loading ? <LoadingState message="Loading analytics…" /> : null}
        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.md }} /> : null}

        {summary && !loading ? (
          <>
            <AppCard style={styles.card}>
              <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
                Totals (last {days} days)
              </AppText>
              <MetricRow label="Analytics events recorded" value={String(summary.totals.events)} />
              <MetricRow label="Unique users" value={String(summary.totals.unique_users)} />
              <AppText variant="caption" color="muted" style={{ marginTop: spacing.sm }}>
                Since {formatWhen(summary.since)}
              </AppText>
            </AppCard>

            <AppText variant="captionBold" color="muted" style={styles.sectionLabel}>
              Screen views (navigation)
            </AppText>
            <AppCard style={styles.card}>
              {screenViews.length === 0 ? (
                <AppText variant="small" color="secondary">No screen views yet.</AppText>
              ) : (
                screenViews.map((row) => (
                  <View key={row.event_name} style={styles.tableRow}>
                    <AppText variant="bodyBold" style={{ flex: 1 }}>
                      {row.event_name}
                    </AppText>
                    <AppText variant="small" color="secondary">
                      {row.count} · {row.unique_users} users · {formatWhen(row.last_at)}
                    </AppText>
                  </View>
                ))
              )}
            </AppCard>

            <AppText variant="captionBold" color="muted" style={styles.sectionLabel}>
              Completed actions
            </AppText>
            <AppCard style={styles.card}>
              {actions.length === 0 ? (
                <AppText variant="small" color="secondary">No actions yet.</AppText>
              ) : (
                actions.map((row) => (
                  <View key={row.event_name} style={styles.tableRow}>
                    <AppText variant="bodyBold" style={{ flex: 1 }}>
                      {row.event_name}
                    </AppText>
                    <AppText variant="small" color="secondary">
                      {row.count} · {row.unique_users} users · {formatWhen(row.last_at)}
                    </AppText>
                  </View>
                ))
              )}
            </AppCard>

            <AppText variant="captionBold" color="muted" style={styles.sectionLabel}>
              Feature highlights
            </AppText>
            <AppCard style={styles.card}>
              <MetricRow
                label="Tee sheet — opened / saved / published"
                value={`${summary.tee_sheet.opened} / ${summary.tee_sheet.saved} / ${summary.tee_sheet.published}`}
              />
              <MetricRow label="Last tee sheet save" value={formatWhen(summary.tee_sheet.last_saved_at)} />
              <MetricRow label="Last tee sheet publish" value={formatWhen(summary.tee_sheet.last_published_at)} />
              <MetricRow
                label="RSVP submitted / payment marked"
                value={`${summary.rsvp_payment.rsvp_submitted} / ${summary.rsvp_payment.payment_marked}`}
              />
              <MetricRow
                label="Exports completed"
                value={`${summary.exports.count} (${summary.exports.unique_users} users)`}
              />
            </AppCard>

            <AppText variant="captionBold" color="muted" style={styles.sectionLabel}>
              Errors by screen (failed actions)
            </AppText>
            <AppCard style={styles.card}>
              {(summary.errors_by_screen ?? []).length === 0 ? (
                <AppText variant="small" color="secondary">No errors recorded.</AppText>
              ) : (
                summary.errors_by_screen.map((row) => (
                  <View key={row.screen} style={styles.tableRow}>
                    <AppText variant="bodyBold" style={{ flex: 1 }}>
                      {row.screen}
                    </AppText>
                    <AppText variant="small" color="secondary">
                      {row.count} · {formatWhen(row.last_at)}
                    </AppText>
                  </View>
                ))
              )}
            </AppCard>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  windowRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  windowChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  tableRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
});
