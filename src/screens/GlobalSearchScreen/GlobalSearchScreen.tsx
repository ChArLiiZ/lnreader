import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, ProgressBar } from 'react-native-paper';

import {
  EmptyView,
  SafeAreaView,
  SearchbarV2,
  SelectableChip,
} from '@components/index';
import GlobalSearchResultsList from './components/GlobalSearchResultsList';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';

import { getString } from '@strings/translations';
import { useGlobalSearch } from './hooks/useGlobalSearch';
import { useMMKVString } from 'react-native-mmkv';

const SEARCH_HISTORY_KEY = 'GLOBAL_SEARCH_HISTORY';
const MAX_HISTORY = 10;

function useSearchHistory() {
  const [raw, setRaw] = useMMKVString(SEARCH_HISTORY_KEY);

  const history: string[] = raw ? JSON.parse(raw) : [];

  const addToHistory = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) {
        return;
      }
      const prev: string[] = raw ? JSON.parse(raw) : [];
      const filtered = prev.filter(h => h !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      setRaw(JSON.stringify(updated));
    },
    [raw, setRaw],
  );

  const removeFromHistory = useCallback(
    (term: string) => {
      const prev: string[] = raw ? JSON.parse(raw) : [];
      setRaw(JSON.stringify(prev.filter(h => h !== term)));
    },
    [raw, setRaw],
  );

  const clearHistory = useCallback(() => setRaw('[]'), [setRaw]);

  return { history, addToHistory, removeFromHistory, clearHistory };
}

interface Props {
  route?: {
    params?: {
      searchText?: string;
    };
  };
}

const GlobalSearchScreen = (props: Props) => {
  const theme = useTheme();
  const { searchText, setSearchText, clearSearchbar } = useSearch(
    props?.route?.params?.searchText,
    false,
  );
  const { history, addToHistory, removeFromHistory } = useSearchHistory();

  const onChangeText = (text: string) => setSearchText(text);

  const [hasResultsOnly, setHasResultsOnly] = useState(false);

  const { searchResults, progress } = useGlobalSearch({
    defaultSearchText: searchText,
    hasResultsOnly,
    onSearchTriggered: addToHistory,
  });

  const showHistory = !searchText && progress === 0 && history.length > 0;

  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('browseScreen.globalSearch')}
        leftIcon="magnify"
        onChangeText={onChangeText}
        clearSearchbar={clearSearchbar}
        theme={theme}
      />
      {progress ? (
        <ProgressBar
          color={theme.primary}
          progress={Math.round(1000 * progress) / 1000}
        />
      ) : null}
      {progress > 0 ? (
        <View style={styles.filterContainer}>
          <SelectableChip
            label={getString('globalSearch.hasResults')}
            selected={hasResultsOnly}
            icon="filter-variant"
            showCheckIcon={false}
            theme={theme}
            onPress={() => setHasResultsOnly(!hasResultsOnly)}
            mode="outlined"
          />
        </View>
      ) : null}
      {showHistory ? (
        <View style={styles.historyContainer}>
          {history.map(term => (
            <Chip
              key={term}
              style={[styles.historyChip, { backgroundColor: theme.surface2 }]}
              textStyle={{ color: theme.onSurface }}
              closeIconAccessibilityLabel="Remove"
              onPress={() => setSearchText(term)}
              onClose={() => removeFromHistory(term)}
            >
              {term}
            </Chip>
          ))}
        </View>
      ) : null}
      <GlobalSearchResultsList
        searchResults={searchResults}
        ListEmptyComponent={
          showHistory ? undefined : (
            <EmptyView
              icon="__φ(．．)"
              description={`${getString('globalSearch.searchIn')} ${getString(
                'globalSearch.allSources',
              )}`}
              theme={theme}
            />
          )
        }
      />
    </SafeAreaView>
  );
};

export default GlobalSearchScreen;

const styles = StyleSheet.create({
  filterContainer: {
    paddingHorizontal: 8,
    paddingTop: 16,
    flexDirection: 'row',
  },
  historyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  historyChip: {
    marginBottom: 4,
  },
});
