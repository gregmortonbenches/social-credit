import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';
import { COLORS } from '../../constants/theme';

interface Props extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function PropagandaButton({ title, loading, variant = 'primary', style, disabled, ...rest }: Props) {
  const bg = variant === 'primary' ? COLORS.primary : variant === 'secondary' ? COLORS.accent : 'transparent';
  const fg = variant === 'ghost' ? COLORS.primary : '#FFFFFF';
  const borderColor = variant === 'ghost' ? COLORS.primary : 'transparent';

  return (
    <TouchableOpacity
      style={[styles.base, { backgroundColor: bg, borderColor, opacity: disabled || loading ? 0.6 : 1 }, style]}
      disabled={disabled || loading}
      activeOpacity={0.75}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{title.toUpperCase()}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'SpaceMono',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 2,
  },
});
