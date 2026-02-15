import { StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native-gesture-handler';

import { Category } from '@database/types';
import { useTheme } from '@hooks/persisted';
import AddCategoryModal from './AddCategoryModal';
import { useBoolean } from '@hooks';
import { Badge, Portal } from 'react-native-paper';
import IconButton from '@components/IconButtonV2/IconButtonV2';
import DeleteCategoryModal from './DeleteCategoryModal';

interface CategoryCardProps {
  category: Category;
  getCategories: () => Promise<void>;
  drag: () => void;
  isActive: boolean;
  isSubCategory?: boolean;
  onAddSubCategory?: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  getCategories,
  drag,
  isActive,
  isSubCategory = false,
  onAddSubCategory,
}) => {
  const theme = useTheme();

  const {
    value: categoryModalVisible,
    setTrue: showCategoryModal,
    setFalse: closeCategoryModal,
  } = useBoolean();

  const {
    value: deletecategoryModalVisible,
    setTrue: showDeleteCategoryModal,
    setFalse: closeDeleteCategoryModal,
  } = useBoolean();

  const isSystem = category.id === 2;
  const isProtected = category.id === 1 || category.id === 2;

  return (
    <>
      <View
        style={[
          styles.cardCtn,
          {
            backgroundColor: theme.secondaryContainer,
            marginStart: isSubCategory ? 40 : 16,
          },
          isActive && styles.activeCard,
        ]}
      >
        <View style={styles.buttonsCtn}>
          <TouchableOpacity
            onLongPress={drag}
            style={styles.dragHandle}
            activeOpacity={0.6}
          >
            <IconButton
              name="drag-horizontal-variant"
              color={theme.onSurface}
              theme={theme}
              padding={8}
            />
          </TouchableOpacity>
          <View style={styles.nameCtn}>
            {isSubCategory && (
              <IconButton
                name="subdirectory-arrow-right"
                color={theme.onSurfaceVariant}
                theme={theme}
                padding={0}
                size={16}
              />
            )}
            <Text
              style={[
                styles.name,
                {
                  color: theme.onSurface,
                },
              ]}
              onPress={isProtected ? undefined : showCategoryModal}
              disabled={isProtected}
            >
              {category.name}
            </Text>
            {isSystem && (
              <Badge
                style={[
                  styles.badge,
                  {
                    backgroundColor: theme.tertiaryContainer,
                  },
                ]}
              >
                System
              </Badge>
            )}
          </View>
          <View style={styles.flex} />
          {/* Add subcategory button - only for root categories that are not system */}
          {!isSubCategory && !isProtected && onAddSubCategory && (
            <IconButton
              name="plus-circle-outline"
              color={theme.onSurface}
              style={styles.manageBtn}
              onPress={onAddSubCategory}
              theme={theme}
            />
          )}
          <View style={[isProtected && styles.disabledOpacity]}>
            <IconButton
              name="pencil-outline"
              color={isProtected ? theme.outline : theme.onSurface}
              style={styles.manageBtn}
              onPress={showCategoryModal}
              theme={theme}
              disabled={isProtected}
            />
          </View>
          <View style={[isProtected && styles.disabledOpacity]}>
            <IconButton
              name="delete-outline"
              color={isProtected ? theme.outline : theme.onSurface}
              style={styles.manageBtn}
              onPress={showDeleteCategoryModal}
              theme={theme}
              disabled={isProtected}
            />
          </View>
        </View>
      </View>
      <Portal>
        <AddCategoryModal
          isEditMode
          category={category}
          visible={categoryModalVisible}
          closeModal={closeCategoryModal}
          onSuccess={getCategories}
        />
        <DeleteCategoryModal
          category={category}
          visible={deletecategoryModalVisible}
          closeModal={closeDeleteCategoryModal}
          onSuccess={getCategories}
        />
      </Portal>
    </>
  );
};

export default CategoryCard;

const styles = StyleSheet.create({
  buttonsCtn: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  cardCtn: {
    borderRadius: 12,
    marginBottom: 8,
    marginEnd: 16,
    marginStart: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dragHandle: {
    marginEnd: 4,
  },
  flex: {
    flex: 1,
  },
  manageBtn: {
    marginStart: 16,
  },
  name: {
    marginStart: 8,
    marginEnd: 8,
  },
  nameCtn: {
    alignItems: 'center',
    flexGrow: 1,
    flexDirection: 'row',
    marginStart: 8,
    paddingEnd: 16,
    paddingVertical: 4,
  },
  activeCard: {
    opacity: 0.8,
    elevation: 8,
  },
  badge: {
    paddingHorizontal: 8,
  },
  disabledOpacity: {
    opacity: 0.4,
  },
});
