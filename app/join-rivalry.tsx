/**
 * Join Rivalry Route — supports /join-rivalry?code=ABC123
 *
 * Flow:
 * - If not signed in: store code, redirect to auth (AuthScreen overlay will show)
 * - If signed in: show join form with code prefilled
 * - On successful join: redirect to rivalry detail, clear pending code
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { joinByCode } from "@/lib/db_supabase/sinbookRepo";
import { storePendingRivalryJoinCode } from "@/lib/pendingRivalryJoinCode";
import { getColors, iconSize, spacing } from "@/lib/ui/theme";
import { Toast } from "@/components/ui/Toast";
import { showAlert } from "@/lib/ui/alert";

const VALID_CODE_REGEX = /^[A-Z0-9]{6}$/;

function isValidCode(code: string): boolean {
  return VALID_CODE_REGEX.test(code.trim().toUpperCase());
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export default function JoinRivalryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
  const { loading: bootstrapLoading, isSignedIn, member } = useBootstrap();
  const colors = getColors();

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [urlCodeInvalid, setUrlCodeInvalid] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" as const });

  // Prefill from URL and store if not signed in
  useEffect(() => {
    if (!codeParam) return;
    const raw = String(codeParam).trim();
    const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (normalized.length === 6) {
      setJoinCode(normalized);
      setInviteLoaded(true);
      setUrlCodeInvalid(false);
      if (!isSignedIn && !bootstrapLoading) {
        storePendingRivalryJoinCode(normalized);
      }
    } else if (raw.length > 0) {
      setUrlCodeInvalid(true);
    }
  }, [codeParam, isSignedIn, bootstrapLoading]);

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setErrorMsg("Enter the 6-character rivalry code shared with you.");
      return;
    }
    if (!isValidCode(code)) {
      setErrorMsg("Invalid rivalry code. Use exactly 6 letters or numbers.");
      return;
    }
    setErrorMsg("");
    setJoining(true);
    const displayName = member?.displayName || member?.name || "Player";
    try {
      const result = await joinByCode(code, displayName);
      setJoinCode("");
      showAlert("Joined!", `You're now part of "${result.title}".`);
      router.replace({ pathname: "/(app)/sinbook/[id]", params: { id: result.sinbookId } });
    } catch {
      setToast({ visible: true, message: "Invite code not ready yet. Please try again in a moment.", type: "info" });
    } finally {
      setJoining(false);
    }
  };

  const handleChangeCode = (text: string) => {
    setErrorMsg("");
    setUrlCodeInvalid(false);
    setJoinCode(normalizeCode(text));
  };

  // Not signed in yet — show placeholder (AuthScreen overlay will appear)
  if (!bootstrapLoading && !isSignedIn) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="zap" size={iconSize.xl} color={colors.primary} />
          </View>
          <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            Join Rivalry
          </AppText>
          <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            Sign in to join this rivalry. Your invite code has been saved.
          </AppText>
        </View>
      </Screen>
    );
  }

  // Loading
  if (bootstrapLoading) {
    return null; // Layout handles loading overlay
  }

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/sinbook")} size="sm">
          Cancel
        </SecondaryButton>
        <AppText variant="h2">Join Rivalry</AppText>
        <View style={{ width: 60 }} />
      </View>

      {inviteLoaded && codeParam && (
        <InlineNotice
          variant="info"
          message="Invite code loaded"
          style={{ marginBottom: spacing.sm }}
        />
      )}
      {urlCodeInvalid && (
        <InlineNotice
          variant="error"
          message="Invalid rivalry code"
          style={{ marginBottom: spacing.sm }}
        />
      )}

      <AppCard>
        <AppText variant="label" color="secondary" style={{ marginBottom: spacing.xs }}>
          Join Code
        </AppText>
        <AppInput
          placeholder="e.g. ABC123"
          value={joinCode}
          onChangeText={handleChangeCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
          Enter the 6-character rivalry code shared with you.
        </AppText>

        {errorMsg ? (
          <InlineNotice variant="error" message={errorMsg} style={{ marginTop: spacing.sm }} />
        ) : null}

        <PrimaryButton onPress={handleJoin} loading={joining} style={{ marginTop: spacing.sm }}>
          Join Rivalry
        </PrimaryButton>
      </AppCard>

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
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
});
