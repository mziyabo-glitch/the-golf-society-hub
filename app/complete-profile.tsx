/**
 * Complete Profile — Required first-time onboarding screen.
 * Shown when user has signed in but profile is incomplete (missing full_name or email).
 *
 * Fields:
 * - Full name (required)
 * - Email (required, prefill from auth)
 * - Handicap Index (optional, encouraged)
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getCurrentUser } from "@/lib/auth_supabase";
import { updateProfileForCompletion } from "@/lib/db_supabase/profileRepo";
import { getColors, spacing } from "@/lib/ui/theme";

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { userId, profile, refresh } = useBootstrap();
  const colors = getColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [handicapIndex, setHandicapIndex] = useState("");

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setFullName(profile?.full_name ?? "");
      let emailVal = profile?.email ?? "";
      if (!emailVal) {
        const authUser = await getCurrentUser();
        emailVal = authUser?.email ?? "";
      }
      setEmail(emailVal);
      setHandicapIndex(
        profile?.whs_index != null ? String(profile.whs_index) : ""
      );
      setLoading(false);
    };
    void load();
  }, [userId, profile]);

  const canSave = fullName.trim().length > 0 && email.trim().length > 0;

  const handleSave = async () => {
    if (!userId || saving || !canSave) return;

    const parsedHI = handicapIndex.trim()
      ? parseFloat(handicapIndex.trim())
      : null;
    if (
      parsedHI !== null &&
      (isNaN(parsedHI) || parsedHI < -10 || parsedHI > 54)
    ) {
      setError("Handicap Index must be between -10 and 54.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateProfileForCompletion(userId, {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        whs_index: parsedHI,
      });
      refresh();
      router.replace("/onboarding");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Complete your profile
        </AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          A few details to get you started.
        </AppText>
      </View>

      {error && (
        <InlineNotice
          variant="error"
          message={error}
          style={{ marginBottom: spacing.base }}
        />
      )}

      <AppCard>
        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>
            Full name *
          </AppText>
          <AppInput
            placeholder="e.g. John Smith"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              setError(null);
            }}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>
            Email *
          </AppText>
          <AppInput
            placeholder="you@example.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
        </View>

        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>
            Handicap Index
          </AppText>
          <AppInput
            placeholder="e.g. 12.4"
            value={handicapIndex}
            onChangeText={(t) => {
              setHandicapIndex(t);
              setError(null);
            }}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <AppText variant="small" color="tertiary" style={styles.helper}>
            You can update this later if you're unsure.
          </AppText>
        </View>

        <PrimaryButton
          onPress={handleSave}
          loading={saving}
          disabled={!canSave || saving}
          style={styles.saveButton}
        >
          Continue
        </PrimaryButton>
      </AppCard>
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
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  field: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  helper: {
    marginTop: 4,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});
