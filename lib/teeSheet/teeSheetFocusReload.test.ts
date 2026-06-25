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

  it("documents regenerate confirmation copy", () => {
    expect(REGENERATE_TEE_SHEET_CONFIRM_MESSAGE).toMatch(/replace your saved tee sheet draft/i);
  });
});
