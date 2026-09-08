/**
 * Genres arrive from plugins as a comma-separated string, but the column is
 * nullable and plugins can return anything, so a bare `.split()` on it crashes
 * the novel screen. Anything that is not a string yields no genres.
 */
export const parseGenres = (genres: unknown): string[] =>
  typeof genres === 'string'
    ? genres
        .split(',')
        .map(genre => genre.trim())
        .filter(Boolean)
    : [];
