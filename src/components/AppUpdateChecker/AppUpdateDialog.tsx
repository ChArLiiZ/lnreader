import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Linking from 'expo-linking';
import { Portal } from 'react-native-paper';
import { ScrollView } from 'react-native-gesture-handler';

import { getString } from '@strings/translations';
import { useTheme } from '@hooks/persisted';

import Button from '../Button/Button';
import Modal from '../Modal/Modal';
import type { AppRelease } from './useAppUpdateChecker';

interface AppUpdateDialogProps {
  release: AppRelease;
  onDismiss: () => void;
  onIgnore: () => void;
}

const AppUpdateDialog: React.FC<AppUpdateDialogProps> = ({
  release,
  onDismiss,
  onIgnore,
}) => {
  const theme = useTheme();
  const maxContentHeight = useWindowDimensions().height / 2;

  const installUpdate = () => {
    if (release.downloadUrl) {
      Linking.openURL(release.downloadUrl);
    }
  };

  return (
    <Portal>
      <Modal visible onDismiss={onDismiss}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          {`${getString('common.newUpdateAvailable')} ${release.tag_name}`}
        </Text>
        <ScrollView style={{ maxHeight: maxContentHeight }}>
          <Text style={[styles.body, { color: theme.onSurfaceVariant }]}>
            {release.body.trim().split('\n').join('\n\n')}
          </Text>
        </ScrollView>
        <View style={styles.buttonCtn}>
          <Button title={getString('common.later')} onPress={onDismiss} />
          <Button title={getString('common.skipVersion')} onPress={onIgnore} />
          <Button
            title={getString('common.install')}
            disabled={!release.downloadUrl}
            onPress={installUpdate}
          />
        </View>
      </Modal>
    </Portal>
  );
};

export default AppUpdateDialog;

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    fontWeight: '500',
  },
  buttonCtn: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});
