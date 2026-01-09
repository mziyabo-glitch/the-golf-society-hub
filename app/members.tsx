/**
 * Members Screen
 * 
 * WEB-ONLY PERSISTENCE: All data via Firestore, no AsyncStorage
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
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
import { getMembers, getEvents, saveMember, deleteMember } from "@/lib/firestore/society";
import type { EventData, MemberData } from "@/lib/models";

export default function MembersScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [canManageMembersFlag, setCanManageMembersFlag] = useState(false);
  const [nextUpcomingEvent, setNextUpcomingEvent] = useState<EventData | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [])
  );

  const loadMembers = async () => {
    try {
      // Load members from Firestore (single source of truth)
      const firestoreMembers = await getMembers();
      setMembers(firestoreMembers);

      // Load session
      const session = await getSession();
      const effectiveUserId = session.currentUserId;
      setCurrentUserIdState(effectiveUserId);

      // Permissions check
      const current = firestoreMembers.find((m) => m.id === effectiveUserId) || null;
      const sessionRole = normalizeSessionRole(session.role);
      const memberRoles = normalizeMemberRoles(current?.roles);

      if (__DEV__) {
        console.log("[Members] Loaded", firestoreMembers.length, "members from Firestore");
      }

      setCanManageMembersFlag(canManageMembers(sessionRole, memberRoles));

      // Load events from Firestore to find next upcoming event
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
    } catch (error) {
      console.error("Error loading members:", error);
      Alert.alert("Error", "Failed to load members. Please check your connection.");
    } finally {
      setLoading(false);
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
      // Check if there are other Captains
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
              const success = await deleteMember(memberId);
              
              if (!success) {
                Alert.alert("Error", "Failed to remove member. Please try again.");
                return;
              }

              // Update local state
              const updatedMembers = members.filter((m) => m.id !== memberId);
              setMembers(updatedMembers);
              
              // Clear selection if needed
              if (selectedMemberId === memberId) {
                setSelectedMemberId(null);
              }

              // If removed member was current user, switch to first remaining member
              if (memberId === currentUserId && updatedMembers.length > 0) {
                const firstMember = updatedMembers[0];
                await setCurrentUserId(firstMember.id);
                setCurrentUserIdState(firstMember.id);
              }

              Alert.alert("Success", `${targetMember.name} has been removed.`);
            } catch (error) {
              console.error("Error removing member:", error);
              // Rollback on error
              setMembers(members);
              Alert.alert("Error", "Failed to remove member. Please try again.");
            }
          },
        },
      ]
    );
  };

  const colors = getColors();

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
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

    // Season fee status
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

    // Event fee status for next upcoming event
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
      <SectionHeader
        title="Members"
        rightAction={
          canManageMembersFlag
            ? {
                label: "Add Member",
                onPress: () => router.push("/add-member" as any),
              }
            : undefined
        }
      />

      {members.length === 0 ? (
        <EmptyState
          title="No members yet"
          message={
            canManageMembersFlag
              ? "Add your first member to get started"
              : "Ask your Captain or Secretary to add the first member"
          }
          action={
            canManageMembersFlag
              ? {
                  label: "Add First Member",
                  onPress: () => router.push("/add-member" as any),
                }
              : undefined
          }
        />
      ) : (
        <>
          {members.map((member) => (
            <AppCard key={member.id} style={currentUserId === member.id ? styles.activeCard : undefined}>
              <Pressable onPress={() => handleMemberPress(member.id)}>
                <Row gap="sm" alignItems="flex-start">
                  <View style={styles.memberInfo}>
                    <Row gap="sm" alignItems="center" style={styles.memberHeader}>
                      <AppText variant="bodyBold">{member.name}</AppText>
                      {currentUserId === member.id && <Badge label="My Profile" variant="status" />}
                    </Row>
                    <Row gap="sm" alignItems="center" style={styles.memberMeta}>
                      {member.handicap !== undefined && (
                        <AppText variant="small" color="secondary">
                          HCP: {member.handicap}
                        </AppText>
                      )}
                      {getRoleBadges(member.roles)}
                    </Row>
                    {getPaymentBadges(member).length > 0 && (
                      <Row gap="sm" alignItems="center" style={styles.paymentRow}>
                        {getPaymentBadges(member)}
                      </Row>
                    )}
                  </View>
                </Row>
              </Pressable>
              {selectedMemberId === member.id && (
                <View style={styles.memberActions}>
                  <SecondaryButton
                    onPress={() => {
                      setSelectedMemberId(null);
                      router.push("/profile" as any);
                    }}
                    style={styles.actionButton}
                  >
                    {currentUserId === member.id ? "View / Edit" : "View"}
                  </SecondaryButton>
                  <PrimaryButton
                    onPress={() => handleSetAsProfile(member.id)}
                    style={styles.actionButton}
                  >
                    Set as My Profile
                  </PrimaryButton>
                  {canManageMembersFlag && (
                    <DestructiveButton
                      onPress={() => handleRemoveMember(member.id)}
                      style={styles.actionButton}
                    >
                      Remove Member
                    </DestructiveButton>
                  )}
                </View>
              )}
            </AppCard>
          ))}

          {canManageMembersFlag && (
            <PrimaryButton
              onPress={() => router.push("/add-member" as any)}
              style={styles.addButton}
            >
              Add Member
            </PrimaryButton>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  activeCard: {
    borderWidth: 2,
    borderColor: "#0B6E4F",
    backgroundColor: "#f0fdf4",
  },
  memberInfo: {
    flex: 1,
  },
  memberHeader: {
    marginBottom: spacing.xs,
  },
  memberMeta: {
    flexWrap: "wrap",
  },
  roleBadge: {
    marginRight: spacing.xs,
  },
  paymentRow: {
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
  paymentBadge: {
    marginRight: spacing.xs,
  },
  memberActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  addButton: {
    marginTop: spacing.lg,
  },
});


