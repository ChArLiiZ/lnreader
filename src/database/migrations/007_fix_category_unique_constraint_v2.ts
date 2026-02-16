import { SQLiteDatabase } from 'expo-sqlite';
import { Migration } from '../types/migration';

/**
 * Migration 7: Fix Category table UNIQUE constraint (v2)
 *
 * This replaces the broken migration 006 which failed silently due to
 * a nested-transaction conflict with the migration runner.
 *
 * The original Category table has `name TEXT NOT NULL UNIQUE`, which enforces
 * global uniqueness on category names. This prevents subcategories under
 * different parents from having the same name.
 *
 * This migration recreates the table without the global UNIQUE constraint and
 * adds a composite unique index on (name, COALESCE(parentId, 0)) instead.
 * This allows subcategories under different parents to share a name while
 * still enforcing uniqueness within the same parent level.
 *
 * It is safe to run even if the original migration 006 partially or fully
 * succeeded, because every step uses IF EXISTS / IF NOT EXISTS guards.
 */
export const migration007: Migration = {
  version: 7,
  description:
    'Fix Category name UNIQUE constraint to allow same name under different parents (v2)',
  migrate: (db: SQLiteDatabase) => {
    // Check if the fix is already applied by looking for the composite index
    const existingIndex = db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_category_name_parent'",
    );
    if (existingIndex) {
      // Already applied (e.g. migration 006 somehow succeeded on some device)
      return;
    }

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
      INSERT OR IGNORE INTO Category_new (id, name, sort, parentId)
      SELECT id, name, sort, parentId FROM Category
    `);

    // 3. Drop old table (this also drops old triggers and indexes)
    db.runSync('DROP TABLE IF EXISTS Category');

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
  },
};
