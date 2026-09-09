import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';

import ReaderAppbar from './components/ReaderAppbar';
import ReaderFooter from './components/ReaderFooter';

import WebViewReader from './components/WebViewReader';
import ReaderBottomSheetV2 from './components/ReaderBottomSheet/ReaderBottomSheet';
import ChapterDrawer from './components/ChapterDrawer';
import ChapterLoadingScreen from './ChapterLoadingScreen/ChapterLoadingScreen';
import { ErrorScreenV2 } from '@components';
import { ChapterScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import KeepScreenAwake from './components/KeepScreenAwake';
import { ChapterContextProvider, useChapterContext } from './ChapterContext';
import { EMPTY_READER_SEARCH_RESULT, ReaderSearchResult } from './types';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useBackHandler } from '@hooks/index';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keyboard, StyleSheet, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';

const Chapter = ({ route, navigation }: ChapterScreenProps) => {
  const [open, setOpen] = useState(false);

  useBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }
    return false;
  });

  const openDrawer = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <ChapterContextProvider
      novel={route.params.novel}
      initialChapter={route.params.chapter}
    >
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        renderDrawerContent={() => <ChapterDrawer />}
        drawerStyle={styles.drawer}
      >
        <ChapterContent
          route={route}
          navigation={navigation}
          openDrawer={openDrawer}
        />
      </Drawer>
    </ChapterContextProvider>
  );
};

type ChapterContentProps = ChapterScreenProps & {
  openDrawer: () => void;
};

export const ChapterContent = ({
  navigation,
  openDrawer,
}: ChapterContentProps) => {
  const { left, right } = useSafeAreaInsets();
  const { novel, chapter } = useChapterContext();
  const readerSheetRef = useRef<BottomSheetModalMethods>(null);
  const theme = useTheme();
  const { pageReader = false, keepScreenOn } = useChapterGeneralSettings();
  const [bookmarked, setBookmarked] = useState(chapter.bookmark);

  useEffect(() => {
    setBookmarked(chapter.bookmark);
  }, [chapter]);

  const { hidden, loading, error, webViewRef, hideHeader, refetch } =
    useChapterContext();

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchResult, setSearchResult] = useState<ReaderSearchResult>(
    EMPTY_READER_SEARCH_RESULT,
  );
  const [searchText, setSearchTextState] = useState('');
  const searchTextRef = useRef('');

  const setSearchText = useCallback((text: string) => {
    searchTextRef.current = text;
    setSearchTextState(text);
  }, []);

  const resetSearchResult = useCallback(() => {
    setSearchResult(EMPTY_READER_SEARCH_RESULT);
  }, []);

  const resetSearch = useCallback(() => {
    setSearchText('');
    resetSearchResult();
  }, [resetSearchResult, setSearchText]);

  // Back closes the search bar before it leaves the chapter.
  useBackHandler(
    useCallback(() => {
      if (searchVisible) {
        setSearchVisible(false);
        return true;
      }
      return false;
    }, [searchVisible]),
  );

  useEffect(() => {
    setSearchVisible(false);
    resetSearch();
  }, [chapter.id, resetSearch]);

  useEffect(() => {
    if (hidden) {
      setSearchVisible(false);
    }
  }, [hidden]);

  // Keep the webview's own "controls hidden" state in step, so tapping the
  // page while searching does not fight the search bar for the tap.
  useEffect(() => {
    if (hidden) {
      return;
    }
    webViewRef.current?.injectJavaScript(`
      if (window.reader?.hidden) {
        window.reader.hidden.val = ${searchVisible ? 'true' : 'false'};
      }
      true;
    `);
  }, [hidden, searchVisible, webViewRef]);

  const handleReaderPress = useCallback(() => {
    if (searchVisible) {
      setSearchVisible(false);
      Keyboard.dismiss();
      return;
    }
    hideHeader();
  }, [hideHeader, searchVisible]);

  const scrollToStart = () =>
    requestAnimationFrame(() => {
      webViewRef?.current?.injectJavaScript(
        !pageReader
          ? `(()=>{
                window.scrollTo({top:0,behavior:'smooth'})
              })()`
          : `(()=>{
              document.querySelector('chapter').setAttribute('data-page',0);
              document.querySelector("chapter").style.transform = 'translate(0%)';
            })()`,
      );
    });

  const openDrawerI = useCallback(() => {
    openDrawer();
    hideHeader();
  }, [hideHeader, openDrawer]);

  if (error) {
    return (
      <ErrorScreenV2
        error={error}
        actions={[
          {
            iconName: 'refresh',
            title: getString('common.retry'),
            onPress: refetch,
          },
          {
            iconName: 'earth',
            title: 'WebView',
            onPress: () =>
              navigation.navigate('WebviewScreen', {
                name: novel.name,
                url: chapter.path,
                pluginId: novel.pluginId,
              }),
          },
        ]}
      />
    );
  }
  return (
    <View style={[{ paddingStart: left, paddingEnd: right }, styles.container]}>
      {keepScreenOn ? <KeepScreenAwake /> : null}
      {loading ? (
        <ChapterLoadingScreen />
      ) : (
        <WebViewReader
          onPress={handleReaderPress}
          searchTextRef={searchTextRef}
          onSearchResult={setSearchResult}
        />
      )}
      <ReaderBottomSheetV2 bottomSheetRef={readerSheetRef} />
      {!hidden ? (
        <>
          <ReaderAppbar
            goBack={navigation.goBack}
            theme={theme}
            bookmarked={bookmarked}
            setBookmarked={setBookmarked}
            searchVisible={searchVisible}
            setSearchVisible={setSearchVisible}
            searchText={searchText}
            setSearchText={setSearchText}
            searchResult={searchResult}
            resetSearchResult={resetSearchResult}
            resetSearch={resetSearch}
          />
          <ReaderFooter
            readerSheetRef={readerSheetRef}
            scrollToStart={scrollToStart}
            navigation={navigation}
            openDrawer={openDrawerI}
          />
        </>
      ) : null}
    </View>
  );
};

export default Chapter;

const styles = StyleSheet.create({
  container: { flex: 1 },
  // The drawer's own white backing showed as a seam beside the chapter list.
  drawer: { backgroundColor: 'transparent' },
});
