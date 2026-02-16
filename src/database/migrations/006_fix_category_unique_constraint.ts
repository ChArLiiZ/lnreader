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
/**
 * Migration 006 was originally broken because it managed its own
 * BEGIN/COMMIT/ROLLBACK while the migration runner already wraps each
 * migration in `withTransactionSync`. The nested BEGIN caused a silent
 * failure, so version was bumped to 6 but the work was never applied.
 *
 * Migration 007 performs the actual fix and also handles databases that
 * already recorded version >= 6 without the real changes.
 */
export const migration006: Migration = {
  version: 6,
  description:
    'No-op (superseded by migration 007 due to nested-transaction bug)',
  migrate: (_db: SQLiteDatabase) => {
    // intentionally empty – real work moved to migration 007
  },
};
