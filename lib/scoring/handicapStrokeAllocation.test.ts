import { describe, expect, it } from "vitest";
import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";
import { buildStrokesReceivedByHole } from "@/lib/scoring/handicapStrokeAllocation";

function holes18(): EventHoleSnapshot[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 400,
    strokeIndex: i + 1,
  }));
}

describe("buildStrokesReceivedByHole", () => {
  it("allocates PH=20 on 18 holes: remainder 2 → SI 1–2 get one extra stroke", () => {
    const m = buildStrokesReceivedByHole(20, holes18());
    expect(m.get(1)).toBe(2);
    expect(m.get(2)).toBe(2);
    expect(m.get(3)).toBe(1);
    expect(m.get(18)).toBe(1);
    let sum = 0;
    for (let h = 1; h <= 18; h++) sum += m.get(h) ?? 0;
    expect(sum).toBe(20);
  });

  it("supports PH>18 (e.g. 22): base 1, remainder 4", () => {
    const m = buildStrokesReceivedByHole(22, holes18());
    expect(m.get(1)).toBe(2);
    expect(m.get(4)).toBe(2);
    expect(m.get(5)).toBe(1);
    let sum = 0;
    for (let h = 1; h <= 18; h++) sum += m.get(h) ?? 0;
    expect(sum).toBe(22);
  });

  it("supports PH=36 (two per hole)", () => {
    const m = buildStrokesReceivedByHole(36, holes18());
    for (let h = 1; h <= 18; h++) expect(m.get(h)).toBe(2);
  });

  it("supports 9-hole card with PH=10", () => {
    const nine: EventHoleSnapshot[] = Array.from({ length: 9 }, (_, i) => ({
      holeNumber: i + 1,
      par: 4,
      yardage: 400,
      strokeIndex: i + 1,
    }));
    const m = buildStrokesReceivedByHole(10, nine);
    expect(m.get(1)).toBe(2);
    let sum = 0;
    for (let h = 1; h <= 9; h++) sum += m.get(h) ?? 0;
    expect(sum).toBe(10);
  });

  it("returns zeros for PH<=0", () => {
    const m = buildStrokesReceivedByHole(0, holes18());
    expect(m.get(1)).toBe(0);
  });
});
