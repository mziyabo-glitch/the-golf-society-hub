import { describe, expect, it, vi } from "vitest";
import {
  isStaleTeeSheetLoad,
  shouldClearTeeSheetRefreshing,
  TEE_SHEET_LOAD_TIMEOUT_MESSAGE,
  TEE_SHEET_LOAD_TIMEOUT_MS,
  validateCanonicalTeeGroupsForEditor,
  withTeeSheetLoadTimeout,
} from "@/lib/teeSheet/teeSheetEventLoadUtils";

describe("teeSheetEventLoadUtils", () => {
  it("stale guard ignores superseded load seq", () => {
    expect(isStaleTeeSheetLoad(1, 2)).toBe(true);
    expect(isStaleTeeSheetLoad(2, 2)).toBe(false);
  });

  it("always clears refreshing flag (no seq gate)", () => {
    expect(shouldClearTeeSheetRefreshing()).toBe(true);
  });

  it("rejects malformed tee_groups canonical", () => {
    expect(
      validateCanonicalTeeGroupsForEditor({
        source: "tee_groups",
        groups: [{ groupNumber: Number.NaN, players: [{ id: "m1" }] }],
      }),
    ).toMatch(/group number/i);
    expect(
      validateCanonicalTeeGroupsForEditor({
        source: "tee_groups",
        groups: [{ groupNumber: 1, players: [{ id: "" }] }],
      }),
    ).toMatch(/player id/i);
    expect(
      validateCanonicalTeeGroupsForEditor({
        source: "computed_fallback",
        groups: [{ groupNumber: Number.NaN, players: [] }],
      }),
    ).toBeNull();
  });

  it("times out hung promises with user-facing message", async () => {
    vi.useFakeTimers();
    const hung = withTeeSheetLoadTimeout(
      new Promise<string>(() => {}),
      100,
      TEE_SHEET_LOAD_TIMEOUT_MESSAGE,
    );
    const assertion = expect(hung).rejects.toThrow(TEE_SHEET_LOAD_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    vi.useRealTimers();
  });

  it("resolves before timeout when promise completes", async () => {
    await expect(withTeeSheetLoadTimeout(Promise.resolve("ok"), TEE_SHEET_LOAD_TIMEOUT_MS)).resolves.toBe(
      "ok",
    );
  });

  it("refreshing flag is not gated by stale seq (superseded loads still clear UI)", () => {
    expect(shouldClearTeeSheetRefreshing()).toBe(true);
    expect(isStaleTeeSheetLoad(1, 3)).toBe(true);
  });
});
