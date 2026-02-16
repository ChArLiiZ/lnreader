import {
  formatWordCount,
  deriveR18Badge,
  buildNovelInfoString,
} from '../format';

describe('formatWordCount', () => {
  it('formats counts >= 10000 with 萬 suffix', () => {
    expect(formatWordCount(42795)).toBe('4.3萬');
    expect(formatWordCount(10000)).toBe('1.0萬');
    expect(formatWordCount(100000)).toBe('10.0萬');
    expect(formatWordCount(11500)).toBe('1.1萬');
  });

  it('formats counts >= 1000 with 千 suffix', () => {
    expect(formatWordCount(3300)).toBe('3.3千');
    expect(formatWordCount(1000)).toBe('1.0千');
    expect(formatWordCount(9999)).toBe('10.0千');
  });

  it('returns raw number string for counts < 1000', () => {
    expect(formatWordCount(999)).toBe('999');
    expect(formatWordCount(0)).toBe('0');
    expect(formatWordCount(1)).toBe('1');
    expect(formatWordCount(500)).toBe('500');
  });
});

describe('deriveR18Badge', () => {
  it('returns R18 for R18 genre', () => {
    expect(deriveR18Badge('R18, 異世界')).toBe('R18');
  });

  it('returns R18 for R-18 variant', () => {
    expect(deriveR18Badge('R-18')).toBe('R18');
  });

  it('returns R18 for 成人 genre', () => {
    expect(deriveR18Badge('冒險, 成人')).toBe('R18');
  });

  it('returns R18 for Adult keyword (case insensitive)', () => {
    expect(deriveR18Badge('Fantasy, adult')).toBe('R18');
    expect(deriveR18Badge('Fantasy, Adult')).toBe('R18');
  });

  it('returns R18 for 18+ keyword', () => {
    expect(deriveR18Badge('18+')).toBe('R18');
  });

  it('returns undefined for non-adult genres', () => {
    expect(deriveR18Badge('冒險, 奇幻')).toBeUndefined();
  });

  it('returns undefined for empty/null genres', () => {
    expect(deriveR18Badge('')).toBeUndefined();
    expect(deriveR18Badge(undefined)).toBeUndefined();
  });
});

describe('buildNovelInfoString', () => {
  it('builds string with both rating and word count', () => {
    expect(buildNovelInfoString(4.5, 42795)).toBe('★4.5 | 4.3萬字');
  });

  it('builds string with rating only', () => {
    expect(buildNovelInfoString(3.7, undefined)).toBe('★3.7');
  });

  it('builds string with word count only', () => {
    expect(buildNovelInfoString(undefined, 3300)).toBe('3.3千字');
  });

  it('returns undefined when both are missing', () => {
    expect(buildNovelInfoString(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined when values are zero', () => {
    expect(buildNovelInfoString(0, 0)).toBeUndefined();
  });
});
