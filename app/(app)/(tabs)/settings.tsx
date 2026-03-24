import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable, Image, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { AppCard } from "@/components/ui/AppCard";
import { DestructiveButton, SecondaryButton, PrimaryButton } from "@/components/ui/Button";
import { AppInput } from "@/components/ui/AppInput";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { supabase } from "@/lib/supabase";
import { clearActiveSociety } from "@/lib/db_supabase/profileRepo";
import { regenerateJoinCode, uploadSocietyLogo, removeSocietyLogo, resetSocietyData } from "@/lib/db_supabase/societyRepo";
import { isCaptain, getPermissionsForMember } from "@/lib/rbac";
import { getSocietyInviteUrl, getSocietyInviteMessage } from "@/lib/appConfig";
import {
  getSocietyLogoUrl,
  getSocietyLogoDataUri,
  getSocietyLogoDiagnostics,
  logSocietyLogoDiagnostics,
  type LogoDiagnostics,
} from "@/lib/societyLogo";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import { getSupabaseEnv, getSupabaseProjectRefSuffix } from "@/lib/supabaseEnv";
import { isPlatformAdmin, listSocieties, reappointCaptain, type AdminSocietyRow } from "@/lib/db_supabase/adminRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { Toast } from "@/components/ui/Toast";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, society, member, loading, refresh, signOut } = useBootstrap();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: 16, paddingBottom: tabBarHeight + 24 };

  const [signingOut, setSigningOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoDiagnostics, setLogoDiagnostics] = useState<LogoDiagnostics | null>(null);
  const [logoDiagnosticsLoading, setLogoDiagnosticsLoading] = useState(false);
  const [logoDiagnosticsError, setLogoDiagnosticsError] = useState<string | null>(null);

  const permissions = getPermissionsForMember(member);
  const canRegenCode = isCaptain(member as any);
  const canManageLogo = permissions.canManageSocietyLogo;

  // Platform admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSocieties, setAdminSocieties] = useState<AdminSocietyRow[]>([]);
  const [adminSearching, setAdminSearching] = useState(false);
  const [adminMembers, setAdminMembers] = useState<MemberDoc[]>([]);
  const [selectedNewCaptain, setSelectedNewCaptain] = useState<string | null>(null);
  const [reappointReason, setReappointReason] = useState("");
  const [reappointing, setReappointing] = useState(false);
  const [showReappoint, setShowReappoint] = useState(false);
  const [adminToast, setAdminToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({ visible: false, message: "", type: "success" });
  const [inviteLinkToast, setInviteLinkToast] = useState(false);
  const [codeCopyToast, setCodeCopyToast] = useState(false);

  useEffect(() => {
    isPlatformAdmin().then(setIsAdmin);
  }, []);

  const handleAdminSearch = useCallback(async (term: string) => {
    setAdminSearch(term);
    if (!isAdmin) return;
    setAdminSearching(true);
    try {
      const results = await listSocieties(term);
      setAdminSocieties(results);
    } catch { /* non-critical */ }
    setAdminSearching(false);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) handleAdminSearch("");
  }, [isAdmin, handleAdminSearch]);

  const handleAdminSwitch = async (row: AdminSocietyRow) => {
    try {
      // Find if platform admin has a member row in target society
      const { data: memberRow } = await supabase
        .from("members")
        .select("id")
        .eq("society_id", row.id)
        .eq("user_id", user?.uid)
        .limit(1)
        .maybeSingle();

      await supabase
        .from("profiles")
        .update({ active_society_id: row.id, active_member_id: memberRow?.id ?? null })
        .eq("id", user?.uid);

      setAdminToast({ visible: true, message: `Switched to ${row.name}`, type: "success" });
      refresh();
    } catch (e: any) {
      setAdminToast({ visible: true, message: e?.message || "Failed to switch", type: "error" });
    }
  };

  const loadAdminMembers = useCallback(async () => {
    if (!society?.id) return;
    try {
      const mems = await getMembersBySocietyId(society.id);
      setAdminMembers(mems);
    } catch { /* non-critical */ }
  }, [society?.id]);

  useEffect(() => {
    if (showReappoint && isAdmin) loadAdminMembers();
  }, [showReappoint, isAdmin, loadAdminMembers]);

  const currentCaptain = adminMembers.find(
    (m) => m.role?.toLowerCase() === "captain"
  );

  const handleReappoint = async () => {
    if (!society?.id || !selectedNewCaptain || reappointing) return;
    setReappointing(true);
    try {
      await reappointCaptain(society.id, selectedNewCaptain, reappointReason);
      setAdminToast({ visible: true, message: "Captain re-appointed.", type: "success" });
      setSelectedNewCaptain(null);
      setReappointReason("");
      setShowReappoint(false);
      await loadAdminMembers();
      await handleAdminSearch(adminSearch);
      refresh();
    } catch (e: any) {
      setAdminToast({ visible: true, message: e?.message || "Failed to re-appoint.", type: "error" });
    } finally {
      setReappointing(false);
    }
  };

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
          refresh();
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to leave society.");
          setLeaving(false);
        }
      },
    );
  };

  const handleSignOut = () => {
    confirmDestructive(
      "Sign Out",
      "Are you sure you want to sign out?",
      "Sign Out",
      async () => {
        setSigningOut(true);
        try {
          await signOut();
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to sign out.");
          setSigningOut(false);
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
        mediaTypes: ["images"],
        allowsEditing: true,
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
      <Screen contentStyle={tabContentStyle}>
        <AppText variant="title" style={styles.title}>Settings</AppText>

        <AppText variant="h2" style={styles.sectionTitle}>Account</AppText>
        <AppCard padding="sm">
          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/(app)/my-profile")}
          >
            <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={24} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <AppText variant="bodyBold">My Profile</AppText>
              <AppText variant="caption" color="secondary">Personal Mode</AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
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

        <AppText variant="h2" style={styles.sectionTitle}>Account</AppText>
        <AppCard>
          <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
            Sign out of your account on this device.
          </AppText>
          <DestructiveButton onPress={handleSignOut} loading={signingOut}>
            Sign Out
          </DestructiveButton>
        </AppCard>

        <AppText variant="h2" style={styles.sectionTitle}>Legal</AppText>
        <AppCard padding="sm">
          <Pressable
            style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/privacy-policy")}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="shield" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="body">Privacy Policy</AppText>
              <AppText variant="small" color="secondary">How we collect and use your data</AppText>
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
    <Screen contentStyle={tabContentStyle}>
      <AppText variant="title" style={styles.title}>Settings</AppText>

      {/* Your Profile */}
      <AppText variant="h2" style={styles.sectionTitle}>Your Profile</AppText>
      <AppCard padding="sm">
        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(app)/my-profile")}
        >
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
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      </AppCard>

      <AppText variant="h2" style={styles.sectionTitle}>Legal</AppText>
      <AppCard padding="sm">
        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/privacy-policy")}
        >
          <View style={[styles.linkIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="shield" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body">Privacy Policy</AppText>
            <AppText variant="small" color="secondary">How we collect and use your data</AppText>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
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
          <>
            <View style={[styles.settingRow, { marginTop: spacing.base }]}>
              <View style={[styles.settingIcon, { backgroundColor: colors.backgroundTertiary }]}>
                <Feather name="key" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingInfo}>
                <AppText variant="caption" color="secondary">Join Code</AppText>
                {canRegenCode ? (
                  <Pressable
                    onPress={async () => {
                      await Clipboard.setStringAsync(society.joinCode!);
                      setCodeCopyToast(true);
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <AppText variant="bodyBold" style={{ letterSpacing: 2 }}>{society.joinCode}</AppText>
                  </Pressable>
                ) : (
                  <AppText variant="bodyBold" style={{ letterSpacing: 2 }}>{society.joinCode}</AppText>
                )}
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
            {canRegenCode && (
              <>
                <Pressable
                  onPress={async () => {
                    const url = getSocietyInviteUrl(society.joinCode!);
                    await Clipboard.setStringAsync(url);
                    setInviteLinkToast(true);
                  }}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1, marginTop: spacing.sm }]}
                >
                  <View style={[styles.linkIcon, { backgroundColor: colors.primary + "14" }]}>
                    <Feather name="link" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.settingInfo}>
                    <AppText variant="bodyBold">Copy invite link</AppText>
                    <AppText variant="small" color="secondary">Members enter name, WHS index & emergency contact</AppText>
                  </View>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const message = getSocietyInviteMessage(society?.name ?? "our society", society.joinCode!);
                    try {
                      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
                        await navigator.share({
                          title: `Join ${society?.name ?? "Society"}`,
                          text: message,
                        });
                      } else if (Platform.OS === "web") {
                        await Clipboard.setStringAsync(message);
                        setInviteLinkToast(true);
                      } else {
                        await Share.share({ message });
                      }
                    } catch { /* cancelled or unsupported */ }
                  }}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1, marginTop: spacing.xs }]}
                >
                  <View style={[styles.linkIcon, { backgroundColor: colors.primary + "14" }]}>
                    <Feather name="share-2" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.settingInfo}>
                    <AppText variant="bodyBold">Share society code</AppText>
                    <AppText variant="small" color="secondary">Share via WhatsApp, SMS, email, etc.</AppText>
                  </View>
                </Pressable>
              </>
            )}
          </>
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
                  <SocietyLogoImage logoUrl={logoUrl} size={140} variant="hero" placeholderText="" />
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

      {/* Club Domain Review - Captain only (platform admin) */}
      {canRegenCode && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>Club Domains</AppText>
          <AppCard padding="sm">
            <Pressable
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push("/(admin)/course-domains" as any)}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.info + "20" }]}>
                <Feather name="globe" size={16} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">Domain Review</AppText>
                <AppText variant="small" color="secondary">Approve/reject club website candidates</AppText>
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

      {/* Platform Admin */}
      {isAdmin && (
        <>
          <AppText variant="h2" style={styles.sectionTitle}>
            <Feather name="shield" size={16} color={colors.error} /> Platform Admin
          </AppText>

          {/* Search societies */}
          <AppCard>
            <AppInput
              placeholder="Search society name or join code\u2026"
              value={adminSearch}
              onChangeText={handleAdminSearch}
              autoCapitalize="none"
            />
            {adminSearching && <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>Searching\u2026</AppText>}
            {adminSocieties.map((row) => {
              const isActive = row.id === society?.id;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => !isActive && handleAdminSwitch(row)}
                  style={[
                    styles.adminSocRow,
                    { borderColor: colors.borderLight },
                    isActive && { backgroundColor: colors.primary + "08" },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold">{row.name}</AppText>
                    <AppText variant="small" color="secondary">
                      {row.country ?? ""}
                      {row.captain_name ? ` · Capt: ${row.captain_name}` : ""}
                      {` · ${row.member_count} members`}
                    </AppText>
                  </View>
                  {row.join_code && (
                    <View style={[styles.adminCodeBadge, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText style={styles.adminCodeText}>{row.join_code}</AppText>
                    </View>
                  )}
                  {isActive ? (
                    <Feather name="check" size={16} color={colors.primary} style={{ marginLeft: spacing.xs }} />
                  ) : (
                    <AppText variant="small" color="primary" style={{ fontWeight: "600", marginLeft: spacing.xs }}>Switch</AppText>
                  )}
                </Pressable>
              );
            })}
          </AppCard>

          {/* Active society sub-panel */}
          {society && (
            <AppCard style={{ marginTop: spacing.sm }}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: colors.primary + "14" }]}>
                  <Feather name="flag" size={18} color={colors.primary} />
                </View>
                <View style={styles.settingInfo}>
                  <AppText variant="bodyBold">{society.name}</AppText>
                  <AppText variant="small" color="secondary">
                    {society.joinCode ? `Code: ${society.joinCode}` : ""}
                    {currentCaptain ? ` · Captain: ${currentCaptain.name || currentCaptain.displayName}` : ""}
                  </AppText>
                </View>
              </View>

              {/* Quick links */}
              <View style={styles.adminQuickLinks}>
                <Pressable style={[styles.adminQuickBtn, { borderColor: colors.border }]} onPress={() => router.push("/(app)/(tabs)/members")}>
                  <Feather name="users" size={14} color={colors.primary} />
                  <AppText variant="small" color="primary">Members</AppText>
                </Pressable>
                <Pressable style={[styles.adminQuickBtn, { borderColor: colors.border }]} onPress={() => router.push("/(app)/(tabs)/events")}>
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <AppText variant="small" color="primary">Events</AppText>
                </Pressable>
                <Pressable style={[styles.adminQuickBtn, { borderColor: colors.border }]} onPress={() => router.push("/(app)/tee-sheet")}>
                  <Feather name="file-text" size={14} color={colors.primary} />
                  <AppText variant="small" color="primary">Tee Sheet</AppText>
                </Pressable>
              </View>

              {/* Re-appoint captain toggle */}
              <Pressable
                onPress={() => setShowReappoint((v) => !v)}
                style={[styles.adminReappointToggle, { borderColor: colors.borderLight }]}
              >
                <Feather name="shield" size={14} color={colors.error} />
                <AppText variant="bodyBold" style={{ flex: 1 }}>Re-appoint Captain</AppText>
                <Feather name={showReappoint ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Pressable>

              {showReappoint && (
                <View style={{ marginTop: spacing.sm }}>
                  {adminMembers.map((m) => {
                    const isCurrent = m.role?.toLowerCase() === "captain";
                    const isSelected = selectedNewCaptain === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => !isCurrent && setSelectedNewCaptain(m.id)}
                        style={[
                          styles.adminMemberRow,
                          { borderColor: colors.borderLight },
                          isSelected && { backgroundColor: colors.primary + "10", borderColor: colors.primary },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <AppText variant="body">{m.name || m.displayName || "Member"}</AppText>
                          <AppText variant="small" color="secondary">{m.role || "member"}</AppText>
                        </View>
                        {isCurrent && (
                          <View style={[styles.adminBadge, { backgroundColor: colors.primary + "18" }]}>
                            <AppText variant="small" color="primary" style={{ fontWeight: "700" }}>Captain</AppText>
                          </View>
                        )}
                        {isSelected && !isCurrent && <Feather name="check-circle" size={18} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                  {selectedNewCaptain && (
                    <View style={{ marginTop: spacing.sm }}>
                      <AppInput placeholder="Reason (optional)" value={reappointReason} onChangeText={setReappointReason} />
                      <PrimaryButton onPress={handleReappoint} loading={reappointing} disabled={reappointing} style={{ marginTop: spacing.sm }}>
                        Re-appoint Captain
                      </PrimaryButton>
                    </View>
                  )}
                </View>
              )}
            </AppCard>
          )}

          <Toast visible={adminToast.visible} message={adminToast.message} type={adminToast.type} onHide={() => setAdminToast((t) => ({ ...t, visible: false }))} />
        </>
      )}

      <Toast visible={inviteLinkToast} message="Invite link copied to clipboard" type="success" onHide={() => setInviteLinkToast(false)} />
      <Toast visible={codeCopyToast} message="Join code copied" type="success" onHide={() => setCodeCopyToast(false)} />

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
        <DestructiveButton onPress={handleLeaveSociety} loading={leaving} style={{ marginBottom: spacing.base }}>
          Leave Society
        </DestructiveButton>
        <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
          Sign out of your account on this device.
        </AppText>
        <DestructiveButton onPress={handleSignOut} loading={signingOut}>
          Sign Out
        </DestructiveButton>
      </AppCard>

      {/* App Info */}
      <View style={styles.footer}>
        <AppText variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          Golf Society Hub v1.0.0
        </AppText>
        <AppText variant="small" color="tertiary" style={{ textAlign: "center", marginTop: 4 }}>
          Environment: {getSupabaseEnv().toUpperCase()} · Backend: …{getSupabaseProjectRefSuffix()}
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
  adminSocRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  adminCodeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  adminCodeText: {
    fontFamily: "monospace",
    fontSize: typography.small.fontSize,
    fontWeight: "700",
    letterSpacing: 1,
  },
  adminQuickLinks: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    flexWrap: "wrap",
  },
  adminQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  adminReappointToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    marginTop: spacing.xs,
  },
  adminMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  adminBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  footer: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
