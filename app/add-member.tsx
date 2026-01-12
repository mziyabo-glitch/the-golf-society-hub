/**
 * Add Member Screen
 * 
 * FIRESTORE-ONLY: Members are stored in societies/{societyId}/members/{memberId}
 * No AsyncStorage usage for member data.
 */

import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { getActiveSocietyId, isFirebaseConfigured, ensureSignedIn, getCurrentUserUid } from "@/lib/firebase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from "react-native";
import { listMembers, upsertMember, validateMember } from "@/lib/firestore/members";
import { NoSocietyGuard } from "@/components/NoSocietyGuard";
import type { MemberData } from "@/lib/models";

export default function AddMemberScreen() {
  const router = useRouter();
  const [memberName, setMemberName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [canCreate, setCanCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true); // Track initial load state

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    setInitializing(true);
    
    try {
      // Ensure user is signed in (Firebase Auth)
      try {
        await ensureSignedIn();
      } catch (error) {
        console.error("[AddMember] Failed to sign in:", error);
        Alert.alert("Authentication Error", "Failed to authenticate. Please try again.", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }
      
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
      const rawRoles = await getCurrentUserRoles();
      const roles = normalizeMemberRoles(rawRoles ?? []);
      const canManage = canManageMembers(sessionRole, roles);
      setCanCreate(canManage);
      
      if (!canManage) {
        Alert.alert("Access Denied", "Only Captain, Secretary, or Treasurer can add members", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("[AddMember] Error loading session:", error);
      Alert.alert("Error", "Failed to load. Please try again.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } finally {
      setInitializing(false);
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
      // Ensure we have an authenticated user
      const authUid = getCurrentUserUid();
      if (!authUid) {
        Alert.alert("Not Signed In", "Please wait while we sign you in...");
        await ensureSignedIn();
      }
      
      // Check if this is the first member
      const existingMembers = await listMembers(societyId);
      const isFirstMember = existingMembers.length === 0;

      // Determine roles: first member gets Captain/Handicapper, others get Member
      // Roles must be stored as an ARRAY of strings
      const roles: string[] = isFirstMember 
        ? ["captain", "handicapper", "member"] 
        : ["member"];

      // For first member OR if they're adding themselves, use auth.uid as doc ID
      // This ensures security rules can verify member identity
      const useAuthUidAsId = isFirstMember;
      const memberId = useAuthUidAsId ? getCurrentUserUid() || `member-${Date.now()}` : `member-${Date.now()}`;
      
      // Create new member with unique ID
      const newMember: MemberData = {
        id: memberId,
        name: memberName.trim(),
        handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
        sex: sex as "male" | "female",
        roles,
      };

      // Save to Firestore using upsertMember
      // Pass useAuthUidAsId to store uid field and link to auth user
      const result = await upsertMember(newMember, societyId, useAuthUidAsId);
      
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
      
      // Use the returned memberId (which may have been set to auth.uid)
      const savedMemberId = result.memberId || newMember.id;
      
      console.log("[AddMember] Member saved to Firestore:", {
        memberId: savedMemberId,
        societyId,
        name: newMember.name,
        authUid: getCurrentUserUid(),
      });
      
      // If first member OR no current user set, set as current user and admin session
      const session = await getSession();
      if (isFirstMember || !session.currentUserId) {
        const { setCurrentUserId: setSessionUserId, setRole: setSessionRole } = await import("@/lib/session");
        if (!session.currentUserId) {
          await setSessionUserId(savedMemberId);
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

  // Show loading state while initializing
  if (initializing) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <ActivityIndicator size="large" color="#0B6E4F" />
          <Text style={{ marginTop: 12, color: "#6b7280" }}>Loading...</Text>
        </View>
      </ScrollView>
    );
  }

  // Show "No society" message if societyId is missing
  if (!societyId) {
    return <NoSocietyGuard message="You need to select a society before adding members." />;
  }

  // Show nothing if user doesn't have permission (will redirect via Alert)
  if (!canCreate) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <Text style={{ fontSize: 16, color: "#6b7280", textAlign: "center" }}>
            Checking permissions...
          </Text>
        </View>
      </ScrollView>
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
