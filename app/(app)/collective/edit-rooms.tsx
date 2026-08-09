import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropagandaButton } from '../../../components/ui/PropagandaButton';
import { COLORS } from '../../../constants/theme';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

const ROOM_TYPES = [
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'living_room', label: 'Living Room' },
  { key: 'dining_room', label: 'Dining Room' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'hallway', label: 'Hallway' },
];

export default function EditRoomsScreen() {
  const { collective, updateRooms } = useCollectiveStore();
  const [rooms, setRooms] = useState<Record<string, number>>(
    Object.fromEntries(
      ROOM_TYPES.map((r) => [r.key, (collective?.rooms as Record<string, number>)?.[r.key] ?? 0])
    )
  );
  const [loading, setLoading] = useState(false);

  const totalRooms = Object.values(rooms).reduce((a, b) => a + b, 0);

  function adjustRoom(key: string, delta: number) {
    setRooms((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
  }

  async function handleSave() {
    if (!collective) return;
    if (totalRooms < 1) {
      Alert.alert('At least 1 room required');
      return;
    }
    setLoading(true);
    try {
      await updateRooms(collective.id, rooms);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update rooms');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>EDIT ROOMS</Text>
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

        <PropagandaButton
          title="Save Changes"
          onPress={handleSave}
          loading={loading}
          disabled={totalRooms < 1}
          style={styles.btn}
        />
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Cancel</Text>
        </TouchableOpacity>
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
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: { color: COLORS.muted, fontSize: 13, marginBottom: 28, textAlign: 'center' },
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
  btn: { marginTop: 32, marginBottom: 12 },
  back: { color: COLORS.accent, textAlign: 'center', fontSize: 14 },
});
