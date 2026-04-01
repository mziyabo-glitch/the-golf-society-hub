import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

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
import { updateHandicap } from "@/lib/db_supabase/memberRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

const SEX_OPTIONS = ["Male", "Female"] as const;

export default function MyProfileScreen() {
  const router = useRouter();
  const { userId, profile, member, refresh } = useBootstrap();
  const isFirstTime = !profile?.profile_complete;
  const colors = getColors();

  const handicapLocked = (member as any)?.handicapLock === true || (member as any)?.handicap_lock === true;
  const currentHI = (member as any)?.handicapIndex ?? (member as any)?.handicap_index ?? null;

  const memberRef = useRef(member);
  const currentHIRef = useRef(currentHI);
  memberRef.current = member;
  currentHIRef.current = currentHI;

  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false, message: "", type: "success",
  });

  // Form fields
  const [fullName, setFullName] = useState("");
  const [sex, setSex] = useState<string>("");
  /** Single handicap field: member HI when in a society (authoritative), else profile whs_index */
  const [handicapIndex, setHandicapIndex] = useState("");
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
          setEmail(p.email ?? "");
          const m = memberRef.current;
          const hi = currentHIRef.current;
          if (m?.id) {
            setHandicapIndex(hi != null ? String(hi) : "");
          } else {
            setHandicapIndex(p.whs_index != null ? String(p.whs_index) : "");
          }
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load profile.");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (member?.id) {
      setHandicapIndex(currentHI != null ? String(currentHI) : "");
    }
  }, [member?.id, currentHI]);

  const canSave = fullName.trim().length > 0 && sex.length > 0;

  const handleSave = async () => {
    if (!userId || saving || !canSave) return;
    setSaving(true);
    setError(null);

    try {
      const parsedHi = handicapIndex.trim() ? parseFloat(handicapIndex.trim()) : null;
      if (parsedHi !== null && (isNaN(parsedHi) || parsedHi < -10 || parsedHi > 54)) {
        setError("Handicap index must be between -10 and 54.");
        setSaving(false);
        return;
      }

      const whsForProfile =
        member?.id && handicapLocked
          ? currentHI != null && Number.isFinite(Number(currentHI))
            ? Number(currentHI)
            : null
          : parsedHi;

      if (member?.id && !handicapLocked) {
        await updateHandicap(member.id, parsedHi);
      }

      await updateUserProfile(userId, {
        full_name: fullName.trim(),
        sex,
        whs_index: whsForProfile,
      });

      refresh();

      // First-time completion: go to app home. Otherwise stay and show toast.
      if (isFirstTime) {
        router.replace("/(app)/(tabs)");
        return;
      }
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
        {isFirstTime ? (
          <View style={{ width: 24 }} />
        ) : (
          <Pressable onPress={() => goBack(router, "/(app)/(tabs)/settings")} hitSlop={8}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        )}
        <AppText variant="title" style={styles.headerTitle}>My Profile</AppText>
        <View style={{ width: 24 }} />
      </View>

      {isFirstTime && (
        <InlineNotice
          variant="info"
          message="Please complete your profile to continue."
          style={{ marginBottom: spacing.base }}
        />
      )}

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

        {/* Handicap index (WHS) — one field; member record when in a society, else profile only */}
        <View style={styles.field}>
          <View style={styles.handicapLabelRow}>
            <AppText variant="captionBold" style={styles.handicapLabelText}>Handicap index (WHS)</AppText>
            {member?.id ? (
              handicapLocked ? (
                <View style={[styles.lockBadge, { backgroundColor: colors.error + "14" }]}>
                  <Feather name="lock" size={11} color={colors.error} />
                  <AppText variant="small" style={{ color: colors.error, fontWeight: "700" }}>Locked</AppText>
                </View>
              ) : (
                <View style={[styles.lockBadge, { backgroundColor: colors.success + "14" }]}>
                  <Feather name="unlock" size={11} color={colors.success} />
                  <AppText variant="small" style={{ color: colors.success, fontWeight: "700" }}>Editable</AppText>
                </View>
              )
            ) : null}
          </View>
          <AppInput
            placeholder="e.g. 12.4"
            value={handicapIndex}
            onChangeText={(t) => {
              setHandicapIndex(t);
              setError(null);
            }}
            keyboardType="decimal-pad"
            autoCorrect={false}
            editable={!handicapLocked}
            style={handicapLocked ? { opacity: 0.85 } : undefined}
          />
          <AppText variant="small" color="tertiary" style={{ marginTop: 2 }}>
            {handicapLocked && member?.id
              ? "Locked by your Handicapper — contact them to change this."
              : "Optional. Your World Handicap System index, used for society play and tee sheets."}
          </AppText>
          {member?.id && (member as any)?.handicapUpdatedAt ? (
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              Last updated: {new Date((member as any).handicapUpdatedAt).toLocaleDateString("en-GB")}
            </AppText>
          ) : null}
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
  handicapLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  handicapLabelText: {
    flex: 1,
    minWidth: 0,
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
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
});
