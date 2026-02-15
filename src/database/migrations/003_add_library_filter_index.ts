import { Migration } from '../types/migration';

/**
 * Migration 3: Add composite index for library filter queries
 * - Speeds up queries that filter by inLibrary, isLocal, chaptersDownloaded
 */
export const migration003: Migration = {
  version: 3,
  description: 'Add composite index for library filter queries',
  migrate: db => {
    db.runSync(`
      CREATE INDEX IF NOT EXISTS idx_novel_library_filters
      ON Novel(inLibrary, isLocal, chaptersDownloaded)
    `);
  },
};
