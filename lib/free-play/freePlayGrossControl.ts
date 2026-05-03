export function nextGrossOnIncrement(currentGross: number | null, par: number): number {
  if (currentGross == null || !Number.isFinite(currentGross)) {
    return Math.max(1, Math.round(par));
  }
  return Math.round(currentGross) + 1;
}

export function nextGrossOnDecrement(currentGross: number | null, par: number): number | null {
  if (currentGross == null || !Number.isFinite(currentGross)) {
    return Math.max(1, Math.round(par) - 1);
  }
  if (currentGross <= 1) return null;
  return Math.round(currentGross) - 1;
}
