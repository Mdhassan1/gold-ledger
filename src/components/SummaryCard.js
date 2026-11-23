import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function SummaryCard({ label, value, hint, tone }) {
  const { theme } = useTheme();
  const toneColor = tone === 'success'
    ? theme.colors.success
    : tone === 'danger'
      ? theme.colors.danger
      : tone === 'info' || tone === 'owe'
        ? theme.colors.accent
        : theme.colors.text;
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: toneColor }]} numberOfLines={1}>{value}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: '46%', borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 12, fontWeight: '500' },
});
