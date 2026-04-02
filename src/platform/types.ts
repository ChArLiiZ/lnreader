/**
 * Platform abstraction interfaces.
 *
 * Each interface mirrors a native module so that Android (TurboModules)
 * and desktop (Tauri) can provide their own implementations.
 */

// ── File Service ────────────────────────────────────────────────────

export interface ReadDirResult {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface IFileService {
  writeFile(path: string, content: string): void;
  readFile(path: string): string;
  copyFile(sourcePath: string, destPath: string): void;
  moveFile(sourcePath: string, destPath: string): void;
  exists(filePath: string): boolean;
  /** Create parent directories; no-op if they already exist. */
  mkdir(filePath: string): void;
  /** Remove recursively. */
  unlink(filePath: string): void;
  readDir(dirPath: string): ReadDirResult[];
  downloadFile(
    url: string,
    destPath: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<void>;
  getExternalDirectoryPath(): string;
  getExternalCachesDirectoryPath(): string;
}

// ── Zip Service ─────────────────────────────────────────────────────

export interface IZipService {
  zip(sourceDirPath: string, destFilePath: string): Promise<void>;
  unzip(sourceFilePath: string, destDirPath: string): Promise<void>;
  remoteUnzip(
    destDirPath: string,
    url: string,
    headers: Record<string, string>,
  ): Promise<void>;
  /** Zip and POST to url; returns the response body as text. */
  remoteZip(
    sourceDirPath: string,
    url: string,
    headers: Record<string, string>,
  ): Promise<string>;
}

// ── EPUB Service ────────────────────────────────────────────────────

export interface EpubChapter {
  name: string;
  path: string;
}

export interface EpubNovel {
  name: string;
  cover: string | null;
  summary: string | null;
  author: string | null;
  artist: string | null;
  chapters: EpubChapter[];
  cssPaths: string[];
  imagePaths: string[];
}

export interface IEpubService {
  parseNovelAndChapters(epubDirPath: string): EpubNovel;
}

// ── Volume Button Service ───────────────────────────────────────────

export interface IVolumeButtonService {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
