/**
 * Format a word count with abbreviated units (萬/千).
 */
export function formatWordCount(count: number): string {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + '萬';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + '千';
  }
  return count.toString();
}

/**
 * Derive R18 badge from genre/tag string.
 * Returns 'R18' if genres contain adult-related keywords, undefined otherwise.
 */
export function deriveR18Badge(genres?: string): string | undefined {
  if (!genres) {
    return undefined;
  }
  return /(R-?18|18\+|成人|Adult)/i.test(genres) ? 'R18' : undefined;
}

/**
 * Build a display string for novel cover info overlay.
 * Combines rating and word count into a single string.
 */
export function buildNovelInfoString(
  rating?: number,
  wordCount?: number,
): string | undefined {
  const parts: string[] = [];
  if (rating && rating > 0) {
    parts.push('★' + rating.toFixed(1));
  }
  if (wordCount && wordCount > 0) {
    parts.push(formatWordCount(wordCount) + '字');
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}
