import { db } from '@database/db';
import { LibraryNovelInfo, NovelInfo } from '../types';

export const getLibraryNovelsFromDb = (
  sortOrder?: string,
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
  excludeLocalNovels?: boolean,
) => {
  let query = 'SELECT * FROM Novel WHERE inLibrary = 1';

  if (excludeLocalNovels) {
    query += ' AND isLocal = 0';
  }

  if (filter) {
    query += ` AND ${filter}`;
  }

  if (downloadedOnlyMode) {
    query += ` AND (chaptersDownloaded = 1 OR isLocal = 1)`;
  }

  if (searchText) {
    query += ' AND name LIKE ?';
  }

  if (sortOrder) {
    query += ` ORDER BY ${sortOrder}`;
  }

  return db.getAllAsync<NovelInfo>(query, searchText ? `%${searchText}%` : '');
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

  if (categoryId) {
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
