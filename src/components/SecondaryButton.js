import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function SecondaryButton({ label, onPress, loading = false, disabled = false, icon, danger = false, compact = false }) {
  const { theme } = useTheme();
  const inactive = disabled || loading;
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        {
          backgroundColor: theme.colors.surfaceSecondary,
          borderColor: theme.colors.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : icon}
      <Text style={[styles.label, compact && styles.compactLabel, { color }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  compact: { minHeight: 48, paddingHorizontal: 8 },
  compactLabel: { fontSize: 13 },
});
