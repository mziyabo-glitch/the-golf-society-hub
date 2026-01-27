// lib/supabase.ts
// SINGLETON Supabase client - use this everywhere
// DO NOT create additional clients elsewhere

import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. " +
    "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file."
  );
}

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStorage: Record<string, string> = {};

function getWebStorage(): StorageAdapter {
  return {
    async getItem(key: string) {
      if (typeof window === "undefined") return memoryStorage[key] ?? null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryStorage[key] ?? null;
      }
    },
    async setItem(key: string, value: string) {
      if (typeof window === "undefined") {
        memoryStorage[key] = value;
        return;
      }
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memoryStorage[key] = value;
      }
    },
    async removeItem(key: string) {
      if (typeof window === "undefined") {
        delete memoryStorage[key];
        return;
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        delete memoryStorage[key];
      }
    },
  };
}

let asyncStorage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} | null = null;

function getNativeStorage(): StorageAdapter {
  if (!asyncStorage) {
    try {
      asyncStorage = require("@react-native-async-storage/async-storage").default;
    } catch (error) {
      console.warn("[supabase] AsyncStorage unavailable, using memory store", error);
      asyncStorage = null;
    }
  }

  if (!asyncStorage) {
    return {
      async getItem(key: string) {
        return memoryStorage[key] ?? null;
      },
      async setItem(key: string, value: string) {
        memoryStorage[key] = value;
      },
      async removeItem(key: string) {
        delete memoryStorage[key];
      },
    };
  }

  return {
    async getItem(key: string) {
      return asyncStorage?.getItem(key) ?? null;
    },
    async setItem(key: string, value: string) {
      await asyncStorage?.setItem(key, value);
    },
    async removeItem(key: string) {
      await asyncStorage?.removeItem(key);
    },
  };
}

function getStorageAdapter(): StorageAdapter {
  return Platform.OS === "web" ? getWebStorage() : getNativeStorage();
}

// Singleton instance
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Web: localStorage, Native: AsyncStorage (or memory fallback)
      storage: getStorageAdapter(),
      // Persist session across app restarts
      persistSession: true,
      // Automatically refresh token before expiry
      autoRefreshToken: true,
      // Detect OAuth callback in URL (for social logins)
      detectSessionInUrl: Platform.OS === "web",
      // Storage key for session
      storageKey: "supabase-auth",
    },
  });

  return supabaseInstance;
}

// Export the singleton client
export const supabase = getSupabaseClient();

// Type export for consumers that need it
export type { SupabaseClient };
