import { useCallback, useEffect, useState } from 'react';
import DeviceInfo from 'react-native-device-info';

import { newer } from '@utils/compareVersion';
import { MMKVStorage } from '@utils/mmkv/mmkv';

import { version } from '../../../package.json';

interface AppUpdate {
  isNewVersion: boolean;
  latestRelease?: AppRelease;
  ignoreVersion: (versionTag: string) => void;
}

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubRelease {
  tag_name?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

export interface AppRelease {
  tag_name: string;
  body: string;
  downloadUrl?: string;
}

const LATEST_RELEASE_URL =
  'https://api.github.com/repos/rajarsheechatterjee/lnreader/releases/latest';
const LAST_UPDATE_CHECK_KEY = 'LAST_UPDATE_CHECK';
const IGNORED_UPDATE_VERSION_KEY = 'IGNORED_UPDATE_VERSION';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Releases ship one APK per ABI plus a universal build. Taking the first asset
 * hands most devices an APK they cannot install, so match the device's own ABIs
 * first and keep the universal build as the fallback.
 */
const getReleaseDownloadUrl = async (
  assets: GithubReleaseAsset[] = [],
): Promise<string | undefined> => {
  const apkAssets = assets.filter(
    asset => asset.name?.endsWith('.apk') && asset.browser_download_url,
  );
  const universalAsset = apkAssets.find(asset =>
    asset.name?.endsWith('-universal.apk'),
  );

  try {
    const supportedAbis = await DeviceInfo.supportedAbis();

    for (const abi of supportedAbis) {
      const matchingAsset = apkAssets.find(asset =>
        asset.name?.endsWith(`-${abi}.apk`),
      );

      if (matchingAsset?.browser_download_url) {
        return matchingAsset.browser_download_url;
      }
    }
  } catch {
    // Fall back to the universal APK when ABI detection is unavailable.
  }

  return (
    universalAsset?.browser_download_url || apkAssets[0]?.browser_download_url
  );
};

const shouldCheckForUpdate = (): boolean => {
  const lastCheckTime = MMKVStorage.getNumber(LAST_UPDATE_CHECK_KEY);
  if (!lastCheckTime) {
    return true;
  }

  return Date.now() - lastCheckTime >= ONE_DAY_MS;
};

const isNewerVersion = (versionTag: string): boolean =>
  newer(versionTag.replace(/[^\d.]/, ''), `${version}`);

export const useAppUpdateChecker = (): AppUpdate => {
  const [checking, setChecking] = useState(true);
  const [latestRelease, setLatestRelease] = useState<AppRelease>();
  const [ignoredVersion, setIgnoredVersion] = useState(() =>
    MMKVStorage.getString(IGNORED_UPDATE_VERSION_KEY),
  );

  const ignoreVersion = useCallback((versionTag: string) => {
    MMKVStorage.set(IGNORED_UPDATE_VERSION_KEY, versionTag);
    setIgnoredVersion(versionTag);
  }, []);

  const checkForRelease = useCallback(async () => {
    if (!shouldCheckForUpdate()) {
      setChecking(false);
      return;
    }

    try {
      const response = await fetch(LATEST_RELEASE_URL);

      if (!response.ok) {
        setChecking(false);
        return;
      }

      const data = (await response.json()) as GithubRelease;

      if (!data.tag_name) {
        setChecking(false);
        return;
      }

      const downloadUrl = await getReleaseDownloadUrl(data.assets);

      MMKVStorage.set(LAST_UPDATE_CHECK_KEY, Date.now());
      setLatestRelease({
        tag_name: data.tag_name,
        body: data.body ?? '',
        downloadUrl,
      });
      setChecking(false);
    } catch {
      // Silently fail in offline mode or on network errors.
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkForRelease();
  }, [checkForRelease]);

  const isNewVersion =
    !checking &&
    latestRelease !== undefined &&
    latestRelease.tag_name !== ignoredVersion &&
    isNewerVersion(latestRelease.tag_name);

  return {
    latestRelease,
    isNewVersion,
    ignoreVersion,
  };
};
