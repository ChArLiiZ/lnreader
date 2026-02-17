import React, { useCallback, useEffect, useState } from 'react';
import { ThemeColors } from '@theme/types';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Portal, TextInput } from 'react-native-paper';
import { GoogleSignin, User } from '@react-native-google-signin/google-signin';
import { Button, EmptyView, Modal } from '@components';
import { FlatList, TouchableOpacity } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import { exists, getBackups, makeDir } from '@api/drive';
import { DriveFile } from '@api/drive/types';
import dayjs from 'dayjs';
import ServiceManager from '@services/ServiceManager';
import {
  sanitizeBackupFolderName,
  toBackupFolderName,
} from '@services/backup/utils';
import { useAppSettings } from '@hooks/persisted/useSettings';

enum BackupModal {
  UNAUTHORIZED,
  AUTHORIZED,
  CREATE_BACKUP,
  RESTORE_BACKUP,
}

function Authorized({
  theme,
  setBackupModal,
  setUser,
}: {
  theme: ThemeColors;
  setBackupModal: (backupModal: BackupModal) => void;
  setUser: (user?: User) => void;
}) {
  const signOut = () => {
    GoogleSignin.signOut()
      .then(() => {
        setUser();
        setBackupModal(BackupModal.UNAUTHORIZED);
      })
      .catch(() => {
        showToast(getString('common.error'));
      });
  };
  return (
    <>
      <Button
        title={getString('common.backup')}
        style={[styles.btnOutline, { borderColor: theme.outline }]}
        onPress={() => setBackupModal(BackupModal.CREATE_BACKUP)}
      />
      <Button
        title={getString('common.restore')}
        style={[styles.btnOutline, { borderColor: theme.outline }]}
        onPress={() => setBackupModal(BackupModal.RESTORE_BACKUP)}
      />
      <Button
        title={getString('common.signOut')}
        style={[styles.btnOutline, { borderColor: theme.outline }]}
        onPress={signOut}
      />
    </>
  );
}

function UnAuthorized({
  theme,
  setBackupModal,
  setUser,
}: {
  theme: ThemeColors;
  setBackupModal: (backupModal: BackupModal) => void;
  setUser: (user?: User | null) => void;
}) {
  const signIn = () => {
    GoogleSignin.hasPlayServices()
      .then(hasPlayServices => {
        if (hasPlayServices) {
          return GoogleSignin.signIn();
        }
      })
      .then(response => {
        if (response?.data) {
          setUser(response.data);
          setBackupModal(BackupModal.AUTHORIZED);
        }
      })
      .catch((err: Error) => {
        showToast(err?.message || getString('common.error'));
      });
  };
  return (
    <Button
      title={getString('common.signIn')}
      style={[styles.btnOutline, { borderColor: theme.outline }]}
      onPress={signIn}
    />
  );
}

function CreateBackup({
  theme,
  setBackupModal,
  closeModal,
  onFolderPrepared,
}: {
  theme: ThemeColors;
  setBackupModal: (backupModal: BackupModal) => void;
  closeModal: () => void;
  onFolderPrepared: (folder: DriveFile) => void;
}) {
  const [backupName, setBackupName] = useState('');
  const [fetching, setFetching] = useState(false);
  const normalizedBackupName = sanitizeBackupFolderName(backupName);

  const prepare = async () => {
    setFetching(true);
    let rootFolder = await exists('LNReader', true, undefined, true);
    if (!rootFolder) {
      rootFolder = await makeDir('LNReader');
    }
    const backupFolderName = toBackupFolderName(backupName);
    if (!backupFolderName) {
      throw new Error(getString('backupScreen.backupName'));
    }
    let backupFolder = await exists(backupFolderName, true, rootFolder.id);
    if (!backupFolder) {
      backupFolder = await makeDir(backupFolderName, rootFolder.id);
    }
    setFetching(false);
    return backupFolder;
  };

  return (
    <>
      <TextInput
        value={normalizedBackupName}
        placeholder={getString('backupScreen.backupName')}
        onChangeText={setBackupName}
        mode="outlined"
        underlineColor={theme.outline}
        theme={{ colors: { ...theme } }}
        placeholderTextColor={theme.onSurfaceDisabled}
        disabled={fetching}
      />
      <View style={styles.footerContainer}>
        <Button
          disabled={normalizedBackupName.length === 0 || fetching}
          title={getString('common.ok')}
          onPress={() => {
            prepare()
              .then(folder => {
                onFolderPrepared(folder);
                closeModal();
                ServiceManager.manager.addTask({
                  name: 'DRIVE_BACKUP',
                  data: folder,
                });
              })
              .catch((err: Error) => {
                setFetching(false);
                showToast(err?.message || getString('common.error'));
              });
          }}
        />
        <Button
          title={getString('common.cancel')}
          onPress={() => setBackupModal(BackupModal.AUTHORIZED)}
        />
      </View>
    </>
  );
}

