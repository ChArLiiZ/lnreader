import { SQLiteDatabase } from 'expo-sqlite';
import { Migration } from '../types/migration';

/**
 * Migration 9: Add rating and wordCount columns to Novel table
 *
 * These columns store metadata from plugins for display on library covers.
 */
export const migration009: Migration = {
  version: 9,
  description: 'Add rating and wordCount columns to Novel table',
  migrate: (db: SQLiteDatabase) => {
    db.runSync('ALTER TABLE Novel ADD COLUMN rating REAL');
    db.runSync('ALTER TABLE Novel ADD COLUMN wordCount INTEGER');
  },
};
