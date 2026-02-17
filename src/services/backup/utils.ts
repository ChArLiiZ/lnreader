import { SELF_HOST_BACKUP } from '@hooks/persisted/useSelfHost';
import { OLD_TRACKED_NOVEL_PREFIX } from '@hooks/persisted/migrations/trackerMigration';
import { LAST_UPDATE_TIME } from '@hooks/persisted/useUpdates';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { version } from '../../../package.json';
import {
  _restoreNovelAndChapters,
  getAllNovels,
} from '@database/queries/NovelQueries';
import { getNovelChapters } from '@database/queries/ChapterQueries';
import {
  _restoreCategory,
  getAllNovelCategories,
  getCategoriesFromDb,
} from '@database/queries/CategoryQueries';
import { BackupCategory, BackupNovel } from '@database/types';
import { BackupEntryName } from './types';
import { ROOT_STORAGE } from '@utils/Storages';
import ServiceManager from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';

const APP_STORAGE_URI = 'file://' + ROOT_STORAGE;

export const CACHE_DIR_PATH =
  NativeFile.getConstants().ExternalCachesDirectoryPath + '/BackupData';

const INVALID_BACKUP_NAME_CHARS = /[\\/:*?"<>|'`]/g;

export const sanitizeBackupFolderName = (name: string) =>
  name.trim().replace(INVALID_BACKUP_NAME_CHARS, '_').replace(/\s+/g, ' ');

export const toBackupFolderName = (name: string) => {
  const sanitized = sanitizeBackupFolderName(name);
  if (!sanitized) {
    return '';
  }
  return sanitized.endsWith('.backup') ? sanitized : sanitized + '.backup';
};

export const cleanupBackupTempData = () => {
  if (NativeFile.exists(CACHE_DIR_PATH)) {
    NativeFile.unlink(CACHE_DIR_PATH);
  }
  const zipPath = CACHE_DIR_PATH + '.zip';
  if (NativeFile.exists(zipPath)) {
    NativeFile.unlink(zipPath);
  }
};

const backupMMKVData = () => {
  const excludeKeys = new Set([
    ServiceManager.manager.STORE_KEY,
    SELF_HOST_BACKUP,
    LAST_UPDATE_TIME,
  ]);
  const excludePrefixes = [OLD_TRACKED_NOVEL_PREFIX];
  const keys = MMKVStorage.getAllKeys().filter(
    key =>
      !excludeKeys.has(key) &&
      !excludePrefixes.some(prefix => key.startsWith(prefix)),
  );
  const data: Record<string, string | number | boolean> = {};

  for (const key of keys) {
    const stringValue = MMKVStorage.getString(key);
    if (stringValue !== undefined) {
      data[key] = stringValue;
      continue;
    }

    const numberValue = MMKVStorage.getNumber(key);
    if (numberValue !== undefined) {
      data[key] = numberValue;
      continue;
    }

    const booleanValue = MMKVStorage.getBoolean(key);
    if (booleanValue !== undefined) {
      data[key] = booleanValue;
    }
  }

  return data;
};

const restoreMMKVData = (data: Record<string, string | number | boolean>) => {
  for (const key in data) {
    MMKVStorage.set(key, data[key]);
  }
};

export const prepareBackupData = async (cacheDirPath: string) => {
  const novelDirPath = cacheDirPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;
  if (NativeFile.exists(novelDirPath)) {
    NativeFile.unlink(novelDirPath);
  }

  NativeFile.mkdir(novelDirPath); // this also creates cacheDirPath

  // version
  try {
    NativeFile.writeFile(
      cacheDirPath + '/' + BackupEntryName.VERSION,
      JSON.stringify({ version: version }),
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast(
      getString('backupScreen.versionFileWriteFailed', {
        error: msg,
      }),
    );
    throw error;
  }

  // novels
  const failedNovels: string[] = [];
  const novels = await getAllNovels();
  for (const novel of novels) {
    try {
      const chapters = await getNovelChapters(novel.id);
      NativeFile.writeFile(
        novelDirPath + '/' + novel.id + '.json',
        JSON.stringify({
          chapters: chapters,
          ...novel,
          cover: novel.cover?.replace(APP_STORAGE_URI, ''),
        }),
      );
    } catch (error: unknown) {
      failedNovels.push(novel.name);
    }
  }

  if (failedNovels.length > 0) {
    const summary =
      failedNovels.length <= 3
        ? failedNovels.join(', ')
        : failedNovels.slice(0, 3).join(', ') +
          ` (+${failedNovels.length - 3})`;
    showToast(
      getString('backupScreen.novelBackupFailed', {
        novelName: summary,
        error: `${failedNovels.length} failed`,
      }),
    );
  }

  // categories
  try {
    const categories = getCategoriesFromDb();
    const novelCategories = getAllNovelCategories();
    NativeFile.writeFile(
      cacheDirPath + '/' + BackupEntryName.CATEGORY,
      JSON.stringify(
        categories.map(category => {
          return {
            ...category,
            novelIds: novelCategories
              .filter(nc => nc.categoryId === category.id)
              .map(nc => nc.novelId),
          };
        }),
      ),
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast(
      getString('backupScreen.categoryFileWriteFailed', {
        error: msg,
      }),
    );
  }

  // settings
  try {
    NativeFile.writeFile(
      cacheDirPath + '/' + BackupEntryName.SETTING,
      JSON.stringify(backupMMKVData()),
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast(
      getString('backupScreen.settingsFileWriteFailed', {
        error: msg,
      }),
    );
  }
};

export const restoreData = async (cacheDirPath: string) => {
  const novelDirPath = cacheDirPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;

  // version
  // nothing to do

  // novels
  showToast(getString('backupScreen.restoringNovels'));
  let novelCount = 0;
  let failedCount = 0;

  if (!NativeFile.exists(novelDirPath)) {
    showToast(getString('backupScreen.novelDirectoryNotFound'));
  } else {
    try {
      const items = NativeFile.readDir(novelDirPath);
      for (const item of items) {
        if (!item.isDirectory) {
          try {
            const fileContent = NativeFile.readFile(item.path);
            const backupNovel = JSON.parse(fileContent) as BackupNovel;

            if (!backupNovel.cover?.startsWith('http')) {
              backupNovel.cover = APP_STORAGE_URI + backupNovel.cover;
            }

            await _restoreNovelAndChapters(backupNovel);
            novelCount++;
          } catch (error: unknown) {
            failedCount++;
            const novelName =
              item.path.split('/').pop()?.replace('.json', '') || 'Unknown';
            const msg = error instanceof Error ? error.message : String(error);
            showToast(
              getString('backupScreen.novelRestoreFailed', {
                novelName: novelName,
                error: msg,
              }),
            );
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(
        getString('backupScreen.novelDirectoryReadFailed', {
          error: msg,
        }),
      );
    }
  }
  if (failedCount > 0) {
    showToast(
      getString('backupScreen.novelsRestoredWithErrors', {
        count: novelCount,
        failedCount: failedCount,
      }),
    );
  } else {
    showToast(getString('backupScreen.novelsRestored', { count: novelCount }));
  }

  // categories
  showToast(getString('backupScreen.restoringCategories'));
  const categoryFilePath = cacheDirPath + '/' + BackupEntryName.CATEGORY;
  let categoryCount = 0;
  let failedCategoryCount = 0;

  if (!NativeFile.exists(categoryFilePath)) {
    showToast(getString('backupScreen.categoryFileNotFound'));
  } else {
    try {
      const fileContent = NativeFile.readFile(categoryFilePath);
      const categories: BackupCategory[] = JSON.parse(fileContent);

      // Restore root categories first, then subcategories.
      // This ensures a parent category exists before its children are inserted,
      // which is required for the parentId foreign key relationship.
      const roots = categories.filter(c => c.parentId == null);
      const subs = categories.filter(c => c.parentId != null);

      for (const category of [...roots, ...subs]) {
        try {
          _restoreCategory(category);
          categoryCount++;
        } catch (error: unknown) {
          failedCategoryCount++;
          const msg = error instanceof Error ? error.message : String(error);
          showToast(
            getString('backupScreen.categoryRestoreFailed', {
              categoryName: category.name || category.id.toString(),
              error: msg,
            }),
          );
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(
        getString('backupScreen.categoryFileReadFailed', {
          error: msg,
        }),
      );
    }
  }
  if (failedCategoryCount > 0) {
    showToast(
      getString('backupScreen.categoriesRestoredWithErrors', {
        count: categoryCount,
        failedCount: failedCategoryCount,
      }),
    );
  } else {
    showToast(
      getString('backupScreen.categoriesRestored', {
        count: categoryCount,
      }),
    );
  }

  // settings
  showToast(getString('backupScreen.restoringSettings'));
  const settingsFilePath = cacheDirPath + '/' + BackupEntryName.SETTING;

  if (!NativeFile.exists(settingsFilePath)) {
    showToast(getString('backupScreen.settingsFileNotFound'));
  } else {
    try {
      const fileContent = NativeFile.readFile(settingsFilePath);
      const settingsData = JSON.parse(fileContent);
      restoreMMKVData(settingsData);
      showToast(getString('backupScreen.settingsRestored'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(
        getString('backupScreen.settingsRestoreFailed', {
          error: msg,
        }),
      );
    }
  }
};
