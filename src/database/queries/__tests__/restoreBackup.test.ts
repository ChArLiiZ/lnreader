import { DatabaseSync } from 'node:sqlite';

let raw: DatabaseSync;

/**
 * The restore queries use the module-level `db`, so it is replaced with a
 * node:sqlite database exposing the slice of the expo-sqlite async API they
 * call.
 */
jest.mock('@database/db', () => ({
  get db() {
    return {
      runAsync: async (sql: string, ...params: unknown[]) => {
        if (params.length === 0) {
          raw.exec(sql);
          return;
        }
        raw.prepare(sql).run(...(params as never[]));
      },
      getFirstAsync: async (sql: string, ...params: unknown[]) =>
        raw.prepare(sql).get(...(params as never[])) ?? null,
      getAllAsync: async (sql: string, ...params: unknown[]) =>
        raw.prepare(sql).all(...(params as never[])),
      withTransactionAsync: async (fn: () => Promise<void>) => {
        raw.exec('BEGIN');
        try {
          await fn();
          raw.exec('COMMIT');
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      },
    };
  },
}));

// NovelQueries reaches native and Expo modules at import time; none of them
// take part in restoring.
jest.mock('expo-document-picker', () => ({}));
jest.mock('@services/plugin/fetch', () => ({ fetchNovel: jest.fn() }));
jest.mock('./../ChapterQueries', () => ({ insertChapters: jest.fn() }));
jest.mock('@plugins/helpers/fetch', () => ({ downloadFile: jest.fn() }));
jest.mock('@plugins/pluginManager', () => ({ getPlugin: jest.fn() }));
jest.mock('@specs/NativeFile', () => ({ default: {} }));
jest.mock('@utils/Storages', () => ({ NOVEL_STORAGE: '/storage/Novels' }));
jest.mock('@strings/translations', () => ({ getString: (k: string) => k }));
jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));

const { _restoreNovelAndChapters } = require('../NovelQueries');

type Row = Record<string, unknown>;

const createSchema = () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE Novel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      pluginId TEXT NOT NULL,
      name TEXT NOT NULL,
      cover TEXT,
      inLibrary INTEGER DEFAULT 0,
      UNIQUE(path, pluginId)
    );
    CREATE TABLE Chapter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      unread INTEGER DEFAULT 1,
      UNIQUE(path, novelId),
      FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE
    );
  `);
  return database;
};

const backupNovel = (overrides: Row = {}) => ({
  id: 1,
  path: '/backup-novel',
  pluginId: 'plugin-a',
  name: 'Backup Novel',
  cover: null,
  inLibrary: 1,
  chapters: [
    { id: 10, novelId: 1, path: '/backup-novel/1', name: 'Ch 1', unread: 0 },
    { id: 11, novelId: 1, path: '/backup-novel/2', name: 'Ch 2', unread: 1 },
  ],
  ...overrides,
});

describe('_restoreNovelAndChapters', () => {
  beforeEach(() => {
    raw = createSchema();
  });

  afterEach(() => raw.close());

  it('leaves an unrelated novel occupying the backup id alone', async () => {
    raw.exec(`
      INSERT INTO Novel (id, path, pluginId, name) VALUES (1, '/mine', 'plugin-b', 'My Novel');
      INSERT INTO Chapter (id, novelId, path, name) VALUES (100, 1, '/mine/1', 'Mine Ch 1');
    `);

    await _restoreNovelAndChapters(backupNovel());

    expect(raw.prepare('SELECT name FROM Novel WHERE id = 1').get()).toEqual({
      name: 'My Novel',
    });
    expect(
      raw.prepare('SELECT COUNT(*) AS n FROM Chapter WHERE novelId = 1').get(),
    ).toEqual({ n: 1 });
  });

  it('reports where the novel and its chapters actually landed', async () => {
    raw.exec(
      "INSERT INTO Novel (id, path, pluginId, name) VALUES (1, '/mine', 'plugin-b', 'My Novel')",
    );

    const mapping = await _restoreNovelAndChapters(backupNovel());

    expect(mapping.backupNovelId).toBe(1);
    expect(mapping.restoredNovelId).not.toBe(1);
    expect(mapping.chapters).toHaveLength(2);
    for (const chapter of mapping.chapters) {
      expect(chapter.restoredChapterId).not.toBe(chapter.backupChapterId);
    }
  });

  it('updates an existing novel in place when the source matches', async () => {
    raw.exec(
      "INSERT INTO Novel (id, path, pluginId, name) VALUES (7, '/backup-novel', 'plugin-a', 'Stale Name')",
    );

    const mapping = await _restoreNovelAndChapters(backupNovel());

    expect(mapping.restoredNovelId).toBe(7);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM Novel').get()).toEqual({
      n: 1,
    });
    expect(raw.prepare('SELECT name FROM Novel WHERE id = 7').get()).toEqual({
      name: 'Backup Novel',
    });
  });

  it('replaces the chapters of the restored novel only', async () => {
    raw.exec(`
      INSERT INTO Novel (id, path, pluginId, name) VALUES
        (7, '/backup-novel', 'plugin-a', 'Stale'),
        (8, '/other', 'plugin-a', 'Other');
      INSERT INTO Chapter (novelId, path, name) VALUES
        (7, '/backup-novel/old', 'Old'),
        (8, '/other/1', 'Other Ch 1');
    `);

    await _restoreNovelAndChapters(backupNovel());

    const restored = (
      raw
        .prepare('SELECT path FROM Chapter WHERE novelId = 7 ORDER BY path')
        .all() as Row[]
    ).map(row => row.path);
    expect(restored).toEqual(['/backup-novel/1', '/backup-novel/2']);
    expect(
      raw.prepare('SELECT COUNT(*) AS n FROM Chapter WHERE novelId = 8').get(),
    ).toEqual({ n: 1 });
  });

  it('rewrites a stored cover path onto the restored novel id', async () => {
    raw.exec(
      "INSERT INTO Novel (id, path, pluginId, name) VALUES (1, '/mine', 'plugin-b', 'My Novel')",
    );

    const mapping = await _restoreNovelAndChapters(
      backupNovel({
        cover: 'file:///storage/Novels/plugin-a/1/cover.png?t=123',
      }),
    );

    expect(
      raw
        .prepare('SELECT cover FROM Novel WHERE id = ?')
        .get(mapping.restoredNovelId),
    ).toEqual({
      cover: `file:///storage/Novels/plugin-a/${mapping.restoredNovelId}/cover.png?t=123`,
    });
  });
});
