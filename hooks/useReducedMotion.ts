import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Respects OS “reduce motion” / prefers-reduced-motion where exposed by RN.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.matchMedia) {
        return;
      }
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => {
        if (mounted) setReduce(mq.matches);
      };
      update();
      mq.addEventListener?.("change", update);
      return () => {
        mounted = false;
        mq.removeEventListener?.("change", update);
      };
    }

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduce(v);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
