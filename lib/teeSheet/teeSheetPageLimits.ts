/** Max tee-time rows that fit on one share/export poster image. */
export const TEE_SHEET_GROUPS_PER_PAGE = 12;

/** Split groups into poster pages (12 tee times per image). */
export function paginateTeeSheetGroups<T>(
  groups: readonly T[],
  groupsPerPage: number = TEE_SHEET_GROUPS_PER_PAGE,
): T[][] {
  if (groups.length === 0) return [];
  const pageSize = Math.max(1, groupsPerPage);
  const pages: T[][] = [];
  for (let i = 0; i < groups.length; i += pageSize) {
    pages.push(groups.slice(i, i + pageSize));
  }
  return pages;
}
