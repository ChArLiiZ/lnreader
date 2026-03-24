import { db } from '@database/db';
import { LibraryNovelInfo, NovelInfo } from '../types';

export const getLibraryNovelsFromDb = (
  sortOrder?: string,
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
  excludeLocalNovels?: boolean,
) => {
  let query = `SELECT n.*,
    (SELECT CAST((c.position + 1) AS REAL) / NULLIF(n.totalChapters, 0) * 100
     FROM Chapter c
     WHERE c.novelId = n.id AND c.readTime IS NOT NULL
     ORDER BY c.position DESC LIMIT 1) as readProgress
  FROM Novel n WHERE n.inLibrary = 1`;

  if (excludeLocalNovels) {
    query += ' AND n.isLocal = 0';
  }

  if (filter) {
    query += ` AND ${filter}`;
  }

  if (downloadedOnlyMode) {
    query += ` AND (n.chaptersDownloaded > 0 OR n.isLocal = 1)`;
  }

  if (searchText) {
    query += ' AND n.name LIKE ?';
  }

  if (sortOrder) {
    query += ` ORDER BY ${sortOrder}`;
  }

  return db.getAllAsync<NovelInfo>(
    query,
    searchText ? [`%${searchText}%`] : [],
  );
};

export const getLibraryWithCategory = async (
  categoryId?: number | null,
  onlyUpdateOngoingNovels?: boolean,
  excludeLocalNovels?: boolean,
): Promise<LibraryNovelInfo[]> => {
  let query = `
    SELECT DISTINCT n.* FROM Novel n
    INNER JOIN NovelCategory nc ON n.id = nc.novelId
    WHERE n.inLibrary = 1
  `;
  const params: (string | number)[] = [];

  if (categoryId != null) {
    query += ' AND nc.categoryId = ?';
    params.push(categoryId);
  }

  if (excludeLocalNovels) {
    query += ' AND n.isLocal = 0';
  }

  if (onlyUpdateOngoingNovels) {
    query += " AND n.status = 'Ongoing'";
  }

  return db.getAllAsync<LibraryNovelInfo>(query, params);
};
