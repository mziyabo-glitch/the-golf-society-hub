import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { getColors } from "@/lib/ui/theme";

type Props = {
  onPress: () => void;
};

/**
 * Consistent top-bar entry to Settings (hub for profile, society, treasurer, admin, app prefs).
 */
export function HeaderSettingsPill({ onPress }: Props) {
  const colors = getColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Settings — account, society, and more"
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: colors.backgroundTertiary,
          borderColor: colors.borderLight,
          opacity: pressed ? 0.88 : 1,
        },
        Platform.select({
          ios: {
            shadowColor: "#15251A",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
          },
          android: { elevation: 2 },
          default: {},
        }),
      ]}
    >
      <View style={styles.inner}>
        <Feather name="settings" size={17} color={colors.text} style={styles.icon} />
        <AppText variant="captionBold" style={{ color: colors.text, fontSize: 15 }}>
          Settings
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    minWidth: 40,
  },
  icon: {
    marginRight: 6,
  },
});
