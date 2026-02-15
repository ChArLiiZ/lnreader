import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNetworkStatus } from '@hooks/common/useNetworkStatus';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';

/**
 * A banner that appears when the device is offline.
 * Place this at the top of screens that rely on network connectivity.
 */
const OfflineBanner: React.FC = () => {
  const { isConnected } = useNetworkStatus();
  const theme = useTheme();

  if (isConnected !== false) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.errorContainer }]}>
      <Text style={[styles.text, { color: theme.onErrorContainer }]}>
        {getString('common.noConnection')}
      </Text>
    </View>
  );
};

export default OfflineBanner;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});
