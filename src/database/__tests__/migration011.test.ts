import { DatabaseSync } from 'node:sqlite';

import { SQLiteDatabase } from 'expo-sqlite';

import { migration011 } from '../migrations/011_add_scanlator_timespent_repo_enabled';

type Row = Record<string, unknown>;

const adapt = (raw: DatabaseSync) => ({
  execSync: (sql: string) => raw.exec(sql),
  runSync: (sql: string, ...params: unknown[]) => {
    if (params.length === 0) {
      raw.exec(sql);
      return;
    }
    raw.prepare(sql).run(...(params as never[]));
  },
  getAllSync: (sql: string, ...params: unknown[]) =>
    raw.prepare(sql).all(...(params as never[])) as Row[],
  getFirstSync: (sql: string, ...params: unknown[]) =>
    (raw.prepare(sql).get(...(params as never[])) as Row | undefined) ?? null,
});

const run = (raw: DatabaseSync) =>
  migration011.migrate(adapt(raw) as unknown as SQLiteDatabase);

const columns = (raw: DatabaseSync, table: string) =>
  new Set(
    (raw.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map(
      row => row.name as string,
    ),
  );

/** A fork database that never met the upstream build. */
const createForkDatabase = () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE Chapter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      unread INTEGER DEFAULT 1,
      progress INTEGER,
      UNIQUE(path, novelId)
    );
    CREATE TABLE Repository (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      UNIQUE(url)
    );
    INSERT INTO Chapter (id, novelId, path, name) VALUES (1, 1, '/a/1', 'Ch 1');
    INSERT INTO Repository (id, url) VALUES (1, 'https://example.com/repo.json');
  `);
  return raw;
};

/**
 * What migration 010 leaves behind: the columns are already there, carried
 * over from the upstream build.
 */
const createUpstreamCarriedDatabase = () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE Chapter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      unread INTEGER DEFAULT 1,
      progress INTEGER,
      scanlator TEXT,
      timeSpent INTEGER DEFAULT 0,
      UNIQUE(path, novelId)
    );
    CREATE TABLE Repository (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(url)
    );
    INSERT INTO Chapter (id, novelId, path, name, scanlator, timeSpent)
    VALUES (1, 1, '/a/1', 'Ch 1', 'group-x', 4200);
    INSERT INTO Repository (id, url, enabled)
    VALUES (1, 'https://example.com/repo.json', 0);
  `);
  return raw;
};

describe('migration011', () => {
  describe('on a fork database', () => {
    let raw: DatabaseSync;

    beforeEach(() => {
      raw = createForkDatabase();
      run(raw);
    });

    afterEach(() => raw.close());

    it('adds the three columns', () => {
      expect(columns(raw, 'Chapter').has('scanlator')).toBe(true);
      expect(columns(raw, 'Chapter').has('timeSpent')).toBe(true);
      expect(columns(raw, 'Repository').has('enabled')).toBe(true);
    });

    it('leaves existing chapters at no scanlator and no time spent', () => {
      expect(
        raw.prepare('SELECT scanlator, timeSpent FROM Chapter').get(),
      ).toEqual({ scanlator: null, timeSpent: 0 });
    });

    it('leaves existing repositories enabled', () => {
      expect(raw.prepare('SELECT enabled FROM Repository').get()).toEqual({
        enabled: 1,
      });
    });

    it('indexes scanlator lookups per novel', () => {
      const indexes = (
        raw
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
          .all() as Row[]
      ).map(row => row.name);
      expect(indexes).toContain('idx_chapter_scanlator');
    });

    it('is safe to run twice', () => {
      expect(() => run(raw)).not.toThrow();
    });
  });

  describe('on a database the upstream build already populated', () => {
    it('keeps the carried-over values instead of resetting them', () => {
      const raw = createUpstreamCarriedDatabase();
      run(raw);

      expect(
        raw.prepare('SELECT scanlator, timeSpent FROM Chapter').get(),
      ).toEqual({ scanlator: 'group-x', timeSpent: 4200 });
      expect(raw.prepare('SELECT enabled FROM Repository').get()).toEqual({
        enabled: 0,
      });
      raw.close();
    });
  });
});
