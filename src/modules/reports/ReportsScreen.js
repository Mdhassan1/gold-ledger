import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { FilterChips } from '../../components/FilterChips';
import { SummaryCard } from '../../components/SummaryCard';
import { TransactionCard } from '../../components/TransactionCard';
import { CustomModal } from '../../components/CustomModal';
import { CustomerSelectList } from '../../components/CustomerSelectList';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { SecondaryButton } from '../../components/SecondaryButton';
import { getReports } from '../../services/reportService';
import { balancePresentation, formatGrams, formatINR } from '../../utils/goldCalculations';
import { shiftPeriodAnchor, todayISODate } from '../../utils/dateUtils';
import { userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

const PERIODS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

export function ReportsScreen({ navigation }) {
  const { theme } = useTheme();
  const [period, setPeriod] = useState('day');
  const [anchor, setAnchor] = useState(todayISODate());
  const [customerId, setCustomerId] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [chooserOpen, setChooserOpen] = useState(false);
  const { data, loading, error, reload } = useScreenData(
    () => getReports({ period, anchor, customerId }),
    [period, anchor, customerId],
  );

  const chooseScope = (id) => {
    if (id === 'all') {
      setCustomerId(null);
      setCustomerName('');
      return;
    }
    setChooserOpen(true);
  };

  if (loading && !data) return <LoadingState label="Calculating reports" />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const balance = balancePresentation(data.outstanding.balanceScaled);
  const balanceHint = customerId
    ? `${balance.shortLabel}. Current balance, not limited to this period.`
    : `Customers owe ${formatGrams(data.outstanding.pendingScaled)}. Excess credit ${formatGrams(data.outstanding.excessScaled)}.`;

  return (
    <Screen scroll>
      <FilterChips options={PERIODS} value={period} onChange={setPeriod} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pressable accessibilityLabel="Previous period" onPress={() => setAnchor(shiftPeriodAnchor(period, anchor, -1))} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1, textAlign: 'center' }}>{data.range.label}</Text>
        <Pressable accessibilityLabel="Next period" onPress={() => setAnchor(shiftPeriodAnchor(period, anchor, 1))} style={{ padding: 8 }}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
        </Pressable>
      </View>
      <FilterChips
        options={[{ id: 'all', label: 'All customers' }, { id: 'one', label: 'Choose customer' }]}
        value={customerId ? 'one' : 'all'}
        onChange={chooseScope}
      />
      {customerId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1 }}>{customerName}</Text>
          <SecondaryButton compact label="Change" onPress={() => setChooserOpen(true)} />
        </View>
      ) : (
        <Text style={{ color: theme.colors.textMuted }}>Combined figures for every active customer.</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SummaryCard label="Total income" value={formatINR(data.income.totalPaise)} hint={`Collected in this ${period}`} />
        <SummaryCard label="Advance deposits" value={formatINR(data.advance.depositedPaise)} hint="Not included in income" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SummaryCard label="Advance used" value={formatINR(data.advance.consumedPaise)} hint="Used in conversions this period" />
        <SummaryCard label="Unconverted income" value={formatINR(data.outstanding.unconvertedPaise)} hint="Still waiting. Not limited to this period." />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SummaryCard label="Converted gold" value={formatGrams(data.gold.convertedScaled)} hint={`${data.gold.conversionCount} conversions this period`} />
        <SummaryCard
          label="Pending gold"
          value={formatGrams(data.outstanding.balanceScaled)}
          hint={balanceHint}
          tone={balance.tone === 'excess' ? 'info' : balance.tone === 'settled' ? 'success' : 'owe'}
        />
      </View>
      <Text style={{ color: theme.colors.textMuted }}>{balance.sentence}</Text>

      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>Transactions</Text>
      {data.transactions.length === 0 ? (
        <EmptyState icon="receipt-outline" title="Nothing in this period" message="Income, advance, and gold conversions for the selected customer and dates will appear here." />
      ) : data.transactions.map((item) => (
        <TransactionCard
          key={`${item.kind}-${item.id}`}
          transaction={customerId ? { ...item, customer_name: null } : item}
          onPress={() => navigation.navigate('CustomerStack', {
            screen: 'TransactionDetails',
            params: { kind: item.kind, id: item.id },
          })}
        />
      ))}

      <CustomModal visible={chooserOpen} title="Choose a customer" onClose={() => setChooserOpen(false)}>
        <CustomerSelectList onSelect={(customer) => {
          setCustomerId(customer.id);
          setCustomerName(customer.name);
          setChooserOpen(false);
        }}
        />
      </CustomModal>
    </Screen>
  );
}
