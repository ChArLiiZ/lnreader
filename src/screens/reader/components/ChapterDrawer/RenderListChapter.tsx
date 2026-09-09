import React from 'react';
import { View, Pressable, TextStyle, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { ChapterInfo } from '@database/types';
import { ThemeColors } from '@theme/types';

type Styles = {
  chapterCtn: StyleProp<ViewStyle>;
  drawerElementContainer: StyleProp<ViewStyle>;
  chapterNameCtn: StyleProp<TextStyle>;
  releaseDateCtn: StyleProp<TextStyle>;
};

type Props = {
  item: ChapterInfo;
  styles: Styles;
  theme: ThemeColors;
  chapterId: number;
  onPress: () => void;
};

const renderListChapter = ({
  item,
  styles,
  theme,
  onPress,
  chapterId,
}: Props) => {
  const isCurrentChapter = item.id === chapterId;

  return (
    <View
      style={[
        styles.drawerElementContainer,
        isCurrentChapter && {
          backgroundColor: theme.secondaryContainer,
        },
      ]}
    >
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        onPress={onPress}
        style={styles.chapterCtn}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.chapterNameCtn,
            {
              color: isCurrentChapter
                ? theme.onSecondaryContainer
                : item.unread
                ? theme.onSurface
                : theme.onSurfaceVariant,
            },
          ]}
        >
          {item.name}
        </Text>
        {item.releaseTime ? (
          <Text
            style={[
              styles.releaseDateCtn,
              {
                color: isCurrentChapter
                  ? theme.onSecondaryContainer
                  : item.unread
                  ? theme.onSurfaceVariant
                  : theme.outline,
              },
            ]}
          >
            {item.releaseTime}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
};
export default renderListChapter;
