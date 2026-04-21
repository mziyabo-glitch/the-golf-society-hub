/**
 * Stableford points from integer **net strokes** on a hole vs par (UK / common society table).
 * `underParBy = par - netStrokes` (strokes better than par when positive).
 * Net double bogey or worse → 0; net bogey → 1; net par → 2; net birdie → 3; net eagle → 4; net 3+ under → 5.
 */

export function stablefordPointsForHole(netStrokes: number, par: number): number {
  const net = Math.round(netStrokes);
  const p = Math.round(par);
  const underParBy = p - net;
  if (underParBy >= 3) return 5;
  if (underParBy === 2) return 4;
  if (underParBy === 1) return 3;
  if (underParBy === 0) return 2;
  if (underParBy === -1) return 1;
  return 0;
}
