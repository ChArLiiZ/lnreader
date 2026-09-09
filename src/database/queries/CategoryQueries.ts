import { BackupCategory, Category, NovelCategory, CCategory } from '../types';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import { db } from '@database/db';

const getCategoriesQuery = `
    SELECT 
        Category.id, 
        Category.name, 
        Category.sort,
        Category.parentId,
        GROUP_CONCAT(NovelCategory.novelId ORDER BY NovelCategory.novelId) AS novelIds
    FROM Category 
    LEFT JOIN NovelCategory ON NovelCategory.categoryId = Category.id 
    GROUP BY Category.id, Category.name, Category.sort, Category.parentId
    ORDER BY Category.sort;
	`;

type NumberList = `${number}` | `${number},${number}` | undefined;
export const getCategoriesFromDb = () => {
  return db.getAllSync<Category & { novelIds: NumberList }>(getCategoriesQuery);
};

/**
 * Get all categories with novel count for given novelIds.
 * Returns all categories (root + sub) excluding system local category (id=2).
 */
export const getCategoriesWithCount = (novelIds: number[]) => {
  const placeholders = novelIds.map(() => '?').join(',');
  const getCategoriesWithCountQuery = `
  SELECT *, novelsCount 
  FROM Category LEFT JOIN 
  (
    SELECT categoryId, COUNT(novelId) as novelsCount 
    FROM NovelCategory WHERE novelId IN (${placeholders}) GROUP BY categoryId 
  ) as NC ON Category.id = NC.categoryId
  WHERE Category.id != 2
  ORDER BY Category.parentId IS NOT NULL, Category.parentId, sort
	`;
  return db.getAllSync<CCategory>(getCategoriesWithCountQuery, novelIds);
};

/**
 * Get root categories only (parentId IS NULL).
 */
export const getRootCategories = () => {
  return db.getAllSync<Category>(
    'SELECT * FROM Category WHERE parentId IS NULL ORDER BY sort',
  );
};

/**
 * Get subcategories of a parent category.
 */
export const getSubCategories = (parentId: number) => {
  return db.getAllSync<Category>(
    'SELECT * FROM Category WHERE parentId = ? ORDER BY sort',
    parentId,
  );
};

/**
 * Create a new category, optionally as a subcategory.
 */
export const createCategory = (
  categoryName: string,
  parentId?: number | null,
): void => {
  if (parentId != null) {
    db.runSync(
      'INSERT INTO Category (name, parentId) VALUES (?, ?)',
      categoryName,
      parentId,
    );
  } else {
    db.runSync('INSERT INTO Category (name) VALUES (?)', categoryName);
  }
};

/**
 * Before deleting a category, move orphan novels to:
 * - parent category (if subcategory)
 * - system default category (id=1) otherwise
 */
const getBeforeDeleteCategoryQuery = (fallbackCategoryId: number) => `
    UPDATE NovelCategory SET categoryId = ${fallbackCategoryId}
    WHERE novelId IN (
      SELECT novelId FROM NovelCategory
      GROUP BY novelId
      HAVING COUNT(categoryId) = 1
    )
    AND categoryId = ?;
`;
const deleteCategoryQuery = 'DELETE FROM Category WHERE id = ?';

export const deleteCategoryById = (category: Category): void => {
  if (category.id === 1 || category.id === 2) {
    return showToast(getString('categories.cantDeleteDefault'));
  }
  // If it's a subcategory, move orphan novels to parent; otherwise to default (id=1)
  const fallbackId = category.parentId ?? 1;
  db.runSync(getBeforeDeleteCategoryQuery(fallbackId), category.id);
  // Also delete all child subcategories (their novels will be moved by CASCADE or handled recursively)
  if (category.parentId == null) {
    // Root category: move novels from subcategories to fallback first
    const subCategories = getSubCategories(category.id);
    for (const sub of subCategories) {
      db.runSync(getBeforeDeleteCategoryQuery(1), sub.id);
    }
  }
  db.runSync(deleteCategoryQuery, category.id);
};

