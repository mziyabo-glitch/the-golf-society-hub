import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { guard } from "@/lib/guards";
import { useBootstrap } from "@/lib/useBootstrap";
import { deleteMemberDoc, subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { setActiveMember } from "@/lib/db/userRepo";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { Badge } from "@/components/ui/Badge";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Row } from "@/components/ui/Row";
import { getColors, spacing } from "@/lib/ui/theme";

type MemberData = MemberDoc;
type EventData = EventDoc;

export default function MembersScreen() {
  const { user } = useBootstrap();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const canManageMembersFlag = useMemo(() => {
    const current = members.find((m) => m.id === currentUserId) || null;
    const sessionRole = normalizeSessionRole("member");
    const memberRoles = normalizeMemberRoles(current?.roles);
    return canManageMembers(sessionRole, memberRoles);
  }, [members, currentUserId]);

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
    if (!user?.id) return;
    if (!user.activeMemberId && members.length > 0) {
      setActiveMember(user.id, members[0].id).catch((error) => {
        console.error("Error setting default member:", error);
      });
    }
  }, [members, user?.activeMemberId, user?.id]);

  const nextUpcomingEvent = useMemo(() => {
    const now = new Date();
    const upcomingEvents = events
      .filter((e) => {
        const eventDate = new Date(e.date);
        return eventDate >= now && !e.isCompleted;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcomingEvents.length > 0 ? upcomingEvents[0] : null;
  }, [events]);

  const handleSetAsProfile = async (memberId: string) => {
    try {
      if (!user?.id) return;
      await setActiveMember(user.id, memberId);
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
              // Remove from local state immediately
              const updatedMembers = members.filter((m) => m.id !== memberId);
              setMembers(updatedMembers);
              
              // Clear selection if needed
              if (selectedMemberId === memberId) {
                setSelectedMemberId(null);
              }

              await deleteMemberDoc(memberId);

              if (memberId === currentUserId && user?.id) {
                const nextMember = updatedMembers[0] || null;
                await setActiveMember(user.id, nextMember?.id ?? null);
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

  if (loadingMembers || loadingEvents) {
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


