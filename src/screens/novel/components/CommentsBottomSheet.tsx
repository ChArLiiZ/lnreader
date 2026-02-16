import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetFlatList,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '@hooks/persisted';
import { useBackHandler } from '@hooks/index';
import { getString } from '@strings/translations';
import { fetchComments } from '@services/plugin/fetch';
import { CommentItem } from '@plugins/types';
import BottomSheetBackdrop from '@components/BottomSheet/BottomSheetBackdrop';
import { ThemeColors } from '@theme/types';
import { NovelScreenProps } from '@navigators/types';

interface CommentsBottomSheetProps {
  pluginId: string;
  path: string;
  novelName?: string;
  visible: boolean;
  onClose: () => void;
}

const CommentRow = ({
  item,
  theme,
}: {
  item: CommentItem;
  theme: ThemeColors;
}) => (
  <View style={styles.commentItem}>
    <View style={styles.commentRow}>
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]} />
      )}
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text
            style={[styles.commentAuthor, { color: theme.primary }]}
            numberOfLines={1}
          >
            {item.author}
          </Text>
          {item.date ? (
            <Text
              style={[styles.commentDate, { color: theme.onSurfaceVariant }]}
            >
              {item.date}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.commentText, { color: theme.onSurface }]}>
          {item.content}
        </Text>
      </View>
    </View>
  </View>
);

const CommentsBottomSheet: React.FC<CommentsBottomSheetProps> = ({
  pluginId,
  path,
  novelName,
  visible,
  onClose,
}) => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const indexRef = useRef<number | null>(null);
  const { navigate } = useNavigation<NovelScreenProps['navigation']>();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} />,
    [],
  );

  useBackHandler(() => {
    if (typeof indexRef.current === 'number' && indexRef.current !== -1) {
      bottomSheetRef.current?.close();
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
      setLoading(true);
      setError(null);
      fetchComments(pluginId, path)
        .then(result => {
          setComments(result);
          setLoading(false);
        })
        .catch(err => {
          setError(err?.message || String(err));
          setLoading(false);
        });
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible, pluginId, path]);

  const handleDismiss = useCallback(() => {
    indexRef.current = -1;
    onClose();
  }, [onClose]);

  const handleOpenWebView = useCallback(() => {
    navigate('WebviewScreen', {
      name: novelName || getString('novelScreen.comments'),
      url: path,
      pluginId,
    });
    onClose();
  }, [pluginId, path, novelName, navigate, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: CommentItem }) => (
      <CommentRow item={item} theme={theme} />
    ),
    [theme],
  );

  const keyExtractor = useCallback(
    (_: CommentItem, idx: number) => `comment_${idx}`,
    [],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      handleComponent={null}
      backgroundStyle={{
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        backgroundColor: theme.surface,
      }}
      containerStyle={{ paddingBottom: bottom }}
      onChange={index => {
        indexRef.current = index;
      }}
      onDismiss={handleDismiss}
      enableDynamicSizing={false}
      enableOverDrag={false}
    >
      <BottomSheetView style={styles.header}>
        <Text style={[styles.title, { color: theme.onSurface }]}>
          {getString('novelScreen.comments')}
        </Text>
        <Pressable onPress={handleOpenWebView} style={styles.webviewButton}>
          <Text style={[styles.webviewButtonText, { color: theme.primary }]}>
            WebView
          </Text>
        </Pressable>
      </BottomSheetView>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.statusText, { color: theme.onSurfaceVariant }]}>
            {getString('novelScreen.loadingComments')}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.error }]}>
            {error}
          </Text>
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.onSurfaceVariant }]}>
            {getString('novelScreen.noComments')}
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={comments}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
        />
      )}
    </BottomSheetModal>
  );
};

export default React.memo(CommentsBottomSheet);

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 18,
    height: 36,
    marginRight: 10,
    width: 36,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  commentAuthor: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
  },
  commentDate: {
    fontSize: 12,
    marginLeft: 8,
  },
  commentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentItem: {
    borderBottomColor: 'rgba(128, 128, 128, 0.15)',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentRow: {
    flexDirection: 'row',
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: 'rgba(128, 128, 128, 0.15)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  listContent: {
    paddingBottom: 16,
  },
  statusText: {
    fontSize: 14,
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  webviewButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  webviewButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
