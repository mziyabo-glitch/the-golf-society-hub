import type { EventSocietyInput } from "./jointEventTypes";

export type NormalizedEventSociety = {
  society_id: string;
  role: "host" | "participant";
  has_society_oom: boolean;
  society_oom_name: string | null;
};

export function normalizeEventSocietyInput(s: EventSocietyInput): NormalizedEventSociety {
  return {
    society_id: s.society_id,
    role: s.role,
    has_society_oom: s.has_society_oom ?? true,
    society_oom_name: s.society_oom_name?.trim() || null,
  };
}

/** True when participating societies (roles, OOM flags, names) are unchanged. */
export function eventSocietyInputsEqual(a: EventSocietyInput[], b: EventSocietyInput[]): boolean {
  if (a.length !== b.length) return false;
  const sortKey = (row: NormalizedEventSociety) => row.society_id;
  const norm = (list: EventSocietyInput[]) =>
    list.map(normalizeEventSocietyInput).sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const left = norm(a);
  const right = norm(b);
  return left.every(
    (row, i) =>
      row.society_id === right[i].society_id &&
      row.role === right[i].role &&
      row.has_society_oom === right[i].has_society_oom &&
      row.society_oom_name === right[i].society_oom_name,
  );
}

export function isSupabaseRlsError(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return error?.code === "42501" || message.includes("row-level security");
}

export function formatEventSocietiesPermissionError(): string {
  return (
    "You don't have permission to change participating societies for this event. " +
    "Only Captain, Secretary, or Handicapper from the host or participating societies can do that."
  );
}

export function formatEventUpdatePermissionError(): string {
  return (
    "You don't have permission to update this event. " +
    "Only Captain, Secretary, or Handicapper from the host or participating societies can edit event details and tee settings."
  );
}
