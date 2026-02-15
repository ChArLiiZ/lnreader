import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemeColors } from '../../theme/types';

interface ChipProps {
  label: string;
  theme: ThemeColors;
  onPress?: () => void;
}

const Chip: React.FC<ChipProps> = ({ label, theme, onPress }) => (
  <View
    style={[
      styles.chipContainer,
      {
        backgroundColor: theme.secondaryContainer,
      },
    ]}
  >
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={styles.pressable}
      onPress={onPress}
    >
      <Text
        style={[
          styles.label,
          {
            color: theme.onSecondaryContainer,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  </View>
);

export default Chip;

const styles = StyleSheet.create({
  chipContainer: {
    borderRadius: 8,
    height: 32,
    marginEnd: 8,
    overflow: 'hidden',
  },
  label: {
    fontSize: 14,
  },
  pressable: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
