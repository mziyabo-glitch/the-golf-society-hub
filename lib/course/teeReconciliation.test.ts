import { describe, expect, it } from "vitest";
import { listStaleTeeRows, partitionStaleTeesForImportReconciliation } from "@/lib/course/teeReconciliation";

describe("teeReconciliation", () => {
  it("listStaleTeeRows treats normalized tee_name set as exact source of truth", () => {
    const db = [
      { id: "a", tee_name: "White" },
      { id: "b", tee_name: "Yellow" },
      { id: "c", tee_name: "Blue (Ladies)" },
      { id: "d", tee_name: "Legacy tee" },
    ];
    const normalized = ["White", "Yellow", "Blue (Ladies)"];
    const stale = listStaleTeeRows(db, normalized);
    expect(stale).toEqual([{ id: "d", tee_name: "Legacy tee" }]);
  });

  it("partitionStaleTeesForImportReconciliation deletes only unreferenced stale tees", () => {
    const stale = [
      { id: "u1", tee_name: "Old" },
      { id: "r1", tee_name: "Historic" },
    ];
    const refs = new Set(["r1"]);
    const { deactivateIds, deleteIds } = partitionStaleTeesForImportReconciliation(stale, refs);
    expect(deactivateIds).toEqual(["r1"]);
    expect(deleteIds).toEqual(["u1"]);
  });
});
