import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader } from '../../components/AppHeader';
import { SummaryCard } from '../../components/SummaryCard';
import { CustomerCard } from '../../components/CustomerCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { listCustomers } from '../../services/customerService';
import { getHomeSummary } from '../../services/reportService';
import { getBusinessProfile } from '../../services/settingsService';
import { balancePresentation, formatGrams, formatINR } from '../../utils/goldCalculations';
import { formatLongDate, todayISODate } from '../../utils/dateUtils';
import { userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

export function HomeScreen({ navigation }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, loading, refreshing, error, reload } = useScreenData(
    () => Promise.all([
      listCustomers(query, { includeArchived }),
      getHomeSummary(todayISODate()),
      getBusinessProfile(),
    ]).then(([customers, summary, business]) => ({ customers, summary, business })),
    [query, includeArchived],
  );

  if (loading && !data) return <LoadingState label="Opening the ledger" />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const summary = data.summary;
  const net = balancePresentation(summary.netScaled);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'left', 'right']}>
      <AppHeader
        title={data.business.name || 'GoldLedger'}
        subtitle={formatLongDate(todayISODate())}
        onSearch={() => setSearchOpen((open) => !open)}/* 
        onSettings={() => navigation.navigate('Settings')} */
      />
      {searchOpen ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or mobile"
          placeholderTextColor={theme.colors.textMuted}
          autoFocus
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            minHeight: 48,
            borderRadius: 14,
            paddingHorizontal: 14,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            color: theme.colors.text,
            fontSize: 16,
          }}
        />
      ) : null}
      <FlatList
        data={data.customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SummaryCard label="Customers" value={String(summary.totalCustomers)} hint="Active accounts" />
              <SummaryCard label="Pending gold" value={formatGrams(summary.pendingScaled)} hint="Customers owe" tone="owe" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SummaryCard label="Today's income" value={formatINR(summary.todayIncomePaise)} hint="Collections" />
              <SummaryCard label="Outstanding" value={formatGrams(summary.netScaled)} hint={net.shortLabel} tone={net.tone === 'excess' ? 'info' : net.tone === 'settled' ? 'success' : undefined} />
            </View>
            <Pressable onPress={() => setIncludeArchived((value) => !value)}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>
                {includeArchived ? 'Hide archived customers' : 'Show archived customers'}
              </Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={query ? 'No matching customers' : 'No customers yet'}
            message={query ? 'Try a different name or mobile number.' : 'Add the first customer to start the ledger.'}
          />
        }
        renderItem={({ item }) => (
          <CustomerCard
            customer={item}
            onPress={() => navigation.navigate('CustomerStack', {
              screen: 'CustomerDetails',
              params: { customerId: item.id },
              initial: false,
            })}
          />
        )}
      />
      <FloatingActionButton
        accessibilityLabel="Add customer"
        onPress={() => navigation.navigate('CustomerStack', { screen: 'AddCustomer' })}
      />
    </SafeAreaView>
  );
}
