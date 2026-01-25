import { useState } from "react";
import { StyleSheet, View, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DestructiveButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { clearActiveSociety } from "@/lib/db/userRepo";
import { regenerateJoinCode } from "@/lib/db/societyRepo";
import { isCaptain } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, society, member, loading } = useBootstrap();
  const colors = getColors();

  const [leaving, setLeaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const canRegenCode = isCaptain(member as any);

  const handleLeaveSociety = () => {
    Alert.alert(
      "Leave Society",
      "Are you sure you want to leave this society? You will need to rejoin with a code or create a new society.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            if (!user?.uid) return;
            setLeaving(true);
            try {
              await clearActiveSociety(user.uid);
              router.replace("/onboarding");
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to leave society.");
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const handleRegenerateCode = () => {
    Alert.alert(
      "Regenerate Join Code",
      "This will create a new join code. The old code will no longer work. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: async () => {
            if (!society?.id) return;
            setRegenerating(true);
            try {
              const newCode = await regenerateJoinCode(society.id);
              Alert.alert("Success", `New join code: ${newCode}`);
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to regenerate code.");
            } finally {
              setRegenerating(false);
            }
          },
        },
      ]
    );
  };

  const getRoleBadges = () => {
    const roles = member?.roles || [];
    const badges: string[] = [];

    if (roles.some((r) => r.toLowerCase() === "captain")) badges.push("Captain");
    if (roles.some((r) => r.toLowerCase() === "treasurer")) badges.push("Treasurer");
    if (roles.some((r) => r.toLowerCase() === "secretary")) badges.push("Secretary");
    if (roles.some((r) => r.toLowerCase() === "handicapper")) badges.push("Handicapper");
    if (badges.length === 0) badges.push("Member");

    return badges;
  };

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading settings..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>Settings</AppText>

      {/* Your Profile */}
      <AppText variant="h2" style={styles.sectionTitle}>Your Profile</AppText>
      <AppCard>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="h1" color="primary">
              {(member?.displayName || member?.name || "?").charAt(0).toUpperCase()}
            </AppText>
          </View>
          <View style={styles.profileInfo}>
            <AppText variant="bodyBold">{member?.displayName || member?.name || "Unknown"}</AppText>
            <View style={styles.rolesRow}>
              {getRoleBadges().map((role) => (
                <View key={role} style={[styles.badge, { backgroundColor: colors.backgroundTertiary }]}>
                  <AppText variant="small" color="secondary">{role}</AppText>
                </View>
              ))}
            </View>
          </View>
        </View>
      </AppCard>

      {/* Society Info */}
      <AppText variant="h2" style={styles.sectionTitle}>Society</AppText>
      <AppCard>
        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="flag" size={18} color={colors.primary} />
          </View>
          <View style={styles.settingInfo}>
            <AppText variant="bodyBold">{society?.name || "Unknown Society"}</AppText>
            <AppText variant="caption" color="secondary">{society?.country || "No country set"}</AppText>
          </View>
        </View>

        {society?.joinCode && (
          <View style={[styles.settingRow, { marginTop: spacing.base }]}>
            <View style={[styles.settingIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="key" size={18} color={colors.primary} />
            </View>
            <View style={styles.settingInfo}>
              <AppText variant="caption" color="secondary">Join Code</AppText>
              <AppText variant="bodyBold" style={{ letterSpacing: 2 }}>{society.joinCode}</AppText>
            </View>
            {canRegenCode && (
              <SecondaryButton
                onPress={handleRegenerateCode}
                size="sm"
                loading={regenerating}
              >
                Regenerate
              </SecondaryButton>
            )}
          </View>
        )}
      </AppCard>

      {/* Quick Links */}
      <AppText variant="h2" style={styles.sectionTitle}>Quick Actions</AppText>
      <AppCard padding="sm">
        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(app)/(tabs)/members")}
        >
          <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="users" size={16} color={colors.primary} />
          </View>
          <AppText variant="body" style={{ flex: 1 }}>View Members</AppText>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(app)/(tabs)/event")}
        >
          <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="calendar" size={16} color={colors.primary} />
          </View>
          <AppText variant="body" style={{ flex: 1 }}>Manage Events</AppText>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(app)/(tabs)/leaderboard")}
        >
          <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="award" size={16} color={colors.primary} />
          </View>
          <AppText variant="body" style={{ flex: 1 }}>Order of Merit</AppText>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      </AppCard>

      {/* Danger Zone */}
      <AppText variant="h2" style={styles.sectionTitle}>Danger Zone</AppText>
      <AppCard>
        <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
          Leave this society to join a different one or create a new society. You can rejoin later with the join code.
        </AppText>
        <DestructiveButton onPress={handleLeaveSociety} loading={leaving}>
          Leave Society
        </DestructiveButton>
      </AppCard>

      {/* App Info */}
      <View style={styles.footer}>
        <AppText variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          Golf Society Hub v1.0.0
        </AppText>
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
  title: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  settingInfo: {
    flex: 1,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
