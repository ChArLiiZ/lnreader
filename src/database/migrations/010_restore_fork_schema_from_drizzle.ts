import { SQLiteDatabase } from 'expo-sqlite';

import { Migration } from '../types/migration';

const tableExists = (db: SQLiteDatabase, name: string): boolean => {
  try {
    return (
      db.getFirstSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        name,
      ) !== null
    );
  } catch {
    return false;
  }
};

const columnNames = (db: SQLiteDatabase, table: string): Set<string> => {
  try {
    return new Set(
      db
        .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
        .map(column => column.name),
    );
  } catch {
    return new Set<string>();
  }
};

const hasForeignKeys = (db: SQLiteDatabase, table: string): boolean => {
  try {
    return db.getAllSync(`PRAGMA foreign_key_list(${table})`).length > 0;
  } catch {
    return false;
  }
};

/**
 * Temporary tables left behind by the Drizzle migration chain. They hold copies
 * of real data, so they are only dropped after the rebuild has read everything
 * it needs out of the live tables.
 */
const LEFTOVER_TABLES = [
  '__fork_NovelMetadata',
  '__fork_CategoryHierarchy',
  '__migration_Novel',
  '__migration_Chapter',
  '__migration_NovelCategory',
  '__new_Novel',
];

/**
 * Indexes Drizzle installed under its own names. They overlap with the fork
 * equivalents, so they go before the fork versions are recreated.
 */
const UPSTREAM_INDEXES = [
  'category_name_unique',
  'category_root_name_unique',
  'category_parent_name_unique',
  'category_sort_idx',
  'chapter_novel_path_unique',
  'novel_category_unique',
];

const NOVEL_TRIGGERS = [
  'update_novel_stats',
  'update_novel_stats_on_update',
  'update_novel_stats_on_delete',
];

/**
 * Recreates the fork's counter triggers.
 *
 * Upstream 2.1.3 ships triggers under the *same names* but with different
 * bodies: its insert trigger increments counters instead of recounting them,
 * and its update trigger only fires `OF isDownloaded, unread, readTime,
 * updatedTime`. Because the fork creates its triggers with `IF NOT EXISTS`, a
 * database that has been through the upstream build would silently keep the
 * upstream bodies forever, so they have to be dropped explicitly.
 */
const recreateForkTriggers = (db: SQLiteDatabase) => {
  for (const trigger of NOVEL_TRIGGERS) {
    db.runSync(`DROP TRIGGER IF EXISTS ${trigger}`);
  }

  db.runSync(`
    CREATE TRIGGER update_novel_stats
    AFTER INSERT ON Chapter
    BEGIN
      UPDATE Novel
      SET
        totalChapters = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id),
        chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1),
        lastUpdatedAt = (SELECT MAX(updatedTime) FROM Chapter WHERE Chapter.novelId = Novel.id)
      WHERE id = NEW.novelId;
    END
  `);

  db.runSync(`
    CREATE TRIGGER update_novel_stats_on_update
    AFTER UPDATE ON Chapter
    BEGIN
      UPDATE Novel
      SET
        chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1),
        lastReadAt = (SELECT MAX(readTime) FROM Chapter WHERE Chapter.novelId = Novel.id),
        lastUpdatedAt = (SELECT MAX(updatedTime) FROM Chapter WHERE Chapter.novelId = Novel.id)
      WHERE id = NEW.novelId;
    END
  `);

  db.runSync(`
    CREATE TRIGGER update_novel_stats_on_delete
    AFTER DELETE ON Chapter
    BEGIN
      UPDATE Novel
      SET
        totalChapters = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id),
        chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1),
        lastReadAt = (SELECT MAX(readTime) FROM Chapter WHERE Chapter.novelId = Novel.id),
        lastUpdatedAt = (SELECT MAX(updatedTime) FROM Chapter WHERE Chapter.novelId = Novel.id)
      WHERE id = OLD.novelId;
    END
  `);

  db.runSync('DROP TRIGGER IF EXISTS add_category');
  db.runSync(`
    CREATE TRIGGER add_category AFTER INSERT ON Category
    BEGIN
      UPDATE Category SET sort = (SELECT IFNULL(sort, new.id)) WHERE id = new.id;
    END
  `);
};

