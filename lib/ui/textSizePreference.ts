import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@golf_society_hub_text_size_level";

export type TextSizeLevel = "default" | "large" | "larger";

/** Multipliers applied on top of base theme typography (50+ friendly). */
export const TEXT_SIZE_MULTIPLIERS: Record<TextSizeLevel, number> = {
  default: 1,
  large: 1.1,
  larger: 1.22,
};

export const TEXT_SIZE_LABELS: Record<TextSizeLevel, { title: string; description: string }> = {
  default: { title: "Default", description: "Comfortable for most screens" },
  large: { title: "Large", description: "Easier to read" },
  larger: { title: "Larger", description: "Maximum in-app size" },
};

export async function loadTextSizeLevel(): Promise<TextSizeLevel> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "large" || raw === "larger" || raw === "default") return raw;
  } catch {
    /* ignore */
  }
  return "default";
}

export async function saveTextSizeLevel(level: TextSizeLevel): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, level);
}
