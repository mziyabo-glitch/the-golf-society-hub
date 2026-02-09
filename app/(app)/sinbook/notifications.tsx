/**
 * Sinbook Notifications Screen
 * In-app notification feed for invites, accepts, entry changes.
 */

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  getMyNotifications,
  markAllNotificationsRead,
  type SinbookNotification,
} from "@/lib/db_supabase/sinbookRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

const ICON_MAP: Record<SinbookNotification["type"], string> = {
  invite: "mail",
  accepted: "check-circle",
  entry_added: "plus-circle",
  entry_edited: "edit",
  entry_deleted: "minus-circle",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function SinbookNotificationsScreen() {
  const router = useRouter();
  const colors = getColors();

  const [notifications, setNotifications] = useState<SinbookNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMyNotifications();
      setNotifications(data);
      // Mark all as read on open
      await markAllNotificationsRead();
    } catch (err) {
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading notifications..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <AppText variant="h2">Notifications</AppText>
        <View style={{ width: 60 }} />
      </View>

      {loadError && (
        <InlineNotice variant="error" message={loadError.message} style={{ marginBottom: spacing.sm }} />
      )}

      {notifications.length === 0 && !loadError ? (
        <EmptyState
          icon={<Feather name="bell-off" size={24} color={colors.textTertiary} />}
          title="No Notifications"
          message="You're all caught up."
        />
      ) : (
        <View>
          {notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => router.push({ pathname: "/(app)/sinbook/[id]", params: { id: n.sinbook_id } })}
            >
              <AppCard style={[styles.notifCard, !n.is_read && { borderLeftWidth: 3, borderLeftColor: colors.primary }]}>
                <View style={styles.notifRow}>
                  <View style={[styles.notifIcon, { backgroundColor: colors.primary + "12" }]}>
                    <Feather name={(ICON_MAP[n.type] || "bell") as any} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold">{n.title}</AppText>
                    {n.body && (
                      <AppText variant="caption" color="secondary" numberOfLines={2}>{n.body}</AppText>
                    )}
                    <AppText variant="small" color="tertiary" style={{ marginTop: 2 }}>
                      {timeAgo(n.created_at)}
                    </AppText>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  notifCard: { marginBottom: spacing.xs },
  notifRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
