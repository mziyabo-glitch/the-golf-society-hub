/**
 * HOW TO TEST:
 * - As member: try to access settings (should show alert and redirect)
 * - As captain: verify can access settings
 * - Set/change Admin PIN
 * - Access Roles & Permissions section (PIN-gated)
 * - Assign roles to members
 * - Verify roles persist and are enforced
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { canAssignRoles, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import { loadThemeFromStorage, saveThemeToStorage, ThemeMode } from "@/lib/ui/theme";

const STORAGE_KEY = STORAGE_KEYS.SOCIETY_ACTIVE;
const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;
const SCORES_KEY = STORAGE_KEYS.SCORES;
const DRAFT_KEY = STORAGE_KEYS.SOCIETY_DRAFT;
const ADMIN_PIN_KEY = STORAGE_KEYS.ADMIN_PIN;

type SocietyData = {
  name: string;
  homeCourse: string;
  country: string;
  scoringMode: "Stableford" | "Strokeplay" | "Both";
  handicapRule: "Allow WHS" | "Fixed HCP" | "No HCP";
};

export default function SettingsScreen() {
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [societyName, setSocietyName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canAssignRolesRole, setCanAssignRolesRole] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");

  useFocusEffect(
    useCallback(() => {
      loadSociety();
      loadTheme();
    }, [])
  );

  const loadSociety = async () => {
    try {
      const societyData = await AsyncStorage.getItem(STORAGE_KEY);
      if (societyData) {
        const parsed: SocietyData = JSON.parse(societyData);
        setSociety(parsed);
        setSocietyName(parsed.name);
      }

      // Load admin PIN
      const pin = await AsyncStorage.getItem(ADMIN_PIN_KEY);
      if (pin) {
        setAdminPin("****"); // Show masked PIN
      }

      // Load session (single source of truth)
      const session = await getSession();
      setRole(session.role);
      
      const sessionRole = normalizeSessionRole(session.role);
      const roles = normalizeMemberRoles(await getCurrentUserRoles());
      const canAssign = canAssignRoles(sessionRole, roles);
      setCanAssignRolesRole(canAssign);
      
      if (session.role !== "admin" && !canAssign) {
        Alert.alert("Access Denied", "Only admins can access settings", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Error loading society:", error);
    }
  };

  const loadTheme = async () => {
    const mode = await loadThemeFromStorage();
    setThemeModeState(mode);
  };

  const handleToggleTheme = async () => {
    const newMode: ThemeMode = themeMode === "light" ? "dark" : "light";
    await saveThemeToStorage(newMode);
    setThemeModeState(newMode);
  };

  // Allow access if admin session OR has captain role (checked in loadSociety)
  // if (role !== "admin" && !canAssignRolesRole && society) {
  //   return null; // Will redirect via Alert
  // }

  const handleSaveName = async () => {
    if (!society || !societyName.trim()) return;

    try {
      const updatedSociety: SocietyData = {
        ...society,
        name: societyName.trim(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSociety));
      setSociety(updatedSociety);
      setIsEditingName(false);
      Alert.alert("Success", "Society name updated");
    } catch (error) {
      console.error("Error saving society name:", error);
      Alert.alert("Error", "Failed to update society name");
    }
  };

  const handleSavePin = async () => {
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      Alert.alert("Error", "PIN must be exactly 4 digits");
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert("Error", "PINs do not match");
      return;
    }

    try {
      await AsyncStorage.setItem(ADMIN_PIN_KEY, newPin);
      setAdminPin("****");
      setNewPin("");
      setConfirmPin("");
      setIsEditingPin(false);
      Alert.alert("Success", "Admin PIN saved");
    } catch (error) {
      console.error("Error saving PIN:", error);
      Alert.alert("Error", "Failed to save PIN");
    }
  };

  const handleResetSociety = () => {
    Alert.alert(
      "Reset Society",
      "This will delete all your data (society, events, members, scores, and session). This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              const { resetAllData } = await import("@/lib/storage");
              await resetAllData();
              // Redirect to create-society screen
              router.replace("/create-society");
            } catch (error) {
              console.error("Error resetting society:", error);
              Alert.alert("Error", "Failed to reset society");
            }
          },
        },
      ]
    );
  };

  if (!society) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>No society found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Society Settings</Text>

        {/* Rename Society */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Society Name</Text>
          {isEditingName ? (
            <View>
              <TextInput
                value={societyName}
                onChangeText={setSocietyName}
                placeholder="Enter society name"
                style={styles.input}
                autoFocus
              />
              <View style={styles.editActions}>
                <Pressable
                  onPress={() => {
                    setSocietyName(society.name);
                    setIsEditingName(false);
                  }}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveName} style={styles.saveButton}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.nameValue}>{society.name}</Text>
              <Pressable
                onPress={() => setIsEditingName(true)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Admin PIN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin PIN</Text>
          {isEditingPin ? (
            <View>
              <Text style={styles.fieldLabel}>New PIN (4 digits)</Text>
              <TextInput
                value={newPin}
                onChangeText={setNewPin}
                placeholder="0000"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Confirm PIN</Text>
              <TextInput
                value={confirmPin}
                onChangeText={setConfirmPin}
                placeholder="0000"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                style={styles.input}
              />
              <View style={styles.editActions}>
                <Pressable
                  onPress={() => {
                    setIsEditingPin(false);
                    setNewPin("");
                    setConfirmPin("");
                  }}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSavePin} style={styles.saveButton}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.nameValue}>{adminPin || "Not set"}</Text>
              <Pressable
                onPress={() => setIsEditingPin(true)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>
                  {adminPin ? "Change" : "Set"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Theme Preference */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.nameRow}>
            <View>
              <Text style={styles.nameValue}>Theme</Text>
              <Text style={styles.fieldLabel}>{themeMode === "light" ? "Light" : "Dark"}</Text>
            </View>
            <Pressable
              onPress={handleToggleTheme}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>
                Switch to {themeMode === "light" ? "Dark" : "Light"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Roles & Permissions - PIN Gated */}
        {canAssignRolesRole && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Roles & Permissions</Text>
            <Pressable
              onPress={() => router.push("/roles" as any)}
              style={styles.rolesButton}
            >
              <Text style={styles.rolesButtonText}>Manage Roles</Text>
            </Pressable>
            <Text style={styles.rolesDescription}>
              Assign roles to members (Captain, Treasurer, Secretary, Handicapper). PIN required.
            </Text>
          </View>
        )}

        {/* Reset Society */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Pressable onPress={handleResetSociety} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset Society</Text>
          </Pressable>
          <Text style={styles.warningText}>
            This will permanently delete all your data
          </Text>
        </View>

        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 32,
    marginTop: 8,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
  },
  nameValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0B6E4F",
  },
  input: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0B6E4F",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  resetButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  resetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  warningText: {
    fontSize: 12,
    opacity: 0.6,
    color: "#111827",
    textAlign: "center",
  },
  rolesButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  rolesButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  rolesDescription: {
    fontSize: 12,
    opacity: 0.7,
    color: "#111827",
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
});

