import React, { useMemo } from 'react';
import { Appbar, List } from '@components';
import { getString } from '@strings/translations';
import { useBoolean } from '@hooks';
import { useCategories, useTheme } from '@hooks/persisted';
import { useLibrarySettings } from '@hooks/persisted/useSettings';
import { useNavigation } from '@react-navigation/native';
import { Portal } from 'react-native-paper';
import DefaultCategoryDialog from './DefaultCategoryDialog';

const SettingsLibraryScreen = () => {
  const theme = useTheme();
  const { goBack, navigate } = useNavigation();
  const { categories } = useCategories();
  const { defaultCategoryId = 0, setLibrarySettings } = useLibrarySettings();

  const defaultCategoryDialog = useBoolean();

  const setDefaultCategoryId = (categoryId: number) => {
    setLibrarySettings({ defaultCategoryId: categoryId });
    defaultCategoryDialog.setFalse();
  };

  const defaultCategoryName = useMemo(() => {
    if (defaultCategoryId === -1) {
      return getString('categories.alwaysAsk');
    }
    if (defaultCategoryId === 0) {
      return (
        categories.find(c => c.id === 1)?.name ??
        getString('categories.default')
      );
    }
    return (
      categories.find(c => c.id === defaultCategoryId)?.name ??
      getString('categories.default')
    );
  }, [defaultCategoryId, categories]);

  // Prepend "Always ask" virtual option
  const dialogCategories = useMemo(() => {
    return [
      {
        id: -1,
        name: getString('categories.alwaysAsk'),
        sort: -1,
        parentId: null,
      },
      ...categories,
    ];
  }, [categories]);

  return (
    <>
      <Appbar
        title={getString('library')}
        handleGoBack={goBack}
        theme={theme}
      />
      <List.Section>
        <List.Item
          title={getString('categories.header')}
          description={`${categories.length} ${getString(
            'common.categories',
          ).toLowerCase()}`}
          onPress={() => navigate('MoreStack', { screen: 'Categories' })}
          theme={theme}
        />
        <List.Item
          title={getString('categories.defaultCategory')}
          description={defaultCategoryName}
          onPress={defaultCategoryDialog.setTrue}
          theme={theme}
        />
      </List.Section>
      <Portal>
        <DefaultCategoryDialog
          categories={dialogCategories}
          defaultCategoryId={defaultCategoryId === 0 ? 1 : defaultCategoryId}
          visible={defaultCategoryDialog.value}
          hideDialog={defaultCategoryDialog.setFalse}
          setDefaultCategory={id => setDefaultCategoryId(id === 1 ? 0 : id)}
        />
      </Portal>
    </>
  );
};

export default SettingsLibraryScreen;
