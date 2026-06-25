/** When to skip DB reload on screen focus (preserve unsaved ManCo edits). */

export function shouldSkipTeeSheetFocusReload(input: {
  isDirty: boolean;
  saving: boolean;
  publishing: boolean;
}): boolean {
  return input.isDirty || input.saving || input.publishing;
}

export const REGENERATE_TEE_SHEET_CONFIRM_MESSAGE =
  "This will replace your saved tee sheet draft with a new grouping from the eligible paid player pool.";
