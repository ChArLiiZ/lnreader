import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  NavigationState,
  SceneRendererProps,
  TabBar,
  TabView,
} from 'react-native-tab-view';
import Color from 'color';

import { SearchbarV2, Button, SafeAreaView } from '@components/index';
import { LibraryView } from './components/LibraryListView';
import LibraryBottomSheet from './components/LibraryBottomSheet/LibraryBottomSheet';
import { Banner } from './components/Banner';
import { Actionbar } from '@components/Actionbar/Actionbar';

import {
  useAppSettings,
  useHistory,
  useLibrarySettings,
  useTheme,
} from '@hooks/persisted';
import { useSearch, useBackHandler, useBoolean } from '@hooks';
import { getString } from '@strings/translations';
import { LibrarySortOrder, sortNovelsByOrder } from './constants/constants';
import { FAB, IconButton, Menu, Portal } from 'react-native-paper';
import {
  markAllChaptersRead,
  markAllChaptersUnread,
} from '@database/queries/ChapterQueries';
import { removeNovelsFromLibrary } from '@database/queries/NovelQueries';
import SetCategoryModal from '@screens/novel/components/SetCategoriesModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SourceScreenSkeletonLoading from '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading';
import { Row } from '@components/Common';
import { LibraryScreenProps } from '@navigators/types';
import { NovelInfo } from '@database/types';
import * as DocumentPicker from 'expo-document-picker';
import ServiceManager from '@services/ServiceManager';
import useImport from '@hooks/persisted/useImport';
import { ThemeColors } from '@theme/types';
import { useLibraryContext } from '@components/Context/LibraryContext';
import { xor } from 'lodash-es';
import { SelectionContext } from './SelectionContext';
import { ExtendedCategory } from './hooks/useLibrary';

type State = NavigationState<{
  key: string;
  title: string;
}>;

