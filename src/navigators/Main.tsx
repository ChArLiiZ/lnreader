import React, { lazy, Suspense, useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  changeNavigationBarColor,
  setStatusBarColor,
} from '@theme/utils/setBarColor';
import { useAppSettings, usePlugins, useTheme } from '@hooks/persisted';
import { useGithubUpdateChecker } from '@hooks/common/useGithubUpdateChecker';

/**
 * Navigators — BottomNavigator is eagerly loaded (home screen)
 */
import BottomNavigator from './BottomNavigator';

/**
 * Lazily loaded navigators and screens
 */
const MoreStack = lazy(() => import('./MoreStack'));
const ReaderStack = lazy(() => import('./ReaderStack'));
const BrowseSourceScreen = lazy(
  () => import('../screens/BrowseSourceScreen/BrowseSourceScreen'),
);
const GlobalSearchScreen = lazy(
  () => import('../screens/GlobalSearchScreen/GlobalSearchScreen'),
);
const Migration = lazy(() => import('../screens/browse/migration/Migration'));
const SourceNovels = lazy(() => import('../screens/browse/SourceNovels'));
const MigrateNovel = lazy(
  () => import('../screens/browse/migration/MigrationNovels'),
);
const MalTopNovels = lazy(
  () => import('../screens/browse/discover/MalTopNovels'),
);
const AniListTopNovels = lazy(
  () => import('../screens/browse/discover/AniListTopNovels'),
);
const BrowseSettings = lazy(
  () => import('../screens/browse/settings/BrowseSettings'),
);
const WebviewScreen = lazy(
  () => import('@screens/WebviewScreen/WebviewScreen'),
);

import NewUpdateDialog from '../components/NewUpdateDialog';
import { RootStackParamList } from './types';
import Color from 'color';
import { useMMKVBoolean } from 'react-native-mmkv';
import OnboardingScreen from '@screens/onboarding/OnboardingScreen';
import ServiceManager from '@services/ServiceManager';
import { LibraryContextProvider } from '@components/Context/LibraryContext';
import { UpdateContextProvider } from '@components/Context/UpdateContext';
import OfflineBanner from '@components/OfflineBanner/OfflineBanner';
import { hasPermission as hasSafPermission } from 'react-native-saf-x';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';

const fallbackStyle = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
const LazyScreenFallback = () => (
  <View style={fallbackStyle.container}>
    <ActivityIndicator size="small" />
  </View>
);
const Stack = createNativeStackNavigator<RootStackParamList>();

