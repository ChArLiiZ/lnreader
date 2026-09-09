export const createRepositoryTableQuery = `
  CREATE TABLE IF NOT EXISTS Repository (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE(url)
  );
`;
