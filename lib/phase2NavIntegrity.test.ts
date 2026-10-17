import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PHASE2_REMOVED_NAV_PATTERNS,
  PHASE2_ROUTE_INVENTORY,
  inventoryHasEntryPoint,
} from "@/lib/navigation/phase2RouteInventory";

const root = process.cwd();

function readAppSource(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 2 route inventory", () => {
  it("lists an intended entry for core and retained routes", () => {
    expect(inventoryHasEntryPoint("/(app)/(tabs)/events")).toBe(true);
    expect(inventoryHasEntryPoint("/(app)/tee-sheet?eventId=")).toBe(true);
    expect(inventoryHasEntryPoint("/(app)/free-play")).toBe(true);
    expect(inventoryHasEntryPoint("/(app)/course-data")).toBe(true);
    expect(inventoryHasEntryPoint("/(app)/admin/usage-report")).toBe(true);
    expect(PHASE2_ROUTE_INVENTORY.every((r) => r.purpose.length > 0)).toBe(true);
  });

  it("marks bare tee-sheet and society as redirects", () => {
    expect(PHASE2_ROUTE_INVENTORY.find((r) => r.route === "/(app)/tee-sheet")?.entry).toBe("redirect");
    expect(PHASE2_ROUTE_INVENTORY.find((r) => r.route === "/(app)/society")?.entry).toBe("redirect");
  });
});

describe("Phase 2 More / Home / Settings link integrity", () => {
  it("More keeps Free Play under Other golf tools and no tee-sheet generator", () => {
    const more = readAppSource("app/(app)/(tabs)/more.tsx");
    expect(more).toContain("Other golf tools");
    expect(more).toContain('push("/(app)/free-play")');
    expect(more).not.toContain("Tee sheet generator");
    expect(more).not.toContain("Birdies League");
    expect(more).toContain("Platform administration");
    expect(more).toContain("course-data");
  });

  it("Settings no longer links to standalone tee-sheet generator or birdies", () => {
    const settings = readAppSource("app/(app)/(tabs)/settings.tsx");
    expect(settings).not.toMatch(/Tee sheet generator/i);
    expect(settings).not.toMatch(/router\.push\(\s*["']\/\(app\)\/tee-sheet["']/);
    expect(settings).not.toMatch(/birdies-league/i);
  });

  it("Personal Mode Home does not promote Free Play", () => {
    const home = readAppSource("features/home/PersonalModeHome.tsx");
    expect(home).not.toContain("Free Play Scorecard");
    expect(home).not.toMatch(/pushWithBlur\("\/\(app\)\/free-play"\)/);
  });

  it("Scorecard tab stays href:null in tabs layout", () => {
    const layout = readAppSource("app/(app)/(tabs)/_layout.tsx");
    expect(layout).toMatch(/name="scorecard"[^]*href:\s*null/);
  });

  it("removed nav labels are documented", () => {
    expect(PHASE2_REMOVED_NAV_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe("Phase 2 event tee-sheet journey still linked from manage", () => {
  it("Manage Event still opens tee-sheet with eventId", () => {
    const manage = readAppSource("app/(app)/event/[id]/manage.tsx");
    expect(manage).toContain('pathname: "/(app)/tee-sheet"');
    expect(manage).toMatch(/eventId/);
  });
});