/**
 * Rebuilds Category so `parentId` cascades again. Drizzle declared the column
 * without `ON DELETE CASCADE`, and SQLite cannot add a foreign key in place.
 */
const rebuildCategory = (db: SQLiteDatabase) => {
  db.runSync(`
    CREATE TABLE Category_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort INTEGER,
      parentId INTEGER REFERENCES Category_new(id) ON DELETE CASCADE
    )
  `);

  // parentId is filled in a second pass so a child row can never be inserted
  // before the parent it points at.
  db.runSync(`
    INSERT INTO Category_new (id, name, sort, parentId)
    SELECT id, name, sort, NULL FROM Category
  `);

  db.runSync('DROP TABLE Category');
  db.runSync('ALTER TABLE Category_new RENAME TO Category');
};

/**
 * Rebuilds Chapter with the fork's UNIQUE(path, novelId) constraint and the
 * cascading foreign key to Novel, both of which the Drizzle schema dropped.
 * Columns upstream added (`scanlator`, `timeSpent`) are carried over when
 * present so no data is discarded.
 */
const rebuildChapter = (db: SQLiteDatabase) => {
  const existing = columnNames(db, 'Chapter');

  const extraDefinitions: string[] = [];
  const extraColumns: string[] = [];
  if (existing.has('scanlator')) {
    extraDefinitions.push('scanlator TEXT');
    extraColumns.push('scanlator');
  }
  if (existing.has('timeSpent')) {
    extraDefinitions.push('timeSpent INTEGER DEFAULT 0');
    extraColumns.push('timeSpent');
  }

  const carried = [
    'id',
    'novelId',
    'path',
    'name',
    'releaseTime',
    'bookmark',
    'unread',
    'readTime',
    'isDownloaded',
    'updatedTime',
    'chapterNumber',
    'page',
    'position',
    'progress',
    ...extraColumns,
  ];

  const extraDdl = extraDefinitions.length
    ? `,\n      ${extraDefinitions.join(',\n      ')}`
    : '';

  db.runSync(`
    CREATE TABLE Chapter_new (
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
      page TEXT DEFAULT "1",
      position INTEGER DEFAULT 0,
      progress INTEGER${extraDdl},
      UNIQUE(path, novelId),
      FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE
    )
  `);

  // Orphans cannot be carried across: the restored foreign key would reject
  // them. They are unreachable rows the missing cascade left behind.
  db.runSync(`
    INSERT INTO Chapter_new (${carried.join(', ')})
    SELECT ${carried.map(column => `Chapter.${column}`).join(', ')}
    FROM Chapter
    WHERE EXISTS (SELECT 1 FROM Novel WHERE Novel.id = Chapter.novelId)
  `);

  db.runSync('DROP TABLE Chapter');
  db.runSync('ALTER TABLE Chapter_new RENAME TO Chapter');
};

/**
 * Rebuilds NovelCategory with both cascading foreign keys restored, from the
 * snapshot taken before Category was dropped.
 */
const rebuildNovelCategory = (db: SQLiteDatabase, snapshot: string) => {
  db.runSync('DROP TABLE IF EXISTS NovelCategory');
  db.runSync(`
    CREATE TABLE NovelCategory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novelId INTEGER NOT NULL,
      categoryId INTEGER NOT NULL,
      UNIQUE(novelId, categoryId),
      FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE CASCADE
    )
  `);
  db.runSync(`
    INSERT OR IGNORE INTO NovelCategory (id, novelId, categoryId)
    SELECT id, novelId, categoryId
    FROM ${snapshot}
    WHERE EXISTS (SELECT 1 FROM Novel WHERE Novel.id = ${snapshot}.novelId)
      AND EXISTS (SELECT 1 FROM Category WHERE Category.id = ${snapshot}.categoryId)
  `);
};

