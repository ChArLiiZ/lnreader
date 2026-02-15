import { StyleSheet } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FAB } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import { Appbar, EmptyView, SafeAreaView } from '@components/index';
import AddCategoryModal from './components/AddCategoryModal';

import { updateCategoryOrderInDb } from '@database/queries/CategoryQueries';
import { useBoolean } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';

import CategoryCard from './components/CategoryCard';
import CategorySkeletonLoading from './components/CategorySkeletonLoading';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibraryContext } from '@components/Context/LibraryContext';
import { ExtendedCategory } from '@screens/library/hooks/useLibrary';

/**
 * Flatten categories into a tree-ordered list:
 * root1, sub1a, sub1b, root2, sub2a, ...
 */
function flattenCategoriesTree(
  categories: ExtendedCategory[],
): ExtendedCategory[] {
  const roots = categories.filter(c => c.parentId == null && c.id !== 1);
  const subsByParent = new Map<number, ExtendedCategory[]>();

  for (const cat of categories) {
    if (cat.parentId != null) {
      const subs = subsByParent.get(cat.parentId) || [];
      subs.push(cat);
      subsByParent.set(cat.parentId, subs);
    }
  }

  const result: ExtendedCategory[] = [];
  for (const root of roots) {
    result.push(root);
    const subs = subsByParent.get(root.id) || [];
    subs.sort((a, b) => a.sort - b.sort);
    result.push(...subs);
  }

  return result;
}

const CategoriesScreen = () => {
  const { categories, setCategories, refreshCategories, isLoading } =
    useLibraryContext();
  const theme = useTheme();
  const { goBack } = useNavigation();

  const { bottom, right } = useSafeAreaInsets();

  const {
    value: categoryModalVisible,
    setTrue: showCategoryModal,
    setFalse: closeCategoryModal,
  } = useBoolean();

  // State for adding subcategories
  const [addSubParentId, setAddSubParentId] = useState<number | null>(null);
  const {
    value: subCategoryModalVisible,
    setTrue: showSubCategoryModal,
    setFalse: closeSubCategoryModal,
  } = useBoolean();

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const treeCategories = useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    return flattenCategoriesTree(categories);
  }, [categories]);

  const handleAddSubCategory = useCallback(
    (parentId: number) => {
      setAddSubParentId(parentId);
      showSubCategoryModal();
    },
    [showSubCategoryModal],
  );

  const onDragEnd = ({ data }: { data: ExtendedCategory[] }) => {
    if (!categories || categories.length === 0) {
      return;
    }

    // Separate system categories, root categories, and subcategories
    const systemCategories = categories.filter(cat => cat.id === 1);

    // Reconstruct sort orders: root categories maintain their tree order
    // Only allow drag reorder among siblings (same parentId)
    const updatedOrderCategories = [...systemCategories, ...data].map(
      (category, index) => ({
        ...category,
        sort: index,
      }),
    );

    setCategories(updatedOrderCategories);
    updateCategoryOrderInDb(updatedOrderCategories);
  };

  const renderItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<ExtendedCategory>) => (
    <CategoryCard
      category={item}
      getCategories={refreshCategories}
      drag={drag}
      isActive={isActive}
      isSubCategory={item.parentId != null}
      onAddSubCategory={
        item.parentId == null ? () => handleAddSubCategory(item.id) : undefined
      }
    />
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('categories.header')}
        handleGoBack={goBack}
        theme={theme}
      />
      {isLoading ? (
        <CategorySkeletonLoading width={360.7} height={89.5} theme={theme} />
      ) : (
        <DraggableFlatList
          data={treeCategories}
          contentContainerStyle={styles.contentCtn}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          onDragEnd={onDragEnd}
          activationDistance={10}
          autoscrollSpeed={100}
          ListEmptyComponent={
            <EmptyView
              icon="Σ(ಠ_ಠ)"
              description={getString('categories.emptyMsg')}
              theme={theme}
            />
          }
        />
      )}
      <FAB
        style={[styles.fab, { backgroundColor: theme.primary, right, bottom }]}
        color={theme.onPrimary}
        label={getString('common.add')}
        uppercase={false}
        onPress={showCategoryModal}
        icon={'plus'}
      />

      {/* Add root category modal */}
      <AddCategoryModal
        visible={categoryModalVisible}
        closeModal={closeCategoryModal}
        onSuccess={refreshCategories}
      />

      {/* Add subcategory modal */}
      <AddCategoryModal
        visible={subCategoryModalVisible}
        closeModal={() => {
          closeSubCategoryModal();
          setAddSubParentId(null);
        }}
        onSuccess={refreshCategories}
        parentId={addSubParentId}
      />
    </SafeAreaView>
  );
};

export default CategoriesScreen;

const styles = StyleSheet.create({
  contentCtn: {
    flexGrow: 1,
    paddingBottom: 270,
    paddingVertical: 16,
  },
  fab: {
    bottom: 16,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
});
