/**
 * Add Member Screen
 * 
 * WEB-ONLY PERSISTENCE: All data via Firestore, no AsyncStorage
 */

import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { getMembers, saveMember } from "@/lib/firestore/society";
import type { MemberData } from "@/lib/models";

export default function AddMemberScreen() {
  const router = useRouter();
  const [memberName, setMemberName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canCreate, setCanCreate] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    const session = await getSession();
    setRole(session.role);
    
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

  const isFormValid = memberName.trim().length > 0 && (sex === "male" || sex === "female");

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      // Load existing members from Firestore
      const existingMembers = await getMembers();

      // Determine roles: first member gets Captain/Handicapper, others get Member
      const isFirstMember = existingMembers.length === 0;
      const roles: string[] = isFirstMember 
        ? ["captain", "handicapper", "member"] 
        : ["member"];

      // Create new member
      const newMember: MemberData = {
        id: `member-${Date.now()}`,
        name: memberName.trim(),
        handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
        sex: sex as "male" | "female",
        roles,
      };

      // Save to Firestore
      const success = await saveMember(newMember);
      
      if (!success) {
        Alert.alert("Error", "Failed to save member. Please try again.");
        return;
      }
      
      console.log("[AddMember] Member saved to Firestore:", newMember.id);
      
      // If first member OR no current user set, set as current user and admin session
      const session = await getSession();
      if (isFirstMember || !session.currentUserId) {
        const { setCurrentUserId: setSessionUserId, setRole: setSessionRole } = await import("@/lib/session");
        if (!session.currentUserId) {
          await setSessionUserId(newMember.id);
        }
        if (isFirstMember) {
          await setSessionRole("admin"); // Set session to admin for first user
        }
      }

      // Navigate back
      router.back();
    } catch (error) {
      console.error("Error saving member:", error);
      Alert.alert("Error", "Failed to add member. Please check your connection.");
    }
  };

  if (!canCreate) {
    return null; // Will redirect via Alert
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
          placeholder="Enter member name"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

        {/* Handicap */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Handicap
        </Text>
        <TextInput
          value={handicap}
          onChangeText={setHandicap}
          placeholder="Enter handicap (optional)"
          keyboardType="numeric"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

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
          disabled={!isFormValid}
          style={{
            backgroundColor: isFormValid ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Add Member
          </Text>
        </Pressable>

        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: "#111827",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
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

