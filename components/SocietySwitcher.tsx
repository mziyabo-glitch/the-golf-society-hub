// components/SocietySwitcher.tsx
// Pill button + modal for switching between societies.

import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { useBootstrap } from "@/lib/useBootstrap";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import type { MySocietyMembership } from "@/lib/db_supabase/mySocietiesRepo";

function formatRole(role: string): string {
  const r = role.toLowerCase();
  const map: Record<string, string> = {
    captain: "Captain",
    secretary: "Secretary",
    treasurer: "Treasurer",
    handicapper: "Handicapper",
    member: "Member",
  };
  return map[r] || "Member";
}

export function SocietySwitcherPill() {
  const { society, memberships, activeSocietyId, switchSociety } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const [open, setOpen] = useState(false);

  if (memberships.length < 2) return null;

  const handleSelect = async (m: MySocietyMembership) => {
    setOpen(false);
    if (m.societyId === activeSocietyId) return;
    await switchSociety(m.societyId);
    router.replace("/(app)/(tabs)");
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.backgroundTertiary, borderColor: colors.borderLight },
          pressed && { opacity: 0.7 },
        ]}
      >
        <AppText variant="small" numberOfLines={1} style={[styles.pillText, { color: colors.text }]}>
          {society?.name ?? "Society"}
        </AppText>
        <Feather name="chevron-down" size={14} color={colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalWrap}>
            <AppCard style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <AppText variant="h2" style={styles.modalTitle}>Switch Society</AppText>

              {memberships.map((m) => {
                const active = m.societyId === activeSocietyId;
                return (
                  <Pressable
                    key={m.memberId}
                    onPress={() => handleSelect(m)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: colors.borderLight },
                      active && { backgroundColor: colors.primary + "10" },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold">{m.societyName}</AppText>
                      <AppText variant="small" color="secondary">
                        {formatRole(m.role)}
                        {m.country ? ` · ${m.country}` : ""}
                      </AppText>
                    </View>
                    {active && <Feather name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}

              <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
                <AppText variant="small" color="secondary">Close</AppText>
              </Pressable>
            </AppCard>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  pillText: {
    fontWeight: "600",
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalWrap: {
    width: "90%",
    maxWidth: 380,
  },
  modalCard: {
    paddingVertical: spacing.lg,
  },
  modalTitle: {
    marginBottom: spacing.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  closeBtn: {
    alignSelf: "center",
    marginTop: spacing.base,
    paddingVertical: spacing.xs,
  },
});
