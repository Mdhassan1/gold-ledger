import { useLayoutEffect } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { IconButton } from '../../components/IconButton';
import { FilterChips } from '../../components/FilterChips';
import { TransactionCard } from '../../components/TransactionCard';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { getCustomer } from '../../services/customerService';
import { getIncomeSummary } from '../../services/incomeService';
import { getAdvanceSummary } from '../../services/advanceService';
import { getGoldBalance, getTimeline } from '../../services/ledgerService';
import { listCustomerImages } from '../../services/galleryService';
import { balancePresentation, formatGrams, formatINR } from '../../utils/goldCalculations';
import { userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';
import { useState } from 'react';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'INCOME', label: 'Income' },
  { id: 'ADVANCE', label: 'Advance' },
  { id: 'CONVERSION', label: 'Gold conversion' },
];

function HeaderTitle({ name, phone }) {
  const { theme } = useTheme();
  return (
    <View style={{ maxWidth: 220 }}>
      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>{name}</Text>
      <Text numberOfLines={1} style={{ color: theme.colors.textMuted, fontSize: 13 }}>{phone || 'No mobile number'}</Text>
    </View>
  );
}

function Stat({ label, value, hint, color }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, gap: 2 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: color || theme.colors.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      {hint ? <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function CustomerDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const [filter, setFilter] = useState('ALL');
  const { data, loading, error, reload } = useScreenData(async () => {
    if (!customerId) return null;
    const [customer, balance, income, advance, timeline, images] = await Promise.all([
      getCustomer(customerId),
      getGoldBalance(customerId),
      getIncomeSummary(customerId),
      getAdvanceSummary(customerId),
      getTimeline(customerId),
      listCustomerImages(customerId),
    ]);
    const converted = timeline
      .filter((item) => item.kind === 'CONVERSION' && item.status === 'COMPLETED')
      .reduce((sum, item) => sum + Number(item.grams_scaled || 0), 0);
    return { customer, balance, income, advance, timeline, converted, images };
  }, [customerId]);

  useLayoutEffect(() => {
    if (!data?.customer) return undefined;
    navigation.setOptions({
      headerTitle: () => <HeaderTitle name={data.customer.name} phone={data.customer.phone} />,
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit customer"
          onPress={() => navigation.navigate('EditCustomer', { customerId })}
          hitSlop={8}
          style={{ marginRight: 4, padding: 6 }}
        >
          <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        </Pressable>
      ),
    });
    return undefined;
  }, [customerId, data, navigation, theme]);

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const presentation = balancePresentation(data.balance);
  const tone = presentation.tone === 'settled' ? theme.colors.success : presentation.tone === 'excess' ? theme.colors.info : theme.colors.accent;
  const transactions = data.timeline.filter((item) => filter === 'ALL' || item.kind === filter);
  const detailLine = [data.customer.address, data.customer.notes].filter(Boolean).join(' · ');

  return (
    <Screen scroll>
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Stat label="Pending gold" value={formatGrams(data.balance)} hint={presentation.shortLabel} color={tone} />
          <Stat label="Advance" value={formatINR(data.advance.availablePaise)} hint={`Deposited ${formatINR(data.advance.depositedPaise)} · Used ${formatINR(data.advance.consumedPaise)}`} />
          <Stat label="Unconverted income" value={formatINR(data.income.unconvertedPaise)} hint="Every payment not yet converted" />
          <Stat label="Total income" value={formatINR(data.income.totalPaise)} hint={`${data.income.paymentCount} payments`} />
          <Stat label="Converted gold" value={formatGrams(data.converted)} />
        </View>
        <Text style={{ color: tone, fontWeight: '700' }}>{presentation.sentence}</Text>
        {detailLine ? <Text style={{ color: theme.colors.textMuted }}>{detailLine}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton compact label="Add income" onPress={() => navigation.navigate('AddIncome', { customerId })} />
        </View>
        <View style={{ flex: 1 }}>
          <SecondaryButton compact label="Add advance" onPress={() => navigation.navigate('AddAdvance', { customerId })} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton compact label="Convert gold" onPress={() => navigation.navigate('GoldConversion', { customerId })} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Photos</Text>
          <IconButton
            icon="images-outline"
            accessibilityLabel="Customer gallery"
            onPress={() => navigation.navigate('CustomerGallery', { customerId })}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
          {data.images.map((image) => (
            <Pressable
              key={image.id}
              onPress={() => navigation.navigate('ImageViewer', { customerId, imageId: image.id })}
              style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.surfaceSecondary }}
            >
              <Image source={{ uri: image.local_uri }} style={{ width: 72, height: 72 }} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => navigation.navigate('CustomerGallery', { customerId })}
            style={{
              height: 72,
              paddingHorizontal: 14,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{data.images.length ? 'View all' : 'Add photos'}</Text>
          </Pressable>
        </ScrollView>
      </View>

      <SecondaryButton label="View all income" onPress={() => navigation.navigate('IncomeHistory', { customerId })} />

      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      {transactions.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No transactions" message="Income, advance, and gold conversions will appear here." />
      ) : (
        transactions.map((item) => (
          <TransactionCard
            key={`${item.kind}-${item.id}`}
            transaction={item}
            onPress={() => navigation.navigate('TransactionDetails', { customerId, kind: item.kind, id: item.id })}
          />
        ))
      )}
    </Screen>
  );
}
