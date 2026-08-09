import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropagandaButton } from '../../../components/ui/PropagandaButton';
import { PropagandaInput } from '../../../components/ui/PropagandaInput';
import { CONFIG } from '../../../constants/config';
import { COLORS } from '../../../constants/theme';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

const ROOM_TYPES = [
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'living_room', label: 'Living Room' },
  { key: 'dining_room', label: 'Dining Room' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'hallway', label: 'Hallway' },
];

export default function CreateCollectiveScreen() {
  const profile = useAuthStore((s) => s.profile);
  const createCollective = useCollectiveStore((s) => s.createCollective);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState<Record<string, number>>(
    Object.fromEntries(ROOM_TYPES.map((r) => [r.key, 1]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalRooms = Object.values(rooms).reduce((a, b) => a + b, 0);
  const nameValid = name.trim().length > 0 && name.trim().length <= CONFIG.COLLECTIVE_NAME_MAX_CHARS;

  function adjustRoom(key: string, delta: number) {
    setRooms((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
  }

  async function handleCreate() {
    if (totalRooms < 1) { setError('Add at least 1 room to the Collective'); return; }
    if (!profile) { setError('Profile not loaded. Please close and reopen the app.'); return; }
    setLoading(true);
    setError('');
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createCollective(name.trim(), timezone, rooms, profile.id);
      router.replace('/(app)');
    } catch (err: any) {
      setError(err.message ?? 'Failed to establish Collective');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>ESTABLISH COLLECTIVE</Text>

        {step === 1 && (
          <>
            <Text style={styles.label}>COLLECTIVE NAME</Text>
            <PropagandaInput
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={CONFIG.COLLECTIVE_NAME_MAX_CHARS}
              placeholder="e.g. The People's Kitchen"
            />
            {name.trim().length > 0 && (
              <Text style={styles.preview}>
                Preview: <Text style={styles.previewName}>{name.trim()} Collective</Text>
              </Text>
            )}
            <Text style={styles.charCount}>
              {name.trim().length}/{CONFIG.COLLECTIVE_NAME_MAX_CHARS}
            </Text>
            <PropagandaButton
              title="Proceed to Room Configuration"
              onPress={() => setStep(2)}
              disabled={!nameValid}
              style={styles.btn}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.sectionHeader}>CONFIGURE ROOMS</Text>
            <Text style={styles.hint}>Set the number of each room type in your household.</Text>
            {ROOM_TYPES.map((room) => (
              <View key={room.key} style={styles.roomRow}>
                <Text style={styles.roomLabel}>{room.label}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustRoom(room.key, -1)}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{rooms[room.key]}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustRoom(room.key, 1)}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PropagandaButton
              title="Establish the Collective!"
              onPress={handleCreate}
              loading={loading}
              disabled={totalRooms < 1}
              style={styles.btn}
            />
            <TouchableOpacity onPress={() => setStep(1)}>
              <Text style={styles.back}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 24, paddingTop: 60 },
  title: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 32,
    textAlign: 'center',
  },
  label: { color: COLORS.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  preview: { color: COLORS.muted, fontSize: 13, marginBottom: 4 },
  previewName: { color: COLORS.accent, fontWeight: '700' },
  charCount: { color: COLORS.muted, fontSize: 11, textAlign: 'right', marginBottom: 16 },
  sectionHeader: { color: COLORS.accent, fontSize: 14, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  hint: { color: COLORS.muted, fontSize: 13, marginBottom: 20 },
  roomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  roomLabel: { color: COLORS.text, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.surface,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  stepBtnText: { color: COLORS.primary, fontSize: 20, fontWeight: '700', lineHeight: 24 },
  stepValue: { color: COLORS.text, fontSize: 18, fontFamily: 'SpaceMono', minWidth: 24, textAlign: 'center' },
  errorText: { color: COLORS.danger, fontSize: 13, marginBottom: 12 },
  btn: { marginTop: 24, marginBottom: 12 },
  back: { color: COLORS.accent, textAlign: 'center', fontSize: 14 },
});
