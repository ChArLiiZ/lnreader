import React from 'react';
import { useTheme } from '@hooks/persisted';
import { Appbar, List, SafeAreaView, SwitchItem } from '@components';
import { useBoolean } from '@hooks';
import { BackupSettingsScreenProps } from '@navigators/types';
import GoogleDriveModal from './Components/GoogleDriveModal';
import SelfHostModal from './Components/SelfHostModal';
import ServiceManager from '@services/ServiceManager';
import { ScrollView } from 'react-native-gesture-handler';
import { getString } from '@strings/translations';
import { Platform, StyleSheet } from 'react-native';
import { showToast } from '@utils/showToast';
import { openDocumentTree } from 'react-native-saf-x';
import { useAppSettings } from '@hooks/persisted/useSettings';
import dayjs from 'dayjs';

const BackupSettings = ({ navigation }: BackupSettingsScreenProps) => {
  const theme = useTheme();
  const {
    autoBackupEnabled,
    autoBackupIntervalHours,
    autoBackupLastRunAt,
    autoBackupTargetType,
    autoBackupTargetUri,
    autoBackupDriveFolderName,
    setAppSettings,
  } = useAppSettings();
  const {
    value: googleDriveModalVisible,
    setFalse: closeGoogleDriveModal,
    setTrue: openGoogleDriveModal,
  } = useBoolean();

  const {
    value: selfHostModalVisible,
    setFalse: closeSelfHostModal,
    setTrue: openSelfHostModal,
  } = useBoolean();

  const autoBackupIntervals = [6, 12, 24, 48, 72, 168];
  const currentIntervalIndex = autoBackupIntervals.indexOf(
    autoBackupIntervalHours,
  );
  const nextInterval =
    autoBackupIntervals[
      currentIntervalIndex === -1
        ? 0
        : (currentIntervalIndex + 1) % autoBackupIntervals.length
    ];
  const lastAutoBackupText = autoBackupLastRunAt
    ? dayjs(autoBackupLastRunAt).format('YYYY-MM-DD HH:mm')
    : getString('backupScreen.never');
  const resolvedAutoBackupTargetType =
    autoBackupTargetType === 'drive' ? 'drive' : 'local';
  const isAutoBackupTargetLocal = resolvedAutoBackupTargetType === 'local';

  const pickAutoBackupFolder = async () => {
    if (Platform.OS !== 'android') {
      showToast(getString('backupScreen.autoBackupAndroidOnly'));
      return;
    }
    try {
      const dir = await openDocumentTree(true);
      if (dir?.uri) {
        setAppSettings({ autoBackupTargetUri: dir.uri });
      }
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.backup')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView style={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('backupScreen.remoteBackup')}
          </List.SubHeader>
          <List.Item
            title={getString('backupScreen.selfHost')}
            description={getString('backupScreen.selfHostDesc')}
            theme={theme}
            onPress={openSelfHostModal}
          />

          <List.Item
            title={getString('backupScreen.googleDrive')}
            description={getString('backupScreen.googleDriveDesc')}
            theme={theme}
            onPress={openGoogleDriveModal}
          />
          <List.SubHeader theme={theme}>
            {getString('backupScreen.localBackup')}
          </List.SubHeader>
          <SwitchItem
            value={autoBackupEnabled}
            onPress={() =>
              setAppSettings({
                autoBackupEnabled: !autoBackupEnabled,
              })
            }
            label={getString('backupScreen.autoBackupEnabled')}
            description={
              isAutoBackupTargetLocal
                ? autoBackupTargetUri
                  ? getString('backupScreen.autoBackupEnabledWithPath', {
                      path: decodeURIComponent(autoBackupTargetUri),
                    })
                  : getString('backupScreen.autoBackupEnabledNoPath')
                : autoBackupDriveFolderName
                ? getString('backupScreen.autoBackupEnabledWithDriveFolder', {
                    folder: autoBackupDriveFolderName,
                  })
                : getString('backupScreen.autoBackupEnabledNoDriveFolder')
            }
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.autoBackupDestination')}
            description={getString(
              isAutoBackupTargetLocal
                ? 'backupScreen.autoBackupDestinationLocal'
                : 'backupScreen.autoBackupDestinationDrive',
            )}
            onPress={() =>
              setAppSettings({
                autoBackupTargetType: isAutoBackupTargetLocal
                  ? 'drive'
                  : 'local',
              })
            }
            theme={theme}
          />
          <List.Item
            title={
              isAutoBackupTargetLocal
                ? getString('backupScreen.autoBackupFolder')
                : getString('backupScreen.autoBackupDriveFolder')
            }
            description={
              isAutoBackupTargetLocal
                ? autoBackupTargetUri
                  ? decodeURIComponent(autoBackupTargetUri)
                  : getString('backupScreen.autoBackupNoFolderSelected')
                : autoBackupDriveFolderName ||
                  getString('backupScreen.autoBackupDriveNoFolderSelected')
            }
            onPress={
              isAutoBackupTargetLocal
                ? pickAutoBackupFolder
                : openGoogleDriveModal
            }
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.autoBackupInterval')}
            description={getString('backupScreen.autoBackupIntervalDesc', {
              hours: autoBackupIntervalHours,
            })}
            onPress={() =>
              setAppSettings({ autoBackupIntervalHours: nextInterval })
            }
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.lastAutoBackup', {
              time: lastAutoBackupText,
            })}
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.createBackup')}
            description={getString('backupScreen.createBackupDesc')}
            onPress={() => {
              ServiceManager.manager.addTask({ name: 'LOCAL_BACKUP' });
            }}
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.restoreBackup')}
            description={getString('backupScreen.restoreBackupDesc')}
            onPress={() => {
              ServiceManager.manager.addTask({ name: 'LOCAL_RESTORE' });
            }}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.restoreLargeBackupsWarning')}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.createBackupWarning')}
            theme={theme}
          />
        </List.Section>
      </ScrollView>
      <GoogleDriveModal
        visible={googleDriveModalVisible}
        theme={theme}
        closeModal={closeGoogleDriveModal}
      />
      <SelfHostModal
        theme={theme}
        visible={selfHostModalVisible}
        closeModal={closeSelfHostModal}
      />
    </SafeAreaView>
  );
};

export default BackupSettings;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 40 },
});