// Wrap lazy components with Suspense for React Navigation compatibility
const withSuspense = <P extends object>(
  LazyComponent: React.LazyExoticComponent<React.ComponentType<P>>,
) => {
  const Wrapped = (props: P) => (
    <Suspense fallback={<LazyScreenFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );
  Wrapped.displayName = `Suspense(${LazyComponent.displayName || 'Lazy'})`;
  return Wrapped;
};

const LazyMoreStack = withSuspense(MoreStack);
const LazyReaderStack = withSuspense(ReaderStack);
const LazyBrowseSourceScreen = withSuspense(BrowseSourceScreen);
const LazyGlobalSearchScreen = withSuspense(GlobalSearchScreen);
const LazyMigration = withSuspense(Migration);
const LazySourceNovels = withSuspense(SourceNovels);
const LazyMigrateNovel = withSuspense(MigrateNovel);
const LazyMalTopNovels = withSuspense(MalTopNovels);
const LazyAniListTopNovels = withSuspense(AniListTopNovels);
const LazyBrowseSettings = withSuspense(BrowseSettings);
const LazyWebviewScreen = withSuspense(WebviewScreen);

const MainNavigator = () => {
  const theme = useTheme();
  const {
    updateLibraryOnLaunch,
    autoBackupEnabled,
    autoBackupIntervalHours,
    autoBackupTargetUri,
    autoBackupLastRunAt,
    setAppSettings,
  } = useAppSettings();
  const { refreshPlugins } = usePlugins();
  const [isOnboarded] = useMMKVBoolean('IS_ONBOARDED');

  useEffect(() => {
    const timer = setTimeout(async () => {
      setStatusBarColor(theme);
      changeNavigationBarColor(Color(theme.surface2).hex(), theme.isDark);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [theme]);

  useEffect(() => {
    if (updateLibraryOnLaunch) {
      ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' });
    }
    if (isOnboarded) {
      // hack this helps app has enough time to initialize database;
      refreshPlugins();
    }
  }, [isOnboarded, refreshPlugins, updateLibraryOnLaunch]);

  useEffect(() => {
    if (!isOnboarded || !autoBackupEnabled || !autoBackupTargetUri) {
      return;
    }

    let disposed = false;
    const intervalMs = Math.max(1, autoBackupIntervalHours) * 60 * 60 * 1000;

    const maybeRunAutoBackup = async () => {
      if (disposed || AppState.currentState !== 'active') {
        return;
      }

      const now = Date.now();
      if (autoBackupLastRunAt && now - autoBackupLastRunAt < intervalMs) {
        return;
      }

      if (Platform.OS === 'android') {
        try {
          const hasPermission = await hasSafPermission(autoBackupTargetUri);
          if (!hasPermission) {
            setAppSettings({ autoBackupEnabled: false });
            showToast(getString('backupScreen.autoBackupPermissionRevoked'));
            return;
          }
        } catch (error) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('Auto backup permission check failed:', error);
          }
          return;
        }
      } else {
        return;
      }

      const taskQueue = ServiceManager.manager.getTaskList();
      if (taskQueue.some(task => task.task.name === 'LOCAL_BACKUP')) {
        return;
      }

      ServiceManager.manager.addTask({
        name: 'LOCAL_BACKUP',
        data: { targetUri: autoBackupTargetUri, silent: true },
      });
      setAppSettings({ autoBackupLastRunAt: now });
    };

    maybeRunAutoBackup();
    const timer = setInterval(maybeRunAutoBackup, 60 * 1000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        maybeRunAutoBackup();
      }
    });

    return () => {
      disposed = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [
    autoBackupEnabled,
    autoBackupIntervalHours,
    autoBackupLastRunAt,
    autoBackupTargetUri,
    isOnboarded,
    setAppSettings,
  ]);

  const { isNewVersion, latestRelease } = useGithubUpdateChecker();

  if (!isOnboarded) {
    return <OnboardingScreen />;
  }

  return (
    <NavigationContainer<RootStackParamList>
      theme={{
        colors: {
          ...DefaultTheme.colors,
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.onSurface,
          border: theme.outline,
        },
        dark: theme.isDark,
        fonts: DefaultTheme.fonts,
      }}
      linking={{
        prefixes: ['lnreader://'],
        config: {
          screens: {
            MoreStack: {
              screens: {
                SettingsStack: {
                  screens: {
                    RespositorySettings: '/repo/add',
                  },
                },
              },
            },
          },
        },
      }}
    >
      <LibraryContextProvider>
        <UpdateContextProvider>
          <OfflineBanner />
          {isNewVersion && <NewUpdateDialog newVersion={latestRelease} />}
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="BottomNavigator" component={BottomNavigator} />
            <Stack.Screen name="ReaderStack" component={LazyReaderStack} />
            <Stack.Screen name="MoreStack" component={LazyMoreStack} />
            <Stack.Screen
              name="SourceScreen"
              component={LazyBrowseSourceScreen}
            />
            <Stack.Screen name="BrowseMal" component={LazyMalTopNovels} />
            <Stack.Screen name="BrowseAL" component={LazyAniListTopNovels} />
            <Stack.Screen
              name="BrowseSettings"
              component={LazyBrowseSettings}
            />
            <Stack.Screen
              name="GlobalSearchScreen"
              component={LazyGlobalSearchScreen}
            />
            <Stack.Screen name="Migration" component={LazyMigration} />
            <Stack.Screen name="SourceNovels" component={LazySourceNovels} />
            <Stack.Screen name="MigrateNovel" component={LazyMigrateNovel} />
            <Stack.Screen name="WebviewScreen" component={LazyWebviewScreen} />
          </Stack.Navigator>
        </UpdateContextProvider>
      </LibraryContextProvider>
    </NavigationContainer>
  );
};

export default MainNavigator;
