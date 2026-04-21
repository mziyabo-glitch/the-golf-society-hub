import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
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
import { invalidateCache } from "@/lib/cache/clientCache";
import { useBootstrap, ACTIVE_SOCIETY_CLIENT_CACHE_KEY } from "@/lib/useBootstrap";
import { ensureSignedIn } from "@/lib/auth_supabase";
import { createSociety, joinSociety } from "@/lib/db_supabase/societyRepo";
import { createMember } from "@/lib/db_supabase/memberRepo";
import { setActiveSocietyAndMember } from "@/lib/db_supabase/profileRepo";
import { supabase } from "@/lib/supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";
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
  const params = useLocalSearchParams<{ mode?: string | string[]; code?: string | string[]; invite?: string | string[] }>();
  const {
    user,
    ready,
    activeSocietyId,
    member,
    membershipLoading,
    setActiveSociety,
    setMember,
    refreshMemberships,
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
  const [whsIndex, setWhsIndex] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const isInviteFlow = params.invite === "1" || (Array.isArray(params.invite) && params.invite[0] === "1");
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

  // Create form state
  const [societyName, setSocietyName] = useState("");
  const [country, setCountry] = useState("");
  const [captainName, setCaptainName] = useState("");

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

  // Pre-fill join code from URL params (captain's invite link)
  useEffect(() => {
    const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
    if (codeParam) {
      setJoinCode(String(codeParam).trim().toUpperCase());
    }
  }, [params.code]);

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
          typeof window !== "undefined" && window.location?.pathname
            ? window.location.pathname
            : pathname;
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
        typeof window !== "undefined" && window.location?.pathname
          ? window.location.pathname
          : pathname;
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
    if (joinLoading) return;
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
    if (isInviteFlow && !emergencyContact.trim()) {
      showJoinFailure("Please enter your emergency contact details.");
      return;
    }

    setJoinLoading(true);

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

      const handicapVal = whsIndex.trim() ? parseFloat(whsIndex.trim()) : null;
      const emergencyVal = emergencyContact.trim() || null;
      if (handicapVal != null && (handicapVal < -10 || handicapVal > 54)) {
        showJoinFailure("Handicap index must be between -10 and 54.");
        return;
      }

      const { data: joinedPayload, error } = await joinSociety({
        p_join_code: code,
        p_name: nameInput,
        p_email: authUser.email ?? null,
        p_handicap_index: handicapVal,
        p_emergency_contact: emergencyVal,
      });

      if (error) {
        console.error("[join] JOIN_FAILED rpc:", error);
        showJoinFailure(error.message || "Failed to join society.");
        return;
      }

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

      // Persist profile pointers deterministically. Do not continue if we cannot
      // commit active society/member in DB + local state.
      let pointerCommitted = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await setActiveSocietyAndMember(uid, joinedSocietyId, joinedMemberId);
          pointerCommitted = true;
          break;
        } catch (profileErr) {
          console.warn("[join] setActiveSocietyAndMember retry", { attempt, profileErr });
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 120 * attempt));
          }
        }
      }
      if (!pointerCommitted) {
        showJoinFailure("Joined society, but could not switch active society. Please try again.");
        return;
      }

      // Local + DB active society should now be in sync.
      await setActiveSociety(joinedSocietyId, joinedMemberId);
      setMember(joinedMemberRecord as any);
      await invalidateCache(ACTIVE_SOCIETY_CLIENT_CACHE_KEY);

      // Fetch memberships from source-of-truth before leaving join flow.
      const refreshedMemberships = await refreshMemberships({ preferSocietyId: joinedSocietyId });
      const joinedPresent = refreshedMemberships.some((m) => m.societyId === joinedSocietyId);
      if (!joinedPresent) {
        // One final short retry for eventual consistency on mobile.
        await new Promise((r) => setTimeout(r, 250));
        const retryMemberships = await refreshMemberships({ preferSocietyId: joinedSocietyId });
        if (!retryMemberships.some((m) => m.societyId === joinedSocietyId)) {
          showJoinFailure("Joined society, but membership sync is delayed. Please reopen the app.");
          return;
        }
      }

      console.log("[join] active_society_change", {
        source: "join-flow",
        nextSocietyId: joinedSocietyId,
        nextMemberId: joinedMemberId,
        membershipCount: refreshedMemberships.length,
      });

      setToast({ visible: true, message: "Joined society ✅", type: "success" });
      // Navigate only after pointer + membership refresh are complete.
      blurWebActiveElement();
      router.replace(SOCIETY_HOME_ROUTE);
    } catch (e: any) {
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
    if (!country.trim()) {
      Alert.alert("Missing Country", "Please enter a country.");
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
        country: country.trim(),
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

      await setActiveSociety(society.id, memberId);
      await invalidateCache(ACTIVE_SOCIETY_CLIENT_CACHE_KEY);
      await refreshMemberships({ preferSocietyId: society.id });
      console.log("[onboarding] active_society_change", {
        source: "create-society-flow",
        nextSocietyId: society.id,
        nextMemberId: memberId,
      });

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
            <AppText variant="title" style={styles.title}>
              {isInviteFlow ? "Join via Captain's Link" : "Join a Society"}
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
              {isInviteFlow
                ? "Enter your details to join this society."
                : "Enter the code shared by your society captain to join."}
            </AppText>

            <AppCard style={styles.formCard}>
              {joinError && (
                <InlineNotice variant="error" message={joinError} style={styles.errorNotice} />
              )}
              <InlineNotice
                variant="info"
                message="Already on the society list? Use the same name your captain entered, or sign up with the same email they saved — we link your account to that member so your history stays together."
                style={styles.errorNotice}
              />
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
              </View>

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

              {isInviteFlow && (
                <>
                  <View style={styles.formField}>
                    <AppText variant="captionBold" style={styles.label}>WHS Index (optional)</AppText>
                    <AppInput
                      placeholder="e.g. 12.4"
                      value={whsIndex}
                      editable={!joinLoading}
                      onChangeText={(t) => { setWhsIndex(t); setJoinError(null); }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.formField}>
                    <AppText variant="captionBold" style={styles.label}>Emergency Contact (required)</AppText>
                    <AppInput
                      placeholder="e.g. Jane Smith +44 7700 900123"
                      value={emergencyContact}
                      editable={!joinLoading}
                      onChangeText={(t) => { setEmergencyContact(t); setJoinError(null); }}
                      autoCapitalize="words"
                    />
                  </View>
                </>
              )}

              <PrimaryButton
                onPress={() => {
                  console.log("[join] Join button onPress fired");
                  void handleJoinSociety();
                }}
                loading={joinLoading}
                disabled={joinLoading}
                style={styles.submitButton}
              >
                Join Society
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
                <AppText variant="captionBold" style={styles.label}>Country</AppText>
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
        <AppText variant="title" style={styles.title}>Golf Society Hub</AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          Manage your golf society with ease. Track events, members, handicaps, and more.
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
                {isAuthReady ? "Join with Code" : "Signing in…"}
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
              {isAuthReady ? "Create New" : "Signing in…"}
            </SecondaryButton>
          </AppCard>
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
