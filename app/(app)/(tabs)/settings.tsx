import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable, Image, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DestructiveButton, SecondaryButton, PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { clearActiveSociety } from "@/lib/db_supabase/profileRepo";
import { regenerateJoinCode, uploadSocietyLogo, removeSocietyLogo, resetSocietyData } from "@/lib/db_supabase/societyRepo";
import { isCaptain, getPermissionsForMember } from "@/lib/rbac";
import {
  getSocietyLogoUrl,
  getSocietyLogoDataUri,
  getSocietyLogoDiagnostics,
  logSocietyLogoDiagnostics,
  type LogoDiagnostics,
} from "@/lib/societyLogo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, society, member, loading, refresh } = useBootstrap();
  const colors = getColors();

  const [leaving, setLeaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoDiagnostics, setLogoDiagnostics] = useState<LogoDiagnostics | null>(null);
  const [logoDiagnosticsLoading, setLogoDiagnosticsLoading] = useState(false);
  const [logoDiagnosticsError, setLogoDiagnosticsError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(member as any);
  const canRegenCode = isCaptain(member as any);
  const canManageLogo = permissions.canManageSocietyLogo;

  useEffect(() => {
    if (!society?.id) return;
    setLogoDiagnostics(getSocietyLogoDiagnostics(society.id));
  }, [society?.id]);

  const handleLeaveSociety = () => {
    confirmDestructive(
      "Leave Society",
      "Are you sure you want to leave this society? You will need to rejoin with a code or create a new society.",
      "Leave",
      async () => {
        if (!user?.uid) return;
        setLeaving(true);
        try {
          await clearActiveSociety(user.uid);
          router.replace("/onboarding");
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to leave society.");
          setLeaving(false);
        }
      },
    );
  };

  const handleResetSociety = () => {
    if (resetting || !society?.id) return;
    confirmDestructive(
      "Reset Society?",
      "This will permanently delete all members, events, results, and finance entries. The society itself and your account will remain. This cannot be undone.",
      "Reset",
      async () => {
        setResetting(true);
        try {
          await resetSocietyData(society.id);
          showAlert("Done", "Society data has been reset.");
          refresh();
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to reset society.");
        } finally {
          setResetting(false);
        }
      },
    );
  };

  const handleRegenerateCode = () => {
    confirmDestructive(
      "Regenerate Join Code",
      "This will create a new join code. The old code will no longer work. Continue?",
      "Regenerate",
      async () => {
        if (!society?.id) return;
        setRegenerating(true);
        try {
          const newCode = await regenerateJoinCode(society.id);
          showAlert("Success", `New join code: ${newCode}`);
          refresh();
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to regenerate code.");
        } finally {
          setRegenerating(false);
        }
      },
    );
  };

  const handleUploadLogo = async () => {
    if (!society?.id) return;

    try {
      // Request permission on native
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          showAlert("Permission Required", "Please allow access to your photo library to upload a logo.");
          return;
        }
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      // Validate file size (2MB max)
      if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
        showAlert("File Too Large", "Logo must be smaller than 2MB. Please choose a smaller image.");
        return;
      }

      setUploadingLogo(true);

      const uploadResult = await uploadSocietyLogo(society.id, {
        uri: asset.uri,
        type: asset.mimeType || "image/jpeg",
        size: asset.fileSize,
        name: asset.fileName || "logo.jpg",
      });

      if (!uploadResult.success) {
        showAlert("Upload Failed", uploadResult.error || "Failed to upload logo.");
        return;
      }

      showAlert("Success", "Society logo updated successfully.");
      setLogoDiagnostics(null);
      setLogoDiagnosticsError(null);
      refresh();

    } catch (e: any) {
      console.error("[Settings] handleUploadLogo error:", e);
      showAlert("Error", e?.message || "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    if (!society?.id) return;

    confirmDestructive("Remove Logo", "Are you sure you want to remove the society logo?", "Remove", async () => {
      setRemovingLogo(true);
      try {
        const result = await removeSocietyLogo(society.id);
        if (!result.success) {
          showAlert("Error", result.error || "Failed to remove logo.");
          return;
        }
        showAlert("Success", "Logo removed.");
        setLogoDiagnostics(null);
        setLogoDiagnosticsError(null);
        refresh();
      } catch (e: any) {
        showAlert("Error", e?.message || "Failed to remove logo.");
      } finally {
        setRemovingLogo(false);
      }
    });
  };

  const handleRunLogoDiagnostics = async () => {
    if (!society?.id) return;
    setLogoDiagnosticsLoading(true);
    setLogoDiagnosticsError(null);
    try {
      const logoUrl = getSocietyLogoUrl(society);
      await getSocietyLogoDataUri(society.id, { logoUrl, forceRefresh: true });
      const diagnostics = getSocietyLogoDiagnostics(society.id);
      setLogoDiagnostics(diagnostics);
      logSocietyLogoDiagnostics(society.id);
    } catch (e: any) {
      setLogoDiagnosticsError(e?.message || "Failed to run logo diagnostics.");
    } finally {
      setLogoDiagnosticsLoading(false);
    }
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

  // Personal Mode — no society
  if (!society) {
    return (
      <Screen>
        <AppText variant="title" style={styles.title}>Settings</AppText>

        <AppText variant="h2" style={styles.sectionTitle}>Account</AppText>
        <AppCard>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={24} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <AppText variant="bodyBold">Individual</AppText>
              <AppText variant="caption" color="secondary">Personal Mode</AppText>
            </View>
          </View>
        </AppCard>

        <AppText variant="h2" style={styles.sectionTitle}>Society</AppText>
        <AppCard padding="sm">
          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/onboarding")}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="users" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="body">Join a Society</AppText>
              <AppText variant="small" color="secondary">Enter a join code from your Captain</AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/onboarding")}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="plus-circle" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="body">Create a Society</AppText>
              <AppText variant="small" color="secondary">Start a new society and invite friends</AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
        </AppCard>

        <View style={styles.footer}>
          <AppText variant="caption" color="tertiary" style={{ textAlign: "center" }}>
            Golf Society Hub v1.0.0
          </AppText>
        </View>
      </Screen>
    );
  }

  // Get logo URL from society (single source of truth)
  const logoUrl = getSocietyLogoUrl(society);

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

      {/* Society Logo - Captain/Secretary only */}
      {canManageLogo && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>Society Logo</AppText>
          <AppCard>
            <View style={styles.logoSection}>
              {/* Logo Preview */}
              <View style={styles.logoPreviewContainer}>
                {logoUrl ? (
                  <Image
                    source={{ uri: logoUrl }}
                    style={styles.logoPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.logoPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
                    <Feather name="image" size={32} color={colors.textTertiary} />
                    <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                      No logo
                    </AppText>
                  </View>
                )}
              </View>

              {/* Logo Actions */}
              <View style={styles.logoActions}>
                <PrimaryButton
                  onPress={handleUploadLogo}
                  size="sm"
                  loading={uploadingLogo}
                  disabled={uploadingLogo || removingLogo}
                >
                  <Feather name="upload" size={14} color={colors.textInverse} />
                  {" "}
                  {logoUrl ? "Change Logo" : "Upload Logo"}
                </PrimaryButton>

                {logoUrl && (
                  <SecondaryButton
                    onPress={handleRemoveLogo}
                    size="sm"
                    loading={removingLogo}
                    disabled={uploadingLogo || removingLogo}
                  >
                    <Feather name="trash-2" size={14} color={colors.error} />
                    {" Remove"}
                  </SecondaryButton>
                )}
              </View>

              <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
                Recommended: Square image, max 2MB (JPEG, PNG, GIF, WebP)
              </AppText>

              <View style={styles.logoDiagnostics}>
                <View style={styles.logoDiagnosticsHeader}>
                  <AppText variant="caption" color="secondary">Logo diagnostics</AppText>
                  <SecondaryButton
                    size="sm"
                    onPress={handleRunLogoDiagnostics}
                    loading={logoDiagnosticsLoading}
                    disabled={logoDiagnosticsLoading}
                  >
                    Run check
                  </SecondaryButton>
                </View>

                {logoDiagnosticsError ? (
                  <InlineNotice
                    variant="error"
                    message={logoDiagnosticsError}
                    style={{ marginTop: spacing.xs }}
                  />
                ) : null}

                {logoDiagnostics ? (
                  <View style={styles.logoDiagnosticsBody}>
                    <AppText variant="small" color="secondary">
                      Status: {logoDiagnostics.status} ({logoDiagnostics.source})
                    </AppText>
                    <AppText variant="small" color="secondary">
                      Logo URL: {truncateText(logoDiagnostics.logoUrl || "None", 48)}
                    </AppText>
                    {logoDiagnostics.dataUriBytes ? (
                      <AppText variant="small" color="secondary">
                        Data URI: {formatBytes(logoDiagnostics.dataUriBytes)}
                      </AppText>
                    ) : null}
                    {logoDiagnostics.bucket ? (
                      <AppText variant="small" color="secondary">
                        Bucket: {logoDiagnostics.bucket}
                      </AppText>
                    ) : null}
                    {logoDiagnostics.path ? (
                      <AppText variant="small" color="secondary">
                        Path: {truncateText(logoDiagnostics.path, 48)}
                      </AppText>
                    ) : null}
                    {logoDiagnostics.error ? (
                      <AppText variant="small" style={{ color: colors.error }}>
                        Error: {logoDiagnostics.error}
                      </AppText>
                    ) : null}
                  </View>
                ) : (
                  <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
                    No diagnostics yet.
                  </AppText>
                )}
              </View>
            </View>
          </AppCard>
        </>
      )}

      {/* Billing & Licences - Captain only */}
      {canRegenCode && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>Billing</AppText>
          <AppCard padding="sm">
            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(app)/billing")}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.primary + "14" }]}>
                <Feather name="credit-card" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Billing & Licences</AppText>
                <AppText variant="small" color="secondary">Purchase member licences for your society</AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </AppCard>
        </>
      )}

      {/* ManCo Tools - Only visible to ManCo members */}
      {permissions.canGenerateTeeSheet && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>ManCo Tools</AppText>
          <AppCard padding="sm">
            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(app)/tee-sheet")}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.warning + "20" }]}>
                <Feather name="file-text" size={16} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Tee Sheet Generator</AppText>
                <AppText variant="small" color="secondary">Grouped tee sheets with WHS handicaps</AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </AppCard>
        </>
      )}

      {/* Treasurer Tools - Only visible to Captain/Treasurer */}
      {permissions.canAccessFinance && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>Treasurer</AppText>
          <AppCard padding="sm">
            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(app)/treasurer")}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="book" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Society Ledger</AppText>
                <AppText variant="small" color="secondary">Full financial ledger with running balance</AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(app)/membership-fees")}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.success + "20" }]}>
                <Feather name="credit-card" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Membership Fees</AppText>
                <AppText variant="small" color="secondary">Track annual fee payments</AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(app)/event-finance")}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.info + "20" }]}>
                <Feather name="bar-chart-2" size={16} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Event Finances</AppText>
                <AppText variant="small" color="secondary">Income, costs, and P&L per event</AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </AppCard>
        </>
      )}

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
          onPress={() => router.push("/events")}
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
        {permissions.canResetSociety && (
          <>
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
              Reset all society data (members, events, results, finances). The society itself is kept.
            </AppText>
            <DestructiveButton onPress={handleResetSociety} loading={resetting} style={{ marginBottom: spacing.base }}>
              Reset Society
            </DestructiveButton>
          </>
        )}
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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
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
  logoSection: {
    alignItems: "center",
  },
  logoPreviewContainer: {
    marginBottom: spacing.base,
  },
  logoPreview: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
  },
  logoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logoActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  logoDiagnostics: {
    marginTop: spacing.base,
    width: "100%",
  },
  logoDiagnosticsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoDiagnosticsBody: {
    marginTop: spacing.xs,
    gap: 2,
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
