/**
 * Align the 5-day planner window so a target date (e.g. event day) can appear in the five-day strip.
 */

export function addDaysYmd(ymd: string, deltaDays: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Shift 5-day planner start so `highlightYmd` falls inside [start, start+4] when it is after the default window. */
export function planStartForFiveDayWindow(todayYmd: string, highlightYmd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(highlightYmd) || highlightYmd < todayYmd) return todayYmd;
  const defaultEnd = addDaysYmd(todayYmd, 4);
  if (!defaultEnd || highlightYmd <= defaultEnd) return todayYmd;
  const shifted = addDaysYmd(highlightYmd, -4);
  if (!shifted) return todayYmd;
  return shifted < todayYmd ? todayYmd : shifted;
}
