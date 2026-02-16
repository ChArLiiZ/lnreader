import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getCategoriesFromDb } from '@database/queries/CategoryQueries';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';

import { Category, NovelInfo } from '@database/types';

import { useLibrarySettings } from '@hooks/persisted';
import { LibrarySortOrder } from '../constants/constants';
import { switchNovelToLibraryQuery } from '@database/queries/NovelQueries';
import ServiceManager, {
  BackgroundTask,
  QueuedBackgroundTask,
} from '@services/ServiceManager';
import { useMMKVObject } from 'react-native-mmkv';

// type Library = Category & { novels: LibraryNovelInfo[] };
export type ExtendedCategory = Category & {
  novelIds: number[];
  /** Root category's own novelIds (without merged subcategory novelIds) */
  originalNovelIds?: number[];
};
export type UseLibraryReturnType = {
  library: NovelInfo[];
  /** All categories from DB (root + sub) */
  allCategories: ExtendedCategory[];
  /** Display categories: root categories with merged subcategory novelIds */
  categories: ExtendedCategory[];
  isLoading: boolean;
  setCategories: React.Dispatch<React.SetStateAction<ExtendedCategory[]>>;
  refreshCategories: () => Promise<void>;
  setLibrary: React.Dispatch<React.SetStateAction<NovelInfo[]>>;
  novelInLibrary: (pluginId: string, novelPath: string) => boolean;
  switchNovelToLibrary: (novelPath: string, pluginId: string) => Promise<void>;
  refetchLibrary: () => void;
  setLibrarySearchText: (text: string) => void;
  /** Subcategory filter */
  selectedSubCategoryIds: Set<number>;
  showAllSubCategories: boolean;
  toggleSubCategoryFilter: (subCategoryId: number) => void;
  toggleShowAllSubCategories: () => void;
  clearSubCategoryFilter: () => void;
  /** Get subcategories for a given parent category id */
  getSubCategoriesForParent: (parentId: number) => ExtendedCategory[];
};

