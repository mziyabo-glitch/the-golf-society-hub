import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlaySetupPlayerKind = "you" | "member" | "friend" | "guest";

type FreePlayPlayerSetupCardProps = {
  kind: FreePlaySetupPlayerKind;
  displayName: string;
  onDisplayNameChange?: (v: string) => void;
  inviteEmail?: string;
  onInviteEmailChange?: (v: string) => void;
  handicapIndex: string;
  onHandicapIndexChange: (v: string) => void;
  /** Tee name for this round (shared). */
  teeName: string | null;
  onRemove?: () => void;
  nameEditable?: boolean;
  showInviteEmail?: boolean;
  handicapReadOnly?: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function kindLabel(kind: FreePlaySetupPlayerKind): string {
  switch (kind) {
    case "you":
      return "You";
    case "member":
      return "Society member";
    case "friend":
      return "Friend";
    case "guest":
      return "Guest";
    default:
      return "Player";
  }
}

export function FreePlayPlayerSetupCard({
  kind,
  displayName,
  onDisplayNameChange,
  inviteEmail,
  onInviteEmailChange,
  handicapIndex,
  onHandicapIndexChange,
  teeName,
  onRemove,
  nameEditable = true,
  showInviteEmail = false,
  handicapReadOnly = false,
}: FreePlayPlayerSetupCardProps) {
  const colors = getColors();

  return (
    <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }, freePlayPremium.cardShadow]}>
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: `${freePlayPremium.accentDeepGreen}18` }]}>
          <AppText variant="bodyBold" style={{ color: freePlayPremium.accentDeepGreen }}>
            {initials(displayName || (kind === "you" ? "You" : "?"))}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.kindRow}>
            <View style={[styles.kindPill, { borderColor: colors.borderLight }]}>
              <AppText variant="captionBold" color="secondary">
                {kindLabel(kind)}
              </AppText>
            </View>
            {onRemove ? (
              <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove player">
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : (
              <Pressable hitSlop={10} disabled style={{ opacity: 0.35 }}>
                <Feather name="edit-2" size={16} color={colors.primary} />
              </Pressable>
            )}
          </View>
          {nameEditable && onDisplayNameChange ? (
            <AppInput value={displayName} onChangeText={onDisplayNameChange} placeholder="Player name" style={{ marginTop: spacing.xs }} />
          ) : (
            <AppText variant="bodyBold" style={{ marginTop: spacing.xs }} numberOfLines={2}>
              {displayName || "—"}
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.hcpRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="tertiary">
            Handicap index
          </AppText>
          {handicapReadOnly ? (
            <AppText variant="bodyBold" style={{ marginTop: spacing.sm }}>
              {handicapIndex}
            </AppText>
          ) : (
            <AppInput
              value={handicapIndex}
              onChangeText={onHandicapIndexChange}
              placeholder="HI"
              keyboardType="numeric"
              style={{ marginTop: 4 }}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="tertiary">
            Tee
          </AppText>
          <AppText variant="bodyBold" style={{ marginTop: spacing.sm }}>
            {teeName ?? "—"}
          </AppText>
        </View>
      </View>

      {showInviteEmail && onInviteEmailChange ? (
        <AppInput
          value={inviteEmail ?? ""}
          onChangeText={onInviteEmailChange}
          placeholder="Invite email (optional)"
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.base,
    marginTop: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  kindPill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  hcpRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    alignItems: "flex-start",
  },
});
