/**
 * Toast Component
 *
 * A lightweight toast notification for quick feedback.
 * Auto-dismisses after a short duration.
 */

import { useEffect, useRef } from "react";
import { StyleSheet, Animated, View, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type ToastType = "success" | "error" | "info";

type ToastProps = {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide: () => void;
};

export function Toast({
  visible,
  message,
  type = "success",
  duration = 2000,
  onHide,
}: ToastProps) {
  const colors = getColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -20,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, onHide, opacity, translateY]);

  if (!visible) return null;

  const getTypeConfig = () => {
    switch (type) {
      case "success":
        return { icon: "check-circle" as const, bg: colors.success, iconColor: "#fff" };
      case "error":
        return { icon: "alert-circle" as const, bg: colors.error, iconColor: "#fff" };
      case "info":
        return { icon: "info" as const, bg: colors.info, iconColor: "#fff" };
    }
  };

  const config = getTypeConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.bg,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <Feather name={config.icon} size={18} color={config.iconColor} />
      <AppText variant="bodyBold" style={styles.message}>
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 60,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  message: {
    color: "#fff",
    marginLeft: spacing.xs,
  },
});
