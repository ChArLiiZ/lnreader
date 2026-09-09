import { NovelStatus } from '@plugins/types';

export interface NovelInfo {
  id: number;
  path: string;
  pluginId: string;
  name: string;
  cover?: string;
  summary?: string;
  author?: string;
  artist?: string;
  status?: NovelStatus | string;
  genres?: string;
  inLibrary: boolean;
  isLocal: boolean;
  totalPages: number;
  rating?: number;
  wordCount?: number;
}

export interface DBNovelInfo extends NovelInfo {
  totalChapters: number;
  chaptersDownloaded: number;
  chaptersUnread: number;
  lastReadAt: string;
  lastUpdatedAt: string;
  latestChapterAt: number;
  readProgress?: number | null;
}

export interface LibraryNovelInfo extends DBNovelInfo {
  category: string;
  chaptersUnread: number;
  chaptersDownloaded: number;
}

export interface ChapterInfo {
  scanlator?: string | null;
  id: number;
  novelId: number;
  path: string;
  name: string;
  releaseTime?: string;
  readTime: string | null;
  bookmark: boolean;
  unread: boolean;
  isDownloaded: boolean;
  updatedTime: string | null;
  chapterNumber?: number;
  page: string;
  progress: number | null;
  position?: number;
}

export interface DownloadedChapter extends ChapterInfo {
  pluginId: string;
  novelName: string;
  novelPath: string;
  novelCover: string;
  inLibrary: boolean | null;
}

export interface History extends ChapterInfo {
  pluginId: string;
  novelName: string;
  novelPath: string;
  novelCover: string;
  readTime: string;
  inLibrary: boolean | null;
}

export interface Update extends ChapterInfo {
  updatedTime: string;
  pluginId: string;
  novelName: string;
  novelPath: string;
  novelCover: string;
  inLibrary: boolean | null;
}

export interface UpdateOverview {
  novelId: number;
  novelName: string;
  updateDate: string;
  updatesPerDay: number;
  novelCover: string;
}

export interface Category {
  id: number;
  name: string;
  sort: number;
  parentId: number | null;
}

export interface NovelCategory {
  novelId: number;
  categoryId: number;
}

export interface CCategory extends Category {
  novelsCount: number;
}

export interface LibraryStats {
  novelsCount?: number;
  chaptersCount?: number;
  chaptersRead?: number;
  chaptersUnread?: number;
  chaptersDownloaded?: number;
  sourcesCount?: number;
  genres?: Record<string, number>;
  status?: Record<string, number>;
}

export interface BackupNovel extends NovelInfo {
  chapters: ChapterInfo[];
}

export interface BackupCategory extends Category {
  novelIds: number[];
}

/**
 * Restoring matches novels by their source identity, so the ids in a backup
 * rarely survive. Everything that referenced them — category membership, the
 * novelId/chapterId folders downloaded chapters live in — is remapped through
 * this.
 */
export interface RestoredNovelMapping {
  pluginId: string;
  backupNovelId: number;
  restoredNovelId: number;
  chapters: {
    backupChapterId: number;
    restoredChapterId: number;
  }[];
}

export interface Repository {
  id: number;
  url: string;
  /** Disabled repositories stay listed but contribute no plugins. */
  enabled: boolean;
}

export * from './migration';
