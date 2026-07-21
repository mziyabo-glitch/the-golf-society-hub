import { describe, expect, it } from "vitest";
import { isAdminRoute, isToolRoute } from "@/lib/rootRouteExemptions";

describe("isAdminRoute", () => {
  it("recognizes admin group and usage-report paths", () => {
    expect(isAdminRoute("/(admin)/usage-report", "(admin)")).toBe(true);
    expect(isAdminRoute("/usage-report", undefined)).toBe(true);
    expect(isAdminRoute("/(admin)/course-domains", "(admin)")).toBe(true);
    expect(isAdminRoute("/(app)/(tabs)/more", "(app)")).toBe(false);
  });
});

describe("isToolRoute", () => {
  it("recognizes share and tee-sheet tool paths", () => {
    expect(isToolRoute("/(share)/tee-sheet", "(share)")).toBe(true);
    expect(isToolRoute("/(app)/tee-sheet", "(app)")).toBe(true);
    expect(isToolRoute("/(app)/(tabs)/events", "(app)")).toBe(false);
  });
});
