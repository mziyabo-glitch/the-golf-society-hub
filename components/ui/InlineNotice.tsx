import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "./AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type InlineNoticeVariant = "success" | "error" | "info";

type InlineNoticeProps = {
  message: string;
  detail?: string;
  variant?: InlineNoticeVariant;
  icon?: ReactNode;
  style?: ViewStyle;
};

export function InlineNotice({
  message,
  detail,
  variant = "info",
  icon,
  style,
}: InlineNoticeProps) {
  const colors = getColors();

  const config = {
    success: {
      iconName: "check-circle" as const,
      bg: colors.success + "12",
      border: colors.success + "30",
      text: colors.success,
    },
    error: {
      iconName: "alert-circle" as const,
      bg: colors.error + "12",
      border: colors.error + "30",
      text: colors.error,
    },
    info: {
      iconName: "info" as const,
      bg: colors.info + "10",
      border: colors.info + "28",
      text: colors.info,
    },
  }[variant];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.bg, borderColor: config.border },
        style,
      ]}
    >
      <View style={styles.icon}>
        {icon ?? <Feather name={config.iconName} size={16} color={config.text} />}
      </View>
      <View style={styles.textBlock}>
        <AppText variant="bodyBold" style={{ color: colors.text }}>
          {message}
        </AppText>
        {detail ? (
          <AppText variant="small" color="secondary" style={styles.detail}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  icon: {
    paddingTop: 2,
  },
  textBlock: {
    flex: 1,
  },
  detail: {
    marginTop: 4,
  },
});
