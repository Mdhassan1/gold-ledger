import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { getConversion } from '../../services/conversionService';
import { getCustomer } from '../../services/customerService';
import { balancePresentation, formatGrams, formatINR } from '../../utils/goldCalculations';
import { formatDisplayDate } from '../../utils/dateUtils';
import { userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

export function ConversionSuccessScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const conversionId = route.params?.conversionId;
  const { data, loading, error, reload } = useScreenData(async () => {
    if (!customerId || !conversionId) return null;
    const [conversion, customer] = await Promise.all([getConversion(conversionId), getCustomer(customerId)]);
    return { conversion, customer };
  }, [customerId, conversionId]);

  if (!customerId || !conversionId) return <ErrorState message="This conversion could not be opened." />;
  if (loading && !data) return <LoadingState label="Saving confirmed" />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;
  const conversion = data.conversion;
  const presentation = balancePresentation(conversion.new_balance_scaled);

  return (
    <Screen scroll>
      <View style={{ padding: 20, borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 8 }}>
        <Text style={{ color: theme.colors.success, fontWeight: '800', fontSize: 14 }}>CONVERSION SAVED</Text>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700' }}>{data.customer.name}</Text>
        <Text style={{ color: theme.colors.textMuted }}>{formatDisplayDate(conversion.conversion_date)}</Text>
        <Text style={{ color: theme.colors.text }}>Previous balance {formatGrams(conversion.previous_balance_scaled)}</Text>
        <Text style={{ color: theme.colors.text }}>Income {formatINR(conversion.income_amount_paise)}</Text>
        <Text style={{ color: theme.colors.text }}>Advance {formatINR(conversion.advance_amount_paise)}</Text>
        <Text style={{ color: theme.colors.text }}>Rate {formatINR(conversion.gold_rate_paise_per_gram)} / g</Text>
        <Text style={{ color: theme.colors.text }}>Converted {formatGrams(conversion.converted_grams_scaled)}</Text>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>New balance {formatGrams(conversion.new_balance_scaled)}</Text>
        <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{presentation.sentence}</Text>
      </View>
      <PrimaryButton label="Back to customer" onPress={() => navigation.navigate('CustomerDetails', { customerId })} />
      <SecondaryButton label="Go to home" onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} />
    </Screen>
  );
}
