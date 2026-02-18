import { showToast } from '@utils/showToast';
import dayjs from 'dayjs';
import {
  saveDocuments,
  pick,
  types,
  keepLocalCopy,
} from '@react-native-documents/picker';
import {
  CACHE_DIR_PATH,
  cleanupBackupTempData,
  prepareBackupData,
  prepareDownloadedChaptersBackupData,
  restoreData,
} from '../utils';
import NativeZipArchive from '@specs/NativeZipArchive';
import { ROOT_STORAGE } from '@utils/Storages';
import { ZipBackupName } from '../types';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { sleep } from '@utils/sleep';
import { Platform } from 'react-native';
import {
  copyFile as safCopyFile,
  exists as safExists,
  unlink as safUnlink,
} from 'react-native-saf-x';

interface LocalBackupOptions {
  targetUri?: string;
  silent?: boolean;
}

export const createBackup = async (
  setMeta?: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
  options: LocalBackupOptions = {},
) => {
  try {
    setMeta?.(meta => ({
      ...meta,
      isRunning: true,
      progress: 0 / 4,
      progressText: getString('backupScreen.preparingData'),
    }));

    await prepareBackupData(CACHE_DIR_PATH);

    setMeta?.(meta => ({
      ...meta,
      progress: 1 / 4,
      progressText: getString('backupScreen.uploadingDownloadedFiles'),
    }));

    await sleep(200);

    const downloadStageDirPath = await prepareDownloadedChaptersBackupData(
      CACHE_DIR_PATH,
    );

    await NativeZipArchive.zip(
      downloadStageDirPath,
      CACHE_DIR_PATH + '/' + ZipBackupName.DOWNLOAD,
    );

    setMeta?.(meta => ({
      ...meta,
      progress: 2 / 4,
      progressText: getString('backupScreen.uploadingData'),
    }));

    await sleep(200);

    await NativeZipArchive.zip(CACHE_DIR_PATH, CACHE_DIR_PATH + '.zip');

    setMeta?.(meta => ({
      ...meta,
      progress: 3 / 4,
      progressText: getString('backupScreen.savingBackup'),
    }));

    const datetime = dayjs().format('YYYY-MM-DD_HH_mm');
    const fileName = 'lnreader_backup_' + datetime + '.zip';
    const localZipUri = 'file://' + CACHE_DIR_PATH + '.zip';

    if (options.targetUri && Platform.OS === 'android') {
      const baseUri = options.targetUri.replace(/\/+$/, '');
      const destinationUri = `${baseUri}/${fileName}`;
      if (await safExists(destinationUri)) {
        await safUnlink(destinationUri);
      }
      await safCopyFile(localZipUri, destinationUri, {
        replaceIfDestinationExists: true,
      });
    } else {
      await saveDocuments({
        sourceUris: [localZipUri],
        copy: false,
        mimeType: 'application/zip',
        fileName,
      });
    }

    setMeta?.(meta => ({
      ...meta,
      progress: 4 / 4,
      isRunning: false,
    }));

    if (!options.silent) {
      showToast(getString('backupScreen.backupCreated'));
    }
  } catch (error: unknown) {
    setMeta?.(meta => ({
      ...meta,
      isRunning: false,
    }));
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      cleanupBackupTempData();
    } catch {
      // Ignore cleanup errors
    }
  }
};

export const restoreBackup = async (
  setMeta?: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  try {
    setMeta?.(meta => ({
      ...meta,
      isRunning: true,
      progress: 0 / 4,
      progressText: getString('backupScreen.downloadingData'),
    }));

    const [result] = await pick({
      mode: 'import',
      type: [types.zip],
      allowVirtualFiles: true, // TODO: hopefully this just works
    });

    if (NativeFile.exists(CACHE_DIR_PATH)) {
      NativeFile.unlink(CACHE_DIR_PATH);
    }

    const [localRes] = await keepLocalCopy({
      files: [
        {
          uri: result.uri,
          fileName: 'backup.zip',
        },
      ],
      destination: 'cachesDirectory',
    });
    if (localRes.status === 'error') {
      throw new Error(localRes.copyError);
    }

    const localPath = localRes.localUri.replace(/^file:(\/\/)?\//, '/');

    setMeta?.(meta => ({
      ...meta,
      progress: 1 / 4,
      progressText: getString('backupScreen.extractingBackup'),
    }));

    await sleep(200);

    await NativeZipArchive.unzip(localPath, CACHE_DIR_PATH);

    setMeta?.(meta => ({
      ...meta,
      progress: 2 / 4,
      progressText: getString('backupScreen.restoringData'),
    }));

    await sleep(200);

    await restoreData(CACHE_DIR_PATH);

    setMeta?.(meta => ({
      ...meta,
      progress: 3 / 4,
      progressText: getString('backupScreen.downloadingDownloadedFiles'),
    }));

    await sleep(200);

    await NativeZipArchive.unzip(
      CACHE_DIR_PATH + '/' + ZipBackupName.DOWNLOAD,
      ROOT_STORAGE,
    );

    setMeta?.(meta => ({
      ...meta,
      progress: 4 / 4,
      isRunning: false,
    }));

    showToast(getString('backupScreen.backupRestored'));
  } catch (error: unknown) {
    setMeta?.(meta => ({
      ...meta,
      isRunning: false,
    }));
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      cleanupBackupTempData();
    } catch {
      // Ignore cleanup errors
    }
  }
};
