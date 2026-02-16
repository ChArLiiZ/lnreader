import React, { createContext, useContext, useMemo } from 'react';
import {
  useLibrary,
  UseLibraryReturnType,
  ExtendedCategory,
} from '@screens/library/hooks/useLibrary';
import { useLibrarySettings } from '@hooks/persisted';
import { LibrarySettings } from '@hooks/persisted/useSettings';
import { NovelInfo } from '@database/types';

// --- Data Context (frequently changing) ---

type LibraryDataContextType = {
  library: NovelInfo[];
  allCategories: ExtendedCategory[];
  categories: ExtendedCategory[];
  isLoading: boolean;
  selectedSubCategoryIds: Set<number>;
  showAllSubCategories: boolean;
};

const LibraryDataContext = createContext<LibraryDataContextType>(
  {} as LibraryDataContextType,
);

// --- Actions Context (stable references) ---

type LibraryActionsContextType = {
  setLibrary: React.Dispatch<React.SetStateAction<NovelInfo[]>>;
  setCategories: React.Dispatch<React.SetStateAction<ExtendedCategory[]>>;
  refreshCategories: () => Promise<void>;
  novelInLibrary: (pluginId: string, novelPath: string) => boolean;
  switchNovelToLibrary: (novelPath: string, pluginId: string) => Promise<void>;
  refetchLibrary: () => void;
  setLibrarySearchText: (text: string) => void;
  toggleSubCategoryFilter: (subCategoryId: number) => void;
  toggleShowAllSubCategories: () => void;
  clearSubCategoryFilter: () => void;
  getSubCategoriesForParent: (parentId: number) => ExtendedCategory[];
};

const LibraryActionsContext = createContext<LibraryActionsContextType>(
  {} as LibraryActionsContextType,
);

// --- Settings Context ---

type LibrarySettingsContextType = {
  settings: LibrarySettings;
};

const LibrarySettingsContext = createContext<LibrarySettingsContextType>(
  {} as LibrarySettingsContextType,
);

// --- Provider ---

export function LibraryContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    library,
    allCategories,
    categories,
    isLoading,
    selectedSubCategoryIds,
    showAllSubCategories,
    setLibrary,
    setCategories,
    refreshCategories,
    novelInLibrary,
    switchNovelToLibrary,
    refetchLibrary,
    setLibrarySearchText,
    toggleSubCategoryFilter,
    toggleShowAllSubCategories,
    clearSubCategoryFilter,
    getSubCategoriesForParent,
  } = useLibrary();
  const settings = useLibrarySettings();

  const dataValue = useMemo(
    () => ({
      library,
      allCategories,
      categories,
      isLoading,
      selectedSubCategoryIds,
      showAllSubCategories,
    }),
    [
      library,
      allCategories,
      categories,
      isLoading,
      selectedSubCategoryIds,
      showAllSubCategories,
    ],
  );

  const actionsValue = useMemo(
    () => ({
      setLibrary,
      setCategories,
      refreshCategories,
      novelInLibrary,
      switchNovelToLibrary,
      refetchLibrary,
      setLibrarySearchText,
      toggleSubCategoryFilter,
      toggleShowAllSubCategories,
      clearSubCategoryFilter,
      getSubCategoriesForParent,
    }),
    [
      setLibrary,
      setCategories,
      refreshCategories,
      novelInLibrary,
      switchNovelToLibrary,
      refetchLibrary,
      setLibrarySearchText,
      toggleSubCategoryFilter,
      toggleShowAllSubCategories,
      clearSubCategoryFilter,
      getSubCategoriesForParent,
    ],
  );

  const settingsValue = useMemo(() => ({ settings }), [settings]);

  return (
    <LibrarySettingsContext.Provider value={settingsValue}>
      <LibraryActionsContext.Provider value={actionsValue}>
        <LibraryDataContext.Provider value={dataValue}>
          {children}
        </LibraryDataContext.Provider>
      </LibraryActionsContext.Provider>
    </LibrarySettingsContext.Provider>
  );
}

// --- Hooks ---

export const useLibraryData = (): LibraryDataContextType =>
  useContext(LibraryDataContext);

export const useLibraryActions = (): LibraryActionsContextType =>
  useContext(LibraryActionsContext);

export const useLibrarySettingsContext = (): LibrarySettingsContextType =>
  useContext(LibrarySettingsContext);

/**
 * @deprecated Use useLibraryData, useLibraryActions, or useLibrarySettingsContext instead.
 * This is kept for backward compatibility during migration.
 */
export const useLibraryContext = (): UseLibraryReturnType & {
  settings: LibrarySettings;
} => {
  const data = useLibraryData();
  const actions = useLibraryActions();
  const { settings } = useLibrarySettingsContext();
  return { ...data, ...actions, settings };
};
