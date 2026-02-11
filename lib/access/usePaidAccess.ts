// lib/access/usePaidAccess.ts
// Single source of truth for paid-feature access.
//
// canUsePaidFeatures = has_society_seat || sinbook_pro || is_captain
// needsLicence      = isMember && !canUsePaidFeatures
//
// guardPaidAction()  — call before any gated action. Returns true if
//   the user can proceed, false if the licence modal was opened.

import { useCallback, useState } from "react";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { isPro } from "@/lib/sinbookEntitlement";

export function usePaidAccess() {
  const { member, societyId } = useBootstrap();
  const [modalVisible, setModalVisible] = useState(false);

  const hasSeat = (member as any)?.has_seat === true;
  const captain = isCaptain(member as any);
  const sinbookPro = isPro();

  const canUsePaidFeatures = hasSeat || captain || sinbookPro;
  const needsLicence = !!member && !!societyId && !canUsePaidFeatures;

  /** Call before any paid action. Returns false (and opens modal) if blocked. */
  const guardPaidAction = useCallback((): boolean => {
    if (!needsLicence) return true;
    setModalVisible(true);
    return false;
  }, [needsLicence]);

  return {
    needsLicence,
    canUsePaidFeatures,
    guardPaidAction,
    modalVisible,
    setModalVisible,
    societyId,
  };
}
