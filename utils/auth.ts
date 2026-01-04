/**
 * Auth utility functions
 * Handles current user and role management
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const CURRENT_USER_KEY = "GSOCIETY_CURRENT_USER";

export type UserRole = "admin" | "member";

export type UserData = {
  userId: string;
  role: UserRole;
};

export async function getCurrentUser(): Promise<UserData | null> {
  try {
    const userData = await AsyncStorage.getItem(CURRENT_USER_KEY);
    if (userData) {
      return JSON.parse(userData);
    }
    return null;
  } catch (error) {
    console.error("Error loading current user:", error);
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.userId || null;
}



