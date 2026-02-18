import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { NovelItem } from '@plugins/types';
import { debounce } from 'lodash-es';

import { getPlugin } from '@plugins/pluginManager';
import { FilterToValues, Filters } from '@plugins/types/filterTypes';
import { classifyError, getErrorMessage } from '@utils/error';

export const useBrowseSource = (
  pluginId: string,
  showLatestNovels?: boolean,
) => {
  const [isLoading, setIsLoading] = useState(true);
  const [novels, setNovels] = useState<NovelItem[]>([]);
  const [error, setError] = useState<string>();

  const [currentPage, setCurrentPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Filters | undefined>(
    getPlugin(pluginId)?.filters,
  );
  const [selectedFilters, setSelectedFilters] = useState<
    FilterToValues<Filters> | undefined
  >(filterValues);
  const [hasNextPage, setHasNextPage] = useState(true);

  const isScreenMounted = useRef(true);
  const tagCacheRef = useRef<Record<string, string>>({});
  const inFlightTagPathsRef = useRef<Set<string>>(new Set());

  const enrichEsjTags = useCallback(
    async (sourceNovels: NovelItem[]) => {
      if (pluginId !== 'esjzone') return;
      const plugin = getPlugin(pluginId);
      if (!plugin?.parseNovel) return;

      const targets = sourceNovels
        .filter(novel => {
          if (!novel.path) return false;
          if (novel.genres) return false;
          if (tagCacheRef.current[novel.path]) return false;
          if (inFlightTagPathsRef.current.has(novel.path)) return false;
          return true;
        })
        .slice(0, 12);

      if (targets.length === 0) return;

      const queue = [...targets];
      const workerCount = Math.min(3, queue.length);
      const worker = async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;

          inFlightTagPathsRef.current.add(next.path);
          try {
            const parsed = await plugin.parseNovel(next.path);
            const genres = parsed?.genres?.trim();
            if (genres) {
              tagCacheRef.current[next.path] = genres;
              if (isScreenMounted.current) {
                setNovels(prev =>
                  prev.map(item =>
                    item.path === next.path ? { ...item, genres } : item,
                  ),
                );
              }
            }
          } catch {
            // Silently ignore tag-enrichment errors.
          } finally {
            inFlightTagPathsRef.current.delete(next.path);
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    },
    [pluginId],
  );

  const fetchNovels = useCallback(
    async (page: number, filters?: FilterToValues<Filters>) => {
      if (isScreenMounted.current === true) {
        try {
          const plugin = getPlugin(pluginId);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
          }
          await plugin
            .popularNovels(page, {
              showLatestNovels,
              filters,
            })
            .then(res => {
              const withCachedTags = res.map(item => {
                const cached = tagCacheRef.current[item.path];
                return cached ? { ...item, genres: cached } : item;
              });
              setNovels(prevState =>
                page === 1 ? withCachedTags : [...prevState, ...withCachedTags],
              );
              if (!res.length) {
                setHasNextPage(false);
              }
              enrichEsjTags(withCachedTags).catch(() => {
                // Ignore background tag enrichment errors.
              });
            })
            .catch((e: unknown) => {
              setError(classifyError(e, pluginId).message);
              setHasNextPage(false);
            });
          setFilterValues(plugin.filters);
        } catch (err: unknown) {
          setError(getErrorMessage(classifyError(err, pluginId)));
        } finally {
          setIsLoading(false);
        }
      }
    },
    [enrichEsjTags, pluginId, showLatestNovels],
  );

  const fetchNextPage = () => {
    if (hasNextPage) setCurrentPage(prevState => prevState + 1);
  };

  /**
   * On screen unmount
   */
  useEffect(() => {
    return () => {
      isScreenMounted.current = false;
    };
  }, []);

  useEffect(() => {
    fetchNovels(currentPage, selectedFilters);
  }, [fetchNovels, currentPage, selectedFilters]);

  const refetchNovels = () => {
    setError('');
    setIsLoading(true);
    setNovels([]);
    setHasNextPage(true);
    setCurrentPage(1);
    fetchNovels(1, selectedFilters);
  };

  const clearFilters = useCallback((filters: Filters) => {
    setError('');
    setIsLoading(true);
    setNovels([]);
    setHasNextPage(true);
    setCurrentPage(1);
    setSelectedFilters({ ...filters });
  }, []);

  const setFilters = (filters?: FilterToValues<Filters>) => {
    setError('');
    setIsLoading(true);
    setNovels([]);
    setHasNextPage(true);
    setCurrentPage(1);
    setSelectedFilters(filters ? { ...filters } : filters);
  };

  return {
    isLoading,
    novels,
    hasNextPage,
    fetchNextPage,
    error,
    filterValues,
    setFilters,
    clearFilters,
    refetchNovels,
  };
};

export const useSearchSource = (pluginId: string) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NovelItem[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [hasNextSearchPage, setHasNextSearchPage] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');

  const isScreenMounted = useRef(true);

  const fetchNovels = useCallback(
    async (localSearchText: string, page: number) => {
      if (isScreenMounted.current === true) {
        try {
          const plugin = getPlugin(pluginId);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
          }
          const res = await plugin.searchNovels(localSearchText, page);
          setSearchResults(prevState =>
            page === 1 ? res : [...prevState, ...res],
          );
          if (!res.length) {
            setHasNextSearchPage(false);
          }
        } catch (err: unknown) {
          setSearchError(`${err}`);
          setHasNextSearchPage(false);
        } finally {
          setIsSearching(false);
        }
      }
    },
    [pluginId],
  );

  // Debounce search requests to avoid excessive API calls
  const debouncedFetchNovels = useMemo(
    () => debounce(fetchNovels, 300),
    [fetchNovels],
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedFetchNovels.cancel();
    };
  }, [debouncedFetchNovels]);

  const searchSource = (searchTerm: string) => {
    setSearchResults([]);
    setHasNextSearchPage(true);
    setCurrentPage(1);
    setSearchText(searchTerm);
    setIsSearching(true);
  };

  /**
   * On screen unmount
   */
  useEffect(() => {
    return () => {
      isScreenMounted.current = false;
    };
  }, []);

  const searchNextPage = () => {
    if (hasNextSearchPage) setCurrentPage(prevState => prevState + 1);
  };

  useEffect(() => {
    if (searchText) {
      debouncedFetchNovels(searchText, currentPage);
    }
  }, [currentPage, debouncedFetchNovels, searchText]);

  const clearSearchResults = useCallback(() => {
    debouncedFetchNovels.cancel();
    setSearchText('');
    setSearchResults([]);
    setCurrentPage(1);
    setHasNextSearchPage(true);
  }, [debouncedFetchNovels]);

  return {
    isSearching,
    searchResults,
    hasNextSearchPage,
    searchNextPage,
    searchSource,
    clearSearchResults,
    searchError,
  };
};
