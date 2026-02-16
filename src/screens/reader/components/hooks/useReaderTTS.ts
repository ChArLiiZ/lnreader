import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import WebView from 'react-native-webview';
import { ChapterReaderSettings } from '@hooks/persisted/useSettings';
import {
  showTTSNotification,
  updateTTSNotification,
  dismissTTSNotification,
  getTTSAction,
  clearTTSAction,
} from '@utils/ttsNotification';

interface UseReaderTTSOptions {
  webViewRef: React.RefObject<WebView | null>;
  novelName: string;
  chapterName: string;
  readerSettingsRef: React.RefObject<ChapterReaderSettings | null>;
}

export function useReaderTTS({
  webViewRef,
  novelName,
  chapterName,
  readerSettingsRef,
}: UseReaderTTSOptions) {
  const isTTSReadingRef = useRef<boolean>(false);
  const appStateRef = useRef(AppState.currentState);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsQueueIndexRef = useRef<number>(0);
  const autoStartTTSRef = useRef<boolean>(false);

  // Poll for notification actions
  useEffect(() => {
    const checkNotificationActions = setInterval(() => {
      const action = getTTSAction();
      if (action) {
        clearTTSAction();
        switch (action) {
          case 'TTS_PLAY_PAUSE':
            webViewRef.current?.injectJavaScript(`
              if (window.tts) {
                if (tts.reading) { tts.pause(); } else { tts.resume(); }
              }
            `);
            break;
          case 'TTS_STOP':
            webViewRef.current?.injectJavaScript(`
              if (window.tts) { tts.stop(); }
            `);
            break;
          case 'TTS_NEXT':
            webViewRef.current?.injectJavaScript(`
              if (window.tts && window.reader && window.reader.nextChapter) {
                window.reader.post({ type: 'next', autoStartTTS: true });
              }
            `);
            break;
        }
      }
    }, 1000);

    return () => clearInterval(checkNotificationActions);
  }, [webViewRef]);

  // Update notification on chapter change
  useEffect(() => {
    if (isTTSReadingRef.current) {
      updateTTSNotification({
        novelName,
        chapterName,
        isPlaying: isTTSReadingRef.current,
      });
    }
  }, [novelName, chapterName]);

  // Cleanup notification on unmount
  useEffect(() => {
    return () => {
      dismissTTSNotification();
    };
  }, []);

  // App state tracking for background TTS
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'active' && isTTSReadingRef.current) {
        const index = ttsQueueIndexRef.current;
        webViewRef.current?.injectJavaScript(`
          if (window.tts && window.tts.allReadableElements) {
            const idx = ${index};
            if (idx < tts.allReadableElements.length) {
              tts.elementsRead = idx;
              tts.currentElement = tts.allReadableElements[idx];
              tts.prevElement = null;
              tts.started = true;
              tts.reading = true;
              tts.scrollToElement(tts.currentElement);
              tts.currentElement.classList.add('highlight');
            }
          }
        `);
      }
    });

    return () => subscription.remove();
  }, [webViewRef]);

  const speakText = (text: string) => {
    Speech.speak(text, {
      onDone() {
        const isBackground =
          appStateRef.current === 'background' ||
          appStateRef.current === 'inactive';

        if (
          isBackground &&
          ttsQueueRef.current.length > 0 &&
          ttsQueueIndexRef.current + 1 < ttsQueueRef.current.length
        ) {
          const nextIndex = ttsQueueIndexRef.current + 1;
          const nextText = ttsQueueRef.current[nextIndex];
          if (nextText) {
            ttsQueueIndexRef.current = nextIndex;
            speakText(nextText);
            return;
          }
        }

        if (isBackground) {
          isTTSReadingRef.current = false;
          dismissTTSNotification();
          webViewRef.current?.injectJavaScript('tts.stop?.()');
          return;
        }

        webViewRef.current?.injectJavaScript('tts.next?.()');
      },
      voice: readerSettingsRef.current?.tts?.voice?.identifier,
      pitch: readerSettingsRef.current?.tts?.pitch || 1,
      rate: readerSettingsRef.current?.tts?.rate || 1,
    });
  };

  const handleTTSQueue = (payload: {
    queue?: unknown;
    startIndex?: unknown;
  }) => {
    const queue = Array.isArray(payload?.queue)
      ? payload.queue.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
    ttsQueueRef.current = queue;
    if (typeof payload?.startIndex === 'number') {
      ttsQueueIndexRef.current = payload.startIndex;
    } else {
      ttsQueueIndexRef.current = 0;
    }
  };

  const handleSpeak = (data: unknown, index?: number) => {
    if (data && typeof data === 'string') {
      if (typeof index === 'number') {
        ttsQueueIndexRef.current = index;
      }
      if (!isTTSReadingRef.current) {
        isTTSReadingRef.current = true;
        showTTSNotification({
          novelName,
          chapterName,
          isPlaying: true,
        });
      } else {
        updateTTSNotification({
          novelName,
          chapterName,
          isPlaying: true,
        });
      }
      speakText(data);
    } else {
      webViewRef.current?.injectJavaScript('tts.next?.()');
    }
  };

  const handleStopSpeak = () => {
    Speech.stop();
    isTTSReadingRef.current = false;
    ttsQueueRef.current = [];
    ttsQueueIndexRef.current = 0;
    dismissTTSNotification();
  };

  const handleTTSState = (data: unknown) => {
    if (data && typeof data === 'object') {
      const payload = data as { isReading?: boolean };
      const isReading = payload.isReading === true;
      isTTSReadingRef.current = isReading;
      updateTTSNotification({
        novelName,
        chapterName,
        isPlaying: isReading,
      });
    }
  };

  return {
    autoStartTTSRef,
    isTTSReadingRef,
    ttsQueueIndexRef,
    handleTTSQueue,
    handleSpeak,
    handleStopSpeak,
    handleTTSState,
  };
}
