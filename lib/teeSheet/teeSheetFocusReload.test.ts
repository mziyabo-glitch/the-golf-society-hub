import { describe, expect, it } from "vitest";
import {
  REGENERATE_TEE_SHEET_CONFIRM_MESSAGE,
  shouldSkipTeeSheetFocusReload,
} from "@/lib/teeSheet/teeSheetFocusReload";

describe("teeSheet focus reload", () => {
  it("skips reload while dirty or save/publish in flight", () => {
    expect(shouldSkipTeeSheetFocusReload({ isDirty: true, saving: false, publishing: false })).toBe(true);
    expect(shouldSkipTeeSheetFocusReload({ isDirty: false, saving: true, publishing: false })).toBe(true);
    expect(shouldSkipTeeSheetFocusReload({ isDirty: false, saving: false, publishing: true })).toBe(true);
    expect(shouldSkipTeeSheetFocusReload({ isDirty: false, saving: false, publishing: false })).toBe(false);
  });

  it("skips reload while generating, regenerating, or a detail reload is in flight", () => {
    expect(
      shouldSkipTeeSheetFocusReload({ isDirty: false, saving: false, publishing: false, generating: true }),
    ).toBe(true);
    expect(
      shouldSkipTeeSheetFocusReload({
        isDirty: false,
        saving: false,
        publishing: false,
        regeneratingFromPool: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipTeeSheetFocusReload({
        isDirty: false,
        saving: false,
        publishing: false,
        eventDetailsRefreshing: true,
      }),
    ).toBe(true);
  });

  it("documents regenerate confirmation copy", () => {
    expect(REGENERATE_TEE_SHEET_CONFIRM_MESSAGE).toMatch(/replace your saved tee sheet draft/i);
  });
});
