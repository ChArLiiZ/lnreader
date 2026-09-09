import * as DocumentPicker from 'expo-document-picker';
import { BUILT_IN_CATEGORY_IDS } from '@database/constants';

import { fetchNovel } from '@services/plugin/fetch';
import { insertChapters } from './ChapterQueries';

import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import { BackupNovel, NovelInfo, RestoredNovelMapping } from '../types';
import { SourceNovel } from '@plugins/types';
import { NOVEL_STORAGE } from '@utils/Storages';
import { downloadFile } from '@plugins/helpers/fetch';
import { getPlugin } from '@plugins/pluginManager';
import { db } from '@database/db';
import NativeFile from '@specs/NativeFile';

export const insertNovelAndChapters = async (
  pluginId: string,
  sourceNovel: SourceNovel,
): Promise<number | undefined> => {
  const insertNovelQuery =
    'INSERT OR IGNORE INTO Novel (path, pluginId, name, cover, summary, author, artist, status, genres, totalPages, rating, wordCount) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const novelId: number | undefined = (
    await db.runAsync(insertNovelQuery, [
      sourceNovel.path,
      pluginId,
      sourceNovel.name,
      sourceNovel.cover || null,
      sourceNovel.summary || null,
      sourceNovel.author || null,
      sourceNovel.artist || null,
      sourceNovel.status || null,
      sourceNovel.genres || null,
      sourceNovel.totalPages || 0,
      sourceNovel.rating || null,
      sourceNovel.wordCount || null,
    ])
  ).lastInsertRowId;

  if (novelId) {
    if (sourceNovel.cover) {
      const novelDir = NOVEL_STORAGE + '/' + pluginId + '/' + novelId;
      NativeFile.mkdir(novelDir);
      const novelCoverPath = novelDir + '/cover.png';
      const novelCoverUri = 'file://' + novelCoverPath;
      await downloadFile(
        sourceNovel.cover,
        novelCoverPath,
        getPlugin(pluginId)?.imageRequestInit,
      );
      await db.runAsync(
        'UPDATE Novel SET cover = ? WHERE id = ?',
        novelCoverUri,
        novelId,
      );
    }
    await insertChapters(novelId, sourceNovel.chapters);
  }
  return novelId;
};

export const getAllNovels = () => {
  return db.getAllAsync<NovelInfo>('SELECT * FROM Novel');
};

export const getNovelById = (novelId: number) => {
  return db.getFirstAsync<NovelInfo>(
    'SELECT * FROM Novel WHERE id = ?',
    novelId,
  );
};

export const getNovelByPath = (novelPath: string, pluginId: string) => {
  return db.getFirstAsync<NovelInfo>(
    'SELECT * FROM Novel WHERE path = ? AND pluginId = ?',
    novelPath,
    pluginId,
  );
};

// if query is insert novel || add to library => add default category name for it
// else remove all it's categories

/**
 * Toggle novel in/out of library.
 * @param novelPath - Novel path
 * @param pluginId - Plugin ID
 * @param defaultCategoryId - Default category setting:
 *   -1 = ask user (skip auto-assign, caller should show category picker)
 *    0 = system default category (ID 1)
 *   >0 = specific category ID
 */
export const switchNovelToLibraryQuery = async (
  novelPath: string,
  pluginId: string,
  defaultCategoryId: number = 0,
): Promise<NovelInfo | undefined> => {
  const novel = await getNovelByPath(novelPath, pluginId);
  if (novel) {
    await db.runAsync(
      'UPDATE Novel SET inLibrary = ? WHERE id = ?',
      Number(!novel.inLibrary),
      novel.id,
    );
    if (novel.inLibrary) {
      // Removing from library
      await db.runAsync(
        'DELETE FROM NovelCategory WHERE novelId = ?',
        novel.id,
      );
      showToast(getString('browseScreen.removeFromLibrary'));
    } else {
      // Adding to library
      // When defaultCategoryId === -1 ("always ask"), skip category assignment
      // so the picker opens with nothing pre-selected.
      // The caller is responsible for showing the category picker afterwards
      // and ensuring a fallback category is assigned if the user dismisses it.
      if (defaultCategoryId >= 0) {
        const categoryId = defaultCategoryId > 0 ? defaultCategoryId : 1;
        await db.runAsync(
          'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
          novel.id,
          categoryId,
        );
      }
      showToast(getString('browseScreen.addedToLibrary'));
    }
    if (novel.pluginId === 'local') {
      await db.runAsync(
        'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, 2)',
        novel.id,
      );
    }
    return { ...novel, inLibrary: !novel.inLibrary };
  } else {
    const sourceNovel = await fetchNovel(pluginId, novelPath);
    const novelId = await insertNovelAndChapters(pluginId, sourceNovel);
    if (novelId) {
      await db.runAsync('UPDATE Novel SET inLibrary = 1 WHERE id = ?', novelId);
      if (defaultCategoryId >= 0) {
        const categoryId = defaultCategoryId > 0 ? defaultCategoryId : 1;
        await db.runAsync(
          'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
          novelId,
          categoryId,
        );
      }
      showToast(getString('browseScreen.addedToLibrary'));
    }
  }
};

