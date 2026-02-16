import React from 'react';
import { StyleProp, View, ViewStyle, StyleSheet } from 'react-native';

const Row = ({
  children,
  style = {},
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => <View style={[styles.row, style]}>{children}</View>;

export { Row };

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
