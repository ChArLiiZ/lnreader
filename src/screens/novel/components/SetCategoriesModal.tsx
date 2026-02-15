import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';
import { Divider, Portal } from 'react-native-paper';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { Button, Modal } from '@components/index';

import { useTheme } from '@hooks/persisted';

import { getString } from '@strings/translations';
import { getCategoriesWithCount } from '@database/queries/CategoryQueries';
import { updateNovelCategories } from '@database/queries/NovelQueries';
import { CCategory, Category } from '@database/types';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { RootStackParamList } from '@navigators/types';

interface SetCategoryModalProps {
  novelIds: number[];
  visible: boolean;
  onEditCategories?: () => void;
  closeModal: () => void;
  onSuccess?: () => void | Promise<void>;
}

/** Flatten categories into tree order: root, sub, sub, root, sub, ... */
function buildCategoryTree(
  categories: CCategory[],
): Array<CCategory & { isSubCategory: boolean }> {
  const roots = categories.filter(c => c.parentId == null);
  const subsByParent = new Map<number, CCategory[]>();

  for (const cat of categories) {
    if (cat.parentId != null) {
      const subs = subsByParent.get(cat.parentId) || [];
      subs.push(cat);
      subsByParent.set(cat.parentId, subs);
    }
  }

  const result: Array<CCategory & { isSubCategory: boolean }> = [];
  for (const root of roots) {
    result.push({ ...root, isSubCategory: false });
    const subs = subsByParent.get(root.id) || [];
    subs.sort((a, b) => a.sort - b.sort);
    for (const sub of subs) {
      result.push({ ...sub, isSubCategory: true });
    }
  }

  return result;
}

const SetCategoryModal: React.FC<SetCategoryModalProps> = ({
  novelIds,
  closeModal,
  visible,
  onSuccess,
  onEditCategories,
}) => {
  const theme = useTheme();
  const { navigate } = useNavigation<NavigationProp<RootStackParamList>>();
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [categories = [], setCategories] = useState<CCategory[]>();

  const getCategories = useCallback(async () => {
    const res = getCategoriesWithCount(novelIds);
    setCategories(res);
    setSelectedCategories(res.filter(c => c.novelsCount));
  }, [novelIds]);

  useEffect(() => {
    if (visible) {
      getCategories();
    }
  }, [getCategories, visible]);

  const treeCategories = useMemo(
    () => buildCategoryTree(categories),
    [categories],
  );

  const handleToggleCategory = useCallback(
    (item: CCategory & { isSubCategory: boolean }) => {
      setSelectedCategories(prev => {
        const isSelected = prev.some(c => c.id === item.id);

        if (isSelected) {
          // Deselecting
          return prev.filter(c => c.id !== item.id);
        } else {
          // Selecting
          const next = [...prev, item];

          // If selecting a subcategory, also select its parent if not already
          if (item.parentId != null) {
            const parentSelected = next.some(c => c.id === item.parentId);
            if (!parentSelected) {
              const parent = categories.find(c => c.id === item.parentId);
              if (parent) {
                next.push(parent);
              }
            }
          }

          return next;
        }
      });
    },
    [categories],
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={() => {
          closeModal();
          setSelectedCategories([]);
        }}
      >
        <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
          {getString('categories.setCategories')}
        </Text>
        <FlatList
          data={treeCategories}
          style={styles.categoryList}
          renderItem={({ item }) => (
            <Checkbox
              status={
                selectedCategories.find(category => category.id === item.id) !==
                undefined
              }
              label={item.name}
              onPress={() => handleToggleCategory(item)}
              viewStyle={[
                styles.checkboxView,
                item.isSubCategory && styles.subCategoryIndent,
              ]}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.onSurfaceVariant }}>
              {getString('categories.setModalEmptyMsg')}
            </Text>
          }
        />
        <Divider
          style={[
            {
              backgroundColor: theme.onSurfaceDisabled,
            },
            styles.divider,
          ]}
        />
        <View style={styles.btnContainer}>
          <Button
            title={getString('common.edit')}
            onPress={() => {
              navigate('MoreStack', {
                screen: 'Categories',
              });
              closeModal();
              onEditCategories?.();
            }}
          />
          <View style={styles.flex} />
          <Button
            title={getString('common.cancel')}
            onPress={() => {
              closeModal();
            }}
          />
          <Button
            title={getString('common.ok')}
            onPress={async () => {
              await updateNovelCategories(
                novelIds,
                selectedCategories.map(category => category.id),
              );
              closeModal();
              onSuccess?.();
            }}
          />
        </View>
      </Modal>
    </Portal>
  );
};

export default SetCategoryModal;

const styles = StyleSheet.create({
  categoryList: {
    maxHeight: Dimensions.get('window').height * 0.4,
  },
  divider: { height: 1, width: '90%', marginLeft: '5%' },
  btnContainer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  checkboxView: {
    marginBottom: 5,
  },
  subCategoryIndent: {
    paddingLeft: 32,
  },
  flex: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    marginBottom: 20,
  },
  modelOption: {
    fontSize: 15,
    marginVertical: 10,
  },
});
