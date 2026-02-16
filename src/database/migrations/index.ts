import { Migration } from '../types/migration';
import { migration002 } from './002_add_novel_counters';
import { migration003 } from './003_add_library_filter_index';
import { migration004 } from './004_add_category_parent_id';
import { migration005 } from './005_add_latest_chapter_at';
import { migration006 } from './006_fix_category_unique_constraint';
import { migration007 } from './007_fix_category_unique_constraint_v2';
import { migration008 } from './008_add_novel_category_indexes';
import { migration009 } from './009_add_novel_rating_wordcount';

/**
 * Registry of all database migrations
 *
 * To add a new migration:
 * 1. Create a new file (e.g., 002_add_bookmarks.ts)
 * 2. Define your migration (see existing migrations for examples)
 * 3. Import and add it to the migrations array below
 * 4. Ensure version numbers are sequential
 */
export const migrations: Migration[] = [
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
];
