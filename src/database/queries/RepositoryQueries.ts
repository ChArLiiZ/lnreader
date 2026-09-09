import { Repository } from '@database/types';
import { db } from '@database/db';

type RepositoryRow = Omit<Repository, 'enabled'> & { enabled: number };

// SQLite has no boolean, so normalise here rather than letting 0/1 travel
// under a type that claims otherwise.
const toRepository = (row: RepositoryRow): Repository => ({
  ...row,
  enabled: row.enabled !== 0,
});

export const getRepositoriesFromDb = (): Repository[] =>
  db
    .getAllSync<RepositoryRow>('SELECT * FROM Repository ORDER BY id')
    .map(toRepository);

export const getEnabledRepositoriesFromDb = (): Repository[] =>
  db
    .getAllSync<RepositoryRow>(
      'SELECT * FROM Repository WHERE enabled = 1 ORDER BY id',
    )
    .map(toRepository);

export const isRepoUrlDuplicated = (repoUrl: string) =>
  (db.getFirstSync<{ isDuplicated: number }>(
    'SELECT COUNT(*) as isDuplicated FROM Repository WHERE url = ?',
    repoUrl,
  )?.isDuplicated || 0) > 0;

export const createRepository = (repoUrl: string) =>
  db.runSync('INSERT INTO Repository (url) VALUES (?)', repoUrl);

export const deleteRepositoryById = (id: number) =>
  db.runSync('DELETE FROM Repository WHERE id = ?', id);

export const updateRepository = (id: number, url: string) =>
  db.runSync('UPDATE Repository SET url = ? WHERE id = ?', url, id);

export const setRepositoryEnabled = (id: number, enabled: boolean) =>
  db.runSync(
    'UPDATE Repository SET enabled = ? WHERE id = ?',
    enabled ? 1 : 0,
    id,
  );