const updateCategoryQuery = 'UPDATE Category SET name = ? WHERE id = ?';

export const updateCategory = (
  categoryId: number,
  categoryName: string,
): void => {
  db.runSync(updateCategoryQuery, categoryName, categoryId);
};

/**
 * Check if a category name is duplicate.
 * For subcategories, checks uniqueness within the same parent.
 * For root categories, checks uniqueness among root categories.
 */
export const isCategoryNameDuplicate = (
  categoryName: string,
  parentId?: number | null,
): boolean => {
  let query: string;
  let params: (string | number)[];

  if (parentId != null) {
    query =
      'SELECT COUNT(*) as isDuplicate FROM Category WHERE name = ? AND parentId = ?';
    params = [categoryName, parentId];
  } else {
    query =
      'SELECT COUNT(*) as isDuplicate FROM Category WHERE name = ? AND parentId IS NULL';
    params = [categoryName];
  }

  const res = db.getFirstSync(query, params);

  if (res instanceof Object && 'isDuplicate' in res) {
    return Boolean(res.isDuplicate);
  } else {
    throw 'isCategoryNameDuplicate return type does not match.';
  }
};

const updateCategoryOrderQuery = 'UPDATE Category SET sort = ? WHERE id = ?';

export const updateCategoryOrderInDb = (categories: Category[]): void => {
  // Do not set local as default one
  if (categories.length && categories[0].id === 2) {
    return;
  }
  // The row's position is authoritative, not whatever `sort` it arrived with.
  // Sort is 1-based: the built-in default category is sort 1, and a 0-based
  // write left nothing at 1 for lookups that expect it.
  categories.forEach((category, index) => {
    db.runSync(updateCategoryOrderQuery, index + 1, category.id);
  });
};

export const getAllNovelCategories = () =>
  db.getAllSync<NovelCategory>('SELECT * FROM NovelCategory');

/**
 * Restores one category without deleting anything already there.
 *
 * A category is matched by its name under the same parent — the fork's unique
 * index — rather than by the id it had in the backup. Deleting by id or sort
 * destroyed whichever unrelated category happened to occupy that row, and with
 * it every novel's membership of that category.
 *
 * Backup ids are remapped through the two maps: `novelIdMap` from the novel
 * restore, `categoryIdMap` filled in as categories are restored, so a
 * subcategory can find its parent.
 */
export const _restoreCategory = (
  category: BackupCategory,
  novelIdMap: Map<number, number>,
  categoryIdMap: Map<number, number>,
): void => {
  const parentId =
    category.parentId == null
      ? null
      : categoryIdMap.get(category.parentId) ?? null;

  const existing = db.getFirstSync<{ id: number }>(
    parentId === null
      ? 'SELECT id FROM Category WHERE name = ? AND parentId IS NULL'
      : 'SELECT id FROM Category WHERE name = ? AND parentId = ?',
    ...(parentId === null ? [category.name] : [category.name, parentId]),
  );

  let categoryId = existing?.id;

  if (categoryId === undefined) {
    db.runSync(
      'INSERT INTO Category (name, sort, parentId) VALUES (?, ?, ?)',
      category.name,
      category.sort,
      parentId,
    );
    categoryId = db.getFirstSync<{ id: number }>(
      parentId === null
        ? 'SELECT id FROM Category WHERE name = ? AND parentId IS NULL'
        : 'SELECT id FROM Category WHERE name = ? AND parentId = ?',
      ...(parentId === null ? [category.name] : [category.name, parentId]),
    )?.id;
  }

  if (categoryId === undefined) {
    throw new Error(`Could not restore category ${category.name}`);
  }

  categoryIdMap.set(category.id, categoryId);

  for (const backupNovelId of category.novelIds) {
    const novelId = novelIdMap.get(backupNovelId);
    if (novelId === undefined) {
      continue;
    }
    db.runSync(
      'INSERT OR IGNORE INTO NovelCategory (categoryId, novelId) VALUES (?, ?)',
      categoryId,
      novelId,
    );
  }
};
