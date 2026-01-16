import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type SecondaryActionButtonProps = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
};

export function SecondaryActionButton({ label, onPress, style }: SecondaryActionButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.button, style]}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  text: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
});



