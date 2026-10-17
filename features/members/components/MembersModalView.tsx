import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

import type { MembersModalMode, MembersPermissionsVm } from "../useMembersScreen";

type Props = {
  modalMode: MembersModalMode;
  permissions: MembersPermissionsVm;
  editingMember: MemberDoc | null;
  formName: string;
  setFormName: (v: string) => void;
  formEmail: string;
  setFormEmail: (v: string) => void;
  formWhsNumber: string;
  setFormWhsNumber: (v: string) => void;
  formHandicapIndex: string;
  setFormHandicapIndex: (v: string) => void;
  formLockHI: boolean;
  setFormLockHI: (v: boolean | ((p: boolean) => boolean)) => void;
  submitting: boolean;
  onClose: () => void;
  onAdd: () => void;
  onUpdate: () => void;
  onDelete: (member: MemberDoc) => void;
};

export function MembersModalView({
  modalMode,
  permissions,
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
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const colors = getColors();

  return (
    <>
      <View style={styles.modalHeader}>
        <SecondaryButton onPress={onClose} size="sm">
          Cancel
        </SecondaryButton>
        <AppText variant="heading">{modalMode === "add" ? "Add member (pre-app)" : "Edit Member"}</AppText>
        <View style={{ width: 60 }} />
      </View>

      <AppCard>
        {modalMode === "add" && (
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.base }}>
            Add someone who has paid or needs to appear on events before they install the app. They appear in lists, tee sheets, and results. When they join with the society code, use the same name or email so their account links to this record — no duplicate.
          </AppText>
        )}
        <View style={styles.formField}>
          <AppText variant="captionBold" style={styles.label}>Name</AppText>
          <AppInput
            placeholder="e.g. John Smith"
            value={formName}
            onChangeText={setFormName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formField}>
          <AppText variant="captionBold" style={styles.label}>Email (optional)</AppText>
          <AppInput
            placeholder="e.g. john@example.com"
            value={formEmail}
            onChangeText={setFormEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {modalMode === "edit" && permissions.canManageHandicaps && (
          <>
            <View style={[styles.formField, { marginTop: spacing.sm }]}>
              <AppText variant="captionBold" style={styles.label}>WHS Number (optional)</AppText>
              <AppInput
                placeholder="e.g. 1234567"
                value={formWhsNumber}
                onChangeText={setFormWhsNumber}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Handicap Index (optional)</AppText>
              <AppInput
                placeholder="e.g. 12.4"
                value={formHandicapIndex}
                onChangeText={setFormHandicapIndex}
                keyboardType="decimal-pad"
              />
              <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                Valid range: -10 to 54
              </AppText>
            </View>

            <Pressable
              onPress={() => setFormLockHI((v) => !v)}
              style={[styles.lockToggle, { borderColor: colors.borderLight }]}
            >
              <Feather name={formLockHI ? "lock" : "unlock"} size={iconSize.sm} color={formLockHI ? colors.error : colors.success} />
              <View style={{ flex: 1 }}>
                <AppText variant="body">{formLockHI ? "Self-edit locked" : "Self-edit allowed"}</AppText>
                <AppText variant="small" color="secondary">
                  {formLockHI ? "Member cannot change their own HI" : "Member can change their own HI"}
                </AppText>
              </View>
              <View style={[styles.lockPill, { backgroundColor: formLockHI ? colors.error + "14" : colors.success + "14" }]}>
                <AppText variant="captionBold" color={formLockHI ? "danger" : "success"}>
                  {formLockHI ? "Locked" : "Open"}
                </AppText>
              </View>
            </Pressable>
          </>
        )}

        <PrimaryButton
          onPress={modalMode === "add" ? onAdd : onUpdate}
          loading={submitting}
          style={{ marginTop: spacing.sm }}
        >
          {modalMode === "add" ? "Add Member" : "Save Changes"}
        </PrimaryButton>

        {modalMode === "edit" && editingMember && permissions.canDeleteMembers && (
          <DestructiveButton
            onPress={() => onDelete(editingMember)}
            loading={submitting}
            style={{ marginTop: spacing.sm }}
          >
            Delete Member
          </DestructiveButton>
        )}
      </AppCard>
    </>
  );
}

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  lockToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginBottom: spacing.base,
  },
  lockPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
});
