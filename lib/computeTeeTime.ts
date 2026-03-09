/**
 * Compute tee time from start time and group index.
 * Pure, safe utility for "Your Tee Time" display.
 *
 * @param start - Start time as "HH:mm" (e.g. "08:00")
 * @param interval - Minutes between groups (default 10)
 * @param groupIndex - Zero-based group index
 * @returns Formatted "HH:mm" string
 */
export function computeTeeTime(
  start: string = "08:00",
  interval: number = 10,
  groupIndex: number = 0
): string {
  const [hoursStr, minutesStr] = String(start || "08:00").split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return "08:00";
  }

  const intervalNum = Number.isFinite(interval) && interval > 0 ? interval : 10;
  const idx = Math.max(0, Math.floor(groupIndex));

  const baseMinutes = hours * 60 + minutes + intervalNum * idx;
  const teeHours = Math.floor(baseMinutes / 60) % 24;
  const teeMins = baseMinutes % 60;

  return `${String(teeHours).padStart(2, "0")}:${String(teeMins).padStart(2, "0")}`;
}