type TabViewLabelProps = {
  route: {
    id: number;
    name: string;
    sort: number;
    novelIds: number[];
    key: string;
    title: string;
    parentId: number | null;
  };
  labelText?: string;
  focused: boolean;
  color: string;
  allowFontScaling?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * Per-tab scene component. Each tab independently reads its own sort order
 * from MMKV, ensuring per-category sort is always correctly applied.
 */
interface LibraryTabSceneProps {
  route: {
    id: number;
    name: string;
    novelIds: number[];
    originalNovelIds?: number[];
    parentId: number | null;
  };
  library: NovelInfo[];
  allCategories: ExtendedCategory[];
  selectedSubCategoryIds: Set<number>;
  showAllSubCategories: boolean;
  searchText: string;
  isLoading: boolean;
  navigation: LibraryScreenProps['navigation'];
  pickAndImport: () => void;
}

const LibraryTabScene = React.memo(
  ({
    route,
    library,
    allCategories,
    selectedSubCategoryIds,
    showAllSubCategories,
    searchText,
    isLoading,
    navigation,
    pickAndImport,
  }: LibraryTabSceneProps) => {
    const theme = useTheme();
    const {
      sortOrder: globalSortOrder = LibrarySortOrder.DateAdded_DESC,
      categorySortOrders = {},
    } = useLibrarySettings();

    const novels = useMemo(() => {
      // 1. Filter by category/subcategory
      let novelIdSet: Set<number>;

      if (showAllSubCategories) {
        novelIdSet = new Set(route.novelIds);
      } else if (selectedSubCategoryIds.size > 0) {
        const subCatNovelIds = new Set<number>();
        for (const cat of allCategories) {
          if (selectedSubCategoryIds.has(cat.id)) {
            for (const nid of cat.novelIds) {
              subCatNovelIds.add(nid);
            }
          }
        }
        const parentIds = new Set(route.novelIds);
        novelIdSet = new Set(
          [...subCatNovelIds].filter(id => parentIds.has(id)),
        );
      } else {
        const allSubNovelIds = new Set<number>();
        for (const cat of allCategories) {
          if (cat.parentId === route.id) {
            for (const nid of cat.novelIds) {
              allSubNovelIds.add(nid);
            }
          }
        }
        const parentOwnIds = route.originalNovelIds ?? route.novelIds;
        novelIdSet = new Set(
          parentOwnIds.filter(id => !allSubNovelIds.has(id)),
        );
      }

      const filtered = library.filter(l => novelIdSet.has(l.id));

      // 2. Apply search
      const searchLower = searchText.toLowerCase();
      const searched = searchText
        ? filtered.filter(
            n =>
              n.name.toLowerCase().includes(searchLower) ||
              (n.author?.toLowerCase().includes(searchLower) ?? false),
          )
        : filtered;

      // 3. Always apply effective sort (per-category or global fallback)
      const effectiveSort =
        categorySortOrders[String(route.id)] || globalSortOrder;
      return sortNovelsByOrder(searched, effectiveSort);
    }, [
      route.id,
      route.novelIds,
      route.originalNovelIds,
      route.parentId,
      library,
      allCategories,
      selectedSubCategoryIds,
      showAllSubCategories,
      searchText,
      categorySortOrders,
      globalSortOrder,
    ]);

    if (isLoading) {
      return <SourceScreenSkeletonLoading theme={theme} />;
    }

    return (
      <>
        {searchText ? (
          <Button
            title={`${getString(
              'common.searchFor',
            )} "${searchText}" ${getString('common.globally')}`}
            style={sceneStyles.globalSearchBtn}
            onPress={() =>
              navigation.navigate('GlobalSearchScreen', {
                searchText,
              })
            }
          />
        ) : null}
        <LibraryView
          categoryId={route.id}
          categoryName={route.name}
          novels={novels}
          pickAndImport={pickAndImport}
          navigation={navigation}
        />
      </>
    );
  },
);

const sceneStyles = StyleSheet.create({
  globalSearchBtn: {
    margin: 16,
  },
});

const LibraryScreen = ({ navigation }: LibraryScreenProps) => {
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { left: leftInset, right: rightInset } = useSafeAreaInsets();
  const {
    library,
    categories,
    refetchLibrary,
    isLoading,
    selectedSubCategoryIds,
    showAllSubCategories,
    toggleSubCategoryFilter,
    toggleShowAllSubCategories,
    clearSubCategoryFilter,
    getSubCategoriesForParent,
    allCategories,
    settings: { showNumberOfNovels, downloadedOnlyMode, incognitoMode },
  } = useLibraryContext();

  const { importNovel } = useImport();
  const { useLibraryFAB = false } = useAppSettings();

  const { isLoading: isHistoryLoading, history, error } = useHistory();

  const layout = useWindowDimensions();

  const bottomSheetRef = useRef<BottomSheetModal | null>(null);

  const [index, setIndex] = useState(0);

  const {
    value: setCategoryModalVisible,
    setTrue: showSetCategoryModal,
    setFalse: closeSetCategoryModal,
  } = useBoolean();

  const [selectedNovelIds, setSelectedNovelIds] = useState<number[]>([]);

  const selectedIdsSet = useMemo(
    () => new Set(selectedNovelIds),
    [selectedNovelIds],
  );
  const hasSelection = selectedNovelIds.length > 0;

  const toggleSelection = useCallback(
    (id: number) => setSelectedNovelIds(prev => xor(prev, [id])),
    [],
  );

  const selectionContextValue = useMemo(
    () => ({
      selectedIdsSet,
      hasSelection,
      toggleSelection,
      setSelectedNovelIds,
    }),
    [selectedIdsSet, hasSelection, toggleSelection],
  );

  // Get novels for current category, applying subcategory filter
  const currentNovels = useMemo(() => {
    if (!categories.length) return [];
    const currentCategory = categories[index];
    if (!currentCategory) return [];

    let novelIdSet: Set<number>;

    if (showAllSubCategories) {
      // Show all novels in this parent category (including subcategories)
      novelIdSet = new Set(currentCategory.novelIds);
    } else if (selectedSubCategoryIds.size > 0) {
      // Filter: only show novels that belong to selected subcategories
      const subCatNovelIds = new Set<number>();
      for (const cat of allCategories) {
        if (selectedSubCategoryIds.has(cat.id)) {
          for (const nid of cat.novelIds) {
            subCatNovelIds.add(nid);
          }
        }
      }
      // Intersect with parent category's merged IDs
      const parentIds = new Set(currentCategory.novelIds);
      novelIdSet = new Set([...subCatNovelIds].filter(id => parentIds.has(id)));
    } else {
      // Nothing selected and showAll is false:
      // show only novels that belong to the parent category but NOT any subcategory
      const allSubNovelIds = new Set<number>();
      for (const cat of allCategories) {
        if (cat.parentId === currentCategory.id) {
          for (const nid of cat.novelIds) {
            allSubNovelIds.add(nid);
          }
        }
      }
      const parentOwnIds =
        currentCategory.originalNovelIds ?? currentCategory.novelIds;
      novelIdSet = new Set(parentOwnIds.filter(id => !allSubNovelIds.has(id)));
    }

    return library.filter(l => novelIdSet.has(l.id));
  }, [
    categories,
    index,
    library,
    selectedSubCategoryIds,
    showAllSubCategories,
    allCategories,
  ]);

  // Get subcategories for current tab
  const currentSubCategories = useMemo(() => {
    if (!categories.length || !categories[index]) return [];
    return getSubCategoriesForParent(categories[index].id);
  }, [categories, index, getSubCategoriesForParent]);

  // Reset subcategory filter and close menu when tab changes
  useEffect(() => {
    clearSubCategoryFilter();
    setSubFilterMenuVisible(false);
  }, [index, clearSubCategoryFilter]);

  // Subcategory filter menu state
  const [subFilterMenuVisible, setSubFilterMenuVisible] = useState(false);
  const filterDismissTimestampRef = useRef(0);

  useBackHandler(() => {
    if (selectedNovelIds.length) {
      setSelectedNovelIds([]);
      return true;
    }

    return false;
  });

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        if (navigation.isFocused()) {
          e.preventDefault();

          bottomSheetRef.current?.present?.();
        }
      }),
    [navigation],
  );

  const searchbarPlaceholder =
    selectedNovelIds.length === 0
      ? getString('libraryScreen.searchbar')
      : `${selectedNovelIds.length} selected`;

  const openRandom = useCallback(() => {
    const randomNovel =
      currentNovels[Math.floor(Math.random() * currentNovels.length)];
    if (randomNovel) {
      navigation.navigate('ReaderStack', {
        screen: 'Novel',
        params: randomNovel,
      });
    }
  }, [currentNovels, navigation]);

  const pickAndImport = useCallback(() => {
    DocumentPicker.getDocumentAsync({
      type: 'application/epub+zip',
      copyToCacheDirectory: false,
      multiple: true,
    }).then(importNovel);
  }, [importNovel]);

  const renderTabBar = useCallback(
    (props: SceneRendererProps & { navigationState: State }) => {
      return categories.length ? (
        <View style={styles.tabBarRow}>
          <View style={styles.tabBarFlex}>
            <TabBar
              {...props}
              scrollEnabled
              indicatorStyle={styles.tabBarIndicator}
              style={[
                {
                  backgroundColor: theme.surface,
                },
                styles.tabBar,
              ]}
              tabStyle={styles.tabStyle}
              gap={8}
              inactiveColor={theme.secondary}
              activeColor={theme.primary}
              android_ripple={{ color: theme.rippleColor }}
            />
          </View>
          {currentSubCategories.length > 0 && (
            <Menu
              visible={subFilterMenuVisible}
              onDismiss={() => {
                setSubFilterMenuVisible(false);
                filterDismissTimestampRef.current = Date.now();
              }}
              anchor={
                <IconButton
                  icon="filter-variant"
                  iconColor={
                    !showAllSubCategories
                      ? theme.primary
                      : theme.onSurfaceVariant
                  }
                  size={22}
                  onPress={() => {
                    if (Date.now() - filterDismissTimestampRef.current < 400) {
                      return;
                    }
                    setSubFilterMenuVisible(v => !v);
                  }}
                />
              }
              contentStyle={{ backgroundColor: theme.surface2 }}
            >
              <Menu.Item
                title={getString('categories.allSubCategories')}
                titleStyle={{
                  color: showAllSubCategories ? theme.primary : theme.onSurface,
                }}
                onPress={() => {
                  toggleShowAllSubCategories();
                }}
              />
              {currentSubCategories.map(sub => (
                <Menu.Item
                  key={sub.id}
                  title={sub.name}
                  titleStyle={{
                    color: selectedSubCategoryIds.has(sub.id)
                      ? theme.primary
                      : theme.onSurface,
                  }}
                  onPress={() => {
                    toggleSubCategoryFilter(sub.id);
                  }}
                />
              ))}
            </Menu>
          )}
        </View>
      ) : null;
    },
    [
      categories.length,
      currentSubCategories,
      subFilterMenuVisible,
      selectedSubCategoryIds,
      showAllSubCategories,
      toggleShowAllSubCategories,
      toggleSubCategoryFilter,
      styles.tabBar,
      styles.tabBarIndicator,
      styles.tabBarRow,
      styles.tabBarFlex,
      styles.tabStyle,
      theme,
    ],
  );
  const renderScene = useCallback(
    ({
      route,
    }: {
      route: {
        id: number;
        name: string;
        sort: number;
        novelIds: number[];
        originalNovelIds?: number[];
        key: string;
        title: string;
        parentId: number | null;
      };
    }) => (
      <LibraryTabScene
        route={route}
        library={library}
        allCategories={allCategories}
        selectedSubCategoryIds={selectedSubCategoryIds}
        showAllSubCategories={showAllSubCategories}
        searchText={searchText}
        isLoading={isLoading}
        navigation={navigation}
        pickAndImport={pickAndImport}
      />
    ),
    [
      allCategories,
      isLoading,
      library,
      navigation,
      pickAndImport,
      searchText,
      selectedSubCategoryIds,
      showAllSubCategories,
    ],
  );

  const renderLabel = useCallback(
    ({ route, color }: TabViewLabelProps) => {
      const novelIds = route?.novelIds?.filter(id => id !== 0);

      return (
        <Row>
          <Text style={[{ color }, styles.fontWeight500]}>{route.title}</Text>
          {showNumberOfNovels ? (
            <View
              style={[
                styles.badgeCtn,
                { backgroundColor: theme.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.badgetText, { color: theme.onSurfaceVariant }]}
              >
                {novelIds.length}
              </Text>
            </View>
          ) : null}
        </Row>
      );
    },
    [
      showNumberOfNovels,
      styles.badgeCtn,
      styles.badgetText,
      styles.fontWeight500,
      theme.onSurfaceVariant,
      theme.surfaceVariant,
    ],
  );

  const handleLeftIconPress = useCallback(() => {
    if (selectedNovelIds.length > 0) {
      setSelectedNovelIds([]);
    }
  }, [selectedNovelIds.length]);

  const rightIcons = useMemo(
    () =>
      selectedNovelIds.length
        ? [
            {
              iconName: 'select-all' as const,
              onPress: () =>
                setSelectedNovelIds(currentNovels.map(novel => novel.id)),
            },
          ]
        : [
            {
              iconName: 'filter-variant' as const,
              onPress: () => bottomSheetRef.current?.present(),
            },
          ],
    [selectedNovelIds.length, currentNovels],
  );

  const menuButtons = useMemo(
    () => [
      {
        title: getString('libraryScreen.extraMenu.updateLibrary'),
        onPress: () =>
          ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' }),
      },
      {
        title: getString('libraryScreen.extraMenu.updateCategory'),
        onPress: () =>
          categories[index]?.id !== 2 &&
          ServiceManager.manager.addTask({
            name: 'UPDATE_LIBRARY',
            data: {
              categoryId: categories[index].id,
              categoryName: categories[index].name,
            },
          }),
      },
      {
        title: getString('libraryScreen.extraMenu.importEpub'),
        onPress: pickAndImport,
      },
      {
        title: getString('libraryScreen.extraMenu.openRandom'),
        onPress: openRandom,
      },
    ],
    [categories, index, pickAndImport, openRandom],
  );

  const handleFABPress = useCallback(() => {
    if (history?.[0]) {
      navigation.navigate('ReaderStack', {
        screen: 'Chapter',
        params: {
          novel: {
            path: history[0].novelPath,
            pluginId: history[0].pluginId,
            name: history[0].novelName,
          } as NovelInfo,
          chapter: history[0],
        },
      });
    }
  }, [history, navigation]);

  const handleEditCategories = useCallback(() => setSelectedNovelIds([]), []);

  const handleCategorySuccess = useCallback(() => {
    setSelectedNovelIds([]);
    refetchLibrary();
  }, [refetchLibrary]);

  const bottomSheetStyle = useMemo(
    () => ({ marginStart: leftInset, marginEnd: rightInset }),
    [leftInset, rightInset],
  );

  const actionbarViewStyle = useMemo(
    () => ({ paddingStart: leftInset, paddingEnd: rightInset }),
    [leftInset, rightInset],
  );

  const markAllRead = useCallback(async () => {
    await Promise.all(selectedNovelIds.map(id => markAllChaptersRead(id)));
    setSelectedNovelIds([]);
    refetchLibrary();
  }, [selectedNovelIds, refetchLibrary]);

  const markAllUnread = useCallback(async () => {
    await Promise.all(selectedNovelIds.map(id => markAllChaptersUnread(id)));
    setSelectedNovelIds([]);
    refetchLibrary();
  }, [selectedNovelIds, refetchLibrary]);

  const deleteSelected = useCallback(async () => {
    await removeNovelsFromLibrary(selectedNovelIds);
    setSelectedNovelIds([]);
    refetchLibrary();
  }, [selectedNovelIds, refetchLibrary]);

  const actionbarActions = useMemo(
    () => [
      { icon: 'label-outline' as const, onPress: showSetCategoryModal },
      { icon: 'check' as const, onPress: markAllRead },
      { icon: 'check-outline' as const, onPress: markAllUnread },
      { icon: 'delete-outline' as const, onPress: deleteSelected },
    ],
    [showSetCategoryModal, markAllRead, markAllUnread, deleteSelected],
  );

  const navigationState = useMemo(
    () => ({
      index,
      routes: categories.map(category => ({
        key: String(category.id),
        title: category.name,
        ...category,
      })),
    }),
    [categories, index],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        clearSearchbar={clearSearchbar}
        placeholder={searchbarPlaceholder}
        onLeftIconPress={handleLeftIconPress}
        onChangeText={setSearchText}
        leftIcon={selectedNovelIds.length ? 'close' : 'magnify'}
        rightIcons={rightIcons}
        menuButtons={menuButtons}
        theme={theme}
      />
      {downloadedOnlyMode ? (
        <Banner
          icon="cloud-off-outline"
          label={getString('moreScreen.downloadOnly')}
          theme={theme}
        />
      ) : null}
      {incognitoMode ? (
        <Banner
          icon="incognito"
          label={getString('moreScreen.incognitoMode')}
          theme={theme}
          backgroundColor={theme.tertiary}
          textColor={theme.onTertiary}
        />
      ) : null}

      <SelectionContext.Provider value={selectionContextValue}>
        <TabView
          commonOptions={{
            label: renderLabel,
          }}
          lazy
          navigationState={navigationState}
          renderTabBar={renderTabBar}
          renderScene={renderScene}
          onIndexChange={setIndex}
          initialLayout={{ width: layout.width }}
        />
      </SelectionContext.Provider>

      {useLibraryFAB &&
      !isHistoryLoading &&
      history &&
      history.length !== 0 &&
      !error ? (
        <FAB
          style={[
            styles.fab,
            { backgroundColor: theme.primary, marginEnd: rightInset + 16 },
          ]}
          color={theme.onPrimary}
          uppercase={false}
          label={getString('common.resume')}
          icon="play"
          onPress={handleFABPress}
        />
      ) : null}
      <SetCategoryModal
        novelIds={selectedNovelIds}
        closeModal={closeSetCategoryModal}
        onEditCategories={handleEditCategories}
        visible={setCategoryModalVisible}
        onSuccess={handleCategorySuccess}
      />
      <LibraryBottomSheet
        bottomSheetRef={bottomSheetRef}
        activeCategoryId={categories[index]?.id}
        activeCategoryName={categories[index]?.name}
        style={bottomSheetStyle}
      />
      <Portal>
        <Actionbar
          viewStyle={actionbarViewStyle}
          active={hasSelection}
          actions={actionbarActions}
        />
      </Portal>
    </SafeAreaView>
  );
};

export default React.memo(LibraryScreen);

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    badgeCtn: {
      borderRadius: 50,
      marginStart: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      position: 'relative',
    },
    badgetText: {
      fontSize: 12,
    },
    fab: {
      bottom: 0,
      margin: 16,
      position: 'absolute',
      end: 0,
    },
    fontWeight500: {
      fontWeight: 500,
    },
    globalSearchBtn: {
      margin: 16,
    },
    tabBar: {
      elevation: 0,
    },
    tabBarIndicator: {
      backgroundColor: theme.primary,
      height: 3,
    },
    tabBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: Color(theme.isDark ? '#FFFFFF' : '#000000')
        .alpha(0.12)
        .string(),
    },
    tabBarFlex: {
      flex: 1,
    },
    tabStyle: {
      minWidth: 100,
      width: 'auto',
    },
  });
}
