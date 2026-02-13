import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { getProfile, updateUserProfile } from "@/lib/db_supabase/profileRepo";
import type { ProfileDoc } from "@/lib/db_supabase/profileRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

const SEX_OPTIONS = ["Male", "Female"] as const;

export default function MyProfileScreen() {
  const router = useRouter();
  const { userId, refresh } = useBootstrap();
  const colors = getColors();

  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false, message: "", type: "success",
  });

  // Form fields
  const [fullName, setFullName] = useState("");
  const [sex, setSex] = useState<string>("");
  const [whsIndex, setWhsIndex] = useState("");
  const [email, setEmail] = useState("");

  // Load profile on mount
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const p = await getProfile(userId);
        if (p) {
          setFullName(p.full_name ?? "");
          setSex(p.sex ?? "");
          setWhsIndex(p.whs_index != null ? String(p.whs_index) : "");
          setEmail(p.email ?? "");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load profile.");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [userId]);

  const canSave = fullName.trim().length > 0 && sex.length > 0;

  const handleSave = async () => {
    if (!userId || saving || !canSave) return;
    setSaving(true);
    setError(null);

    try {
      const parsedWhs = whsIndex.trim() ? parseFloat(whsIndex.trim()) : null;
      if (parsedWhs !== null && (isNaN(parsedWhs) || parsedWhs < -10 || parsedWhs > 54)) {
        setError("WHS Index must be between -10 and 54.");
        setSaving(false);
        return;
      }

      await updateUserProfile(userId, {
        full_name: fullName.trim(),
        sex,
        whs_index: parsedWhs,
      });

      refresh();
      setToast({ visible: true, message: "Profile saved.", type: "success" });
    } catch (e: any) {
      setError(e?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading profile..." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <AppText variant="title" style={styles.headerTitle}>My Profile</AppText>
        <View style={{ width: 24 }} />
      </View>

      {error && (
        <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.base }} />
      )}

      {/* Form */}
      <AppCard>
        {/* Full Name */}
        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>Full Name *</AppText>
          <AppInput
            placeholder="e.g. John Smith"
            value={fullName}
            onChangeText={(t) => { setFullName(t); setError(null); }}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* Sex */}
        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>Sex *</AppText>
          <View style={styles.optionRow}>
            {SEX_OPTIONS.map((option) => {
              const selected = sex === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => { setSex(option); setError(null); }}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: selected ? colors.primary : colors.backgroundTertiary,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="body"
                    style={{ color: selected ? colors.textInverse : colors.text, fontWeight: selected ? "600" : "400" }}
                  >
                    {option}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Email (read-only) */}
        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>Email</AppText>
          <AppInput
            value={email}
            editable={false}
            style={{ opacity: 0.6 }}
          />
          <AppText variant="small" color="tertiary" style={{ marginTop: 2 }}>
            From your sign-in account
          </AppText>
        </View>

        {/* WHS Index */}
        <View style={styles.field}>
          <AppText variant="captionBold" style={styles.label}>WHS Handicap Index</AppText>
          <AppInput
            placeholder="e.g. 12.4"
            value={whsIndex}
            onChangeText={(t) => { setWhsIndex(t); setError(null); }}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <AppText variant="small" color="tertiary" style={{ marginTop: 2 }}>
            Optional. Your official World Handicap System index.
          </AppText>
        </View>

        {/* Save */}
        <PrimaryButton
          onPress={handleSave}
          loading={saving}
          disabled={!canSave || saving}
          style={styles.saveButton}
        >
          Save Profile
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  field: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  optionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});
