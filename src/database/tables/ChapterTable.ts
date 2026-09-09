export const createChapterTableQuery = `
    CREATE TABLE IF NOT EXISTS Chapter (
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
        progress INTEGER,
        scanlator TEXT,
        timeSpent INTEGER DEFAULT 0,
        UNIQUE(path, novelId),
        FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE
    )
`;

export const createChapterIndexQuery = `
    CREATE INDEX
    IF NOT EXISTS
    chapterNovelIdIndex ON Chapter(novelId, position,page, id)
`;

export const createChapterScanlatorIndexQuery = `
    CREATE INDEX
    IF NOT EXISTS
    idx_chapter_scanlator ON Chapter(novelId, scanlator)
`;

export const dropChapterIndexQuery = `
    DROP INDEX IF EXISTS chapterNovelIdIndex;
`;
