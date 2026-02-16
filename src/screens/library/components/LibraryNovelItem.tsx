import React, { memo, useCallback, useMemo } from 'react';
import NovelCover from '@components/NovelCover';
import { NovelInfo } from '@database/types';
import { ThemeColors } from '@theme/types';
import { ImageRequestInit } from '@plugins/types';
import { deriveR18Badge, buildNovelInfoString } from '@utils/format';

interface LibraryNovelItemProps {
  item: NovelInfo;
  theme: ThemeColors;
  isSelected: boolean;
  hasSelection: boolean;
  onSelect: (id: number) => void;
  onNavigate: (item: NovelInfo) => void;
  imageRequestInit: ImageRequestInit | undefined;
}

const LibraryNovelItem = memo(function LibraryNovelItem({
  item,
  theme,
  isSelected,
  hasSelection,
  onSelect,
  onNavigate,
  imageRequestInit,
}: LibraryNovelItemProps) {
  const handleLongPress = useCallback(() => {
    onSelect(item.id);
  }, [item.id, onSelect]);

  const handlePress = useCallback(() => {
    if (hasSelection) {
      onSelect(item.id);
    } else {
      onNavigate(item);
    }
  }, [hasSelection, item, onSelect, onNavigate]);

  const displayItem = useMemo(
    () => ({
      ...item,
      badge: deriveR18Badge(item.genres),
      info: buildNovelInfoString(item.rating, item.wordCount),
    }),
    [item],
  );

  return (
    <NovelCover
      item={displayItem}
      theme={theme}
      isSelected={isSelected}
      hasSelection={hasSelection}
      onLongPress={handleLongPress}
      onPress={handlePress}
      libraryStatus={false}
      imageRequestInit={imageRequestInit}
    />
  );
});

export default LibraryNovelItem;
