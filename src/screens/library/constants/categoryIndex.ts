/**
 * Resolve a saved category id to its current tab index. Categories can be
 * reordered or deleted between sessions, so the id is the stable reference and
 * a missing one falls back to the first tab.
 */
export const getLibraryCategoryIndex = (
  categories: { id: number }[],
  categoryId?: number,
): number => {
  const index = categories.findIndex(category => category.id === categoryId);
  return index === -1 ? 0 : index;
};
