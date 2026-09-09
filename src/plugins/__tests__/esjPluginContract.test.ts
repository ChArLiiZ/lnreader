import { DatabaseSync } from 'node:sqlite';

let raw: DatabaseSync;

jest.mock('@database/db', () => ({
  get db() {
    return {
      // expo-sqlite accepts bindings either spread or as one array.
      runAsync: async (sql: string, ...args: unknown[]) => {
        const params =
          Array.isArray(args[0]) && args.length === 1 ? args[0] : args;
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

const mockGetPlugin = jest.fn();
jest.mock('@plugins/pluginManager', () => ({
  getPlugin: (...args: unknown[]) => mockGetPlugin(...args),
}));
jest.mock('@plugins/helpers/isAbsoluteUrl', () => ({
  isUrlAbsolute: () => true,
}));
jest.mock('@platform', () => ({
  FileService: {
    getExternalDirectoryPath: () => '/storage',
    getExternalCachesDirectoryPath: () => '/cache',
  },
}));
jest.mock('@specs/NativeFile', () => ({ default: {} }));
jest.mock('@strings/translations', () => ({ getString: (k: string) => k }));
jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));

import { fetchChapters } from '@services/plugin/fetch';
import { insertChapters } from '@database/queries/ChapterQueries';
import {
  FilterTypes,
  isAutocompleteMultiValue,
} from '@plugins/types/filterTypes';

type Row = Record<string, unknown>;

const createSchema = () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE Novel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latestChapterAt INTEGER DEFAULT 0
    );
    CREATE TABLE Chapter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      releaseTime TEXT,
      chapterNumber REAL NULL,
      page TEXT DEFAULT "1",
      position INTEGER DEFAULT 0,
      scanlator TEXT,
      timeSpent INTEGER DEFAULT 0,
      UNIQUE(path, novelId)
    );
    INSERT INTO Novel (id) VALUES (1);
  `);
  return database;
};

describe('ESJ-shaped plugin contract', () => {
  beforeEach(() => {
    raw = createSchema();
    mockGetPlugin.mockReset();
  });

  afterEach(() => raw.close());

  it('keeps every optional field a chapter carries and flattens a scanlator list', async () => {
    mockGetPlugin.mockReturnValue({
      parseNovel: async () => ({
        chapters: [
          {
            name: 'Chapter 1',
            path: '/novel/1',
            releaseTime: '2026-01-01',
            chapterNumber: 1,
            page: '1',
            scanlator: ['Group A', 'Group B'],
          },
        ],
      }),
    });

    const chapters = await fetchChapters('esj', '/novel');

    expect(chapters).toEqual([
      {
        name: 'Chapter 1',
        path: '/novel/1',
        releaseTime: '2026-01-01',
        chapterNumber: 1,
        page: '1',
        scanlator: 'Group A, Group B',
      },
    ]);
  });

  it('leaves a chapter without a scanlator exactly as the plugin returned it', async () => {
    const chapter = {
      name: 'Chapter 2',
      path: '/novel/2',
      page: '3',
      chapterNumber: 2,
    };
    mockGetPlugin.mockReturnValue({
      parseNovel: async () => ({ chapters: [chapter] }),
    });

    const chapters = await fetchChapters('esj', '/novel');

    expect(chapters?.[0]).toBe(chapter);
  });

  it('writes chapters to the columns they belong in', async () => {
    await insertChapters(1, [
      {
        name: 'Chapter 1',
        path: '/novel/1',
        releaseTime: '2026-01-01',
        chapterNumber: 1,
        page: '1',
        scanlator: 'Group A, Group B',
      },
      {
        name: 'Chapter 2',
        path: '/novel/2',
        page: '2',
        chapterNumber: 2,
      },
    ]);

    expect(
      raw
        .prepare(
          'SELECT name, path, releaseTime, chapterNumber, page, position, scanlator FROM Chapter ORDER BY id',
        )
        .all() as Row[],
    ).toEqual([
      {
        name: 'Chapter 1',
        path: '/novel/1',
        releaseTime: '2026-01-01',
        chapterNumber: 1,
        page: '1',
        position: 0,
        scanlator: 'Group A, Group B',
      },
      {
        name: 'Chapter 2',
        path: '/novel/2',
        releaseTime: '',
        chapterNumber: 2,
        page: '2',
        position: 1,
        scanlator: null,
      },
    ]);
  });

  it('still recognises an AutocompleteMulti filter value', () => {
    expect(
      isAutocompleteMultiValue({
        type: FilterTypes.AutocompleteMulti,
        value: ['fantasy', 'action'],
      } as never),
    ).toBe(true);
  });
});
