import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Image, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, Pressable } from "react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { ensureSignedIn } from "@/lib/auth_supabase";
import { createSociety, lookupSocietyByJoinCode, type SocietyDoc } from "@/lib/db_supabase/societyRepo";
import { createMember } from "@/lib/db_supabase/memberRepo";
import { setActiveSocietyAndMember, setSocietyOnboardingSkipped } from "@/lib/db_supabase/profileRepo";
import { supabase } from "@/lib/supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { uploadSocietyLogo } from "@/lib/db_supabase/societyRepo";
import * as ImagePicker from "expo-image-picker";
import { blurWebActiveElement } from "@/lib/ui/focus";

type Mode = "choose" | "join" | "create";
const SOCIETY_HOME_ROUTE = "/(app)/(tabs)";
const JOIN_NAV_BACKOFF_MS = [250, 700, 1500] as const;

/**
 * Helper to show user-friendly error for RLS/permission issues
 */
function showRlsError(error: any): void {
  const code = error?.code;
  const message = error?.message || "";

  if (code === "42501" || code === "403" || message.includes("row-level security") || message.includes("Permission denied")) {
    Alert.alert(
      "Permission Denied",
      "The server rejected this operation. Please ensure you're signed in and try again. If the problem persists, contact support.",
      [{ text: "OK" }]
    );
  } else {
    Alert.alert("Error", message || "An unexpected error occurred. Please try again.");
  }
}

