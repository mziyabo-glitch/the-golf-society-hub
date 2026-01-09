/**
 * Members Screen
 * 
 * FIRESTORE-ONLY: Members are loaded from societies/{societyId}/members
 * Uses onSnapshot for real-time updates. No AsyncStorage for member data.
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState, useEffect } from "react";
import { Alert, ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { getSession, setCurrentUserId } from "@/lib/session";
import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { guard } from "@/lib/guards";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { Badge } from "@/components/ui/Badge";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Row } from "@/components/ui/Row";
import { getColors, spacing } from "@/lib/ui/theme";
import { getActiveSocietyId, isFirebaseConfigured } from "@/lib/firebase";
import { subscribeMembers, deleteMemberById } from "@/lib/firestore/members";
import { logDataSanity, isPermissionDeniedError } from "@/lib/firestore/errors";
import { PermissionDeniedScreen } from "@/components/PermissionDeniedScreen";
import { getEvents } from "@/lib/firestore/society";
import { NoSocietyGuard } from "@/components/NoSocietyGuard";
import { FirebaseConfigGuard } from "@/components/FirebaseConfigGuard";
import type { EventData, MemberData } from "@/lib/models";

export default function MembersScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [canManageMembersFlag, setCanManageMembersFlag] = useState(false);
  const [nextUpcomingEvent, setNextUpcomingEvent] = useState<EventData | null>(null);
  const [societyId, setSocietyId] = useState<string | null>(null);

  // Subscribe to members on mount
  useEffect(() => {
    const activeSocietyId = getActiveSocietyId();
    setSocietyId(activeSocietyId);

    if (!activeSocietyId) {
      setLoading(false);
      setError("No society selected");
      return;
    }

    // Set up real-time subscription to members
    const unsubscribe = subscribeMembers(
      (firestoreMembers) => {
        setMembers(firestoreMembers);
        setLoading(false);
        setError(null);
        
        // Dev mode sanity check
        logDataSanity("MembersScreen", {
          societyId: activeSocietyId,
          memberCount: firestoreMembers.length,
        });
      },
      (err) => {
        console.error("[Members] Subscription error:", err);
        
        // Check if this is a permission denied error
        if (isPermissionDeniedError(err)) {
          setPermissionDenied(true);
          setLoading(false);
          return;
        }
        
        setError(err.message || "Failed to load members");
        setLoading(false);
      },
      activeSocietyId
    );

    // Load session and permissions
    loadSessionAndPermissions();

    // Load upcoming events
    loadUpcomingEvents();

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  // Reload permissions when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadSessionAndPermissions();
      loadUpcomingEvents();
    }, [members])
  );

  const loadSessionAndPermissions = async () => {
    try {
      const session = await getSession();
      const effectiveUserId = session.currentUserId;
      setCurrentUserIdState(effectiveUserId);

      // Permissions check based on current members
      const current = members.find((m) => m.id === effectiveUserId) || null;
      const sessionRole = normalizeSessionRole(session.role);
      const memberRoles = normalizeMemberRoles(current?.roles);

      setCanManageMembersFlag(canManageMembers(sessionRole, memberRoles));
    } catch (err) {
      console.error("[Members] Error loading session:", err);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      const allEvents = await getEvents();
      const now = new Date();
      const upcomingEvents = allEvents
        .filter((e) => {
          const eventDate = new Date(e.date);
          return eventDate >= now && !e.isCompleted;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      if (upcomingEvents.length > 0) {
        setNextUpcomingEvent(upcomingEvents[0]);
      }
    } catch (err) {
      console.error("[Members] Error loading events:", err);
    }
  };

  const handleSetAsProfile = async (memberId: string) => {
    try {
      await setCurrentUserId(memberId);
      setCurrentUserIdState(memberId);
      setSelectedMemberId(null);
      Alert.alert("Success", "Profile set successfully");
    } catch (error) {
      console.error("Error setting profile:", error);
      Alert.alert("Error", "Failed to set profile");
    }
  };

  const handleMemberPress = (memberId: string) => {
    if (selectedMemberId === memberId) {
      setSelectedMemberId(null);
    } else {
      setSelectedMemberId(memberId);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    // Hard guard: must have permission
    if (!guard(canManageMembersFlag, "Only Captain or Treasurer can remove members.")) {
      return;
    }

    // Hard guard: cannot remove self
    if (memberId === currentUserId) {
      Alert.alert("Cannot Remove", "You cannot remove yourself. Please switch to another profile first.");
      return;
    }

    // Find the member to check roles
    const targetMember = members.find((m) => m.id === memberId);
    if (!targetMember) {
      Alert.alert("Error", "Member not found.");
      return;
    }

    // Hard guard: cannot remove only Captain
    const roles = targetMember.roles || [];
    const isCaptain = roles.some((r) => r.toLowerCase() === "captain" || r.toLowerCase() === "admin");
    
    if (isCaptain) {
      const otherCaptains = members.filter(
        (m) => m.id !== memberId && m.roles?.some((r) => r.toLowerCase() === "captain" || r.toLowerCase() === "admin")
      );
      
      if (otherCaptains.length === 0) {
        Alert.alert(
          "Cannot Remove",
          "You cannot remove the only Captain. Please transfer the Captain role to another member first."
        );
        return;
      }
    }

    // Confirm deletion
    Alert.alert(
      "Remove Member?",
      `Are you sure you want to remove ${targetMember.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete from Firestore
              const result = await deleteMemberById(memberId, societyId || undefined);
              
              if (!result.success) {
                console.error("[Members] Delete failed:", result.error, { societyId, memberId });
                Alert.alert("Error", `Failed to remove member: ${result.error || "Unknown error"}`);
                return;
              }

              // Clear selection if needed
              if (selectedMemberId === memberId) {
                setSelectedMemberId(null);
              }

              // If removed member was current user, switch to first remaining member
              const remainingMembers = members.filter((m) => m.id !== memberId);
              if (memberId === currentUserId && remainingMembers.length > 0) {
                const firstMember = remainingMembers[0];
                await setCurrentUserId(firstMember.id);
                setCurrentUserIdState(firstMember.id);
              }

              Alert.alert("Success", `${targetMember.name} has been removed.`);
              // Note: UI will update automatically via onSnapshot subscription
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              console.error("[Members] Error removing member:", error, { societyId, memberId });
              Alert.alert("Error", `Failed to remove member: ${errorMessage}`);
            }
          },
        },
      ]
    );
  };

  const colors = getColors();

  // Loading state
  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText style={{ marginTop: 12 }}>Loading members...</AppText>
        </View>
      </Screen>
    );
  }

  // Permission denied state
  if (permissionDenied) {
    return (
      <PermissionDeniedScreen
        message="You don't have access to view members in this society."
        showContactCaptain={true}
        errorCode="PERMISSION_DENIED"
      />
    );
  }

  // Error state - no society selected
  if (!societyId) {
    return <NoSocietyGuard message="Please select or create a society to view members." />;
  }

  // Error state - Firestore error
  if (error) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <AppText style={{ fontSize: 18, fontWeight: "600", marginBottom: 12, color: colors.error }}>
            Error Loading Members
          </AppText>
          <AppText style={{ color: "#6b7280", textAlign: "center", marginBottom: 20 }}>
            {error}
          </AppText>
          <PrimaryButton onPress={() => {
            setLoading(true);
            setError(null);
            // Re-trigger subscription by remounting
            const activeSocietyId = getActiveSocietyId();
            if (activeSocietyId) {
              subscribeMembers(
                (firestoreMembers) => {
                  setMembers(firestoreMembers);
                  setLoading(false);
                  setError(null);
                },
                (err) => {
                  setError(err.message);
                  setLoading(false);
                },
                activeSocietyId
              );
            }
          }}>
            Retry
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  const getRoleBadges = (roles?: string[]) => {
    if (!roles || roles.length === 0) return null;
    const roleMap: Record<string, string> = {
      captain: "Captain",
      treasurer: "Treasurer",
      secretary: "Secretary",
      handicapper: "Handicapper",
      member: "Member",
    };
    return roles
      .filter((r) => r !== "member")
      .map((r) => {
        const label = roleMap[r.toLowerCase()] || r;
        return <Badge key={r} label={label} variant="role" style={styles.roleBadge} />;
      });
  };

  const getPaymentBadges = (member: MemberData) => {
    const badges: React.ReactElement[] = [];

    if (member.paid !== undefined) {
      badges.push(
        <Badge
          key="season-fee"
          label={member.paid ? "Season Fee: Paid" : "Season Fee: Unpaid"}
          variant={member.paid ? "paid" : "unpaid"}
          style={styles.paymentBadge}
        />
      );
    }

    if (nextUpcomingEvent && nextUpcomingEvent.eventFee && nextUpcomingEvent.eventFee > 0) {
      const paymentStatus = nextUpcomingEvent.payments?.[member.id];
      const isPaid = paymentStatus?.paid ?? false;
      badges.push(
        <Badge
          key="event-fee"
          label={isPaid ? "Event Fee: Paid" : "Event Fee: Unpaid"}
          variant={isPaid ? "paid" : "unpaid"}
          style={styles.paymentBadge}
        />
      );
    }

    return badges;
  };

  return (
    <Screen>
      <SectionHeader title="Members" />

      {members.length === 0 ? (
        <EmptyState
          title="No Members Yet"
          message="Add your first member to get started."
        />
      ) : (
        members.map((member) => {
          const isSelected = selectedMemberId === member.id;
          const isCurrentUser = currentUserId === member.id;

          return (
            <Pressable key={member.id} onPress={() => handleMemberPress(member.id)}>
              <AppCard style={isCurrentUser ? styles.currentUserCard : undefined}>
                <Row style={styles.memberHeader}>
                  <View style={styles.memberInfo}>
                    <AppText variant="title" style={styles.memberName}>
                      {member.name}
                      {isCurrentUser && (
                        <AppText variant="small" color="primary"> (You)</AppText>
                      )}
                    </AppText>
                    <View style={styles.badgesRow}>
                      {getRoleBadges(member.roles)}
                      {getPaymentBadges(member)}
                    </View>
                  </View>
                  <View style={styles.handicapContainer}>
                    <AppText variant="small" color="secondary">HI</AppText>
                    <AppText variant="title" style={styles.handicapValue}>
                      {member.handicap !== undefined ? member.handicap.toFixed(1) : "-"}
                    </AppText>
                  </View>
                </Row>

                {isSelected && (
                  <View style={styles.actionButtons}>
                    {!isCurrentUser && (
                      <PrimaryButton
                        onPress={() => handleSetAsProfile(member.id)}
                        size="sm"
                        style={styles.actionButton}
                      >
                        Set as My Profile
                      </PrimaryButton>
                    )}
                    <SecondaryButton
                      onPress={() => router.push(`/profile?memberId=${member.id}`)}
                      size="sm"
                      style={styles.actionButton}
                    >
                      Edit
                    </SecondaryButton>
                    {canManageMembersFlag && !isCurrentUser && (
                      <DestructiveButton
                        onPress={() => handleRemoveMember(member.id)}
                        size="sm"
                        style={styles.actionButton}
                      >
                        Remove
                      </DestructiveButton>
                    )}
                  </View>
                )}
              </AppCard>
            </Pressable>
          );
        })
      )}

      {canManageMembersFlag && (
        <PrimaryButton
          onPress={() => router.push("/add-member")}
          style={styles.addButton}
        >
          Add Member
        </PrimaryButton>
      )}

      <SecondaryButton onPress={() => router.back()} style={styles.backButton}>
        Back
      </SecondaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  memberCard: {
    // Empty style since AppCard has marginBottom built-in
  },
  currentUserCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#0B6E4F",
  },
  memberHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    marginBottom: spacing.xs,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  roleBadge: {
    marginRight: 4,
  },
  paymentBadge: {
    marginRight: 4,
  },
  handicapContainer: {
    alignItems: "center",
    minWidth: 50,
  },
  handicapValue: {
    fontSize: 20,
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  actionButton: {
    minWidth: 100,
  },
  addButton: {
    marginTop: spacing.lg,
  },
  backButton: {
    marginTop: spacing.sm,
  },
});
