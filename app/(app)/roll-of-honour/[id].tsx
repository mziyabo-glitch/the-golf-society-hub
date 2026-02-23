/**
 * Roll of Honour - Champion detail view
 * Resilient image loading, never blank
 */

import { StyleSheet, View, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useCallback, useContext, useState } from "react";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getOomChampionById,
  deleteOomChampion,
  type OomChampionDoc,
} from "@/lib/db_supabase/oomChampionsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing } from "@/lib/ui/theme";
import { confirmDestructive } from "@/lib/ui/alert";

export default function ChampionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const canManage = getPermissionsForMember(member as any).canManageOomChampions;

  const [champion, setChampion] = useState<OomChampionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await getOomChampionById(id);
      setChampion(data);
    } catch (err: any) {
      console.error("[roll-of-honour] detail load error:", err);
      setError(err?.message || "Failed to load champion");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const championName = champion
    ? champion.member_display_name || champion.member_name || "Champion"
    : "";

  const handleDelete = async () => {
    if (!champion || !canManage) return;
    const ok = await confirmDestructive(
      "Delete Champion",
      `Remove ${championName} (${champion.season_year}) from the Roll of Honour?`
    );
    if (!ok) return;
    try {
      await deleteOomChampion(champion.id);
      router.back();
    } catch (err: any) {
      setError(err?.message || "Failed to delete");
    }
  };

  if (!id) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Invalid Champion"
          message="This champion could not be found."
        />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <LoadingState message="Loading..." />
        </View>
      </Screen>
    );
  }

  if (error && !champion) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Failed to Load"
          message={error}
          action={{ label: "Try Again", onPress: loadData }}
        />
      </Screen>
    );
  }

  if (!champion) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="user-x" size={24} color={colors.textTertiary} />}
          title="Champion Not Found"
          message="This champion may have been removed."
          action={{ label: "Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {canManage && (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(app)/roll-of-honour/edit",
                  params: { id: champion.id },
                })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name="edit-2" size={20} color={colors.primary} />
            </Pressable>
          )}
        </View>

        <AppCard style={styles.photoCard}>
          <ResilientImage
            uri={champion.photo_url}
            style={styles.photo}
            placeholderSize={160}
            aspectRatio={1}
          />
        </AppCard>

        <View style={styles.yearBadge}>
          <AppText variant="h2" style={{ color: colors.primary }}>
            {champion.season_year} Champion
          </AppText>
        </View>

        <AppCard>
          <AppText variant="h2" style={styles.name}>
            {championName}
          </AppText>
          {champion.points_total != null && (
            <AppText variant="body" color="secondary" style={styles.points}>
              {champion.points_total} points
            </AppText>
          )}
          {champion.bio && champion.bio.trim() && (
            <AppText variant="body" style={styles.bio}>
              {champion.bio}
            </AppText>
          )}
        </AppCard>

        {canManage && (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="trash-2" size={18} color={colors.error} />
            <AppText variant="caption" style={{ color: colors.error, marginLeft: 8 }}>
              Remove from Roll of Honour
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  },
  photoCard: {
    alignItems: "center",
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  photo: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  yearBadge: {
    marginBottom: spacing.base,
  },
  name: {
    marginBottom: 4,
  },
  points: {
    marginBottom: spacing.md,
  },
  bio: {
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.base,
    marginTop: spacing.lg,
  },
});
