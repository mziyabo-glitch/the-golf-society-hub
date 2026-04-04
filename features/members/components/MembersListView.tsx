import { memo, useCallback, useMemo } from "react";
import { StyleSheet, View, Pressable, FlatList, type ListRenderItem } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { pressableSurfaceStyle } from "@/lib/ui/interaction";
import { useSlowCommitLog } from "@/lib/perf/perf";

import type { MemberListRowVm } from "../membersViewModel";
import type { MembersPermissionsVm } from "../useMembersScreen";

type Props = {
  colors: ReturnType<typeof getColors>;
  reduceMotion: boolean;
  refreshing: boolean;
  loadError: string | null;
  permissions: MembersPermissionsVm;
  memberRows: MemberListRowVm[];
  onOpenAdd: () => void;
  onPressMember: (memberId: string) => void;
  onTogglePaid: (memberId: string) => void;
};

type RowProps = {
  row: MemberListRowVm;
  colors: ReturnType<typeof getColors>;
  reduceMotion: boolean;
  canManageMembershipFees: boolean;
  onPressMember: (id: string) => void;
  onTogglePaid: (id: string) => void;
};

const MemberRow = memo(function MemberRow({
  row,
  colors,
  reduceMotion,
  canManageMembershipFees,
  onPressMember,
  onTogglePaid,
}: RowProps) {
  return (
    <Pressable
      onPress={() => onPressMember(row.id)}
      style={({ pressed }) => [pressableSurfaceStyle({ pressed }, { reduceMotion, scale: "card" })]}
    >
      <AppCard style={styles.memberCard}>
        <View style={styles.memberRow}>
          <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="bodyBold" color="primary">
              {row.initials}
            </AppText>
          </View>

          <View style={styles.memberInfo}>
            <View style={styles.nameRow}>
              <AppText variant="bodyBold">
                {row.displayName}
              </AppText>
              {row.isCurrentUser && <StatusBadge label="You" tone="primary" />}
              {!row.hasLinkedApp && <StatusBadge label="No app yet" tone="warning" />}
            </View>

            {row.roleBadges.length > 0 && (
              <View style={styles.rolesRow}>
                {row.roleBadges.map((role) => (
                  <StatusBadge key={role} label={role} tone="neutral" />
                ))}
              </View>
            )}

            {row.email && (
              <AppText variant="caption" color="muted">{row.email}</AppText>
            )}

            <AppText variant="caption" color={row.hiLine ? "secondary" : "muted"} style={{ marginTop: 2 }}>
              {row.hiLine || "Awaiting assignment"}
            </AppText>

            {row.oom && (
              <View style={styles.oomRow}>
                <View style={[styles.oomBadge, { backgroundColor: colors.warning + "15" }]}>
                  <Feather name="award" size={12} color={colors.warning} />
                  <AppText variant="small" style={{ color: colors.warning }}>
                    #{row.oom.rank}
                  </AppText>
                </View>
                <AppText variant="caption" color="muted">
                  {row.oom.pointsLabel}
                </AppText>
              </View>
            )}
          </View>

          {canManageMembershipFees ? (
            <Pressable
              onPress={() => onTogglePaid(row.id)}
              style={styles.paidBadgePressable}
              accessibilityRole="button"
              accessibilityLabel={row.annualFeePaid ? "Annual fee paid, tap to mark unpaid" : "Annual fee unpaid, tap to mark paid"}
            >
              <StatusBadge label={row.annualFeePaid ? "Paid" : "Unpaid"} tone={row.annualFeePaid ? "success" : "warning"} />
            </Pressable>
          ) : (
            <StatusBadge label={row.annualFeePaid ? "Paid" : "Unpaid"} tone={row.annualFeePaid ? "success" : "warning"} />
          )}
        </View>
      </AppCard>
    </Pressable>
  );
});

export function MembersListView({
  colors,
  reduceMotion,
  refreshing,
  loadError,
  permissions,
  memberRows,
  onOpenAdd,
  onPressMember,
  onTogglePaid,
}: Props) {
  useSlowCommitLog("MembersListView", 80);

  const canManageFees = permissions.canManageMembershipFees;

  const renderItem = useCallback<ListRenderItem<MemberListRowVm>>(
    ({ item }) => (
      <MemberRow
        row={item}
        colors={colors}
        reduceMotion={reduceMotion}
        canManageMembershipFees={canManageFees}
        onPressMember={onPressMember}
        onTogglePaid={onTogglePaid}
      />
    ),
    [colors, reduceMotion, canManageFees, onPressMember, onTogglePaid],
  );

  const ListHeader = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <View>
            <AppText variant="title">Members</AppText>
            <AppText variant="subheading" color="muted" style={{ marginTop: spacing.xs }}>
              {memberRows.length} member{memberRows.length !== 1 ? "s" : ""}
            </AppText>
          </View>
          {permissions.canCreateMembers && (
            <PrimaryButton onPress={onOpenAdd} size="sm">
              Add Member
            </PrimaryButton>
          )}
        </View>

        {refreshing && (
          <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
            Refreshing...
          </AppText>
        )}
        {loadError && (
          <InlineNotice
            variant="error"
            message={loadError}
            style={{ marginBottom: spacing.sm }}
          />
        )}
      </>
    ),
    [
      memberRows.length,
      permissions.canCreateMembers,
      onOpenAdd,
      refreshing,
      loadError,
    ],
  );

  const ListEmpty = useMemo(
    () =>
      !loadError ? (
        <EmptyState
          icon={<Feather name="users" size={iconSize.lg} color={colors.textTertiary} />}
          title="No Members Yet"
          message="Add members to your society to get started."
          action={permissions.canCreateMembers ? { label: "Add Member", onPress: onOpenAdd } : undefined}
        />
      ) : null,
    [loadError, colors.textTertiary, permissions.canCreateMembers, onOpenAdd],
  );

  return (
    <FlatList
      style={styles.flatList}
      data={memberRows}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      ItemSeparatorComponent={Separator}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={10}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
    />
  );
}

function Separator() {
  return <View style={{ height: spacing.sm }} />;
}

const styles = StyleSheet.create({
  flatList: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 2,
  },
  oomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  paidBadgePressable: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
});
