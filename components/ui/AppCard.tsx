/**
 * App card — default list/panel surface; delegates to Card with spacing scale padding.
 */

import { ReactNode } from "react";
import { ViewStyle, StyleProp } from "react-native";
import { Card, type CardVariant } from "./Card";
import { spacing } from "@/lib/ui/theme";

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When false, uses a flat secondary surface (no drop shadow). @deprecated Prefer `variant="subtle"`. */
  elevated?: boolean;
  padding?: keyof typeof spacing;
  /** Explicit surface kind — overrides `elevated` when set */
  variant?: CardVariant;
};

export function AppCard({
  children,
  style,
  elevated = true,
  padding = "base",
  variant,
}: AppCardProps) {
  const resolvedVariant: CardVariant =
    variant ?? (elevated ? "default" : "subtle");

  return (
    <Card variant={resolvedVariant} padding={padding} style={style}>
      {children}
    </Card>
  );
}
