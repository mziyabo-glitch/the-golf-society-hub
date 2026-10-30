/**
 * Touch target that uses TouchableOpacity on iOS / iOS Safari where Pressable taps can be dropped.
 * See onboarding join buttons (7b49125d) and RSVP segment controls.
 */

import { ReactNode } from "react";
import {
  Platform,
  Pressable,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { isIOSLikeWeb } from "@/lib/web/browserEnvironment";

type HitSlop = number | { top: number; bottom: number; left: number; right: number };

type Props = {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
  hitSlop?: HitSlop;
};

function normalizeHitSlop(hitSlop: HitSlop) {
  if (typeof hitSlop === "number") {
    return { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop };
  }
  return hitSlop;
}

function useIosReliableTouch(): boolean {
  return Platform.OS === "ios" || isIOSLikeWeb();
}

export function ReliablePressable({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  hitSlop = 12,
}: Props) {
  if (useIosReliableTouch()) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.88}
        hitSlop={normalizeHitSlop(hitSlop)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}
