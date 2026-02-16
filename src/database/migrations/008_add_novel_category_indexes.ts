import { SQLiteDatabase } from 'expo-sqlite';
import { Migration } from '../types/migration';

/**
 * Migration 8: Add indexes to NovelCategory table
 *
 * The NovelCategory table has a UNIQUE(novelId, categoryId) constraint which
 * provides an implicit index with novelId as the leading column. However,
 * queries that filter by categoryId (e.g. library category views) require
 * an index with categoryId as the leading column for efficient lookups.
 */
export const migration008: Migration = {
  version: 8,
  description: 'Add categoryId index to NovelCategory for faster lookups',
  migrate: (db: SQLiteDatabase) => {
    db.runSync(
      'CREATE INDEX IF NOT EXISTS idx_nc_categoryId ON NovelCategory(categoryId, novelId)',
    );
  },
};
