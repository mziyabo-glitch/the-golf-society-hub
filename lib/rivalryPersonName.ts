/**
 * Shared display-name resolution for Rivalries (sinbook) participants.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

export type RivalryPersonNameSource =
  | "participant_display_name"
  | "member_name"
  | "member_full_name"
  | "member_display_name"
  | "profile_display_name"
  | "auth_full_name"
  | "auth_name"
  | "email_local"
  | "opponent_fallback";

export type RivalryPersonNameHints = {
  participantDisplayName?: string | null;
  memberName?: string | null;
  memberFullName?: string | null;
  /** `members.display_name` column when present */
  memberDisplayNameCol?: string | null;
  /** profiles.full_name (treated as profile "display" name) */
  profileDisplayName?: string | null;
  profileEmail?: string | null;
  authFullName?: string | null;
  authName?: string | null;
  /** Extra email (e.g. from member row) for local-part fallback */
  memberEmail?: string | null;
  /** Populated by sinbook hydration for temporary debug logging */
  userId?: string;
  memberId?: string | null;
  personId?: string | null;
  email?: string | null;
};

const PLACEHOLDER_PARTICIPANT_NAMES = new Set(
  ["", "player", "opponent", "you", "unknown", "member"].map((s) => s.toLowerCase()),
);

export function emailLocalPart(email: string | null | undefined): string | null {
  const e = email?.trim();
  if (!e || !e.includes("@")) return null;
  const local = e.split("@")[0]?.trim();
  return local || null;
}

function meaningfulParticipantName(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (PLACEHOLDER_PARTICIPANT_NAMES.has(t.toLowerCase())) return null;
  return t;
}

export type ResolvePersonDisplayNameResult = {
  name: string;
  source: RivalryPersonNameSource;
  usedOpponentFallback: boolean;
};

/**
 * Required fallback order:
 * - participant.display_name (excluding empty / common placeholders)
 * - member.name / member.full_name
 * - profile.display_name → profiles.full_name in DB
 * - auth user metadata full_name / name
 * - email local-part (profile or member email)
 * - "Opponent" only as last resort
 */
export function resolvePersonDisplayName(
  hints: RivalryPersonNameHints,
  options?: { lastResort?: string },
): ResolvePersonDisplayNameResult {
  const p = meaningfulParticipantName(hints.participantDisplayName);
  if (p) {
    return { name: p, source: "participant_display_name", usedOpponentFallback: false };
  }

  const mName = hints.memberName?.trim();
  if (mName) {
    return { name: mName, source: "member_name", usedOpponentFallback: false };
  }

  const mFull = hints.memberFullName?.trim();
  if (mFull) {
    return { name: mFull, source: "member_full_name", usedOpponentFallback: false };
  }

  const mDisp = hints.memberDisplayNameCol?.trim();
  if (mDisp) {
    return { name: mDisp, source: "member_display_name", usedOpponentFallback: false };
  }

  const prof = hints.profileDisplayName?.trim();
  if (prof) {
    return { name: prof, source: "profile_display_name", usedOpponentFallback: false };
  }

  const authFn = hints.authFullName?.trim();
  if (authFn) {
    return { name: authFn, source: "auth_full_name", usedOpponentFallback: false };
  }

  const authN = hints.authName?.trim();
  if (authN) {
    return { name: authN, source: "auth_name", usedOpponentFallback: false };
  }

  const local =
    emailLocalPart(hints.profileEmail) ?? emailLocalPart(hints.memberEmail);
  if (local) {
    return { name: local, source: "email_local", usedOpponentFallback: false };
  }

  const last = (options?.lastResort ?? "Opponent").trim() || "Opponent";
  const isOpp = last === "Opponent";
  return { name: last, source: "opponent_fallback", usedOpponentFallback: isOpp };
}

export function memberDocToRivalryHints(m: MemberDoc): RivalryPersonNameHints {
  const withNames = m as MemberDoc & { first_name?: string | null; last_name?: string | null };
  const combined = [withNames.first_name, withNames.last_name]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  const primary = m.name?.trim() || combined || null;
  return {
    memberName: primary,
    memberFullName: primary,
    memberDisplayNameCol: m.display_name ?? null,
    memberEmail: m.email ?? null,
  };
}

export type SinbookLikeForNames = {
  participants: { user_id: string; display_name: string }[];
  rivalryNameHintsByUserId?: Record<string, RivalryPersonNameHints>;
};

/**
 * Resolver for one sinbook: returns "You" for the viewer's own user id when requested.
 */
/** Display name stored on `sinbook_participants` when joining / creating (avoid generic "Player"). */
export function joinRivalrySelfDisplayName(args: {
  memberName?: string | null;
  memberDisplayName?: string | null;
  profileFullName?: string | null;
  authEmail?: string | null;
  authMetadata?: Record<string, unknown> | null;
}): string {
  const m =
    args.memberDisplayName?.trim() ||
    args.memberName?.trim() ||
    args.profileFullName?.trim();
  if (m) return m;

  const meta = args.authMetadata;
  if (meta && typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (meta && typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();

  const local = emailLocalPart(args.authEmail);
  if (local) return local;
  return "Player";
}

export function createRivalryParticipantDisplayResolver(
  sinbook: SinbookLikeForNames,
  viewerUserId: string | null,
  options?: { nullWinnerLabel?: string },
): (participantUserId: string | null | undefined) => string {
  const nullLabel = options?.nullWinnerLabel ?? "No winner";
  return (participantUserId) => {
    if (participantUserId == null || participantUserId === "") return nullLabel;
    if (viewerUserId && participantUserId === viewerUserId) return "You";

    const p = sinbook.participants.find((x) => x.user_id === participantUserId);
    const extra = sinbook.rivalryNameHintsByUserId?.[participantUserId] ?? {};
    const merged: RivalryPersonNameHints = {
      ...extra,
      participantDisplayName: p?.display_name ?? extra.participantDisplayName,
    };
    return resolvePersonDisplayName(merged).name;
  };
}
