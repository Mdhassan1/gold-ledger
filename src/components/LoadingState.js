import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function LoadingState({ label = 'Loading records' }) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={theme.colors.accent} />
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  label: { fontSize: 15, fontWeight: '600' },
});
