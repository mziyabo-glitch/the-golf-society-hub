// components/SocietySwitcher.tsx
// Pill button + modal for switching between societies and joining new ones.

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

/**
 * Always-visible pill in the Home app bar.
 * - 1 society: shows name + tap to open modal with "Join another" CTA.
 * - 2+ societies: shows name + chevron, modal lists all + "Join another".
 * - 0 societies (personal mode): returns null.
 */
export function SocietySwitcherPill() {
  const { society, memberships, activeSocietyId, switchSociety } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const [open, setOpen] = useState(false);

  if (!society && memberships.length === 0) return null;

  const multi = memberships.length > 1;

  const handleSelect = async (m: MySocietyMembership) => {
    setOpen(false);
    if (m.societyId === activeSocietyId) return;
    await switchSociety(m.societyId);
    router.replace("/(app)/(tabs)");
  };

  const handleJoinAnother = () => {
    setOpen(false);
    router.push({ pathname: "/join", params: { mode: "join" } });
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={multi ? "Switch society" : "Society options"}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: colors.primary + "10",
            borderColor: colors.primary + "30",
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Feather name={multi ? "repeat" : "flag"} size={13} color={colors.primary} />
        <AppText
          variant="small"
          numberOfLines={1}
          style={[styles.pillText, { color: colors.primary }]}
        >
          {society?.name ?? "Society"}
        </AppText>
        <Feather name="chevron-down" size={13} color={colors.primary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalWrap} onStartShouldSetResponder={() => true}>
            <AppCard style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <AppText variant="h2" style={styles.modalTitle}>
                {multi ? "Switch Society" : "Your Society"}
              </AppText>

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

              {/* Join another society CTA */}
              <Pressable
                onPress={handleJoinAnother}
                style={({ pressed }) => [
                  styles.joinRow,
                  { borderColor: colors.primary + "30" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.joinIcon, { backgroundColor: colors.primary + "14" }]}>
                  <Feather name="plus-circle" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" color="primary">Join another society</AppText>
                  <AppText variant="small" color="secondary">Enter a join code</AppText>
                </View>
                <Feather name="chevron-right" size={16} color={colors.primary} />
              </Pressable>

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
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 200,
  },
  pillText: {
    fontWeight: "700",
    flexShrink: 1,
    fontSize: 12,
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
  joinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  joinIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    alignSelf: "center",
    marginTop: spacing.base,
    paddingVertical: spacing.xs,
  },
});