/**
 * Migration 10: Restore the fork schema on databases that were opened by the
 * upstream 2.1.3 (Drizzle / op-sqlite) build.
 *
 * That build never touched `PRAGMA user_version`, so it is still 9 and the
 * fork's runner would otherwise consider the database current while querying a
 * schema that no longer matches. Bumping to 10 is what forces this repair.
 *
 * The repair is driven by schema introspection rather than by the Drizzle
 * marker alone, so it stays a no-op on databases that never met that build.
 */
export const migration010: Migration = {
  version: 10,
  description:
    'Restore fork schema (foreign keys, indexes, triggers) after an upstream 2.1.3 Drizzle migration',
  migrate: db => {
    const cameFromUpstream =
      tableExists(db, '__drizzle_migrations') ||
      !hasForeignKeys(db, 'NovelCategory') ||
      !hasForeignKeys(db, 'Chapter');

    if (cameFromUpstream) {
      // NovelCategory and the category hierarchy are snapshotted first:
      // rebuilding Category drops it, and if a cascading foreign key is already
      // in place that drop would take the membership rows with it.
      db.runSync('DROP TABLE IF EXISTS __restore_NovelCategory');
      db.runSync(`
        CREATE TABLE __restore_NovelCategory AS
        SELECT id, novelId, categoryId FROM NovelCategory
      `);

      const parentSource = columnNames(db, 'Category').has('parentId')
        ? 'parentId'
        : 'NULL';
      db.runSync('DROP TABLE IF EXISTS __restore_CategoryParent');
      db.runSync(`
        CREATE TABLE __restore_CategoryParent AS
        SELECT id, ${parentSource} AS parentId FROM Category
      `);

      for (const index of UPSTREAM_INDEXES) {
        db.runSync(`DROP INDEX IF EXISTS ${index}`);
      }

      rebuildCategory(db);
      db.runSync(`
        UPDATE Category
        SET parentId = (
          SELECT parentId FROM __restore_CategoryParent
          WHERE __restore_CategoryParent.id = Category.id
        )
        WHERE EXISTS (
          SELECT 1 FROM __restore_CategoryParent AS source
          WHERE source.id = Category.id
            AND source.parentId IS NOT NULL
            AND source.parentId IN (SELECT id FROM Category)
        )
      `);

      rebuildChapter(db);
      rebuildNovelCategory(db, '__restore_NovelCategory');

      db.runSync('DROP TABLE IF EXISTS __restore_NovelCategory');
      db.runSync('DROP TABLE IF EXISTS __restore_CategoryParent');
      db.runSync('DROP TABLE IF EXISTS __drizzle_migrations');
    }

    for (const table of LEFTOVER_TABLES) {
      db.runSync(`DROP TABLE IF EXISTS ${table}`);
    }

    // Fork columns the upstream build added under its own migration, and which
    // fresh fork installs get from the initial schema.
    const novelColumns = columnNames(db, 'Novel');
    if (!novelColumns.has('latestChapterAt')) {
      db.runSync(
        'ALTER TABLE Novel ADD COLUMN latestChapterAt INTEGER DEFAULT 0',
      );
    }
    if (!novelColumns.has('rating')) {
      db.runSync('ALTER TABLE Novel ADD COLUMN rating REAL');
    }
    if (!novelColumns.has('wordCount')) {
      db.runSync('ALTER TABLE Novel ADD COLUMN wordCount INTEGER');
    }

    recreateForkTriggers(db);

    db.runSync(
      'CREATE UNIQUE INDEX IF NOT EXISTS novel_path_plugin_unique ON Novel(path, pluginId)',
    );
    db.runSync(
      'CREATE INDEX IF NOT EXISTS NovelIndex ON Novel(pluginId, path, id, inLibrary)',
    );
    db.runSync(
      'CREATE INDEX IF NOT EXISTS idx_novel_library_filters ON Novel(inLibrary, isLocal, chaptersDownloaded)',
    );
    db.runSync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name_parent ON Category(name, COALESCE(parentId, 0))',
    );
    db.runSync(
      'CREATE INDEX IF NOT EXISTS idx_nc_categoryId ON NovelCategory(categoryId, novelId)',
    );
    db.runSync(
      'CREATE INDEX IF NOT EXISTS chapterNovelIdIndex ON Chapter(novelId, position, page, id)',
    );
  },
};