// allow to delete local novels
export const removeNovelsFromLibrary = async (novelIds: Array<number>) => {
  await db.runAsync(
    `UPDATE Novel SET inLibrary = 0 WHERE id IN (${novelIds.join(', ')})`,
  );
  await db.runAsync(
    `DELETE FROM NovelCategory WHERE novelId IN (${novelIds.join(', ')})`,
  );
  showToast(getString('browseScreen.removeFromLibrary'));
};

export const getCachedNovels = () => {
  return db.getAllAsync<NovelInfo>('SELECT * FROM Novel WHERE inLibrary = 0');
};

export const deleteCachedNovels = async () => {
  await db.runAsync('DELETE FROM Novel WHERE inLibrary = 0');
  showToast(getString('advancedSettingsScreen.cachedNovelsDeletedToast'));
};

const restoreFromBackupQuery =
  'INSERT OR REPLACE INTO Novel (path, name, pluginId, cover, summary, author, artist, status, genres, totalPages, rating, wordCount) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const restoreLibrary = async (novel: NovelInfo) => {
  const sourceNovel = await fetchNovel(novel.pluginId, novel.path);
  let novelId: number | undefined;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      restoreFromBackupQuery,
      sourceNovel.path,
      novel.name,
      novel.pluginId,
      novel.cover || '',
      novel.summary || '',
      novel.author || '',
      novel.artist || '',
      novel.status || '',
      novel.genres || '',
      sourceNovel.totalPages || 0,
      sourceNovel.rating || null,
      sourceNovel.wordCount || null,
    );
    novelId = result.lastInsertRowId;
  });

  if (novelId && novelId > 0) {
    await db.runAsync(
      'INSERT OR REPLACE INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
      novelId,
      BUILT_IN_CATEGORY_IDS.default,
    );
    await db.runAsync('UPDATE Novel SET inLibrary = 1 WHERE id = ?', novelId);

    if (sourceNovel.chapters) {
      await insertChapters(novelId, sourceNovel.chapters);
    }
  }
};

export const updateNovelInfo = async (info: NovelInfo) => {
  await db.runAsync(
    'UPDATE Novel SET name = ?, cover = ?, path = ?, summary = ?, author = ?, artist = ?, genres = ?, status = ?, isLocal = ? WHERE id = ?',
    info.name,
    info.cover || '',
    info.path,
    info.summary || '',
    info.author || '',
    info.artist || '',
    info.genres || '',
    info.status || '',
    Number(info.isLocal),
    info.id,
  );
};

export const pickCustomNovelCover = async (novel: NovelInfo) => {
  const image = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
  if (image.assets && image.assets[0]) {
    const novelDir = NOVEL_STORAGE + '/' + novel.pluginId + '/' + novel.id;
    let novelCoverUri = 'file://' + novelDir + '/cover.png';
    if (!NativeFile.exists(novelDir)) {
      NativeFile.mkdir(novelDir);
    }
    NativeFile.copyFile(image.assets[0].uri, novelCoverUri);
    novelCoverUri += '?' + Date.now();
    await db.runAsync(
      'UPDATE Novel SET cover = ? WHERE id = ?',
      novelCoverUri,
      novel.id,
    );
    return novelCoverUri;
  }
};

/**
 * Ensure a novel has at least one category assigned.
 * If the novel has no categories, assign to default category (ID 1).
 * This is used as a safety net when the category picker is dismissed
 * without any selection (e.g. when defaultCategoryId === -1).
 */
export const ensureNovelHasCategory = async (
  novelId: number,
): Promise<void> => {
  const result = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM NovelCategory WHERE novelId = ?',
    novelId,
  );
  if (result && result.count === 0) {
    await db.runAsync(
      'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, 1)',
      novelId,
    );
  }
};

