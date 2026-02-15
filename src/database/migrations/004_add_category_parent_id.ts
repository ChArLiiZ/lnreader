import { SQLiteDatabase } from 'expo-sqlite';
import { Migration } from '../types/migration';

const columnExists = (
  db: SQLiteDatabase,
  tableName: string,
  columnName: string,
): boolean => {
  try {
    const columns = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(${tableName})`,
    );
    return columns.some(col => col.name === columnName);
  } catch {
    return false;
  }
};

/**
 * Migration 4: Add parentId column to Category table for subcategory support
 * - Adds parentId column referencing Category(id)
 * - parentId = NULL means root category
 * - parentId = <id> means subcategory of that parent
 */
export const migration004: Migration = {
  version: 4,
  description: 'Add parentId column to Category table for subcategory support',
  migrate: (db: SQLiteDatabase) => {
    if (!columnExists(db, 'Category', 'parentId')) {
      try {
        db.runSync(`
          ALTER TABLE Category
          ADD COLUMN parentId INTEGER REFERENCES Category(id) ON DELETE CASCADE
        `);
      } catch (error) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            'Failed to add parentId column to Category table:',
            error,
          );
        }
      }
    }
  },
};
