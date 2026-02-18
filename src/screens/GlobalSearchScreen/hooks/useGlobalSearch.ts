import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash-es';

import { NovelItem, PluginItem } from '@plugins/types';
import { getPlugin } from '@plugins/pluginManager';
import { useBrowseSettings, usePlugins } from '@hooks/persisted';
import { useFocusEffect } from '@react-navigation/native';

interface Props {
  defaultSearchText?: string;
  hasResultsOnly?: boolean;
  onSearchTriggered?: (searchText: string) => void;
}

export interface GlobalSearchResult {
  isLoading: boolean;
  plugin: PluginItem;
  novels: NovelItem[];
  error?: string | null;
}

export const useGlobalSearch = ({
  defaultSearchText,
  hasResultsOnly = false,
  onSearchTriggered,
}: Props) => {
  const isMounted = useRef(true); //if user closes the search screen, cancel the search
  const isFocused = useRef(true); //if the user opens a sub-screen (e.g. novel screen), pause the search
  const lastSearch = useRef(''); //if the user changes search, cancel running searches
  const activeSearchToken = useRef(0);
  useEffect(
    () => () => {
      isMounted.current = false;
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;

      return () => (isFocused.current = false);
    }, []),
  );

  const { filteredInstalledPlugins } = usePlugins();

  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [progress, setProgress] = useState(0);

  const { globalSearchConcurrency = 1 } = useBrowseSettings();

  const globalSearch = useCallback(
    (searchText: string) => {
      if (lastSearch.current === searchText) {
        return;
      }
      const searchToken = ++activeSearchToken.current;
      lastSearch.current = searchText;
      onSearchTriggered?.(searchText);
      const defaultResult: GlobalSearchResult[] = filteredInstalledPlugins.map(
        plugin => ({
          isLoading: true,
          plugin,
          novels: [],
          error: null,
        }),
      );

      setSearchResults(defaultResult.sort(novelResultSorter));
      setProgress(0);

      async function searchInPlugin(_plugin: PluginItem) {
        if (
          !isMounted.current ||
          searchToken !== activeSearchToken.current ||
          lastSearch.current !== searchText
        ) {
          return;
        }

        try {
          const plugin = getPlugin(_plugin.id);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${_plugin.id}`);
          }
          const res = await plugin.searchNovels(searchText, 1);
          if (
            !isMounted.current ||
            searchToken !== activeSearchToken.current ||
            lastSearch.current !== searchText
          ) {
            return;
          }

          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === plugin.id
                  ? { ...prevResult, novels: res, isLoading: false }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        } catch (error: any) {
          if (
            !isMounted.current ||
            searchToken !== activeSearchToken.current ||
            lastSearch.current !== searchText
          ) {
            return;
          }
          const errorMessage = error?.message || String(error);
          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === _plugin.id
                  ? {
                      ...prevResult,
                      novels: [],
                      isLoading: false,
                      error: errorMessage,
                    }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        }
      }

      //Sort so we load the plugins results in the same order as they show on the list
      const filteredSortedInstalledPlugins = [...filteredInstalledPlugins].sort(
        (a, b) => a.name.localeCompare(b.name),
      );
      const totalPlugins = filteredSortedInstalledPlugins.length;
      const step = totalPlugins > 0 ? 1 / totalPlugins : 0;
      const concurrency = Math.max(1, globalSearchConcurrency);

      const waitUntilFocused = async () => {
        while (
          isMounted.current &&
          searchToken === activeSearchToken.current &&
          lastSearch.current === searchText &&
          !isFocused.current
        ) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      };

      (async () => {
        let nextPluginIndex = 0;

        const worker = async () => {
          while (true) {
            if (
              !isMounted.current ||
              searchToken !== activeSearchToken.current ||
              lastSearch.current !== searchText
            ) {
              return;
            }

            await waitUntilFocused();
            if (
              !isMounted.current ||
              searchToken !== activeSearchToken.current ||
              lastSearch.current !== searchText
            ) {
              return;
            }

            const plugin = filteredSortedInstalledPlugins[nextPluginIndex];
            nextPluginIndex += 1;
            if (!plugin) {
              return;
            }

            await searchInPlugin(plugin);

            if (
              isMounted.current &&
              searchToken === activeSearchToken.current &&
              lastSearch.current === searchText
            ) {
              setProgress(prevState => prevState + step);
            }
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(concurrency, totalPlugins || 1) }, () =>
            worker(),
          ),
        );
      })();
    },
    [filteredInstalledPlugins, globalSearchConcurrency, onSearchTriggered],
  );

  const debouncedGlobalSearch = useMemo(
    () => debounce(globalSearch, 300),
    [globalSearch],
  );

  useEffect(() => {
    if (defaultSearchText) {
      debouncedGlobalSearch(defaultSearchText);
    }

    return () => {
      debouncedGlobalSearch.cancel();
    };
  }, [defaultSearchText, debouncedGlobalSearch]);

  const filteredSearchResults = useMemo(() => {
    if (!hasResultsOnly) {
      return searchResults;
    }
    return searchResults.filter(
      result => !result.isLoading && !result.error && result.novels.length > 0,
    );
  }, [searchResults, hasResultsOnly]);

  return { searchResults: filteredSearchResults, globalSearch, progress };
};

function novelResultSorter(
  { novels: a, plugin: { name: aName } }: GlobalSearchResult,
  { novels: b, plugin: { name: bName } }: GlobalSearchResult,
) {
  if (!a.length && !b.length) {
    return aName.localeCompare(bName);
  }
  if (!a.length) {
    return 1;
  }
  if (!b.length) {
    return -1;
  }

  return aName.localeCompare(bName);
}
