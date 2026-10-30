import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { MembersListSkeleton } from "@/components/ui/Skeleton";
import { spacing } from "@/lib/ui/theme";

import { MembersListView } from "@/features/members/components/MembersListView";
import { MembersModalView } from "@/features/members/components/MembersModalView";
import { useMembersScreen } from "@/features/members/useMembersScreen";

export default function MembersScreen() {
  const {
    tabContentStyle,
    colors,
    reduceMotion,
    bootstrapLoading,
    loading,
    refreshing,
    permissionError,
    loadError,
    modalMode,
    editingMember,
    formName,
    setFormName,
    formEmail,
    setFormEmail,
    formWhsNumber,
    setFormWhsNumber,
    formHandicapIndex,
    setFormHandicapIndex,
    formLockHI,
    setFormLockHI,
    submitting,
    permissions,
    memberRows,
    openAddModal,
    closeModal,
    handleAddMember,
    handleUpdateMember,
    handleDeleteMember,
    handleTogglePaidById,
    onPressMemberRow,
    retryLoadMembers,
  } = useMembersScreen();

  if (bootstrapLoading && loading) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={shellStyles.header}>
          <AppText variant="title">Members</AppText>
        </View>
        <MembersListSkeleton count={6} />
      </Screen>
    );
  }

  if (permissionError) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={shellStyles.header}>
          <AppText variant="title">Members</AppText>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.textTertiary} />}
          title="Access Denied"
          message={permissionError}
        />
      </Screen>
    );
  }

  if (modalMode !== "none") {
    return (
      <Screen contentStyle={tabContentStyle}>
        <MembersModalView
          modalMode={modalMode}
          permissions={permissions}
          editingMember={editingMember}
          formName={formName}
          setFormName={setFormName}
          formEmail={formEmail}
          setFormEmail={setFormEmail}
          formWhsNumber={formWhsNumber}
          setFormWhsNumber={setFormWhsNumber}
          formHandicapIndex={formHandicapIndex}
          setFormHandicapIndex={setFormHandicapIndex}
          formLockHI={formLockHI}
          setFormLockHI={setFormLockHI}
          submitting={submitting}
          onClose={closeModal}
          onAdd={handleAddMember}
          onUpdate={handleUpdateMember}
          onDelete={handleDeleteMember}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} contentStyle={[tabContentStyle, { flex: 1 }]}>
      <MembersListView
        colors={colors}
        reduceMotion={reduceMotion}
        refreshing={refreshing}
        loadError={loadError}
        onRetryLoad={retryLoadMembers}
        retryingLoad={refreshing}
        permissions={permissions}
        memberRows={memberRows}
        onOpenAdd={openAddModal}
        onPressMember={onPressMemberRow}
        onTogglePaid={handleTogglePaidById}
      />
    </Screen>
  );
}

const shellStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
});
