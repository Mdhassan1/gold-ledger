import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { formatGrams, formatINR } from '../utils/goldCalculations';
import { formatDisplayDate } from '../utils/dateUtils';
import { paymentMethodLabel } from '../utils/constants';

function describe(transaction) {
  if (transaction.kind === 'INCOME') {
    return {
      title: 'Income',
      amount: formatINR(transaction.amount_paise),
      status: transaction.status === 'CONVERTED' ? 'Converted' : 'Unconverted',
      tone: transaction.status === 'CONVERTED' ? 'settled' : 'owe',
    };
  }
  if (transaction.kind === 'ADVANCE') {
    const labels = { DEPOSIT: 'Advance deposit', CONSUMPTION: 'Advance used', REVERSAL: 'Advance restored' };
    return {
      title: labels[transaction.status] || 'Advance',
      amount: formatINR(transaction.amount_paise),
      status: transaction.status === 'CONSUMPTION' ? 'Used' : transaction.status === 'REVERSAL' ? 'Restored' : 'Available',
      tone: transaction.status === 'CONSUMPTION' ? 'info' : 'owe',
    };
  }
  return {
    title: 'Gold conversion',
    amount: formatGrams(transaction.grams_scaled || 0),
    status: transaction.status === 'REVERSED' ? 'Reversed' : 'Completed',
    tone: transaction.status === 'REVERSED' ? 'danger' : 'settled',
  };
}

export function TransactionCard({ transaction, onPress }) {
  const { theme } = useTheme();
  const view = describe(transaction);
  const toneColor = view.tone === 'settled'
    ? theme.colors.success
    : view.tone === 'danger'
      ? theme.colors.danger
      : view.tone === 'info'
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
      <View style={styles.row}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{view.title}</Text>
        <Text style={[styles.amount, { color: theme.colors.text }]}>{view.amount}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {transaction.customer_name ? `${transaction.customer_name}  ·  ` : ''}
          {formatDisplayDate(transaction.transaction_date)}
          {transaction.payment_method ? `  ·  ${paymentMethodLabel(transaction.payment_method)}` : ''}
        </Text>
        <Text style={[styles.status, { color: toneColor }]}>{view.status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 15, fontWeight: '700' },
  meta: { flex: 1, fontSize: 13 },
  status: { fontSize: 13, fontWeight: '700' },
});
