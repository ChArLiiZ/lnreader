import { SQLiteDatabase } from 'expo-sqlite';
import { Migration } from '../types/migration';

/**
 * Migration 6: Fix Category table UNIQUE constraint
 *
 * The original Category table has `name TEXT NOT NULL UNIQUE`, which enforces
 * global uniqueness on category names. This prevents subcategories under
 * different parents from having the same name.
 *
 * This migration recreates the table without the global UNIQUE constraint and
 * adds a composite unique index on (name, COALESCE(parentId, 0)) instead.
 * This allows subcategories under different parents to share a name while
 * still enforcing uniqueness within the same parent level.
 */
export const migration006: Migration = {
  version: 6,
  description:
    'Fix Category name UNIQUE constraint to allow same name under different parents',
  migrate: (db: SQLiteDatabase) => {
    try {
      db.runSync('BEGIN TRANSACTION');

      // 1. Create new table without global UNIQUE on name
      db.runSync(`
        CREATE TABLE IF NOT EXISTS Category_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sort INTEGER,
          parentId INTEGER REFERENCES Category_new(id) ON DELETE CASCADE
        )
      `);

      // 2. Copy all existing data
      db.runSync(`
        INSERT INTO Category_new (id, name, sort, parentId)
        SELECT id, name, sort, parentId FROM Category
      `);

      // 3. Drop old table (this also drops old triggers and indexes)
      db.runSync('DROP TABLE Category');

      // 4. Rename new table
      db.runSync('ALTER TABLE Category_new RENAME TO Category');

      // 5. Create composite unique index
      //    COALESCE(parentId, 0) treats root categories (parentId IS NULL) as
      //    parentId=0 so they remain mutually unique
      db.runSync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name_parent
        ON Category(name, COALESCE(parentId, 0))
      `);

      // 6. Recreate the sort trigger
      db.runSync(`
        CREATE TRIGGER IF NOT EXISTS add_category AFTER INSERT ON Category
        BEGIN
          UPDATE Category SET sort = (SELECT IFNULL(sort, new.id)) WHERE id = new.id;
        END
      `);

      db.runSync('COMMIT');
    } catch (error) {
      try {
        db.runSync('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('Failed to fix Category UNIQUE constraint:', error);
      }
    }
  },
};
