import React from 'react';

import { Dialog, Portal } from 'react-native-paper';
import { ScrollView } from 'react-native';

import { Modal, RadioButton } from '@components';
import { useAppSettings, useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import {
  DATE_FORMATS,
  DateFormat,
  getDateFormatLabel,
} from '@utils/dateFormat';

interface DateFormatModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const DateFormatModal: React.FC<DateFormatModalProps> = ({
  visible,
  onDismiss,
}) => {
  const theme = useTheme();
  const { dateFormat = 'default', setAppSettings } = useAppSettings();

  const selectDateFormat = (value: DateFormat) => {
    setAppSettings({ dateFormat: value });
    onDismiss();
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{getString('appearanceScreen.dateFormat')}</Dialog.Title>
        <ScrollView>
          {DATE_FORMATS.map(format => (
            <RadioButton
              key={format}
              status={dateFormat === format}
              onPress={() => selectDateFormat(format)}
              label={getDateFormatLabel(format)}
              theme={theme}
            />
          ))}
        </ScrollView>
      </Modal>
    </Portal>
  );
};

export default DateFormatModal;
