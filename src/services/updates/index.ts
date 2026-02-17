import {
  getLibraryWithCategory,
  getLibraryNovelsFromDb,
} from '../../database/queries/LibraryQueries';

import { showToast } from '../../utils/showToast';
import { getString } from '@strings/translations';
import { UpdateNovelOptions, updateNovel } from './LibraryUpdateQueries';
import { LibraryNovelInfo } from '@database/types';
import { sleep } from '@utils/sleep';
import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import { LAST_UPDATE_TIME } from '@hooks/persisted/useUpdates';
import dayjs from 'dayjs';
import { APP_SETTINGS, AppSettings } from '@hooks/persisted/useSettings';
import { BackgroundTaskMetadata } from '@services/ServiceManager';

/** Max retry attempts per novel on transient failures */
const MAX_RETRIES = 2;

/** Delay between retries (ms) */
const RETRY_DELAY_MS = 2000;

/** Max concurrent novel updates (reduced to 1 to avoid SQLite transaction conflicts) */
const CONCURRENCY = 1;

/** Min interval between progress metadata writes (ms) */
const PROGRESS_UPDATE_INTERVAL_MS = 400;

/** Min progress delta before forcing a metadata write */
const PROGRESS_UPDATE_MIN_DELTA = 0.01; // 1%

/**
 * Deduplication window (ms).
 * Novels updated within this window are skipped if queued again
 * (e.g. when the same novel belongs to multiple categories).
 */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Module-level map: novelId → last successful update timestamp */
const recentlyUpdatedNovels = new Map<number, number>();

/** Remove stale entries from the dedup map */
function pruneDedup() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [id, ts] of recentlyUpdatedNovels) {
    if (ts < cutoff) {
      recentlyUpdatedNovels.delete(id);
    }
  }
}

const updateLibrary = async (
  {
    categoryId,
  }: {
    categoryId?: number;
  },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
  }));

  const { downloadNewChapters, refreshNovelMetadata, onlyUpdateOngoingNovels } =
    getMMKVObject<AppSettings>(APP_SETTINGS) || {};
  const options: UpdateNovelOptions = {
    downloadNewChapters: downloadNewChapters || false,
    refreshNovelMetadata: refreshNovelMetadata || false,
  };

  let libraryNovels: LibraryNovelInfo[] = [];
  if (categoryId) {
    libraryNovels = await getLibraryWithCategory(
      categoryId,
      onlyUpdateOngoingNovels,
      true,
    );
  } else {
    libraryNovels = (await getLibraryNovelsFromDb(
      '',
      onlyUpdateOngoingNovels ? "status = 'Ongoing'" : '',
      '',
      false,
      true,
    )) as LibraryNovelInfo[];
  }

  if (libraryNovels.length > 0) {
    pruneDedup();
    MMKVStorage.set(LAST_UPDATE_TIME, dayjs().format('YYYY-MM-DD HH:mm:ss'));

    let completedCount = 0;
    let skippedCount = 0;
    let lastMetaUpdateAt = 0;
    let lastReportedProgress = 0;

    const reportProgress = (novelName: string, force = false) => {
      const progress = completedCount / libraryNovels.length;
      const now = Date.now();
      const timeDue = now - lastMetaUpdateAt >= PROGRESS_UPDATE_INTERVAL_MS;
      const progressDue =
        progress - lastReportedProgress >= PROGRESS_UPDATE_MIN_DELTA;

      if (!force && !timeDue && !progressDue) {
        return;
      }

      lastMetaUpdateAt = now;
      lastReportedProgress = progress;
      setMeta(meta => ({
        ...meta,
        progressText: novelName,
        progress,
      }));
    };

    const updateSingleNovel = async (novel: LibraryNovelInfo) => {
      const lastUpdated = recentlyUpdatedNovels.get(novel.id);
      if (lastUpdated && Date.now() - lastUpdated < DEDUP_WINDOW_MS) {
        skippedCount++;
        completedCount++;
        reportProgress(novel.name, completedCount === libraryNovels.length);
        return;
      }

      let succeeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await updateNovel(novel.pluginId, novel.path, novel.id, options);
          succeeded = true;
          break;
        } catch (error: unknown) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
          } else {
            const msg = error instanceof Error ? error.message : String(error);
            showToast(novel.name + ': ' + msg);
          }
        }
      }

      if (succeeded) {
        recentlyUpdatedNovels.set(novel.id, Date.now());
      }

      completedCount++;
      reportProgress(novel.name, completedCount === libraryNovels.length);
    };

    // Process novels with concurrency limit
    let cursor = 0;
    const runWorker = async () => {
      while (cursor < libraryNovels.length) {
        const idx = cursor++;
        await updateSingleNovel(libraryNovels[idx]);
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, libraryNovels.length) },
      () => runWorker(),
    );
    await Promise.allSettled(workers);

    if (skippedCount > 0 && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`Skipped ${skippedCount} recently updated novel(s)`);
    }
  } else {
    showToast(getString('updatesScreen.noNovelsToUpdate'));
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};

export { updateLibrary };
