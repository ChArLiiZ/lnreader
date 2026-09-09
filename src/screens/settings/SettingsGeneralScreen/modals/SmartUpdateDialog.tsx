import React from 'react';
import { Button, Dialog, Portal } from 'react-native-paper';

import { Checkbox } from '@components';
import { useTheme } from '@hooks/persisted';
import type { SmartUpdateFilters } from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';

interface SmartUpdateDialogProps {
  filters: SmartUpdateFilters;
  visible: boolean;
  onCancel: () => void;
  onChange: (filters: SmartUpdateFilters) => void;
  onSave: () => void;
}

const SmartUpdateDialog: React.FC<SmartUpdateDialogProps> = ({
  filters,
  visible,
  onCancel,
  onChange,
  onSave,
}) => {
  const theme = useTheme();

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onCancel}
        style={{ backgroundColor: theme.overlay3 }}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          {getString('generalSettingsScreen.smartUpdate')}
        </Dialog.Title>
        <Dialog.Content>
          <Checkbox
            label={getString('generalSettingsScreen.smartUpdateSkipWithUnread')}
            status={filters.skipWithUnread}
            onPress={() =>
              onChange({ ...filters, skipWithUnread: !filters.skipWithUnread })
            }
            theme={theme}
          />
          <Checkbox
            label={getString('generalSettingsScreen.smartUpdateSkipUnstarted')}
            status={filters.skipUnstarted}
            onPress={() =>
              onChange({ ...filters, skipUnstarted: !filters.skipUnstarted })
            }
            theme={theme}
          />
          <Checkbox
            label={getString('generalSettingsScreen.smartUpdateSkipCompleted')}
            status={filters.skipCompleted}
            onPress={() =>
              onChange({ ...filters, skipCompleted: !filters.skipCompleted })
            }
            theme={theme}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>{getString('common.cancel')}</Button>
          <Button onPress={onSave}>{getString('common.ok')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default SmartUpdateDialog;
