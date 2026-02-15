import {
  getLibraryWithCategory,
  getLibraryNovelsFromDb,
} from '../../database/queries/LibraryQueries';

import { showToast } from '../../utils/showToast';
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

/** Delay between novels (ms) */
const INTER_NOVEL_DELAY_MS = 500;

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

    let skippedCount = 0;

    for (let i = 0; i < libraryNovels.length; i++) {
      const novel = libraryNovels[i];

      // Always update progress so the UI stays in sync
      setMeta(meta => ({
        ...meta,
        progressText: novel.name,
        progress: i / libraryNovels.length,
      }));

      // Dedup: skip if this novel was successfully updated recently
      const lastUpdated = recentlyUpdatedNovels.get(novel.id);
      if (lastUpdated && Date.now() - lastUpdated < DEDUP_WINDOW_MS) {
        skippedCount++;
        continue;
      }

      // Retry loop
      let succeeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await updateNovel(novel.pluginId, novel.path, novel.id, options);
          succeeded = true;
          break;
        } catch (error: any) {
          if (attempt < MAX_RETRIES) {
            // Wait before retrying
            await sleep(RETRY_DELAY_MS);
          } else {
            // All retries exhausted
            showToast(novel.name + ': ' + error.message);
          }
        }
      }

      if (succeeded) {
        recentlyUpdatedNovels.set(novel.id, Date.now());
      }

      await sleep(INTER_NOVEL_DELAY_MS);
    }

    if (skippedCount > 0 && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`Skipped ${skippedCount} recently updated novel(s)`);
    }
  } else {
    showToast("There's no novel to be updated");
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};

export { updateLibrary };
