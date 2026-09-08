import { DatabaseSync } from 'node:sqlite';

import { SQLiteDatabase } from 'expo-sqlite';

import { migration010 } from '../migrations/010_restore_fork_schema_from_drizzle';

type Row = Record<string, unknown>;

/**
 * Minimal stand-in for the slice of the expo-sqlite synchronous API that
 * migration 010 uses, backed by node:sqlite.
 */
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

const run = (raw: DatabaseSync) => {
  migration010.migrate(adapt(raw) as unknown as SQLiteDatabase);
};

/**
 * Recreates the schema the upstream 2.1.3 Drizzle chain leaves behind:
 * no foreign keys anywhere, unique constraints expressed as standalone
 * indexes, upstream-only Chapter columns, and the partial Category indexes.
 */
const createPostDrizzleDatabase = () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');

  raw.exec(`
    CREATE TABLE Category (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      sort integer,
      parentId integer REFERENCES Category(id)
    );
    CREATE INDEX category_sort_idx ON Category (sort);
    CREATE UNIQUE INDEX category_root_name_unique ON Category (name) WHERE "Category"."parentId" IS NULL;
    CREATE UNIQUE INDEX category_parent_name_unique ON Category (parentId, name) WHERE "Category"."parentId" IS NOT NULL;

    CREATE TABLE Chapter (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      novelId integer NOT NULL,
      path text NOT NULL,
      name text NOT NULL,
      releaseTime text,
      bookmark integer DEFAULT 0,
      unread integer DEFAULT 1,
      readTime text,
      isDownloaded integer DEFAULT 0,
      updatedTime text,
      chapterNumber real,
      page text DEFAULT '1',
      position integer DEFAULT 0,
      progress integer,
      scanlator text,
      timeSpent integer DEFAULT 0
    );
    CREATE UNIQUE INDEX chapter_novel_path_unique ON Chapter (novelId, path);
    CREATE INDEX chapterNovelIdIndex ON Chapter (novelId, position, page, id);

    CREATE TABLE Novel (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      path text NOT NULL,
      pluginId text NOT NULL,
      name text NOT NULL,
      cover text,
      summary text,
      author text,
      artist text,
      status text DEFAULT 'Unknown',
      genres text,
      inLibrary integer DEFAULT 0,
      isLocal integer DEFAULT 0,
      totalPages integer DEFAULT 0,
      chaptersDownloaded integer DEFAULT 0,
      chaptersUnread integer DEFAULT 0,
      totalChapters integer DEFAULT 0,
      lastReadAt text,
      lastUpdatedAt text,
      latestChapterAt integer DEFAULT 0,
      rating real,
      wordCount integer
    );
    CREATE UNIQUE INDEX novel_path_plugin_unique ON Novel (path, pluginId);
    CREATE INDEX NovelIndex ON Novel (pluginId, path, id, inLibrary);

    CREATE TABLE NovelCategory (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      novelId integer NOT NULL,
      categoryId integer NOT NULL
    );
    CREATE UNIQUE INDEX novel_category_unique ON NovelCategory (novelId, categoryId);

    CREATE TABLE Repository (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      url text NOT NULL,
      enabled integer DEFAULT 1 NOT NULL
    );

    CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  // Upstream trigger bodies, which share the fork's trigger names.
  raw.exec(`
    CREATE TRIGGER update_novel_stats
    AFTER INSERT ON Chapter
    BEGIN
      UPDATE Novel
      SET totalChapters = totalChapters + 1
      WHERE id = NEW.novelId;
    END;
  `);

  return raw;
};

const seed = (raw: DatabaseSync) => {
  raw.exec(`
    INSERT INTO Novel (id, path, pluginId, name, latestChapterAt, rating, wordCount)
    VALUES
      (1, '/a', 'p1', 'Novel A', 1700000000000, 4.5, 120000),
      (2, '/b', 'p1', 'Novel B', 1700000001000, 3.0, 90000);

    INSERT INTO Category (id, name, sort, parentId) VALUES
      (1, 'Default', 1, NULL),
      (2, 'Local', 2, NULL),
      (3, 'Shelf', 3, NULL),
      (4, 'Sub', 4, 3),
      (5, 'SubSub', 5, 4);

    INSERT INTO NovelCategory (id, novelId, categoryId) VALUES
      (1, 1, 3),
      (2, 1, 5),
      (3, 2, 4),
      (4, 2, 999);

    INSERT INTO Chapter (id, novelId, path, name, scanlator, timeSpent, position, progress)
    VALUES
      (1, 1, '/a/1', 'Ch 1', 'group-x', 42, 0, 10),
      (2, 1, '/a/2', 'Ch 2', NULL, 0, 1, 0),
      (3, 2, '/b/1', 'Ch 1', NULL, 7, 0, 100),
      (4, 404, '/gone/1', 'Orphan', NULL, 0, 0, 0);
  `);
};

const indexNames = (raw: DatabaseSync) =>
  new Set(
    (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Row[]
    ).map(row => row.name as string),
  );

const fkTargets = (raw: DatabaseSync, table: string) =>
  (raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as Row[]).map(
    row => ({
      table: row.table as string,
      onDelete: row.on_delete as string,
    }),
  );

describe('migration010 — restoring the fork schema after upstream 2.1.3', () => {
  describe('on a database the upstream Drizzle build has migrated', () => {
    let raw: DatabaseSync;

    beforeEach(() => {
      raw = createPostDrizzleDatabase();
      seed(raw);
      run(raw);
    });

    afterEach(() => raw.close());

    it('restores the cascading foreign keys Drizzle dropped', () => {
      expect(fkTargets(raw, 'Chapter')).toEqual([
        { table: 'Novel', onDelete: 'CASCADE' },
      ]);
      expect(fkTargets(raw, 'NovelCategory')).toEqual(
        expect.arrayContaining([
          { table: 'Category', onDelete: 'CASCADE' },
          { table: 'Novel', onDelete: 'CASCADE' },
        ]),
      );
      expect(fkTargets(raw, 'Category')).toEqual([
        { table: 'Category', onDelete: 'CASCADE' },
      ]);
    });

    it('keeps every novel row and its fork-only metadata', () => {
      const novels = raw
        .prepare('SELECT id, latestChapterAt, rating, wordCount FROM Novel')
        .all() as Row[];
      expect(novels).toEqual([
        {
          id: 1,
          latestChapterAt: 1700000000000,
          rating: 4.5,
          wordCount: 120000,
        },
        {
          id: 2,
          latestChapterAt: 1700000001000,
          rating: 3.0,
          wordCount: 90000,
        },
      ]);
    });

    it('keeps chapters with their ids, reading state and upstream columns', () => {
      const chapters = raw
        .prepare(
          'SELECT id, novelId, progress, scanlator, timeSpent FROM Chapter ORDER BY id',
        )
        .all() as Row[];
      expect(chapters).toEqual([
        {
          id: 1,
          novelId: 1,
          progress: 10,
          scanlator: 'group-x',
          timeSpent: 42,
        },
        { id: 2, novelId: 1, progress: 0, scanlator: null, timeSpent: 0 },
        { id: 3, novelId: 2, progress: 100, scanlator: null, timeSpent: 7 },
      ]);
    });

    it('drops chapters whose novel no longer exists', () => {
      const orphan = raw
        .prepare('SELECT id FROM Chapter WHERE novelId = 404')
        .all();
      expect(orphan).toEqual([]);
    });

    it('preserves the nested category hierarchy, including grandchildren', () => {
      const categories = raw
        .prepare('SELECT id, name, sort, parentId FROM Category ORDER BY id')
        .all() as Row[];
      expect(categories).toEqual([
        { id: 1, name: 'Default', sort: 1, parentId: null },
        { id: 2, name: 'Local', sort: 2, parentId: null },
        { id: 3, name: 'Shelf', sort: 3, parentId: null },
        { id: 4, name: 'Sub', sort: 4, parentId: 3 },
        { id: 5, name: 'SubSub', sort: 5, parentId: 4 },
      ]);
    });

    it('keeps valid category memberships and discards dangling ones', () => {
      const memberships = raw
        .prepare('SELECT novelId, categoryId FROM NovelCategory ORDER BY id')
        .all() as Row[];
      expect(memberships).toEqual([
        { novelId: 1, categoryId: 3 },
        { novelId: 1, categoryId: 5 },
        { novelId: 2, categoryId: 4 },
      ]);
    });

    it('replaces the upstream trigger bodies with the fork recount versions', () => {
      const sql = (
        raw
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'update_novel_stats'",
          )
          .get() as Row
      ).sql as string;
      expect(sql).toContain('SELECT COUNT(*) FROM Chapter');
      expect(sql).not.toContain('totalChapters + 1');
    });

    it('installs the fork trigger set and the fork indexes', () => {
      const triggers = (
        raw
          .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
          .all() as Row[]
      ).map(row => row.name);
      expect(triggers).toEqual(
        expect.arrayContaining([
          'update_novel_stats',
          'update_novel_stats_on_update',
          'update_novel_stats_on_delete',
          'add_category',
        ]),
      );

      const indexes = indexNames(raw);
      for (const name of [
        'idx_novel_library_filters',
        'idx_category_name_parent',
        'idx_nc_categoryId',
        'chapterNovelIdIndex',
        'NovelIndex',
      ]) {
        expect(indexes).toContain(name);
      }
      for (const name of [
        'category_root_name_unique',
        'category_parent_name_unique',
        'chapter_novel_path_unique',
        'novel_category_unique',
      ]) {
        expect(indexes).not.toContain(name);
      }
    });

    it('removes the Drizzle bookkeeping and migration leftovers', () => {
      const tables = (
        raw
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Row[]
      ).map(row => row.name as string);
      expect(tables).not.toContain('__drizzle_migrations');
      expect(tables.filter(name => name.startsWith('__'))).toEqual([]);
    });

    it('cascades deletes again, which the Drizzle schema had silently lost', () => {
      raw.exec('DELETE FROM Novel WHERE id = 1');
      expect(
        raw
          .prepare('SELECT COUNT(*) AS n FROM Chapter WHERE novelId = 1')
          .get(),
      ).toEqual({ n: 0 });
      expect(
        raw
          .prepare('SELECT COUNT(*) AS n FROM NovelCategory WHERE novelId = 1')
          .get(),
      ).toEqual({ n: 0 });

      raw.exec('DELETE FROM Category WHERE id = 3');
      expect(raw.prepare('SELECT COUNT(*) AS n FROM Category').get()).toEqual({
        n: 2,
      });
    });

    it('still allows the same category name under different parents', () => {
      raw.exec("INSERT INTO Category (name, parentId) VALUES ('Same', 3)");
      raw.exec("INSERT INTO Category (name, parentId) VALUES ('Same', 4)");
      expect(() =>
        raw.exec("INSERT INTO Category (name, parentId) VALUES ('Same', 4)"),
      ).toThrow();
    });

    it('is safe to run twice', () => {
      expect(() => run(raw)).not.toThrow();
      expect(raw.prepare('SELECT COUNT(*) AS n FROM Chapter').get()).toEqual({
        n: 3,
      });
      expect(
        raw.prepare('SELECT COUNT(*) AS n FROM NovelCategory').get(),
      ).toEqual({ n: 3 });
    });
  });

  describe('on a fork database that never met the upstream build', () => {
    it('leaves the existing tables untouched and only tops up indexes', () => {
      const raw = new DatabaseSync(':memory:');
      raw.exec('PRAGMA foreign_keys = ON');
      raw.exec(`
        CREATE TABLE Novel (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL,
          pluginId TEXT NOT NULL,
          name TEXT NOT NULL,
          inLibrary INTEGER DEFAULT 0,
          isLocal INTEGER DEFAULT 0,
          chaptersDownloaded INTEGER DEFAULT 0,
          chaptersUnread INTEGER DEFAULT 0,
          totalChapters INTEGER DEFAULT 0,
          lastReadAt TEXT,
          lastUpdatedAt TEXT,
          latestChapterAt INTEGER DEFAULT 0,
          rating REAL,
          wordCount INTEGER,
          UNIQUE(path, pluginId)
        );
        CREATE TABLE Category (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sort INTEGER,
          parentId INTEGER REFERENCES Category(id) ON DELETE CASCADE
        );
        CREATE TABLE Chapter (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          novelId INTEGER NOT NULL,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          releaseTime TEXT,
          bookmark INTEGER DEFAULT 0,
          unread INTEGER DEFAULT 1,
          readTime TEXT,
          isDownloaded INTEGER DEFAULT 0,
          updatedTime TEXT,
          chapterNumber REAL NULL,
          page TEXT DEFAULT '1',
          position INTEGER DEFAULT 0,
          progress INTEGER,
          UNIQUE(path, novelId),
          FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE
        );
        CREATE TABLE NovelCategory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          novelId INTEGER NOT NULL,
          categoryId INTEGER NOT NULL,
          UNIQUE(novelId, categoryId),
          FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE,
          FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE CASCADE
        );
      `);
      raw.exec(`
        INSERT INTO Novel (id, path, pluginId, name) VALUES (1, '/a', 'p1', 'A');
        INSERT INTO Category (id, name, sort) VALUES (1, 'Default', 1);
        INSERT INTO NovelCategory (id, novelId, categoryId) VALUES (1, 1, 1);
        INSERT INTO Chapter (id, novelId, path, name) VALUES (1, 1, '/a/1', 'Ch 1');
      `);

      run(raw);

      expect(
        raw.prepare('SELECT COUNT(*) AS n FROM NovelCategory').get(),
      ).toEqual({ n: 1 });
      expect(raw.prepare('SELECT COUNT(*) AS n FROM Chapter').get()).toEqual({
        n: 1,
      });
      expect(indexNames(raw)).toContain('idx_novel_library_filters');
      raw.close();
    });
  });
});
