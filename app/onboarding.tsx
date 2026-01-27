import { useState } from "react";
import { StyleSheet, View, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { ensureSignedIn } from "@/lib/auth_supabase";
import { createSociety, findSocietyByJoinCode } from "@/lib/db_supabase/societyRepo";
import { createMember, findMemberByUserAndSociety } from "@/lib/db_supabase/memberRepo";
import { setActiveSocietyAndMember } from "@/lib/db_supabase/profileRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Mode = "choose" | "join" | "create";

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
  const { user, ready, refresh } = useBootstrap();
  const colors = getColors();

  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);

  // Join form state
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Create form state
  const [societyName, setSocietyName] = useState("");
  const [country, setCountry] = useState("");
  const [captainName, setCaptainName] = useState("");

  // Buttons are disabled until auth is ready
  const isAuthReady = ready && !!user?.uid;

  /**
   * Join Society Flow:
   * 1. Lookup society by join code
   * 2. Check if membership already exists
   * 3. If exists: just set profile active IDs
   * 4. If not: create member row, then set profile active IDs
   * 5. Redirect to app home
   */
  const handleJoinSociety = async () => {
    if (!joinCode.trim()) {
      Alert.alert("Missing Code", "Please enter the society join code.");
      return;
    }
    if (!displayName.trim()) {
      Alert.alert("Missing Name", "Please enter your name.");
      return;
    }

    setLoading(true);
    console.log("[join] === JOIN SOCIETY START ===");

    try {
      // Step 1: Ensure signed in
      console.log("[join] Ensuring signed in...");
      const authUser = await ensureSignedIn();
      const uid = authUser?.id;
      if (!uid) {
        Alert.alert("Error", "Authentication failed. Please try again.");
        setLoading(false);
        return;
      }
      console.log("[join] Authenticated as:", uid);

      // Step 2: Lookup society by join code
      console.log("[join] code lookup start:", joinCode.trim().toUpperCase());
      const society = await findSocietyByJoinCode(joinCode);
      if (!society) {
        console.log("[join] Society not found");
        Alert.alert("Not Found", "No society found with that code. Please check and try again.");
        setLoading(false);
        return;
      }
      console.log("[join] code lookup success:", society.id, society.name);

      // Step 3: Check if membership already exists
      console.log("[join] Checking for existing membership...");
      const existingMember = await findMemberByUserAndSociety(society.id, uid);

      let memberId: string;

      if (existingMember) {
        // Already a member - just use existing membership
        console.log("[join] Existing membership found:", existingMember.id);
        memberId = existingMember.id;
      } else {
        // Step 4: Create new member row
        console.log("[onboarding] createMember start (join flow)");
        memberId = await createMember(society.id, {
          displayName: displayName.trim(),
          name: displayName.trim(),
          roles: ["member"],
          userId: uid,
        });
        console.log("[onboarding] createMember success:", memberId);
      }

      // Step 5: Update profile with active society/member
      console.log("[onboarding] updateProfile start");
      await setActiveSocietyAndMember(uid, society.id, memberId);
      console.log("[onboarding] updateProfile success");

      // Refresh bootstrap state to pick up the new active society
      refresh();

      // Step 6: Navigate to app home
      console.log("[join] === JOIN SOCIETY COMPLETE ===");
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      console.error("[join] Join society error:", e);
      showRlsError(e);
    } finally {
      setLoading(false);
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

    setLoading(true);
    console.log("[onboarding] === CREATE SOCIETY START ===");

    try {
      // Step 1: Ensure signed in
      console.log("[onboarding] Ensuring signed in...");
      const authUser = await ensureSignedIn();
      const uid = authUser?.id;
      if (!uid) {
        Alert.alert("Error", "Authentication failed. Please try again.");
        setLoading(false);
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

      // Step 3: Create captain member
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

      // Refresh bootstrap state to pick up the new active society
      refresh();

      // Step 5: Navigate to app home
      console.log("[onboarding] === CREATE SOCIETY COMPLETE ===");
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      console.error("[onboarding] Create society error:", e);
      showRlsError(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message={mode === "join" ? "Joining society..." : "Creating society..."} />
        </View>
      </Screen>
    );
  }

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
              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Join Code</AppText>
                <AppInput
                  placeholder="e.g. ABC123"
                  value={joinCode}
                  onChangeText={(text) => setJoinCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Your Name</AppText>
                <AppInput
                  placeholder="e.g. John Smith"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>

              <PrimaryButton
                onPress={handleJoinSociety}
                style={styles.submitButton}
                disabled={!isAuthReady}
              >
                {isAuthReady ? "Join Society" : "Signing in..."}
              </PrimaryButton>
            </AppCard>
          </View>
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
                disabled={!isAuthReady}
              >
                {isAuthReady ? "Create Society" : "Signing in..."}
              </PrimaryButton>
            </AppCard>
          </View>
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
            <PrimaryButton
              onPress={() => setMode("join")}
              style={styles.optionButton}
              disabled={!isAuthReady}
            >
              {isAuthReady ? "Join with Code" : "Signing in..."}
            </PrimaryButton>
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
              disabled={!isAuthReady}
            >
              {isAuthReady ? "Create New" : "Signing in..."}
            </SecondaryButton>
          </AppCard>
        </View>
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
  formCard: {
    width: "100%",
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});
