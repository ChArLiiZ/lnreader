import { getPlugin } from '@plugins/pluginManager';
import { isUrlAbsolute } from '@plugins/helpers/isAbsoluteUrl';
import { ChapterItem, CommentItem } from '@plugins/types';

/**
 * Plugins may report a chapter's scanlator as a list. It is stored as one
 * string, so flatten it at the boundary rather than in every consumer.
 */
function formatChapters<T extends ChapterItem[] | undefined>(chapters: T): T {
  if (!chapters) {
    return undefined as T;
  }
  return chapters.map(chapter =>
    Array.isArray(chapter.scanlator)
      ? { ...chapter, scanlator: chapter.scanlator.filter(Boolean).join(', ') }
      : chapter,
  ) as T;
}

export const fetchNovel = async (pluginId: string, novelPath: string) => {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  const res = await plugin.parseNovel(novelPath);
  if (res?.chapters) {
    res.chapters = formatChapters(res.chapters);
  }
  return res;
};

export const fetchChapter = async (pluginId: string, chapterPath: string) => {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  const chapterText = await plugin.parseChapter(chapterPath);
  return chapterText;
};

export const fetchChapters = async (pluginId: string, novelPath: string) => {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  const res = await plugin.parseNovel(novelPath);
  return formatChapters(res?.chapters);
};

export const fetchPage = async (
  pluginId: string,
  novelPath: string,
  page: string,
) => {
  const plugin = getPlugin(pluginId);

  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }

  if (!plugin.parsePage) {
    throw new Error(`Could not fetch chapters for page ${page}`);
  }
  const res = await plugin.parsePage(novelPath, page);
  if (res?.chapters) {
    res.chapters = formatChapters(res.chapters);
  }
  return res;
};

export const fetchComments = async (
  pluginId: string,
  path: string,
): Promise<CommentItem[]> => {
  const plugin = getPlugin(pluginId);
  if (plugin?.parseComments) {
    return plugin.parseComments(path);
  }
  return [];
};

export const hasCommentSupport = (pluginId: string): boolean => {
  const plugin = getPlugin(pluginId);
  return !!plugin?.parseComments;
};

export const resolveUrl = (
  pluginId: string,
  path: string,
  isNovel?: boolean,
) => {
  if (isUrlAbsolute(path)) {
    return path;
  }
  const plugin = getPlugin(pluginId);
  try {
    if (!plugin) {
      throw new Error(`Unknown plugin: ${pluginId}`);
    }
    if (plugin.resolveUrl) {
      return plugin.resolveUrl(path, isNovel);
    }
  } catch {
    return path;
  }
  return plugin.site + path;
};
