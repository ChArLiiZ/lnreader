import { SQLiteDatabase } from 'expo-sqlite';

import { Migration } from '../types/migration';

const columnExists = (
  db: SQLiteDatabase,
  tableName: string,
  columnName: string,
): boolean => {
  try {
    return db
      .getAllSync<{ name: string }>(`PRAGMA table_info(${tableName})`)
      .some(column => column.name === columnName);
  } catch {
    return false;
  }
};

const addColumn = (
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) => {
  if (!columnExists(db, table, column)) {
    db.runSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

/**
 * Migration 11: Columns for scanlator filtering, reading-time statistics and
 * per-repository enabling.
 *
 * A database that has been through the upstream 2.1.3 build already carries
 * all three — migration 010 deliberately keeps them — so every step here is
 * conditional. This exists for fork databases that never met that build, and
 * for fresh installs created before these columns joined the initial schema.
 */
export const migration011: Migration = {
  version: 11,
  description:
    'Add Chapter.scanlator, Chapter.timeSpent and Repository.enabled',
  migrate: db => {
    addColumn(db, 'Chapter', 'scanlator', 'TEXT');
    addColumn(db, 'Chapter', 'timeSpent', 'INTEGER DEFAULT 0');
    addColumn(db, 'Repository', 'enabled', 'INTEGER NOT NULL DEFAULT 1');

    // Scanlator filtering reads this per novel.
    db.runSync(
      'CREATE INDEX IF NOT EXISTS idx_chapter_scanlator ON Chapter(novelId, scanlator)',
    );
  },
};
