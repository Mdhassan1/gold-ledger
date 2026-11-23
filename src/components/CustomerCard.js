import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { balancePresentation, formatGrams, formatINR } from '../utils/goldCalculations';
import { formatDisplayDate } from '../utils/dateUtils';

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function CustomerCard({ customer, onPress }) {
  const { theme } = useTheme();
  const balance = balancePresentation(customer.gold_balance_scaled);
  const toneColor = balance.tone === 'settled'
    ? theme.colors.success
    : balance.tone === 'excess'
      ? theme.colors.info
      : theme.colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceSecondary }]}>
        <Text style={[styles.initials, { color: theme.colors.accent }]}>{initials(customer.name)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{customer.name}</Text>
          <Text style={[styles.grams, { color: toneColor }]}>{formatGrams(customer.gold_balance_scaled)}</Text>
        </View>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {customer.phone || 'No mobile number'}
          {customer.is_archived ? '  ·  Archived' : ''}
        </Text>
        <View style={styles.bottom}>
          <Text style={[styles.status, { color: toneColor }]}>{balance.shortLabel}</Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            Advance {formatINR(customer.advance_balance_paise || 0)}
          </Text>
        </View>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Last payment {customer.last_payment_date ? formatDisplayDate(customer.last_payment_date) : 'none'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 16, fontWeight: '800' },
  body: { flex: 1, gap: 3 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700' },
  grams: { fontSize: 15, fontWeight: '700' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  status: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 13 },
});
