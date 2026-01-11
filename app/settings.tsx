/**
 * HOW TO TEST:
 * - As member: try to access settings (should show alert and redirect)
 * - As captain: verify can access settings
 * - Set/change Admin PIN
 * - Access Roles & Permissions section (PIN-gated)
 * - Assign roles to members
 * - Verify roles persist and are enforced
 * - Export data (web: download JSON, native: share)
 * - Import data (validates JSON schema, confirms overwrite)
 * - Reset data (danger action with confirm modal)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image, ActivityIndicator, Platform, Modal } from "react-native";
import * as Sharing from "expo-sharing";
import { Paths, File as ExpoFile } from "expo-file-system";

import { canAssignRoles, normalizeMemberRoles, normalizeSessionRole, canEditVenueInfo } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import { pickImage } from "@/utils/imagePicker";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { spacing } from "@/lib/ui/theme";
import { 
  exportAppData, 
  importAppData, 
  resetAppData, 
  loadAppData,
  DATA_VERSION 
} from "@/lib/data-store";
// Use shared Firestore helper (same as other screens)
import { getSociety as getFirestoreSociety, deleteSocietyCascade } from "@/lib/firestore/society";
import { getActiveSocietyId } from "@/lib/firebase";
import { showAlert } from "@/lib/guards";

// Storage keys for backward compatibility during migration
const STORAGE_KEY = STORAGE_KEYS.SOCIETY_ACTIVE;
const ADMIN_PIN_KEY = STORAGE_KEYS.ADMIN_PIN;

type SocietyData = {
  name: string;
  homeCourse: string;
  country: string;
  scoringMode: "Stableford" | "Strokeplay" | "Both";
  handicapRule: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
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
  const [canEditLogo, setCanEditLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSociety();
    }, [])
  );

  /**
   * Load society using the same getSociety() helper as other screens
   * This ensures consistent behavior across the app
   */
  const loadSociety = async () => {
    setLoading(true);
    try {
      // Use the shared Firestore helper (with AsyncStorage fallback)
      // This is the same function used by leaderboard, tee sheet, etc.
      const societyData = await getFirestoreSociety();
      
      if (societyData) {
        // Map Firestore society data to local SocietyData type
        const localSociety: SocietyData = {
          name: societyData.name || "Golf Society",
          homeCourse: "", // Not stored in Firestore yet
          country: "", // Not stored in Firestore yet
          scoringMode: "Stableford", // Default
          handicapRule: "Allow WHS", // Default
          logoUrl: societyData.logoUrl || null,
        };
        
        // Try to load additional fields from AsyncStorage (backward compatibility)
        try {
          const localData = await AsyncStorage.getItem(STORAGE_KEY);
          if (localData) {
            const parsed = JSON.parse(localData);
            localSociety.homeCourse = parsed.homeCourse || "";
            localSociety.country = parsed.country || "";
            localSociety.scoringMode = parsed.scoringMode || "Stableford";
            localSociety.handicapRule = parsed.handicapRule || "Allow WHS";
            // Use local logoUrl if Firestore doesn't have one
            if (!localSociety.logoUrl && parsed.logoUrl) {
              localSociety.logoUrl = parsed.logoUrl;
            }
          }
        } catch (localError) {
          console.warn("[Settings] Error loading local society data:", localError);
        }
        
        setSociety(localSociety);
        setSocietyName(localSociety.name);
        console.log("[Settings] Society loaded:", localSociety.name);
      } else {
        // No society found - redirect to onboarding
        console.log("[Settings] No society found, redirecting to create-society");
        showAlert(
          "No Society Found",
          "Please create or join a society first.",
          [{ text: "OK", onPress: () => router.replace("/create-society") }]
        );
        return;
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
      
      // Check if user can edit logo (Captain or Secretary)
      const canEdit = canEditVenueInfo(sessionRole, roles);
      setCanEditLogo(canEdit);
      
      if (session.role !== "admin" && !canAssign) {
        showAlert("Access Denied", "Only admins can access settings", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("[Settings] Error loading society:", error);
      showAlert(
        "Error",
        "Failed to load society data. Please try again.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
    }
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
      showAlert("Success", "Society name updated");
    } catch (error) {
      console.error("Error saving society name:", error);
      showAlert("Error", "Failed to update society name");
    }
  };

  const handleSavePin = async () => {
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      showAlert("Error", "PIN must be exactly 4 digits");
      return;
    }

    if (newPin !== confirmPin) {
      showAlert("Error", "PINs do not match");
      return;
    }

    try {
      await AsyncStorage.setItem(ADMIN_PIN_KEY, newPin);
      setAdminPin("****");
      setNewPin("");
      setConfirmPin("");
      setIsEditingPin(false);
      showAlert("Success", "Admin PIN saved");
    } catch (error) {
      console.error("Error saving PIN:", error);
      showAlert("Error", "Failed to save PIN");
    }
  };

  const handleLogoUpload = async () => {
    if (!canEditLogo) {
      showAlert("Access Denied", "Only Captain or Secretary can upload logo");
      return;
    }

    if (!society) {
      showAlert("Error", "No society found");
      return;
    }

    try {
      setUploadingLogo(true);
      
      // Pick image using expo-image-picker
      const result = await pickImage();
      if (!result || !result.uri) {
        setUploadingLogo(false);
        return;
      }

      // Convert image to base64 data URL for storage in AsyncStorage
      // Note: For production with Firebase Storage, upload to /societies/{societyId}/logo and store download URL
      let logoUrl: string;
      
      try {
        // Fetch image and convert to base64 data URL for cross-platform compatibility
        const response = await fetch(result.uri);
        if (!response.ok) {
          throw new Error("Failed to fetch image");
        }
        
        const blob = await response.blob();
        
        // Convert blob to base64 data URL
        const reader = new FileReader();
        logoUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to convert image to base64"));
            }
          };
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error("Error processing image:", error);
        // Fallback: use local URI (works but may not persist across app restarts/updates)
        // TODO: Implement Firebase Storage upload for production use
        logoUrl = result.uri;
        console.warn("Using local URI - consider implementing Firebase Storage for production");
      }

      // Save logo URL to society
      const updatedSociety: SocietyData = {
        ...society,
        logoUrl: logoUrl,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSociety));
      setSociety(updatedSociety);
      showAlert("Success", "Logo uploaded successfully");
    } catch (error) {
      console.error("Error uploading logo:", error);
      showAlert("Error", "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!canEditLogo) {
      showAlert("Access Denied", "Only Captain or Secretary can remove logo");
      return;
    }

    if (!society) {
      return;
    }

    showAlert(
      "Remove Logo",
      "Are you sure you want to remove the society logo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const updatedSociety: SocietyData = {
                ...society,
                logoUrl: null,
              };
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSociety));
              setSociety(updatedSociety);
              showAlert("Success", "Logo removed");
            } catch (error) {
              console.error("Error removing logo:", error);
              showAlert("Error", "Failed to remove logo");
            }
          },
        },
      ]
    );
  };

  // ============================================
  // Export Data
  // ============================================
  const handleExportData = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const jsonData = await exportAppData();
      const fileName = `golf-society-backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === "web") {
        // Web: Download as file
        try {
          const blob = new Blob([jsonData], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showAlert("Success", "Data exported successfully. Check your downloads folder.");
        } catch (webError) {
          console.error("Web export error:", webError);
          // Fallback: show in modal for copy
          setImportJsonText(jsonData);
          showAlert("Export", "Copy the data below:", [
            { text: "OK" }
          ]);
        }
      } else {
        // Native: Share JSON file
        try {
          const file = new ExpoFile(Paths.cache, fileName);
          await file.write(jsonData);
          
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(file.uri, {
              mimeType: "application/json",
              dialogTitle: "Export Golf Society Data",
            });
          } else {
            showAlert("Export", `Data saved to: ${file.uri}`);
          }
        } catch (fsError) {
          console.error("FileSystem error:", fsError);
          showAlert("Error", "Failed to export data on this device");
        }
      }
    } catch (error) {
      console.error("Export error:", error);
      showAlert("Error", "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  // ============================================
  // Import Data
  // ============================================
  const handleImportClick = () => {
    if (Platform.OS === "web") {
      // Web: Use file input
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } else {
      // Native: Show modal for paste
      setImportJsonText("");
      setShowImportModal(true);
    }
  };

  const handleFileSelected = async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await processImport(text);
    } catch (error) {
      console.error("File read error:", error);
      showAlert("Error", "Failed to read file");
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processImport = async (jsonText: string) => {
    setIsImporting(true);
    
    try {
      // Validate JSON first
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        showAlert("Error", "Invalid JSON format");
        setIsImporting(false);
        return;
      }

      // Check version
      const dataVersion = parsed.version || "unknown";
      const memberCount = parsed.members?.length || 0;
      const eventCount = parsed.events?.length || 0;

      showAlert(
        "Confirm Import",
        `This will replace all existing data with:\n\n` +
        `• Version: ${dataVersion}\n` +
        `• Members: ${memberCount}\n` +
        `• Events: ${eventCount}\n\n` +
        `This cannot be undone. Continue?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsImporting(false) },
          {
            text: "Import",
            style: "destructive",
            onPress: async () => {
              const result = await importAppData(jsonText);
              if (result.success) {
                showAlert("Success", "Data imported successfully. Reloading...", [
                  { text: "OK", onPress: () => {
                    setShowImportModal(false);
                    loadSociety(); // Reload data
                  }}
                ]);
              } else {
                showAlert("Import Failed", result.error || "Unknown error");
              }
              setIsImporting(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Import error:", error);
      showAlert("Error", "Failed to import data");
      setIsImporting(false);
    }
  };

  const handleImportFromModal = () => {
    if (!importJsonText.trim()) {
      showAlert("Error", "Please paste JSON data");
      return;
    }
    processImport(importJsonText);
  };

  // ============================================
  // Reset Data
  // ============================================
  const handleResetClick = () => {
    setResetConfirmText("");
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    if (resetConfirmText !== "DELETE") {
      showAlert("Error", "Please type DELETE to confirm");
      return;
    }

    try {
      console.log("[Settings] Starting society reset...");
      
      // 1. Delete from Firestore (if there's an active society)
      const societyId = getActiveSocietyId();
      if (societyId) {
        console.log("[Settings] Deleting society from Firestore:", societyId);
        const result = await deleteSocietyCascade(societyId);
        if (!result.success) {
          console.error("[Settings] Firestore delete failed:", result.error);
          showAlert("Error", result.error || "Failed to delete society from Firestore");
          return;
        }
        console.log("[Settings] Firestore delete complete:", result.deletedCounts);
      }
      
      // 2. Also clear AsyncStorage (for any local data)
      await resetAppData();
      
      setShowResetModal(false);
      console.log("[Settings] Society reset complete");
      
      showAlert("Success", "All data has been reset", [
        { text: "OK", onPress: () => router.replace("/create-society" as any) }
      ]);
    } catch (error) {
      console.error("[Settings] Reset error:", error);
      showAlert("Error", `Failed to reset data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleResetSociety = () => {
    handleResetClick();
  };

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  // No society found - should have redirected, but show fallback
  if (!society) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>No society found</Text>
        <Text style={styles.errorSubtext}>Please create or join a society first.</Text>
        <Pressable 
          onPress={() => router.replace("/create-society")} 
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Create Society</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Society Settings</Text>

        {/* Society Logo */}
        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Society Logo</Text>
          <View style={styles.logoContainer}>
            {society.logoUrl ? (
              <Image source={{ uri: society.logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderText}>Logo</Text>
              </View>
            )}
            {canEditLogo && (
              <View style={styles.logoActions}>
                <Pressable
                  onPress={handleLogoUpload}
                  disabled={uploadingLogo}
                  style={[styles.logoButton, uploadingLogo && styles.logoButtonDisabled]}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator size="small" color="#0B6E4F" />
                  ) : (
                    <Text style={styles.logoButtonText}>
                      {society.logoUrl ? "Change Logo" : "Upload Logo"}
                    </Text>
                  )}
                </Pressable>
                {society.logoUrl && (
                  <Pressable
                    onPress={handleRemoveLogo}
                    style={[styles.logoButton, styles.logoButtonRemove]}
                  >
                    <Text style={styles.logoButtonTextRemove}>Remove</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          {!canEditLogo && (
            <Text style={styles.permissionText}>
              Only Captain or Secretary can upload logo
            </Text>
          )}
        </AppCard>

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

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <Text style={styles.dataVersionText}>Data Version: {DATA_VERSION}</Text>
          
          {/* Export Button */}
          <Pressable 
            onPress={handleExportData} 
            style={[styles.dataButton, isExporting && styles.dataButtonDisabled]}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.dataButtonText}>
                {Platform.OS === "web" ? "Download Backup" : "Export Data"}
              </Text>
            )}
          </Pressable>
          
          {/* Import Button */}
          <Pressable 
            onPress={handleImportClick} 
            style={[styles.dataButton, styles.dataButtonSecondary]}
            disabled={isImporting}
          >
            <Text style={styles.dataButtonTextSecondary}>
              {Platform.OS === "web" ? "Import from File" : "Import Data"}
            </Text>
          </Pressable>
          
          {/* Hidden file input for web */}
          {Platform.OS === "web" && (
            <input
              ref={fileInputRef as any}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelected}
              style={{ display: "none" }}
            />
          )}
          
          <Text style={styles.dataHelpText}>
            Export your data to back it up. Import to restore from a backup file.
          </Text>
        </View>

        {/* Reset Society */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Pressable onPress={handleResetSociety} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset All Data</Text>
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

      {/* Import Modal (for native) */}
      <Modal
        visible={showImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Import Data</Text>
            <Text style={styles.modalSubtitle}>Paste your backup JSON below:</Text>
            
            <TextInput
              value={importJsonText}
              onChangeText={setImportJsonText}
              placeholder='{"version": 1, "society": {...}}'
              multiline
              numberOfLines={10}
              style={styles.importTextArea}
            />
            
            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => setShowImportModal(false)} 
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleImportFromModal}
                disabled={isImporting}
                style={[styles.modalImportButton, isImporting && styles.dataButtonDisabled]}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalImportButtonText}>Import</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚠️ Reset All Data</Text>
            <Text style={styles.modalWarningText}>
              This will permanently delete ALL your data including:
            </Text>
            <View style={styles.resetList}>
              <Text style={styles.resetListItem}>• Society information</Text>
              <Text style={styles.resetListItem}>• All members</Text>
              <Text style={styles.resetListItem}>• All events and results</Text>
              <Text style={styles.resetListItem}>• All courses and tee sets</Text>
              <Text style={styles.resetListItem}>• Admin PIN</Text>
            </View>
            <Text style={styles.modalWarningText}>
              This cannot be undone. Type DELETE to confirm:
            </Text>
            
            <TextInput
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder="Type DELETE"
              autoCapitalize="characters"
              style={styles.resetConfirmInput}
            />
            
            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => setShowResetModal(false)} 
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleConfirmReset}
                style={[
                  styles.modalResetButton,
                  resetConfirmText !== "DELETE" && styles.dataButtonDisabled
                ]}
                disabled={resetConfirmText !== "DELETE"}
              >
                <Text style={styles.modalResetButtonText}>Reset Everything</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ef4444",
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
  logoContainer: {
    alignItems: "center",
    marginTop: spacing.base,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: spacing.sm,
    marginBottom: spacing.base,
    backgroundColor: "#f3f4f6",
  },
  logoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: spacing.sm,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.base,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
  },
  logoPlaceholderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9ca3af",
  },
  logoActions: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
  },
  logoButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: spacing.sm,
    backgroundColor: "#0B6E4F",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  logoButtonDisabled: {
    opacity: 0.6,
  },
  logoButtonRemove: {
    backgroundColor: "#ef4444",
  },
  logoButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  logoButtonTextRemove: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  permissionText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: spacing.xs,
    textAlign: "center",
  },
  // Data Management styles
  dataVersionText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 12,
  },
  dataButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  dataButtonSecondary: {
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#0B6E4F",
  },
  dataButtonDisabled: {
    opacity: 0.5,
  },
  dataButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  dataButtonTextSecondary: {
    color: "#0B6E4F",
    fontSize: 16,
    fontWeight: "600",
  },
  dataHelpText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
    textAlign: "center",
  },
  modalWarningText: {
    fontSize: 14,
    color: "#dc2626",
    marginBottom: 12,
    textAlign: "center",
  },
  importTextArea: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minHeight: 150,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  modalImportButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#0B6E4F",
    alignItems: "center",
  },
  modalImportButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalResetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#dc2626",
    alignItems: "center",
  },
  modalResetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  resetList: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  resetListItem: {
    fontSize: 14,
    color: "#991b1b",
    marginVertical: 2,
  },
  resetConfirmInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 2,
    borderColor: "#dc2626",
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
});

