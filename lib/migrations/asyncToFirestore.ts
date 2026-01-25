import { Platform } from "react-native";
import { ensureSignedIn } from "@/lib/firebase";
import { ensureUserDoc, getUserDoc, updateUserDoc } from "@/lib/firebase/firestore";

// Legacy AsyncStorage keys from older versions
const LEGACY_KEYS = {
  activeSocietyId: "activeSocietyId",
  activeMemberId: "activeMemberId",
  // Keep these for backwards compatibility, but we will not overwrite Firestore with null.
  selectedSocietyId: "selectedSocietyId",
  selectedMemberId: "selectedMemberId",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function getAsyncStorageSafe(): Promise<{
  getItem: (key: string) => Promise<string | null>;
  multiGet?: (keys: string[]) => Promise<[string, string | null][]>;
} | null> {
  // Only migrate on native. On web this causes accidental null overwrites & isn’t needed.
  if (Platform.OS === "web") return null;

  try {
    // Dynamic require to avoid web bundling issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require("@react-native-async-storage/async-storage").default;
    return AS ?? null;
  } catch {
    return null;
  }
}

/**
 * Migrates legacy AsyncStorage values into users/{uid} Firestore doc.
 *
 * HARD RULES:
 * - Native only (never runs on web).
 * - Never overwrite Firestore fields with null/empty.
 * - If Firestore already has activeSocietyId/activeMemberId, we do NOT replace them.
 * - Sets migratedFromAsyncStorageV1=true once checked, so we don't re-run every launch.
 */
export async function runAsyncStorageMigration(): Promise<void> {
  const AsyncStorage = await getAsyncStorageSafe();
  if (!AsyncStorage) return; // web or missing module -> do nothing

  const uid = await ensureSignedIn();
  await ensureUserDoc(uid);

  const existing = await getUserDoc(uid);
  if (existing?.migratedFromAsyncStorageV1) {
    return;
  }

  // Read legacy keys
  let activeSocietyId: string | null = null;
  let activeMemberId: string | null = null;

  try {
    if (AsyncStorage.multiGet) {
      const rows = await AsyncStorage.multiGet([
        LEGACY_KEYS.activeSocietyId,
        LEGACY_KEYS.activeMemberId,
        LEGACY_KEYS.selectedSocietyId,
        LEGACY_KEYS.selectedMemberId,
      ]);

      const map = new Map(rows);
      const aSoc = map.get(LEGACY_KEYS.activeSocietyId);
      const aMem = map.get(LEGACY_KEYS.activeMemberId);
      const sSoc = map.get(LEGACY_KEYS.selectedSocietyId);
      const sMem = map.get(LEGACY_KEYS.selectedMemberId);

      // Prefer active* keys, fall back to selected* keys
      activeSocietyId = isNonEmptyString(aSoc) ? aSoc : isNonEmptyString(sSoc) ? sSoc : null;
      activeMemberId = isNonEmptyString(aMem) ? aMem : isNonEmptyString(sMem) ? sMem : null;
    } else {
      const aSoc = await AsyncStorage.getItem(LEGACY_KEYS.activeSocietyId);
      const aMem = await AsyncStorage.getItem(LEGACY_KEYS.activeMemberId);
      const sSoc = await AsyncStorage.getItem(LEGACY_KEYS.selectedSocietyId);
      const sMem = await AsyncStorage.getItem(LEGACY_KEYS.selectedMemberId);

      activeSocietyId = isNonEmptyString(aSoc) ? aSoc : isNonEmptyString(sSoc) ? sSoc : null;
      activeMemberId = isNonEmptyString(aMem) ? aMem : isNonEmptyString(sMem) ? sMem : null;
    }
  } catch {
    // If AsyncStorage read fails, we still mark migrated to avoid looping forever.
    await updateUserDoc(uid, { migratedFromAsyncStorageV1: true });
    return;
  }

  // Build patch carefully:
  // - Only set fields if Firestore is missing them AND we have a non-empty legacy value.
  const patch: Record<string, unknown> = {
    migratedFromAsyncStorageV1: true,
  };

  const firestoreActiveSocietyId = existing?.activeSocietyId;
  const firestoreActiveMemberId = existing?.activeMemberId;

  if (!isNonEmptyString(firestoreActiveSocietyId) && isNonEmptyString(activeSocietyId)) {
    patch.activeSocietyId = activeSocietyId;
  }

  if (!isNonEmptyString(firestoreActiveMemberId) && isNonEmptyString(activeMemberId)) {
    patch.activeMemberId = activeMemberId;
  }

  // IMPORTANT: We do NOT set activeSocietyId/activeMemberId to null.
  await updateUserDoc(uid, patch);
}
