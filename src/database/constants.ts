/**
 * Categories 1 and 2 are created by the initial schema and cannot be deleted.
 * They are identified by id: `sort` is user-controlled and changes whenever
 * categories are reordered, so it cannot stand in for identity.
 */
export const BUILT_IN_CATEGORY_IDS = {
  default: 1,
  local: 2,
} as const;
