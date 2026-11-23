import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function PrimaryButton({ label, onPress, loading = false, disabled = false, icon, compact = false }) {
  const { theme } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: theme.colors.accent, opacity: inactive ? 0.5 : pressed ? 0.88 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={theme.colors.accentText} /> : icon}
      <Text style={[styles.label, compact && styles.compactLabel, { color: theme.colors.accentText }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
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
