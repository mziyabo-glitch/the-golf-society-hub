/**
 * Add Member Screen
 * 
 * FIRESTORE-ONLY: Members are stored in societies/{societyId}/members/{memberId}
 * No AsyncStorage usage for member data.
 */

import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { getActiveSocietyId } from "@/lib/firebase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from "react-native";
import { listMembers, upsertMember, validateMember } from "@/lib/firestore/members";
import type { MemberData } from "@/lib/models";

export default function AddMemberScreen() {
  const router = useRouter();
  const [memberName, setMemberName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [canCreate, setCanCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    // Get active society ID
    const activeSocietyId = getActiveSocietyId();
    setSocietyId(activeSocietyId);

    if (!activeSocietyId) {
      Alert.alert("No Society Selected", "Please select or create a society first.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }

    const session = await getSession();
    
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canManage = canManageMembers(sessionRole, roles);
    setCanCreate(canManage);
    
    if (!canManage) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Treasurer can add members", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  // Validation: name must be at least 2 characters
  const nameValid = memberName.trim().length >= 2;
  const sexValid = sex === "male" || sex === "female";
  const handicapValid = handicap.trim() === "" || (!isNaN(parseFloat(handicap)) && parseFloat(handicap) >= 0);
  const isFormValid = nameValid && sexValid && handicapValid;

  const handleSubmit = async () => {
    if (!isFormValid || !societyId) return;

    // Pre-validate with our helper
    const member: Partial<MemberData> = {
      name: memberName.trim(),
      handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
      sex: sex as "male" | "female",
    };

    const validation = validateMember(member);
    if (!validation.valid) {
      Alert.alert("Validation Error", validation.errors.join("\n"));
      return;
    }

    setSaving(true);

    try {
      // Check if this is the first member
      const existingMembers = await listMembers(societyId);
      const isFirstMember = existingMembers.length === 0;

      // Determine roles: first member gets Captain/Handicapper, others get Member
      // Roles must be stored as an ARRAY of strings
      const roles: string[] = isFirstMember 
        ? ["captain", "handicapper", "member"] 
        : ["member"];

      // Create new member with unique ID
      const newMember: MemberData = {
        id: `member-${Date.now()}`,
        name: memberName.trim(),
        handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
        sex: sex as "male" | "female",
        roles,
      };

      // Save to Firestore using upsertMember
      const result = await upsertMember(newMember, societyId);
      
      if (!result.success) {
        console.error("[AddMember] Failed to save member:", result.error, {
          societyId,
          memberId: newMember.id,
        });
        Alert.alert(
          "Error", 
          `Failed to save member: ${result.error || "Unknown error"}. Please try again.`
        );
        return;
      }
      
      console.log("[AddMember] Member saved to Firestore:", {
        memberId: newMember.id,
        societyId,
        name: newMember.name,
      });
      
      // If first member OR no current user set, set as current user and admin session
      const session = await getSession();
      if (isFirstMember || !session.currentUserId) {
        const { setCurrentUserId: setSessionUserId, setRole: setSessionRole } = await import("@/lib/session");
        if (!session.currentUserId) {
          await setSessionUserId(newMember.id);
        }
        if (isFirstMember) {
          await setSessionRole("admin");
        }
      }

      // Navigate back on success
      router.back();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[AddMember] Error saving member:", error, { societyId });
      Alert.alert("Error", `Failed to add member: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // Show nothing while checking permissions (will redirect via Alert)
  if (!canCreate) {
    return null;
  }

  // Show "No society" message if societyId is missing
  if (!societyId) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
          No Society Selected
        </Text>
        <Text style={{ fontSize: 14, color: "#6b7280", textAlign: "center" }}>
          Please select or create a society first.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>
          Add Member
        </Text>
        <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
          Add a new member to your society.
        </Text>

        {/* Member Name */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, marginTop: 8 }}>
          Member Name <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <TextInput
          value={memberName}
          onChangeText={setMemberName}
          placeholder="Enter member name (min 2 characters)"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 4,
            borderWidth: memberName.length > 0 && !nameValid ? 1 : 0,
            borderColor: "#ef4444",
          }}
        />
        {memberName.length > 0 && !nameValid && (
          <Text style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }}>
            Name must be at least 2 characters
          </Text>
        )}
        {(memberName.length === 0 || nameValid) && <View style={{ marginBottom: 16 }} />}

        {/* Handicap */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Handicap Index
        </Text>
        <TextInput
          value={handicap}
          onChangeText={setHandicap}
          placeholder="Enter handicap (optional, e.g., 12.5)"
          keyboardType="decimal-pad"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 4,
            borderWidth: handicap.length > 0 && !handicapValid ? 1 : 0,
            borderColor: "#ef4444",
          }}
        />
        {handicap.length > 0 && !handicapValid && (
          <Text style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }}>
            Handicap must be a number &gt;= 0
          </Text>
        )}
        {(handicap.length === 0 || handicapValid) && <View style={{ marginBottom: 16 }} />}

        {/* Sex */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Sex <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => setSex("male")}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: sex === "male" ? "#f0fdf4" : "#f3f4f6",
              alignItems: "center",
              borderWidth: 2,
              borderColor: sex === "male" ? "#0B6E4F" : "transparent",
            }}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: sex === "male" ? "#0B6E4F" : "#6b7280",
            }}>Male</Text>
          </Pressable>
          <Pressable
            onPress={() => setSex("female")}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: sex === "female" ? "#f0fdf4" : "#f3f4f6",
              alignItems: "center",
              borderWidth: 2,
              borderColor: sex === "female" ? "#0B6E4F" : "transparent",
            }}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: sex === "female" ? "#0B6E4F" : "#6b7280",
            }}>Female</Text>
          </Pressable>
        </View>

        {/* Add Member Button */}
        <Pressable
          onPress={handleSubmit}
          disabled={!isFormValid || saving}
          style={{
            backgroundColor: isFormValid && !saving ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            marginTop: 8,
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving && <ActivityIndicator size="small" color="#fff" />}
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            {saving ? "Saving..." : "Add Member"}
          </Text>
        </Pressable>

        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          disabled={saving}
          style={{
            backgroundColor: "#111827",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            opacity: saving ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Back
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
