import { useLibrarySettings } from '@hooks/persisted';
import { DisplayModes } from '@screens/library/constants/constants';
import React, { useMemo } from 'react';
import {
  StyleSheet,
  FlatListProps,
  ListRenderItem,
  useWindowDimensions,
} from 'react-native';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import { NovelItem } from '@plugins/types';
import { NovelInfo } from '../database/types';
import { useDeviceOrientation } from '@hooks';

export type NovelListRenderItem = ListRenderItem<NovelInfo | NovelItem>;

type listDataItem =
  | (NovelInfo | NovelItem) & {
      completeRow?: number;
    };

interface NovelListProps
  extends Omit<FlatListProps<NovelInfo | NovelItem>, 'data'> {
  inSource?: boolean;
  data: Array<listDataItem>;
}

const novelListKeyExtractor = (item: NovelInfo | NovelItem, index: number) =>
  index + '_' + item.path;

const NovelList: React.FC<NovelListProps> = props => {
  const { displayMode = DisplayModes.Comfortable, novelsPerRow = 3 } =
    useLibrarySettings();
  const orientation = useDeviceOrientation();
  const window = useWindowDimensions();

  const isListView = displayMode === DisplayModes.List;

  const numColumns = useMemo(() => {
    if (isListView) {
      return 1;
    }

    if (orientation === 'landscape') {
      return 6;
    } else {
      return novelsPerRow;
    }
  }, [isListView, orientation, novelsPerRow]);

  let extendedNovelList: Array<listDataItem> = props?.data;
  if (props.data?.length && props.inSource) {
    const remainder = numColumns - (props.data?.length % numColumns);
    const extension: Array<listDataItem> = [];
    if (remainder !== 0 && remainder !== numColumns) {
      for (let i = 0; i < remainder; i++) {
        extension.push({
          cover: '',
          name: '',
          path: 'loading-' + remainder,
          completeRow: 1,
        } as listDataItem);
      }
    }
    extension.push({
      cover: '',
      name: '',
      path: 'loading-' + remainder,
      completeRow: 2,
    } as listDataItem);

    extendedNovelList = [...props.data, ...extension];
  }

  // Estimate item size based on display mode and cover dimensions
  const estimatedItemSize = useMemo(() => {
    if (isListView) {
      return 56;
    }
    // coverHeight = (window.width / numColumns) * (4 / 3)
    const coverHeight = (window.width / numColumns) * (4 / 3);
    // padding from opac style (4.8 * 2) + margin (2 * 2)
    const padding = 14;
    if (displayMode === DisplayModes.Comfortable) {
      // title (~50px) + genre tags row (~28px)
      return coverHeight + padding + 78;
    }
    // Compact and CoverOnly: just cover + padding
    return coverHeight + padding;
  }, [isListView, window.width, numColumns, displayMode]);

  // Extract props not supported by FlashList before spreading
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { inSource, contentContainerStyle, ...restProps } = props;

  return (
    <FlashList
      contentContainerStyle={!isListView ? styles.listView : undefined}
      numColumns={numColumns}
      key={numColumns}
      keyExtractor={novelListKeyExtractor}
      estimatedItemSize={estimatedItemSize}
      {...(restProps as Partial<FlashListProps<NovelInfo | NovelItem>>)}
      data={extendedNovelList}
    />
  );
};

export default NovelList;

const styles = StyleSheet.create({
  listView: {
    paddingHorizontal: 4,
  },
});
