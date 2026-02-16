import { useEffect, useMemo, useState } from 'react';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import {
  CHAPTER_GENERAL_SETTINGS,
  CHAPTER_READER_SETTINGS,
  ChapterGeneralSettings,
  ChapterReaderSettings,
  initialChapterGeneralSettings,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getPlugin } from '@plugins/pluginManager';
import { PLUGIN_STORAGE } from '@utils/Storages';

export function useReaderSettings(
  chapterId: number,
  pluginId: string | undefined,
) {
  const [readerSettings, setReaderSettings] = useState<ChapterReaderSettings>(
    () =>
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
      initialChapterReaderSettings,
  );

  const chapterGeneralSettings = useMemo(
    () =>
      getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ||
      initialChapterGeneralSettings,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterId],
  );

  useEffect(() => {
    setReaderSettings(
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
        initialChapterReaderSettings,
    );
  }, [chapterId]);

  const plugin = pluginId ? getPlugin(pluginId) : undefined;
  const pluginCustomJS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.js`;
  const pluginCustomCSS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.css`;
  const isRTL = plugin?.lang === 'Arabic' || plugin?.lang === 'Hebrew';
  const readerDir = isRTL ? 'rtl' : 'ltr';

  return {
    readerSettings,
    setReaderSettings,
    chapterGeneralSettings,
    plugin,
    pluginCustomJS,
    pluginCustomCSS,
    readerDir,
  };
}
