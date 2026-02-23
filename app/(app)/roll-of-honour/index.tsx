/**
 * Roll of Honour - List OOM champions by year
 * Premium UI cards, year chips, empty states, never blank
 */

import { useCallback, useContext, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useBootstrap } from "@/lib/useBootstrap";
import { getOomChampionsBySociety, type OomChampionDoc } from "@/lib/db_supabase/oomChampionsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function RollOfHonourScreen() {
  const { society, societyId, member } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const canManage = getPermissionsForMember(member as any).canManageOomChampions;

  const [champions, setChampions] = useState<OomChampionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await getOomChampionsBySociety(societyId);
      setChampions(data);
    } catch (err: any) {
      console.error("[roll-of-honour] load error:", err);
      setError(err?.message || "Failed to load champions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) loadData();
    }, [societyId, loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const championName = (c: OomChampionDoc) =>
    c.member_display_name || c.member_name || "Champion";

  // Never blank: always show something
  if (!societyId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society Selected"
            message="Select or join a society to view the Roll of Honour."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <LoadingState message="Loading Roll of Honour..." />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={error}
            action={{ label: "Try Again", onPress: loadData }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <AppText variant="h1" style={styles.title}>
            Roll of Honour
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            {society?.name || "Society"} • OOM Champions
          </AppText>
        </View>

        {champions.length === 0 ? (
          <EmptyState
            icon={<Feather name="award" size={24} color={colors.textTertiary} />}
            title="No champions yet"
            message="Add OOM champions for each season to build your Roll of Honour."
            action={
              canManage
                ? {
                    label: "Add Champion",
                    onPress: () => router.push("/(app)/roll-of-honour/edit"),
                  }
                : undefined
            }
            style={styles.emptyCard}
          />
        ) : (
          <>
            {canManage && (
              <View style={styles.addRow}>
                <PrimaryButton
                  size="sm"
                  onPress={() => router.push("/(app)/roll-of-honour/edit")}
                >
                  Add Champion
                </PrimaryButton>
              </View>
            )}

            {/* Year chips + cards */}
            {champions.map((champ) => (
              <Pressable
                key={champ.id}
                onPress={() => router.push(`/(app)/roll-of-honour/${champ.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <AppCard style={styles.championCard} elevated>
                  <View style={styles.cardRow}>
                    <ResilientImage
                      uri={champ.photo_url}
                      style={styles.thumb}
                      placeholderSize={64}
                    />
                    <View style={styles.cardContent}>
                      <View style={styles.yearChip}>
                        <AppText variant="captionBold" style={{ color: colors.primary }}>
                          {champ.season_year}
                        </AppText>
                      </View>
                      <AppText variant="h2" numberOfLines={1}>
                        {championName(champ)}
                      </AppText>
                      {champ.points_total != null && (
                        <AppText variant="caption" color="secondary">
                          {champ.points_total} pts
                        </AppText>
                      )}
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                  </View>
                </AppCard>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 16,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 0,
  },
  addRow: {
    marginBottom: spacing.base,
  },
  emptyCard: {
    marginTop: spacing.lg,
  },
  championCard: {
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.base,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  yearChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: "rgba(11, 110, 79, 0.12)",
    marginBottom: 4,
  },
});
