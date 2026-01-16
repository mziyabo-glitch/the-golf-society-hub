import AsyncStorage from "@react-native-async-storage/async-storage";

import { ensureSignedIn } from "@/lib/firebase";
import { ensureUserDoc, getUserDoc, updateUserDoc } from "@/lib/db/userRepo";

const LEGACY_KEYS = {
  activeSociety: "GSOCIETY_ACTIVE",
  activeSocietyId: "activeSocietyId",
  activeMemberId: "activeMemberId",
  sessionMemberId: "session.currentUserId",
  themeMode: "GSOCIETY_THEME_MODE",
};

export async function runAsyncStorageMigration(): Promise<void> {
  const uid = await ensureSignedIn();
  await ensureUserDoc(uid);

  const existingUser = await getUserDoc(uid);
  if (existingUser?.migratedFromAsyncStorageV1) {
    return;
  }

  const [rawSociety, rawActiveSocietyId, rawActiveMemberId, rawSessionMemberId, rawThemeMode] =
    await Promise.all([
      AsyncStorage.getItem(LEGACY_KEYS.activeSociety),
      AsyncStorage.getItem(LEGACY_KEYS.activeSocietyId),
      AsyncStorage.getItem(LEGACY_KEYS.activeMemberId),
      AsyncStorage.getItem(LEGACY_KEYS.sessionMemberId),
      AsyncStorage.getItem(LEGACY_KEYS.themeMode),
    ]);

  let activeSocietyId: string | null = rawActiveSocietyId || null;
  if (!activeSocietyId && rawSociety) {
    try {
      const parsed = JSON.parse(rawSociety) as { id?: string | null };
      activeSocietyId = parsed?.id ?? null;
    } catch (error) {
      console.warn("[Migration] Failed to parse legacy society data:", error);
    }
  }

  const activeMemberId = rawActiveMemberId || rawSessionMemberId || null;
  const themeMode = rawThemeMode === "dark" || rawThemeMode === "light" ? rawThemeMode : undefined;

  await updateUserDoc(uid, {
    activeSocietyId,
    activeMemberId,
    themeMode,
    migratedFromAsyncStorageV1: true,
  });
}
