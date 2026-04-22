import { describe, expect, it } from "vitest";

import { planTerritoryCandidateOrder, type TerritoryImportCaps } from "@/lib/server/courseImportEngine";

describe("planTerritoryCandidateOrder", () => {
  it("applies bucket priority and per-bucket caps (growth ceiling, refresh sub-cap)", () => {
    const caps: TerritoryImportCaps = {
      maxPriorityCourses: 2,
      maxNewSeeds: 2,
      maxRetries: 1,
      maxRefreshes: 1,
      maxDiscoveryPerRun: 50,
      maxNewCourseImportAttempts: 5,
      maxStaleCandidateRefreshAttempts: 0,
      maxStaleCatalogSweepCourses: 10,
    };
    const ordered = planTerritoryCandidateOrder(caps, {
      priority: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      retries: [{ id: "r1" }, { id: "r2" }],
      fresh: [{ id: "n1" }, { id: "n2" }, { id: "n3" }],
      refresh: [{ id: "f1" }, { id: "f2" }],
    });
    expect(ordered).toEqual(["p1", "p2", "r1", "n1", "n2"]);
  });

  it("de-duplicates ids across buckets", () => {
    const caps: TerritoryImportCaps = {
      maxPriorityCourses: 2,
      maxNewSeeds: 2,
      maxRetries: 1,
      maxRefreshes: 1,
      maxDiscoveryPerRun: 50,
      maxNewCourseImportAttempts: 4,
      maxStaleCandidateRefreshAttempts: 1,
      maxStaleCatalogSweepCourses: 10,
    };
    const ordered = planTerritoryCandidateOrder(caps, {
      priority: [{ id: "shared" }, { id: "p2" }],
      retries: [{ id: "shared" }, { id: "r2" }],
      fresh: [{ id: "shared" }, { id: "n2" }],
      refresh: [{ id: "shared" }, { id: "f2" }],
    });
    expect(ordered).toEqual(["shared", "p2", "r2", "n2", "f2"]);
  });
});
