import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlaySetupStep = {
  id: string;
  label: string;
  /** Step is satisfied / complete */
  complete: boolean;
  /** Step is the current focus */
  active: boolean;
};

type FreePlaySetupStepperProps = {
  steps: FreePlaySetupStep[];
  onStepPress?: (stepId: string) => void;
};

/**
 * Progress chips: Course → Tee → Group → Start (ParUp-style clarity, our layout).
 */
export function FreePlaySetupStepper({ steps, onStepPress }: FreePlaySetupStepperProps) {
  const colors = getColors();

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="muted" style={{ marginBottom: spacing.xs }}>
        Setup progress
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {steps.map((s, i) => {
          const showConnector = i < steps.length - 1;
          const bg = s.active ? colors.primary : s.complete ? `${colors.success}22` : colors.surface;
          const border = s.active ? colors.primary : s.complete ? `${colors.success}55` : colors.borderLight;
          const text = s.active ? "inverse" : s.complete ? "success" : "secondary";
          const content = (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: bg,
                  borderColor: border,
                },
              ]}
            >
              <AppText variant="captionBold" color={text as "inverse" | "success" | "secondary"}>
                {s.label}
              </AppText>
            </View>
          );
          return (
            <View key={s.id} style={styles.stepUnit}>
              {onStepPress ? (
                <Pressable onPress={() => onStepPress(s.id)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                  {content}
                </Pressable>
              ) : (
                content
              )}
              {showConnector ? (
                <View style={[styles.connector, { backgroundColor: s.complete ? colors.success + "55" : colors.borderLight }]} />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 2,
  },
  stepUnit: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  connector: {
    width: 10,
    height: 2,
    marginHorizontal: 4,
    borderRadius: 1,
  },
});
