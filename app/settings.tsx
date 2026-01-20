import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  normalizeMemberRoles,
  normalizeSessionRole,
} from "@/lib/permissions";
import { pickImage } from "@/utils/imagePicker";
import { AppCard } from "@/components/ui/AppCard";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeSocietyDoc, updateSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";
import { subscribeMemberDoc } from "@/lib/db/memberRepo";
import { updateUserDoc } from "@/lib/db/userRepo";
import { resetSocietyData } from "@/lib/db/resetSociety";

export default function SettingsScreen() {
  const { user } = useBootstrap();
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [societyName, setSocietyName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const [adminPin, setAdminPin] = useState("");
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [canAssignRolesRole, setCanAssignRolesRole] = useState(false); // Captain/Admin
  const [canEditLogo, setCanEditLogo] = useState(false); // Captain or Secretary
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hasAlertedRef = useRef(false);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setSociety(null);
      setSocietyName("");
      return;
    }

    const unsubscribe = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setSociety(doc);
      setSocietyName(doc?.name ?? "");
      if (doc?.adminPin) {
        setAdminPin("****");
      } else {
        setAdminPin("");
      }
    });

    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  const [member, setMember] = useState<any>(null);

  useEffect(() => {
    if (!user?.activeMemberId) {
      setMember(null);
      return;
    }
    const unsub = subscribeMemberDoc(user.activeMemberId, (doc) => setMember(doc));
    return () => unsub();
  }, [user?.activeMemberId]);

  const roles = useMemo(() => normalizeMemberRoles(member?.roles), [member?.roles]);

  useEffect(() => {
    const sessionRole = normalizeSessionRole("member");

    // Captain/Admin
    setCanAssignRolesRole(roles.includes("captain"));

    // Captain or Secretary
    setCanEditLogo(roles.includes("captain") || roles.includes("secretary"));
  }, [roles]);

  const handleUploadLogo = async () => {
    if (!society?.id) return;
    try {
      setUploadingLogo(true);
      const image = await pickImage();
      if (!image) return;

      // NOTE: You likely already have upload logic elsewhere.
      // If you store logoUrl directly, set it here.
      await updateSocietyDoc(society.id, { logoUrl: image.uri });
      Alert.alert("Success", "Logo updated");
    } catch (error) {
      console.error("Error uploading logo:", error);
      Alert.alert("Error", "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    if (!society?.id) return;

    Alert.alert("Remove Logo", "Are you sure you want to remove the society logo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await updateSocietyDoc(society.id, { logoUrl: null });
            Alert.alert("Success", "Logo removed");
          } catch (error) {
            console.error("Error removing logo:", error);
            Alert.alert("Error", "Failed to remove logo");
          }
        },
      },
    ]);
  };

  const handleResetSociety = () => {
    Alert.alert(
      "Reset Society",
      "This will delete the society and its data (events, members, courses, expenses) and sign you out of it. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              if (!user?.id || !user.activeSocietyId) return;
              setResetting(true);

              // Delete society + related data first...
              await resetSocietyData(user.activeSocietyId);

              // ...then clear local session pointers.
              await updateUserDoc(user.id, {
                activeSocietyId: null,
                activeMemberId: null,
              });

              // Go to the app home (it will offer Create/Join).
              router.replace("/(tabs)" as any);
            } catch (error) {
              console.error("Error resetting society:", error);
              Alert.alert("Error", "Failed to reset society");
            } finally {
              setResetting(false);
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

        {/* Society Logo */}
        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Society Logo</Text>

          {!canEditLogo && (
            <Text style={styles.helperText}>Only Captain or Secretary can change the logo.</Text>
          )}

          <View style={styles.rowButtons}>
            <Pressable
              onPress={handleUploadLogo}
              style={[styles.primaryButton, (!canEditLogo || uploadingLogo) && styles.disabledButton]}
              disabled={!canEditLogo || uploadingLogo}
            >
              {uploadingLogo ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Upload Logo</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleRemoveLogo}
              style={[styles.secondaryButton, !canEditLogo && styles.disabledButton]}
              disabled={!canEditLogo}
            >
              <Text style={styles.secondaryButtonText}>Remove</Text>
            </Pressable>
          </View>
        </AppCard>

        {/* Roles & Permissions (Captain only) */}
        {canAssignRolesRole && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Roles & Permissions</Text>
            <Pressable onPress={() => router.push("/roles" as any)} style={styles.rolesButton}>
              <Text style={styles.rolesButtonText}>Manage Roles</Text>
            </Pressable>
            <Text style={styles.rolesDescription}>
              Assign roles to members (Captain, Treasurer, Secretary, Handicapper). PIN required.
            </Text>
          </View>
        )}

        {/* Reset Society (Captain only) */}
        {canAssignRolesRole && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger Zone</Text>
            <Pressable
              onPress={handleResetSociety}
              style={[styles.resetButton, resetting && { opacity: 0.6 }]}
              disabled={resetting}
            >
              <Text style={styles.resetButtonText}>{resetting ? "Resetting..." : "Reset Society"}</Text>
            </Pressable>
            <Text style={styles.warningText}>This will permanently delete all your data</Text>
          </View>
        )}

        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  section: { marginBottom: 20, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  helperText: { color: "#666", marginBottom: 12 },
  rowButtons: { flexDirection: "row", gap: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: "#0B6B4F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#111", fontWeight: "700" },
  disabledButton: { opacity: 0.5 },
  rolesButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  rolesButtonText: { color: "#fff", fontWeight: "700" },
  rolesDescription: { color: "#666", marginTop: 10 },
  resetButton: {
    backgroundColor: "#B91C1C",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  resetButtonText: { color: "#fff", fontWeight: "800" },
  warningText: { color: "#B91C1C", marginTop: 10, fontWeight: "600" },
  backButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  backButtonText: { color: "#fff", fontWeight: "700" },
  centerContent: { alignItems: "center", justifyContent: "center" },
  errorText: { color: "#B91C1C", marginBottom: 12 },
  buttonText: { color: "#fff", fontWeight: "700" },
});
