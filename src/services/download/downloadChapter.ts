import * as cheerio from 'cheerio';
import { NOVEL_STORAGE } from '@utils/Storages';
import { Plugin } from '@plugins/types';
import { downloadFile } from '@plugins/helpers/fetch';
import { getPlugin } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { getChapter } from '@database/queries/ChapterQueries';
import { sleep } from '@utils/sleep';
import { getNovelById } from '@database/queries/NovelQueries';
import { db } from '@database/db';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { FileService } from '@platform';

const createChapterFolder = async (
  path: string,
  data: {
    pluginId: string;
    novelId: number;
    chapterId: number;
  },
): Promise<string> => {
  const { pluginId, novelId, chapterId } = data;
  const chapterFolder = `${path}/${pluginId}/${novelId}/${chapterId}`;
  FileService.mkdir(chapterFolder);
  const nomediaPath = chapterFolder + '/.nomedia';
  FileService.writeFile(nomediaPath, ',');
  return chapterFolder;
};

const downloadImageWithRetry = async (
  absoluteURL: string,
  fileurl: string,
  imageRequestInit: Plugin['imageRequestInit'],
  attempts = 3,
): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await downloadFile(absoluteURL, fileurl, imageRequestInit);
      return;
    } catch (e) {
      lastError = e;
      // Back off a bit before retrying — image hosts often rate-limit
      // when a chapter has many images.
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastError;
};

const downloadFiles = async (
  html: string,
  plugin: Plugin,
  novelId: number,
  chapterId: number,
): Promise<void> => {
  const folder = await createChapterFolder(NOVEL_STORAGE, {
    pluginId: plugin.id,
    novelId,
    chapterId,
  });
  const loadedCheerio = cheerio.load(html);
  const imgs = loadedCheerio('img').toArray();
  const failures: string[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const elem = loadedCheerio(imgs[i]);
    const url = elem.attr('src');
    if (url) {
      const fileurl = `${folder}/${i}.b64.png`;
      elem.attr('src', 'file://' + fileurl);
      try {
        const absoluteURL = new URL(url, plugin.site).href;
        await downloadImageWithRetry(
          absoluteURL,
          fileurl,
          plugin.imageRequestInit,
        );
      } catch (e) {
        elem.attr('alt', String(e));
        failures.push(url);
      }
    }
  }
  // If any images failed after retries, surface it so the chapter is not
  // silently marked "downloaded" with broken images. Skip writing index.html
  // so the reader's on-disk cache fallback (loadChapterText) does not serve
  // a broken copy on the next read — the user can retry.
  if (failures.length > 0) {
    throw new Error(
      `Failed to download ${failures.length}/${imgs.length} image(s) in chapter`,
    );
  }
  FileService.writeFile(folder + '/index.html', loadedCheerio.html());
};

export const downloadChapter = async (
  { chapterId }: { chapterId: number },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
  }));

  const chapter = await getChapter(chapterId);
  if (!chapter) {
    throw new Error('Chapter not found with id: ' + chapterId);
  }
  if (chapter.isDownloaded) {
    return;
  }
  const novel = await getNovelById(chapter.novelId);
  if (!novel) {
    throw new Error('Novel not found for chapter: ' + chapter.name);
  }
  const plugin = getPlugin(novel.pluginId);
  if (!plugin) {
    throw new Error(getString('downloadScreen.pluginNotFound'));
  }
  const chapterText = await plugin.parseChapter(chapter.path);
  if (chapterText && chapterText.length) {
    await downloadFiles(chapterText, plugin, novel.id, chapter.id);
    await db.runAsync('UPDATE Chapter SET isDownloaded = 1 WHERE id = ?', [
      chapter.id,
    ]);

    await sleep(1000);
  } else {
    throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};
