import * as SecureStore from "expo-secure-store";

/**
 * Secure storage adapter for Supabase auth.
 * Stores ONLY the auth session token (encrypted).
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
