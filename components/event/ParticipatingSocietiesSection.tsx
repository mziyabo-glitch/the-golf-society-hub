/**
 * Phase 3: Participating societies section for joint event create/edit.
 * Visible only when isJointEvent is true.
 */

import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import type { EventSocietyInput } from "@/lib/db_supabase/jointEventTypes";
import type { MySocietyMembership } from "@/lib/db_supabase/mySocietiesRepo";

type Props = {
  hostSocietyId: string;
  participatingSocieties: EventSocietyInput[];
  availableSocieties: MySocietyMembership[];
  errors?: { participating_societies?: string };
  onHostChange: (societyId: string) => void;
  onSocietiesChange: (societies: EventSocietyInput[]) => void;
};

export function ParticipatingSocietiesSection({
  hostSocietyId,
  participatingSocieties,
  availableSocieties,
  errors,
  onHostChange,
  onSocietiesChange,
}: Props) {
  const colors = getColors();

  const addSociety = (soc: MySocietyMembership) => {
    const exists = participatingSocieties.some((s) => s.society_id === soc.societyId);
    if (exists) return;
    const newList: EventSocietyInput[] = [
      ...participatingSocieties,
      {
        society_id: soc.societyId,
        society_name: soc.societyName,
        role: participatingSocieties.length === 0 ? "host" : "participant",
        has_society_oom: true,
      },
    ];
    if (participatingSocieties.length === 0) {
      onHostChange(soc.societyId);
    }
    onSocietiesChange(newList);
  };

  const removeSociety = (societyId: string) => {
    const next = participatingSocieties.filter((s) => s.society_id !== societyId);
    if (hostSocietyId === societyId && next.length > 0) {
      onHostChange(next[0].society_id);
      next[0].role = "host";
    }
    onSocietiesChange(next);
  };

  const setHost = (societyId: string) => {
    onHostChange(societyId);
    onSocietiesChange(
      participatingSocieties.map((s) => ({
        ...s,
        role: s.society_id === societyId ? "host" : "participant",
      }))
    );
  };

  const addableSocieties = availableSocieties.filter(
    (s) => !participatingSocieties.some((p) => p.society_id === s.societyId)
  );

  return (
    <View style={styles.container}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>
        Participating societies
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
        {participatingSocieties.length < 2
          ? "Add at least 2 societies for a joint event."
          : "Host society is the primary organiser."}
      </AppText>

      {participatingSocieties.map((s) => (
        <View
          key={s.society_id}
          style={[
            styles.row,
            {
              borderColor: s.role === "host" ? colors.primary + "60" : colors.border,
              backgroundColor: s.role === "host" ? colors.primary + "08" : undefined,
            },
          ]}
        >
          <View style={styles.rowMain}>
            <View style={styles.rowHeader}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {s.society_name || "Society"}
              </AppText>
              {s.role === "host" && (
                <View style={[styles.hostBadge, { backgroundColor: colors.primary + "20" }]}>
                  <AppText variant="small" style={{ color: colors.primary, fontWeight: "600" }}>
                    Host
                  </AppText>
                </View>
              )}
            </View>
            <View style={styles.actions}>
              {s.role !== "host" && (
                <Pressable
                  onPress={() => setHost(s.society_id)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <AppText variant="small" color="primary">Set as host</AppText>
                </Pressable>
              )}
              <Pressable
                onPress={() =>
                  onSocietiesChange(
                    participatingSocieties.map((p) =>
                      p.society_id === s.society_id
                        ? { ...p, has_society_oom: !p.has_society_oom }
                        : p
                    )
                  )
                }
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <AppText variant="small" color="secondary">
                  OOM: {s.has_society_oom ? "Yes" : "No"}
                </AppText>
              </Pressable>
            </View>
            {s.has_society_oom && (
              <View style={styles.oomNameRow}>
                <AppInput
                  placeholder="Society OOM name (optional)"
                  value={s.society_oom_name ?? ""}
                  onChangeText={(v) =>
                    onSocietiesChange(
                      participatingSocieties.map((p) =>
                        p.society_id === s.society_id
                          ? { ...p, society_oom_name: v.trim() || null }
                          : p
                      )
                    )
                  }
                  style={styles.oomInput}
                />
              </View>
            )}
          </View>
          <Pressable
            onPress={() => removeSociety(s.society_id)}
            hitSlop={8}
            disabled={participatingSocieties.length <= 2}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : participatingSocieties.length <= 2 ? 0.4 : 1,
            })}
          >
            <Feather name="x-circle" size={20} color={colors.error} />
          </Pressable>
        </View>
      ))}

      {addableSocieties.length > 0 && (
        <View style={styles.addSection}>
          <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.xs }}>
            Add society
          </AppText>
          {addableSocieties.map((soc) => (
            <Pressable
              key={soc.societyId}
              onPress={() => addSociety(soc)}
              style={({ pressed }) => [
                styles.addItem,
                { backgroundColor: pressed ? colors.backgroundSecondary : "transparent" },
              ]}
            >
              <Feather name="plus" size={16} color={colors.primary} />
              <AppText variant="body" style={{ marginLeft: spacing.xs }}>{soc.societyName}</AppText>
            </Pressable>
          ))}
        </View>
      )}

      {errors?.participating_societies && (
        <AppText variant="small" style={{ color: colors.error, marginTop: spacing.xs }}>
          {errors.participating_societies}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  hostBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  oomNameRow: {
    marginTop: spacing.xs,
  },
  oomInput: {
    minHeight: 36,
  },
  addSection: {
    marginTop: spacing.sm,
  },
  addItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
});
