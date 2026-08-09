import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  showToggle?: boolean;
}

export function PropagandaInput({ label, error, style, showToggle, secureTextEntry, ...rest }: Props) {
  const [hidden, setHidden] = useState(true);
  const isSecure = showToggle ? hidden : secureTextEntry;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, error ? styles.inputError : null, showToggle && styles.inputWithToggle, style]}
          placeholderTextColor={COLORS.muted}
          secureTextEntry={isSecure}
          {...rest}
        />
        {showToggle && (
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setHidden((v) => !v)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
  },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: '#3D2020',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'SpaceMono',
  },
  inputWithToggle: { paddingRight: 46 },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  inputError: { borderColor: COLORS.danger },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
});
