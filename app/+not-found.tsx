import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>PAGE NOT FOUND</Text>
      <Text style={styles.body}>
        This route does not exist, Comrade. You have strayed from the path of the Collective.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(app)')}>
        <Text style={styles.btnText}>RETURN TO THE COLLECTIVE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  code: { color: COLORS.primary, fontSize: 72, fontWeight: '900', letterSpacing: 4 },
  title: { color: COLORS.accent, fontSize: 18, fontWeight: '700', letterSpacing: 3, marginBottom: 16 },
  body: { color: COLORS.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 0,
  },
  btnText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 2 },
});
