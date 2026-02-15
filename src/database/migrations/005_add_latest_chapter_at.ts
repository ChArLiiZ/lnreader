import { SQLiteDatabase } from 'expo-sqlite';
import dayjs from 'dayjs';
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
 * Migration 5: Add latestChapterAt column to Novel table
 * - Stores the latest chapter release time as epoch millis (INTEGER)
 * - Computed from Chapter.releaseTime (parsed via dayjs)
 * - Used for "Latest Chapter" sort and cover badge display
 */
export const migration005: Migration = {
  version: 5,
  description:
    'Add latestChapterAt column to Novel table for latest chapter release time',
  migrate: (db: SQLiteDatabase) => {
    if (!columnExists(db, 'Novel', 'latestChapterAt')) {
      try {
        db.runSync(
          'ALTER TABLE Novel ADD COLUMN latestChapterAt INTEGER DEFAULT 0',
        );
      } catch (error) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            'Failed to add latestChapterAt column to Novel table:',
            error,
          );
        }
        return;
      }
    }

    // Backfill: compute latestChapterAt from existing chapter releaseTime data
    try {
      const novels = db.getAllSync<{ id: number }>(
        'SELECT id FROM Novel WHERE inLibrary = 1',
      );

      for (const novel of novels) {
        const chapters = db.getAllSync<{ releaseTime: string }>(
          "SELECT releaseTime FROM Chapter WHERE novelId = ? AND releaseTime IS NOT NULL AND releaseTime != ''",
          novel.id,
        );

        let maxEpoch = 0;
        for (const ch of chapters) {
          const parsed = dayjs(ch.releaseTime);
          if (parsed.isValid()) {
            const epoch = parsed.valueOf();
            if (epoch > maxEpoch) {
              maxEpoch = epoch;
            }
          }
        }

        if (maxEpoch > 0) {
          db.runSync(
            'UPDATE Novel SET latestChapterAt = ? WHERE id = ?',
            maxEpoch,
            novel.id,
          );
        }
      }
    } catch (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('Failed to backfill latestChapterAt:', error);
      }
    }
  },
};
