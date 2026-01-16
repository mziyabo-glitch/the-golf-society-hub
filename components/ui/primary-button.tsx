import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, style, disabled }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled, style]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  text: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});



