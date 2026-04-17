import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useNovel } from '@hooks/persisted';
import { RouteProp } from '@react-navigation/native';
import { ReaderStackParamList } from '@navigators/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeviceOrientation } from '@hooks/index';

/**
 * A simple LRU map that evicts the oldest entry when the max size is reached.
 * Used to cap the in-memory chapter text cache so image-heavy novels don't
 * accumulate unbounded memory.
 */
class LRUMap<K, V> extends Map<K, V> {
  private maxSize: number;
  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }
  get(key: K): V | undefined {
    if (!super.has(key)) {
      return undefined;
    }
    // Move accessed key to end (most recent)
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key);
    } else if (super.size >= this.maxSize) {
      // Evict oldest (first) entry
      const oldest = super.keys().next().value;
      if (oldest !== undefined) {
        super.delete(oldest);
      }
    }
    super.set(key, value);
    return this;
  }
}

type NovelContextType = ReturnType<typeof useNovel> & {
  navigationBarHeight: number;
  statusBarHeight: number;
  chapterTextCache: Map<number, string | Promise<string>>;
};

const defaultValue = {} as NovelContextType;

const NovelContext = createContext<NovelContextType>(defaultValue);

export function NovelContextProvider({
  children,

  route,
}: {
  children: React.JSX.Element;

  route:
    | RouteProp<ReaderStackParamList, 'Novel'>
    | RouteProp<ReaderStackParamList, 'Chapter'>;
}) {
  const { path, pluginId } =
    'novel' in route.params ? route.params.novel : route.params;

  const novelHookContent = useNovel(
    'id' in route.params ? route.params : path,
    pluginId,
  );

  const { bottom, top } = useSafeAreaInsets();
  const orientation = useDeviceOrientation();
  const NavigationBarHeight = useRef(bottom);
  const StatusBarHeight = useRef(top);
  // Cap at 5 chapters to prevent unbounded memory growth on image-heavy novels
  const chapterTextCache = useRef<Map<number, string | Promise<string>>>(
    new LRUMap<number, string | Promise<string>>(5),
  );

  if (bottom < NavigationBarHeight.current && orientation === 'landscape') {
    NavigationBarHeight.current = bottom;
  } else if (bottom > NavigationBarHeight.current) {
    NavigationBarHeight.current = bottom;
  }
  if (top > StatusBarHeight.current) {
    StatusBarHeight.current = top;
  }
  const contextValue = useMemo(
    () => ({
      ...novelHookContent,
      navigationBarHeight: NavigationBarHeight.current,
      statusBarHeight: StatusBarHeight.current,
      chapterTextCache: chapterTextCache.current,
    }),
    [novelHookContent],
  );
  return (
    <NovelContext.Provider value={contextValue}>
      {children}
    </NovelContext.Provider>
  );
}

export const useNovelContext = () => {
  const context = useContext(NovelContext);
  return context;
};