export const useLibrary = (): UseLibraryReturnType => {
  const {
    filter,
    sortOrder = LibrarySortOrder.DateAdded_DESC,
    downloadedOnlyMode = false,
    defaultCategoryId = 0,
  } = useLibrarySettings();

  const [library, setLibrary] = useState<NovelInfo[]>([]);
  const [allCategories, setAllCategories] = useState<ExtendedCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const isDirtyRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  // Subcategory filter state
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<
    Set<number>
  >(new Set());
  const [showAllSubCategories, setShowAllSubCategories] = useState(true);

  const toggleSubCategoryFilter = useCallback((subCategoryId: number) => {
    setSelectedSubCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(subCategoryId)) {
        next.delete(subCategoryId);
      } else {
        next.add(subCategoryId);
      }
      return next;
    });
    // Selecting a specific subcategory disables "show all"
    setShowAllSubCategories(false);
  }, []);

  const toggleShowAllSubCategories = useCallback(() => {
    setShowAllSubCategories(prev => {
      if (!prev) {
        // Turning on "show all" clears specific subcategory selections
        setSelectedSubCategoryIds(new Set());
      }
      return !prev;
    });
  }, []);

  const clearSubCategoryFilter = useCallback(() => {
    setSelectedSubCategoryIds(new Set());
    setShowAllSubCategories(true);
  }, []);

  const refreshCategories = useCallback(async () => {
    const dbCategories = getCategoriesFromDb();

    const res = dbCategories.map(c => ({
      ...c,
      novelIds: (c.novelIds ?? '')
        .split(',')
        .map(Number)
        .filter(id => id !== 0),
    }));

    // Hide the system default category (id=1) if user has other root categories
    // and the default category has no novels
    const hasUserCategories = res.some(
      cat => cat.id !== 1 && cat.id !== 2 && cat.parentId == null,
    );
    const filteredCategories = res.filter(cat => {
      if (cat.id === 1) {
        return !hasUserCategories || cat.novelIds.length > 0;
      }
      return true;
    });

    setAllCategories(filteredCategories);
  }, []);

  /**
   * Compute display categories: only root categories (parentId === null),
   * with subcategory novel IDs merged into the parent.
   */
  const categories = useMemo(() => {
    const subsByParent = new Map<number, ExtendedCategory[]>();
    for (const cat of allCategories) {
      if (cat.parentId != null) {
        const subs = subsByParent.get(cat.parentId) || [];
        subs.push(cat);
        subsByParent.set(cat.parentId, subs);
      }
    }

    return allCategories
      .filter(cat => cat.parentId == null)
      .map(rootCat => {
        const subs = subsByParent.get(rootCat.id) || [];
        if (subs.length === 0) {
          return { ...rootCat, originalNovelIds: rootCat.novelIds };
        }
        // Merge subcategory novelIds into the root category
        const mergedIds = new Set(rootCat.novelIds);
        for (const sub of subs) {
          for (const id of sub.novelIds) {
            mergedIds.add(id);
          }
        }
        return {
          ...rootCat,
          originalNovelIds: rootCat.novelIds,
          novelIds: Array.from(mergedIds),
        };
      });
  }, [allCategories]);

  const setCategories = setAllCategories;

  const getSubCategoriesForParent = useCallback(
    (parentId: number) => {
      return allCategories.filter(cat => cat.parentId === parentId);
    },
    [allCategories],
  );

  const getLibrary = useCallback(async () => {
    if (searchText) {
      setIsLoading(true);
    }

    const [_, novels] = await Promise.all([
      refreshCategories(),
      getLibraryNovelsFromDb(sortOrder, filter, searchText, downloadedOnlyMode),
    ]);

    setLibrary(novels);
    setIsLoading(false);
    isDirtyRef.current = false;
  }, [downloadedOnlyMode, filter, refreshCategories, searchText, sortOrder]);

  // Mark library as dirty when filter/sort settings change
  useEffect(() => {
    if (!isInitialLoadRef.current) {
      isDirtyRef.current = true;
    }
    isInitialLoadRef.current = false;
  }, [filter, sortOrder, downloadedOnlyMode, searchText]);

  const libraryLookup = useMemo(() => {
    const set = new Set<string>();
    for (const novel of library) {
      set.add(`${novel.pluginId}::${novel.path}`);
    }
    return set;
  }, [library]);

  const novelInLibrary = useCallback(
    (pluginId: string, novelPath: string) =>
      libraryLookup.has(`${pluginId}::${novelPath}`),
    [libraryLookup],
  );

  const switchNovelToLibrary = useCallback(
    async (novelPath: string, pluginId: string) => {
      await switchNovelToLibraryQuery(novelPath, pluginId, defaultCategoryId);

      // Important to get correct chapters count
      // Count is set by sql trigger
      await refreshCategories();
      const novels = await getLibraryNovelsFromDb(
        sortOrder,
        filter,
        searchText,
        downloadedOnlyMode,
      );

      setLibrary(novels);
    },
    [
      defaultCategoryId,
      downloadedOnlyMode,
      filter,
      refreshCategories,
      searchText,
      sortOrder,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      // Always refresh categories on focus to pick up changes from other screens
      // (e.g. adding/removing subcategories). getCategoriesFromDb() is synchronous
      // and very fast, so there's no performance concern.
      refreshCategories();
      if (isDirtyRef.current) {
        getLibrary();
      }
    }, [refreshCategories, getLibrary]),
  );

  const [taskQueue] = useMMKVObject<
    Array<BackgroundTask | QueuedBackgroundTask>
  >(ServiceManager.manager.STORE_KEY);
  const restoreTasksCount = useMemo(
    () =>
      taskQueue?.filter(t => {
        /**
         * Handle backward compatibility: check for new format first, then old format
         */
        const taskName =
          (t as QueuedBackgroundTask)?.task?.name ||
          (t as BackgroundTask)?.name;
        return (
          taskName === 'LOCAL_RESTORE' ||
          taskName === 'DRIVE_RESTORE' ||
          taskName === 'SELF_HOST_RESTORE'
        );
      }).length || 0,
    [taskQueue],
  );
  const prevRestoreTasksCountRef = useRef(restoreTasksCount);

  useEffect(() => {
    if (prevRestoreTasksCountRef.current > 0 && restoreTasksCount === 0) {
      isDirtyRef.current = true;
      getLibrary();
    }
    prevRestoreTasksCountRef.current = restoreTasksCount;
  }, [getLibrary, restoreTasksCount]);

  return {
    library,
    allCategories,
    categories,
    isLoading,
    setLibrary,
    setCategories,
    refreshCategories,
    novelInLibrary,
    switchNovelToLibrary,
    refetchLibrary: () => {
      isDirtyRef.current = true;
      getLibrary();
    },
    setLibrarySearchText: (text: string) => {
      isDirtyRef.current = true;
      setSearchText(text);
    },
    selectedSubCategoryIds,
    showAllSubCategories,
    toggleSubCategoryFilter,
    toggleShowAllSubCategories,
    clearSubCategoryFilter,
    getSubCategoriesForParent,
  };
};

export const useLibraryNovels = () => {
  const [library, setLibrary] = useState<NovelInfo[]>([]);

  const getLibrary = async () => {
    const novels = await getLibraryNovelsFromDb();

    setLibrary(novels);
  };

  useFocusEffect(
    useCallback(() => {
      getLibrary();
    }, []),
  );

  return { library, setLibrary };
};
