import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';

import { coverPlaceholderColor } from '../theme/colors';

import color from 'color';
import { ThemeColors } from '@theme/types';
import { NovelItem } from '@plugins/types';
import { NovelInfo } from '@database/types';

interface ListViewProps {
  item: NovelItem | NovelInfo;
  downloadBadge?: React.ReactNode;
  unreadBadge?: React.ReactNode;
  inLibraryBadge?: React.ReactNode;
  theme: ThemeColors;
  onPress: () => void;
  isSelected?: boolean;
  onLongPress?: () => void;
}

const ListView = ({
  item,
  downloadBadge,
  unreadBadge,
  inLibraryBadge,
  theme,
  onPress,
  isSelected,
  onLongPress,
}: ListViewProps) => {
  const fadedImage = { opacity: inLibraryBadge ? 0.5 : 1 };
  const genreTags = useMemo(() => {
    if (!item.genres) return [];
    return item.genres
      .split(/\s*,\s*/)
      .map(tag => tag.trim())
      .filter(Boolean);
  }, [item.genres]);
  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={[
        styles.listView,
        isSelected && {
          backgroundColor: color(theme.primary).alpha(0.12).string(),
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      accessibilityState={{ selected: isSelected }}
    >
      <Image
        source={{ uri: item.cover }}
        cachePolicy="disk"
        style={[styles.extensionIcon, fadedImage]}
      />
      <View style={styles.novelInfo}>
        <Text
          style={[{ color: theme.onSurface }, styles.novelName]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {genreTags.length > 0 ? (
          <View
            onStartShouldSetResponderCapture={() => true}
            onMoveShouldSetResponderCapture={() => true}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              directionalLockEnabled
              nestedScrollEnabled
              contentContainerStyle={styles.genreRow}
            >
              {genreTags.map(tag => (
                <View
                  key={tag}
                  style={[
                    styles.genreChip,
                    {
                      backgroundColor: theme.surface2,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.genreText,
                      {
                        color: theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
      <View style={styles.badgeContainer}>
        {downloadBadge}
        {unreadBadge}
        {inLibraryBadge}
      </View>
    </Pressable>
  );
};

export default ListView;

const styles = StyleSheet.create({
  badgeContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  extensionIcon: {
    backgroundColor: coverPlaceholderColor,
    borderRadius: 4,
    height: 40,
    width: 40,
  },
  listView: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  novelName: {
    fontSize: 15,
    marginBottom: 2,
  },
  novelInfo: {
    flex: 1,
    marginStart: 16,
    paddingEnd: 8,
  },
  genreRow: {
    alignItems: 'center',
    columnGap: 6,
    paddingVertical: 1,
  },
  genreChip: {
    borderRadius: 10,
    maxWidth: 96,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  genreText: {
    fontSize: 10,
  },
});
