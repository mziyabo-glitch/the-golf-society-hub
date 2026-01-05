import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

export default function AddMemberScreen() {
  const router = useRouter();
  const [memberName, setMemberName] = useState("");
  const [handicap, setHandicap] = useState("");
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
      Alert.alert("Access Denied", "Only Captain or Secretary can add members", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const isFormValid = memberName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      // Load existing members
      const existingMembersData = await AsyncStorage.getItem(MEMBERS_KEY);
      const existingMembers: MemberData[] = existingMembersData
        ? JSON.parse(existingMembersData)
        : [];

      // Determine roles: first member gets Captain/Handicapper, others get Member
      const isFirstMember = existingMembers.length === 0;
      const roles: string[] = isFirstMember 
        ? ["Captain", "Handicapper", "Member"] 
        : ["Member"];

      // Create new member
      const newMember: MemberData = {
        id: Date.now().toString(),
        name: memberName.trim(),
        handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
        roles,
      };

      // Append to array and save
      const updatedMembers = [...existingMembers, newMember];
      await AsyncStorage.setItem(MEMBERS_KEY, JSON.stringify(updatedMembers));
      
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