export const updateNovelCategoryById = async (
  novelId: number,
  categoryIds: number[],
) => {
  for (const categoryId of categoryIds) {
    await db.runAsync(
      'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
      novelId,
      categoryId,
    );
  }
};

export const updateNovelCategories = async (
  novelIds: number[],
  categoryIds: number[],
): Promise<void> => {
  // Assigning a category is how a novel gets added from the browse screen, so
  // it has to land in the library too — otherwise it acquires categories while
  // staying outside it.
  await db.runAsync(
    `UPDATE Novel SET inLibrary = 1 WHERE id IN (${novelIds.join(',')})`,
  );

  await db.runAsync(
    `DELETE FROM NovelCategory WHERE novelId IN (${novelIds.join(
      ',',
    )}) AND categoryId != 2`,
  );
  // if no category is selected => set to the default category
  if (categoryIds.length) {
    for (const novelId of novelIds) {
      for (const categoryId of categoryIds) {
        await db.runAsync(
          `INSERT INTO NovelCategory (novelId, categoryId) VALUES (${novelId}, ${categoryId})`,
        );
      }
    }
  } else {
    for (const novelId of novelIds) {
      // hacky: insert local novel category -> failed -> ignored
      await db.runAsync(
        `INSERT OR IGNORE INTO NovelCategory (novelId, categoryId)
         VALUES (
          ${novelId},
          IFNULL((SELECT categoryId FROM NovelCategory WHERE novelId = ${novelId}), 1)
        )`,
      );
    }
  }
};

/**
 * Restores one novel and its chapters without touching anything else.
 *
 * The novel is matched on (path, pluginId) — its identity at the source —
 * rather than on the id it happened to have on the device the backup came
 * from. Restoring by id deleted whichever unrelated novel currently occupied
 * that row, and took its chapters and category membership with it.
 */
export const _restoreNovelAndChapters = async (
  backupNovel: BackupNovel,
): Promise<RestoredNovelMapping> => {
  const { chapters, id: backupNovelId, ...novel } = backupNovel;
  const columns = Object.keys(novel);
  const values = Object.values(novel) as (string | number | null)[];

  let restoredNovelId = 0;
  const chapterMappings: RestoredNovelMapping['chapters'] = [];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO Novel (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON CONFLICT(path, pluginId) DO UPDATE SET
       ${columns
         .filter(column => column !== 'path' && column !== 'pluginId')
         .map(column => `${column} = excluded.${column}`)
         .join(', ')}`,
      ...values,
    );

    const restored = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM Novel WHERE path = ? AND pluginId = ?',
      novel.path,
      novel.pluginId,
    );
    if (!restored) {
      throw new Error(`Could not restore novel ${novel.name}`);
    }
    restoredNovelId = restored.id;

    // The cover lives under a folder named for the novel id, so a remapped id
    // needs the stored path corrected to match.
    if (novel.cover?.startsWith(`file://${NOVEL_STORAGE}/`)) {
      const cacheSuffix = novel.cover.match(/[?#].*$/)?.[0] ?? '';
      await db.runAsync(
        'UPDATE Novel SET cover = ? WHERE id = ?',
        `file://${NOVEL_STORAGE}/${novel.pluginId}/${restoredNovelId}/cover.png${cacheSuffix}`,
        restoredNovelId,
      );
    }

    // Only this novel's chapters are replaced.
    await db.runAsync('DELETE FROM Chapter WHERE novelId = ?', restoredNovelId);

    for (const chapter of chapters) {
      // id and novelId are dropped: the chapter is re-parented onto the
      // restored novel and gets a fresh id.
      const backupChapterId = chapter.id;
      const rest = Object.fromEntries(
        Object.entries(chapter).filter(
          ([column]) => column !== 'id' && column !== 'novelId',
        ),
      );
      const chapterColumns = Object.keys(rest);
      await db.runAsync(
        `INSERT INTO Chapter (novelId, ${chapterColumns.join(', ')})
         VALUES (?, ${chapterColumns.map(() => '?').join(', ')})`,
        restoredNovelId,
        ...(Object.values(rest) as (string | number | null)[]),
      );
      const inserted = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM Chapter WHERE novelId = ? AND path = ?',
        restoredNovelId,
        chapter.path,
      );
      if (inserted) {
        chapterMappings.push({
          backupChapterId,
          restoredChapterId: inserted.id,
        });
      }
    }
  });

  return {
    pluginId: novel.pluginId,
    backupNovelId,
    restoredNovelId,
    chapters: chapterMappings,
  };
};