export default function OnboardingScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const {
    user,
    ready,
    profile,
    activeSocietyId,
    member,
    membershipLoading,
    setActiveSocietyId,
    setMember,
    refresh,
  } = useBootstrap();
  const colors = getColors();

  const routeModeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const routeMode = routeModeParam === "join" || routeModeParam === "create" ? routeModeParam : null;
  const isJoinAliasRoute = pathname === "/join" || pathname === "/join-society" || pathname === "/onboarding/join";
  const [mode, setMode] = useState<Mode>(
    routeMode ?? (isJoinAliasRoute ? "join" : "choose")
  );
  const [joinLoading, setJoinLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Join form state
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{ society: SocietyDoc } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [pendingJoinNavigation, setPendingJoinNavigation] = useState<{
    societyId: string;
    memberId: string;
  } | null>(null);
  const joinNavRetryCount = useRef(0);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const loading = joinLoading || createLoading;

  const handleSkip = async () => {
    try {
      const authUser = await ensureSignedIn();
      if (authUser?.id) {
        await setSocietyOnboardingSkipped(authUser.id);
      }
    } catch (e) {
      console.warn("[onboarding] setSocietyOnboardingSkipped failed:", e);
    }
    refresh();
    blurWebActiveElement();
    router.replace(SOCIETY_HOME_ROUTE);
  };

  // Create form state
  const [societyName, setSocietyName] = useState("");
  const [country, setCountry] = useState("");
  const [captainName, setCaptainName] = useState(profile?.full_name ?? "");
  const [logoUri, setLogoUri] = useState<string | null>(null);

  // Buttons are disabled until auth is ready
  const isAuthReady = ready && !!user?.uid;

  useEffect(() => {
    if (routeMode) {
      setMode(routeMode);
      return;
    }
    if (isJoinAliasRoute) {
      setMode("join");
    }
  }, [routeMode, isJoinAliasRoute]);

  useEffect(() => {
    if (mode === "create" && profile?.full_name && !captainName.trim()) {
      setCaptainName(profile.full_name);
    }
  }, [mode, profile?.full_name]);

  // Instant validation: debounced lookup when join code is 4+ chars
  useEffect(() => {
    const code = joinCode.trim().toUpperCase().replace(/\s/g, "");
    if (code.length < 4) {
      setLookupResult(null);
      return;
    }
    const t = setTimeout(async () => {
      setLookupLoading(true);
      setLookupResult(null);
      try {
        const result = await lookupSocietyByJoinCode(code);
        if (result.ok && result.society) {
          setLookupResult({ society: result.society });
        } else {
          setLookupResult(null);
        }
      } catch {
        setLookupResult(null);
      } finally {
        setLookupLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [joinCode]);

  useEffect(() => {
    if (!pendingJoinNavigation) return;

    const readyForNavigation =
      ready &&
      !membershipLoading &&
      activeSocietyId === pendingJoinNavigation.societyId &&
      !!member;

    if (readyForNavigation) {
      console.log("[join] Navigation after bootstrap refresh:", {
        target: SOCIETY_HOME_ROUTE,
        societyId: pendingJoinNavigation.societyId,
        memberId: pendingJoinNavigation.memberId,
      });
      console.log("[join] before nav pathname", pathname);
      blurWebActiveElement();
      router.replace(SOCIETY_HOME_ROUTE);
      setTimeout(() => {
        const afterPath =
          typeof window !== "undefined" ? window.location.pathname : pathname;
        console.log("[join] after nav pathname", afterPath);
      }, 0);
      setPendingJoinNavigation(null);
      joinNavRetryCount.current = 0;
      return;
    }

    if (joinNavRetryCount.current < JOIN_NAV_BACKOFF_MS.length) {
      const delayMs = JOIN_NAV_BACKOFF_MS[joinNavRetryCount.current];
      const retryIndex = joinNavRetryCount.current + 1;
      const fallbackTimer = setTimeout(() => {
        console.log("[join] awaiting dashboard state, retrying refresh:", {
          retry: retryIndex,
          delayMs,
          pathname,
          activeSocietyId,
          hasMember: !!member,
        });
        joinNavRetryCount.current += 1;
        refresh();
      }, delayMs);
      return () => clearTimeout(fallbackTimer);
    }

    // Final fallback: force route replace after retries.
    console.log("[join] forcing dashboard navigation after retries:", {
      target: SOCIETY_HOME_ROUTE,
      pathname,
      activeSocietyId,
      hasMember: !!member,
      hasMembershipLoading: membershipLoading,
    });
    console.log("[join] before nav pathname", pathname);
    blurWebActiveElement();
    router.replace(SOCIETY_HOME_ROUTE);
    setTimeout(() => {
      const afterPath =
        typeof window !== "undefined" ? window.location.pathname : pathname;
      console.log("[join] after nav pathname", afterPath);
    }, 0);
    setPendingJoinNavigation(null);
    joinNavRetryCount.current = 0;
  }, [
    pendingJoinNavigation,
    ready,
    membershipLoading,
    activeSocietyId,
    member,
    pathname,
    refresh,
    router,
  ]);

  useEffect(() => {
    if (!pendingJoinNavigation) {
      joinNavRetryCount.current = 0;
    }
  }, [pendingJoinNavigation]);

  useEffect(() => {
    if (!pendingJoinNavigation) return;
    if (!activeSocietyId) return;
    // keep this log separate from navigation logs to diagnose bounce/redirect
    console.log("[join] nav pending state:", {
      pathname,
      activeSocietyId,
      hasMember: !!member,
      membershipLoading,
      target: SOCIETY_HOME_ROUTE,
    });
  }, [pendingJoinNavigation, pathname, activeSocietyId, member, membershipLoading]);

  useEffect(() => {
    if (!pendingJoinNavigation) return;
    if (pathname === SOCIETY_HOME_ROUTE) return;
    if (!activeSocietyId) return;
    console.log("[join] route guard likely moved route:", {
      pathname,
      target: SOCIETY_HOME_ROUTE,
      activeSocietyId,
    });
  }, [pendingJoinNavigation, pathname, activeSocietyId]);

  useEffect(() => {
    if (!pendingJoinNavigation) return;
    return () => {
      joinNavRetryCount.current = 0;
    };
  }, [pendingJoinNavigation]);

  useEffect(() => {
    if (!pendingJoinNavigation) return;
    const safetyTimer = setTimeout(() => {
      console.log("[join] safety refresh while nav pending", {
        pathname,
        societyId: pendingJoinNavigation.societyId,
        memberId: pendingJoinNavigation.memberId,
      });
      refresh();
    }, 3000);
    return () => clearTimeout(safetyTimer);
  }, [pendingJoinNavigation, pathname, refresh]);

  /**
   * Join Society Flow:
   * 1. Normalize & validate join code
   * 2. Call join_society RPC
   * 3. Set active society state
   * 4. Refresh + navigate to app home
   */
  const showJoinFailure = (message: string) => {
    setJoinError(message);
    setToast({ visible: true, message, type: "error" });
  };

  const handleJoinSociety = async () => {
    console.log("JOIN CLICKED");
    if (joinLoading) return;
    console.log("[join] JOIN_TAP");
    setJoinError(null);

    const code = joinCode.trim().toUpperCase();
    const nameInput = displayName.trim();

    if (!code) {
      showJoinFailure("Please enter the society join code.");
      return;
    }
    if (code.length < 4 || code.length > 10) {
      showJoinFailure("Join code must be 4–10 characters.");
      return;
    }
    if (!nameInput) {
      showJoinFailure("Please enter your name.");
      return;
    }

    setJoinLoading(true);
    console.log("[join] JOIN_START", { normalized: code });

    try {
      const authUser = await ensureSignedIn();
      const uid = authUser?.id;
      if (!uid) {
        showJoinFailure("Authentication failed. Please try again.");
        return;
      }
      console.log("[join] Calling join_society RPC", {
        code,
        p_name: nameInput,
        hasEmail: !!authUser.email,
      });

      const { data: rpcMember, error } = await supabase.rpc("join_society", {
        p_join_code: code,
        p_name: nameInput,
        p_email: authUser.email ?? null,
      });

      if (error) {
        console.error("[join] JOIN_FAILED rpc:", error);
        showJoinFailure(error.message || "Failed to join society.");
        return;
      }

      const joinedPayload = Array.isArray(rpcMember) ? rpcMember[0] : rpcMember;
      if (!joinedPayload || typeof joinedPayload !== "object") {
        showJoinFailure("Failed to join society. Please try again.");
        return;
      }

      const joinedMemberId =
        typeof (joinedPayload as any).id === "string"
          ? (joinedPayload as any).id
          : typeof (joinedPayload as any).member_id === "string"
            ? (joinedPayload as any).member_id
            : typeof (joinedPayload as any).memberId === "string"
              ? (joinedPayload as any).memberId
              : null;

      const joinedSocietyId =
        typeof (joinedPayload as any).society_id === "string"
          ? (joinedPayload as any).society_id
          : typeof (joinedPayload as any).societyId === "string"
            ? (joinedPayload as any).societyId
            : null;

      if (!joinedMemberId || !joinedSocietyId) {
        showJoinFailure("Failed to join society. Please try again.");
        return;
      }

      let joinedMemberRecord: any = joinedPayload;
      if (
        typeof (joinedPayload as any).user_id !== "string" ||
        typeof (joinedPayload as any).society_id !== "string"
      ) {
        const { data: fetchedMember, error: memberFetchError } = await supabase
          .from("members")
          .select("*")
          .eq("id", joinedMemberId)
          .maybeSingle();

        console.log("[join] Member fetch by memberId:", {
          memberId: joinedMemberId,
          found: !!fetchedMember,
          error: memberFetchError
            ? {
                message: memberFetchError.message,
                code: memberFetchError.code,
                details: memberFetchError.details,
              }
            : null,
        });

        if (fetchedMember) {
          joinedMemberRecord = fetchedMember;
        }
      }

      // Persist profile pointers to DB (defense-in-depth: the RPC also
      // writes these, but an explicit client-side write guarantees the
      // profile is correct before bootstrap re-reads it).
      try {
        await setActiveSocietyAndMember(uid, joinedSocietyId, joinedMemberId);
      } catch (profileErr) {
        console.warn("[join] setActiveSocietyAndMember failed (RPC already wrote it):", profileErr);
      }

      // Set local state so the UI can react immediately.
      setActiveSocietyId(joinedSocietyId);
      setMember(joinedMemberRecord as any);
      refresh();
      console.log("[join] JOIN_COMPLETE", {
        memberId: joinedMemberId,
        societyId: joinedSocietyId,
        pathname,
      });
      setToast({ visible: true, message: "Joined society ✅", type: "success" });
      setPendingJoinNavigation({
        societyId: joinedSocietyId,
        memberId: joinedMemberId,
      });
    } catch (e: any) {
      console.error("[join] JOIN_FAILED", e);
      const msg = e?.message || "Something went wrong. Please try again.";
      showJoinFailure(msg);
    } finally {
      setJoinLoading(false);
    }
  };

  /**
   * Create Society Flow:
   * 1. Create society row
   * 2. Create captain member row
   * 3. Update profile with active society/member
   * 4. Redirect to app home
   */
  const handleCreateSociety = async () => {
    if (!societyName.trim()) {
      Alert.alert("Missing Name", "Please enter a society name.");
      return;
    }
    if (!captainName.trim()) {
      Alert.alert("Missing Name", "Please enter your name (you will be the Captain).");
      return;
    }

    setCreateLoading(true);
    console.log("[onboarding] === CREATE SOCIETY START ===");

    try {
      // Step 1: Ensure signed in
      console.log("[onboarding] Ensuring signed in...");
      const authUser = await ensureSignedIn();
      const uid = authUser?.id;
      if (!uid) {
        Alert.alert("Error", "Authentication failed. Please try again.");
        return;
      }
      console.log("[onboarding] Authenticated as:", uid);

      // Step 2: Create society
      console.log("[onboarding] createSociety start");
      const society = await createSociety({
        name: societyName.trim(),
        country: country.trim() || undefined,
        createdBy: uid,
      });
      console.log("[onboarding] createSociety success:", society.id, "joinCode:", society.join_code);

      // Step 3: Create captain member with schema-correct payload
      console.log("[onboarding] createMember start (captain)");
      const memberId = await createMember(society.id, {
        displayName: captainName.trim(),
        name: captainName.trim(),
        roles: ["captain"],
        userId: uid,
      });
      console.log("[onboarding] createMember success:", memberId);

      // Step 4: Update profile with active society/member
      console.log("[onboarding] updateProfile start");
      await setActiveSocietyAndMember(uid, society.id, memberId);
      console.log("[onboarding] updateProfile success");

      // Step 4b: Upload logo if selected
      if (logoUri) {
        try {
          await uploadSocietyLogo(society.id, { uri: logoUri });
        } catch (logoErr) {
          console.warn("[onboarding] Logo upload failed:", logoErr);
        }
      }

      // Refresh bootstrap state to pick up the new active society
      refresh();

      // Step 5: Navigate to app home
      console.log("[onboarding] === CREATE SOCIETY COMPLETE ===");
      blurWebActiveElement();
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      console.error("[onboarding] Create society error:", e);
      showRlsError(e);
    } finally {
      setCreateLoading(false);
    }
  };

  // Show loading while waiting for auth
  if (!ready) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Signing in..." />
        </View>
      </Screen>
    );
  }

  if (mode === "join") {
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <SecondaryButton onPress={() => setMode("choose")} size="sm">
              Back
            </SecondaryButton>
          </View>

          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="users" size={32} color={colors.primary} />
            </View>
            <AppText variant="title" style={styles.title}>Join a Society</AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
              Enter the code shared by your society captain to join.
            </AppText>

            <AppCard style={styles.formCard}>
              {joinError && (
                <InlineNotice variant="error" message={joinError} style={styles.errorNotice} />
              )}
              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Join Code</AppText>
                <AppInput
                  placeholder="e.g. ABC123"
                  value={joinCode}
                  editable={!joinLoading}
                  onChangeText={(text) => {
                    setJoinCode(text.toUpperCase().replace(/\s/g, ""));
                    setJoinError(null);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                />
                {lookupLoading && (
                  <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                    Checking...
                  </AppText>
                )}
              </View>

              {lookupResult && (
                <View style={[styles.societyPreview, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                  {getSocietyLogoUrl(lookupResult.society) ? (
                    <Image
                      source={{ uri: getSocietyLogoUrl(lookupResult.society)! }}
                      style={styles.societyLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.societyLogoPlaceholder, { backgroundColor: colors.primary + "20" }]}>
                      <Feather name="flag" size={24} color={colors.primary} />
                    </View>
                  )}
                  <AppText variant="bodyBold" style={styles.societyPreviewName}>
                    {lookupResult.society.name}
                  </AppText>
                  <AppText variant="small" color="tertiary">
                    Ready to join
                  </AppText>
                </View>
              )}

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Your Name</AppText>
                <AppInput
                  placeholder="e.g. John Smith"
                  value={displayName}
                  editable={!joinLoading}
                  onChangeText={(t) => { setDisplayName(t); setJoinError(null); }}
                  autoCapitalize="words"
                />
              </View>

              <PrimaryButton
                onPress={() => {
                  console.log("[join] Join button onPress fired");
                  void handleJoinSociety();
                }}
                loading={joinLoading}
                disabled={joinLoading || (!!lookupResult && !displayName.trim())}
                style={styles.submitButton}
              >
                {lookupResult ? `Join ${lookupResult.society.name}` : "Join Society"}
              </PrimaryButton>
            </AppCard>
          </View>
          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={() => setToast((t) => ({ ...t, visible: false }))}
          />
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  if (mode === "create") {
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <SecondaryButton onPress={() => setMode("choose")} size="sm">
              Back
            </SecondaryButton>
          </View>

          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="flag" size={32} color={colors.primary} />
            </View>
            <AppText variant="title" style={styles.title}>Create a Society</AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
              Start a new golf society. You will be the Captain.
            </AppText>

            <AppCard style={styles.formCard}>
              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Society Name</AppText>
                <AppInput
                  placeholder="e.g. The Sunday Swingers"
                  value={societyName}
                  onChangeText={setSocietyName}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Logo (optional)</AppText>
                <View style={styles.logoRow}>
                  {logoUri ? (
                    <View style={styles.logoPreviewRow}>
                      <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="cover" />
                      <SecondaryButton onPress={() => setLogoUri(null)} size="sm">
                        Remove
                      </SecondaryButton>
                    </View>
                  ) : (
                    <SecondaryButton
                      onPress={async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== "granted") {
                          Alert.alert("Permission needed", "Allow access to photos to add a logo.");
                          return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ["images"],
                          allowsEditing: true,
                          aspect: [1, 1],
                          quality: 0.8,
                        });
                        if (!result.canceled && result.assets[0]) {
                          setLogoUri(result.assets[0].uri);
                        }
                      }}
                      size="sm"
                    >
                      Add logo
                    </SecondaryButton>
                  )}
                </View>
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Country (optional)</AppText>
                <AppInput
                  placeholder="e.g. United Kingdom"
                  value={country}
                  onChangeText={setCountry}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Your Name (Captain)</AppText>
                <AppInput
                  placeholder="e.g. John Smith"
                  value={captainName}
                  onChangeText={setCaptainName}
                  autoCapitalize="words"
                />
              </View>

              <PrimaryButton
                onPress={handleCreateSociety}
                style={styles.submitButton}
                disabled={!isAuthReady || createLoading}
                loading={createLoading}
              >
                {isAuthReady ? "Create Society" : "Signing in..."}
              </PrimaryButton>
            </AppCard>
          </View>
          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={() => setToast((t) => ({ ...t, visible: false }))}
          />
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // Default: Choose mode
  return (
    <Screen>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
          <Feather name="flag" size={40} color={colors.primary} />
        </View>
        <AppText variant="title" style={styles.title}>Join your golf society</AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          Join with a code, create your own, or explore the app first.
        </AppText>

        <View style={styles.optionsContainer}>
          <AppCard style={styles.optionCard}>
            <View style={[styles.optionIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="users" size={24} color={colors.primary} />
            </View>
            <AppText variant="h2" style={styles.optionTitle}>Join a Society</AppText>
            <AppText variant="caption" color="secondary" style={styles.optionDescription}>
              Have a join code? Enter it to join your society.
            </AppText>
            <TouchableOpacity
              onPress={() => setMode("join")}
              disabled={loading}
              activeOpacity={0.8}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={[
                styles.optionButtonTouch,
                {
                  backgroundColor: loading ? colors.surfaceDisabled : colors.primary,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              <AppText variant="button" color="inverse">
                {isAuthReady ? "Join a Society" : "Signing in…"}
              </AppText>
            </TouchableOpacity>
          </AppCard>

          <AppCard style={styles.optionCard}>
            <View style={[styles.optionIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="plus-circle" size={24} color={colors.primary} />
            </View>
            <AppText variant="h2" style={styles.optionTitle}>Create a Society</AppText>
            <AppText variant="caption" color="secondary" style={styles.optionDescription}>
              Start a new golf society and invite your friends.
            </AppText>
            <SecondaryButton
              onPress={() => setMode("create")}
              style={styles.optionButton}
              disabled={loading}
            >
              {isAuthReady ? "Create a Society" : "Signing in…"}
            </SecondaryButton>
          </AppCard>

          <Pressable onPress={handleSkip} style={styles.skipRow} hitSlop={12}>
            <AppText variant="small" color="tertiary">
              Skip for now
            </AppText>
          </Pressable>
        </View>
      </View>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  optionsContainer: {
    width: "100%",
    gap: spacing.base,
  },
  optionCard: {
    alignItems: "center",
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  optionTitle: {
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  optionDescription: {
    textAlign: "center",
    marginBottom: spacing.base,
  },
  optionButton: {
    width: "100%",
  },
  skipRow: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  optionButtonTouch: {
    width: "100%",
    minHeight: 44,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  formCard: {
    width: "100%",
  },
  formField: {
    marginBottom: spacing.base,
  },
  societyPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  societyLogo: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  societyLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  societyPreviewName: {
    flex: 1,
  },
  logoRow: {
    marginTop: spacing.xs,
  },
  logoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
  },
  errorNotice: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});
