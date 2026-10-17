import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { hasBillableEventFee, shouldShowHomePaymentRow } from "@/lib/home/homeNextEventPanelModel";

export type EventDetailQuickActionId =
  | "players"
  | "tee_sheet"
  | "results"
  | "prize_pool"
  | "scoring_leaderboard"
  | "gross_entry"
  | "publish_scoring";

export type EventDetailQuickAction = {
  id: EventDetailQuickActionId;
  memberFacing: boolean;
  adminOnly: boolean;
};

/** Member-first ordering; admin scoring tools flagged adminOnly. */
export function buildEventDetailQuickActions(input: {
  canViewTeeSheet: boolean;
  hasResults: boolean;
  canManageHandicaps: boolean;
  canEnterGrossScores: boolean;
  canAccessScorecardUi: boolean;
  prizePoolEnabled: boolean;
}): EventDetailQuickAction[] {
  const actions: EventDetailQuickAction[] = [
    { id: "players", memberFacing: true, adminOnly: false },
  ];

  if (input.canViewTeeSheet) {
    actions.push({ id: "tee_sheet", memberFacing: true, adminOnly: false });
  }

  if (input.hasResults || input.canManageHandicaps) {
    actions.push({ id: "results", memberFacing: true, adminOnly: false });
  }

  if (input.prizePoolEnabled) {
    actions.push({ id: "prize_pool", memberFacing: true, adminOnly: false });
  }

  if (input.canAccessScorecardUi) {
    actions.push({ id: "scoring_leaderboard", memberFacing: false, adminOnly: true });
  }
  if (input.canEnterGrossScores) {
    actions.push({ id: "gross_entry", memberFacing: false, adminOnly: true });
    actions.push({ id: "publish_scoring", memberFacing: false, adminOnly: true });
  }

  return actions;
}

export function splitQuickActionsForAudience(
  actions: EventDetailQuickAction[],
  showAdminTools: boolean,
): { member: EventDetailQuickAction[]; admin: EventDetailQuickAction[] } {
  const member = actions.filter((a) => a.memberFacing && !a.adminOnly);
  const admin = showAdminTools ? actions.filter((a) => a.adminOnly) : [];
  return { member, admin };
}

export function shouldShowMemberPaymentStatus(
  myRegistration: EventRegistration | null | undefined,
  entryFeeDisplay: string | null | undefined,
): boolean {
  return shouldShowHomePaymentRow(myRegistration ?? null, entryFeeDisplay);
}

export function shouldShowEntryFeeLine(entryFeeDisplay: string | null | undefined): boolean {
  return hasBillableEventFee(entryFeeDisplay);
}

export function shouldShowSocietyAttendanceSummary(showAdminTools: boolean): boolean {
  return showAdminTools;
}

export function shouldShowJointAttendeeRoll(showAdminTools: boolean, canExport: boolean): boolean {
  return showAdminTools || canExport;
}

type QuickActionCopy = {
  icon: "users" | "flag" | "bar-chart-2" | "award" | "list" | "edit-3" | "check-circle";
  iconColorKey: "primary" | "success" | "warning";
  title: string;
  subtitle: string;
};

export function quickActionCopy(
  id: EventDetailQuickActionId,
  ctx: { canManageHandicaps: boolean; hasResults: boolean; poolCount: number },
): QuickActionCopy {
  switch (id) {
    case "players":
      return {
        icon: "users",
        iconColorKey: "primary",
        title: "Players",
        subtitle: "Player and guest list",
      };
    case "tee_sheet":
      return {
        icon: "flag",
        iconColorKey: "success",
        title: "Tee sheet",
        subtitle: "Published start times",
      };
    case "results":
      return {
        icon: "bar-chart-2",
        iconColorKey: "warning",
        title: ctx.canManageHandicaps ? "Enter results" : "Event results",
        subtitle: ctx.canManageHandicaps
          ? "Official points and placements"
          : ctx.hasResults
            ? "View official results"
            : "Results when published",
      };
    case "prize_pool":
      return {
        icon: "award",
        iconColorKey: "primary",
        title: "Prize pool",
        subtitle:
          ctx.poolCount > 0
            ? `${ctx.poolCount} pool${ctx.poolCount === 1 ? "" : "s"} configured`
            : "Side pools for this event",
      };
    case "scoring_leaderboard":
      return {
        icon: "list",
        iconColorKey: "primary",
        title: "Scoring leaderboard",
        subtitle: "Gross order (draft vs official on screen)",
      };
    case "gross_entry":
      return {
        icon: "edit-3",
        iconColorKey: "success",
        title: "Gross score entry",
        subtitle: "Enter or edit hole scores",
      };
    case "publish_scoring":
      return {
        icon: "check-circle",
        iconColorKey: "primary",
        title: "Publish scoring results",
        subtitle: "Make gross leaderboard official",
      };
    default:
      return { icon: "users", iconColorKey: "primary", title: id, subtitle: "" };
  }
}
