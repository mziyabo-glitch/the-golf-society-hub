import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any): State {
    return {
      hasError: true,
      message: error?.message || "Unexpected app error",
    };
  }

  componentDidCatch(error: any, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Caught render error:", error, info?.componentStack);
  }

  private handleReload = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.replace("/");
      return;
    }
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const colors = getColors();

    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="h2" style={styles.title}>
            Something went wrong
          </AppText>
          <AppText variant="body" color="secondary" style={styles.message}>
            {this.state.message}
          </AppText>
          <Pressable
            onPress={this.handleReload}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <AppText variant="bodyBold" color="inverse">
              Reload app
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  message: {
    marginBottom: spacing.base,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