function RestoreBackup({
  theme,
  setBackupModal,
  closeModal,
}: {
  theme: ThemeColors;
  setBackupModal: (backupModal: BackupModal) => void;
  closeModal: () => void;
}) {
  const [backupList, setBackupList] = useState<DriveFile[]>([]);
  useEffect(() => {
    exists('LNReader', true, undefined, true)
      .then(rootFolder => {
        if (rootFolder) {
          return getBackups(rootFolder.id, true).then(backups =>
            setBackupList(backups),
          );
        }
      })
      .catch((err: Error) => {
        showToast(err?.message || getString('common.error'));
      });
  }, []);

  const emptyComponent = useCallback(() => {
    return (
      <EmptyView
        description={getString('backupScreen.noBackupFound')}
        theme={theme}
      />
    );
  }, [theme]);

  return (
    <>
      <FlatList
        contentContainerStyle={styles.backupList}
        data={backupList}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Button
            mode="outlined"
            style={styles.btnOutline}
            onPress={() => {
              closeModal();
              ServiceManager.manager.addTask({
                name: 'DRIVE_RESTORE',
                data: item,
              });
            }}
          >
            <Text style={{ color: theme.primary }}>
              {item.name?.replace(/\.backup$/, ' ')}
            </Text>
            <Text style={[{ color: theme.secondary }, styles.fontSize]}>
              {'(' + dayjs(item.createdTime).format('LL') + ')'}
            </Text>
          </Button>
        )}
        ListEmptyComponent={emptyComponent}
      />
      <View style={styles.footerContainer}>
        <Button
          title={getString('common.cancel')}
          onPress={() => setBackupModal(BackupModal.AUTHORIZED)}
        />
      </View>
    </>
  );
}

interface GoogleDriveModalProps {
  visible: boolean;
  theme: ThemeColors;
  closeModal: () => void;
}

export default function GoogleDriveModal({
  visible,
  theme,
  closeModal,
}: GoogleDriveModalProps) {
  const { setAppSettings } = useAppSettings();
  const [backupModal, setBackupModal] = useState(BackupModal.UNAUTHORIZED);
  const [user, setUser] = useState<User | null | undefined>(null);
  useEffect(() => {
    GoogleSignin.configure({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const isSignedIn = GoogleSignin.hasPreviousSignIn();
    if (isSignedIn) {
      const localUser = GoogleSignin.getCurrentUser();
      if (localUser) {
        setUser(localUser);
        setBackupModal(BackupModal.AUTHORIZED);
      }
    } else {
      setBackupModal(BackupModal.UNAUTHORIZED);
    }
  }, []);

  const renderModal = () => {
    switch (backupModal) {
      case BackupModal.AUTHORIZED:
        return (
          <Authorized
            theme={theme}
            setBackupModal={setBackupModal}
            setUser={setUser}
          />
        );
      case BackupModal.UNAUTHORIZED:
        return (
          <UnAuthorized
            theme={theme}
            setBackupModal={setBackupModal}
            setUser={setUser}
          />
        );
      case BackupModal.CREATE_BACKUP:
        return (
          <CreateBackup
            theme={theme}
            setBackupModal={setBackupModal}
            closeModal={closeModal}
            onFolderPrepared={folder =>
              setAppSettings({
                autoBackupDriveFolderId: folder.id,
                autoBackupDriveFolderName: folder.name || '',
              })
            }
          />
        );
      case BackupModal.RESTORE_BACKUP:
        return (
          <RestoreBackup
            theme={theme}
            setBackupModal={setBackupModal}
            closeModal={closeModal}
          />
        );
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={closeModal}>
        <>
          <View style={styles.titleContainer}>
            <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
              {getString('backupScreen.drive.googleDriveBackup')}
            </Text>
            <TouchableOpacity
              onLongPress={() => {
                if (user?.user.email) {
                  Clipboard.setStringAsync(user.user.email).then(success => {
                    if (success) {
                      showToast(
                        getString('common.copiedToClipboard', {
                          name: user.user.email,
                        }),
                      );
                    }
                  });
                }
              }}
            >
              {user ? (
                <Image
                  source={{ uri: user?.user.photo || '' }}
                  style={styles.avatar}
                />
              ) : null}
            </TouchableOpacity>
          </View>
          {renderModal()}
        </>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 40,
    height: 40,
    width: 40,
  },
  backupList: {
    flexGrow: 1,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  btnOutline: {
    borderWidth: 1,
    marginVertical: 4,
  },
  error: {
    fontSize: 16,
    marginTop: 8,
  },
  footerContainer: {
    flexDirection: 'row-reverse',
    marginTop: 24,
  },
  loadingContent: {
    borderRadius: 16,
    width: '100%',
  },
  modalTitle: {
    fontSize: 24,
  },
  titleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    textAlignVertical: 'center',
  },
  fontSize: { fontSize: 12 },
});
