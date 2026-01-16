/**
 * TEST PLAN:
 * - Navigate to Profile screen
 * - Select a member from the list
 * - Verify current user is saved and persists
 * - Try to switch to admin role, enter PIN
 * - Verify role changes and persists
 * - Navigate back, verify user indicator shows on dashboard
 * - Close/reopen app, verify profile persists
 */

import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, updateMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
};

export default function ProfileScreen() {
  const { user } = useBootstrap();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [currentMember, setCurrentMember] = useState<MemberData | null>(null);
  const [editName, setEditName] = useState("");
  const [editHandicap, setEditHandicap] = useState("");
  const [editSex, setEditSex] = useState<"male" | "female" | "">("");
  const [isEditing, setIsEditing] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const userRoles = useMemo(() => currentMember?.roles ?? ["member"], [currentMember?.roles]);
  const upcomingEventsWithFees = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => {
        const eventDate = new Date(e.date);
        return eventDate >= now && !e.isCompleted && e.eventFee && e.eventFee > 0;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  useEffect(() => {
    setCurrentUserIdState(user?.activeMemberId ?? null);
  }, [user?.activeMemberId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setEvents([]);
      setLoadingEvents(false);
      return;
    }
    setLoadingEvents(true);
    const unsubscribe = subscribeEventsBySociety(user.activeSocietyId, (items) => {
      setEvents(items);
      setLoadingEvents(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!currentUserId) {
      setCurrentMember(null);
      return;
    }
    const member = members.find((m) => m.id === currentUserId) || null;
    setCurrentMember(member);
    if (member) {
      setEditName(member.name);
      setEditHandicap(member.handicap?.toString() || "");
      setEditSex(member.sex || "");
    }
  }, [currentUserId, members]);

  const handleSaveProfile = async () => {
    if (!currentMember || !editName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    if (!editSex || (editSex !== "male" && editSex !== "female")) {
      Alert.alert("Error", "Sex is required (Male or Female)");
      return;
    }

    try {
      await updateMemberDoc(currentMember.id, {
        name: editName.trim(),
        handicap: editHandicap.trim() ? parseFloat(editHandicap.trim()) : undefined,
        sex: editSex as "male" | "female",
      });
      setIsEditing(false);
      Alert.alert("Success", "Profile updated");
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to save profile");
    }
  };

  const loading = loadingMembers || loadingEvents;

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {currentMember ? "Edit your profile" : "Choose your profile"}
        </Text>

        {!currentUserId ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No profile selected</Text>
            <Text style={styles.emptySubtext}>
              Choose your profile from the Members screen
            </Text>
            <Pressable
              onPress={() => router.push("/members" as any)}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Choose Profile</Text>
            </Pressable>
          </View>
        ) : currentMember ? (
          <>
            {isEditing ? (
              <View style={styles.editSection}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Name <Text style={{ color: "#ef4444" }}>*</Text>
                  </Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter name"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Handicap</Text>
                    <TextInput
                      value={editHandicap}
                      onChangeText={setEditHandicap}
                      placeholder="Enter handicap (optional)"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Sex <Text style={{ color: "#ef4444" }}>*</Text></Text>
                  <View style={styles.sexButtons}>
                    <Pressable
                      onPress={() => setEditSex("male")}
                      style={[
                        styles.sexButton,
                        editSex === "male" && styles.sexButtonActive,
                      ]}
                    >
                      <Text style={[
                        styles.sexButtonText,
                        editSex === "male" && styles.sexButtonTextActive,
                      ]}>Male</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditSex("female")}
                      style={[
                        styles.sexButton,
                        editSex === "female" && styles.sexButtonActive,
                      ]}
                    >
                      <Text style={[
                        styles.sexButtonText,
                        editSex === "female" && styles.sexButtonTextActive,
                      ]}>Female</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setIsEditing(false);
                      setEditName(currentMember.name);
                      setEditHandicap(currentMember.handicap?.toString() || "");
                      setEditSex(currentMember.sex || "");
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSaveProfile} style={styles.saveButton}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.profileSection}>
                <View style={styles.profileCard}>
                  <Text style={styles.profileName}>{currentMember.name}</Text>
                  {currentMember.handicap !== undefined && (
                    <Text style={styles.profileHandicap}>HCP: {currentMember.handicap}</Text>
                  )}
                </View>

                <Pressable
                  onPress={() => setIsEditing(true)}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>Edit Profile</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>Assigned Roles</Text>
              {userRoles.length > 0 ? (
                <View style={styles.rolesList}>
                  {userRoles.map((r) => (
                    <View key={r} style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noRolesText}>No roles assigned (default: member)</Text>
              )}
              <Text style={styles.roleNote}>
                Roles are assigned by Captain/Admin in Settings → Roles
              </Text>
            </View>

            {/* Payment Status Section */}
            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>Payment Status</Text>
              
              {/* Season Fee Status */}
              <View style={styles.paymentItem}>
                <Text style={styles.paymentLabel}>Season Fee:</Text>
                <View style={[
                  styles.paymentStatusBadge,
                  { backgroundColor: currentMember?.paid ? "#d1fae5" : "#fee2e2" }
                ]}>
                  <Text style={[
                    styles.paymentStatusText,
                    { color: currentMember?.paid ? "#065f46" : "#991b1b" }
                  ]}>
                    {currentMember?.paid ? "Paid" : "Unpaid"}
                  </Text>
                </View>
                {currentMember?.paidDate && (
                  <Text style={styles.paymentDate}>Paid: {currentMember.paidDate}</Text>
                )}
                {currentMember?.amountPaid !== undefined && currentMember.amountPaid > 0 && (
                  <Text style={styles.paymentAmount}>Amount: £{currentMember.amountPaid.toFixed(2)}</Text>
                )}
              </View>

              {/* Event Fee Status */}
              {upcomingEventsWithFees.length > 0 && (
                <View style={styles.paymentItem}>
                  <Text style={styles.paymentLabel}>Competition Fees:</Text>
                  {upcomingEventsWithFees.map((event) => {
                    const paymentStatus = event.payments?.[currentMember?.id || ""];
                    const isPaid = paymentStatus?.paid ?? false;
                    return (
                      <View key={event.id} style={styles.eventPaymentItem}>
                        <Text style={styles.eventName}>{event.name}</Text>
                        <Text style={styles.eventFee}>Fee: £{event.eventFee?.toFixed(2)}</Text>
                        <View style={[
                          styles.paymentStatusBadge,
                          { backgroundColor: isPaid ? "#d1fae5" : "#fee2e2" }
                        ]}>
                          <Text style={[
                            styles.paymentStatusText,
                            { color: isPaid ? "#065f46" : "#991b1b" }
                          ]}>
                            {isPaid ? "Paid" : "Unpaid"}
                          </Text>
                        </View>
                        {paymentStatus?.paidAtISO && (
                          <Text style={styles.paymentDate}>
                            Paid: {new Date(paymentStatus.paidAtISO).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={styles.roleNote}>
                Payment status is managed by Captain or Treasurer
              </Text>
            </View>

          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Profile not found</Text>
            <Text style={styles.emptySubtext}>
              Your selected profile may have been deleted
            </Text>
            <Pressable
              onPress={() => router.push("/members" as any)}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Choose Profile</Text>
            </Pressable>
          </View>
        )}

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
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.75,
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
  },
  ctaButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  ctaButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  profileSection: {
    marginBottom: 24,
  },
  profileCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  profileHandicap: {
    fontSize: 16,
    opacity: 0.7,
    color: "#111827",
  },
  editSection: {
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f9fafb",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sexButtons: {
    flexDirection: "row",
    gap: 12,
  },
  sexButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  sexButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  sexButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  sexButtonTextActive: {
    color: "#0B6E4F",
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
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
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0B6E4F",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  editButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 24,
  },
  editButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  membersList: {
    marginBottom: 24,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  memberCardSelected: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  memberHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  selectedBadge: {
    backgroundColor: "#0B6E4F",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  selectedBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  roleSection: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  roleValue: {
    color: "#0B6E4F",
    textTransform: "uppercase",
  },
  rolesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: "#0B6E4F",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  noRolesText: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
    marginBottom: 12,
  },
  roleNote: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
  },
  paymentItem: {
    marginBottom: 16,
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  paymentStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  paymentDate: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  paymentAmount: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  eventPaymentItem: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  eventName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  eventFee: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  // TODO: Re-enable PIN-related styles when PIN requirement is restored
  // pinSection: {
  //   marginTop: 8,
  // },
  // pinLabel: {
  //   fontSize: 14,
  //   fontWeight: "600",
  //   color: "#111827",
  //   marginBottom: 8,
  // },
  // pinInput: {
  //   backgroundColor: "#fff",
  //   paddingVertical: 12,
  //   paddingHorizontal: 16,
  //   borderRadius: 10,
  //   fontSize: 16,
  //   borderWidth: 1,
  //   borderColor: "#e5e7eb",
  //   marginBottom: 12,
  // },
  // pinActions: {
  //   flexDirection: "row",
  //   gap: 12,
  // },
  // cancelButton: {
  //   flex: 1,
  //   paddingVertical: 12,
  //   borderRadius: 10,
  //   alignItems: "center",
  //   backgroundColor: "#f3f4f6",
  // },
  // cancelButtonText: {
  //   fontSize: 14,
  //   fontWeight: "600",
  //   color: "#111827",
  // },
  // submitButton: {
  //   flex: 1,
  //   paddingVertical: 12,
  //   borderRadius: 10,
  //   alignItems: "center",
  //   backgroundColor: "#0B6E4F",
  // },
  // submitButtonText: {
  //   fontSize: 14,
  //   fontWeight: "600",
  //   color: "white",
  // },
  roleButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  roleButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  backButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
});

