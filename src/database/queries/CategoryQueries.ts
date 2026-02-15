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
  const getCategoriesWithCountQuery = `
  SELECT *, novelsCount 
  FROM Category LEFT JOIN 
  (
    SELECT categoryId, COUNT(novelId) as novelsCount 
    FROM NovelCategory WHERE novelId in (${novelIds.join(
      ',',
    )}) GROUP BY categoryId 
  ) as NC ON Category.id = NC.categoryId
  WHERE Category.id != 2
  ORDER BY Category.parentId IS NOT NULL, Category.parentId, sort
	`;
  return db.getAllSync<CCategory>(getCategoriesWithCountQuery);
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
  for (const c of categories) {
    db.runSync(updateCategoryOrderQuery, c.sort, c.id);
  }
};

export const getAllNovelCategories = () =>
  db.getAllSync<NovelCategory>('SELECT * FROM NovelCategory');

export const _restoreCategory = (category: BackupCategory) => {
  db.runSync(
    'DELETE FROM Category WHERE id = ? OR sort = ?',
    category.id,
    category.sort,
  );
  db.runSync(
    'INSERT OR IGNORE INTO Category (id, name, sort, parentId) VALUES (?, ?, ?, ?)',
    category.id,
    category.name,
    category.sort,
    category.parentId ?? null,
  );
  for (const novelId of category.novelIds) {
    db.runSync(
      'INSERT OR IGNORE INTO NovelCategory (categoryId, novelId) VALUES (?, ?)',
      category.id,
      novelId,
    );
  }
};
