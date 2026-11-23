import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { SecondaryButton } from '../../components/SecondaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { getIncome } from '../../services/incomeService';
import { getAdvance } from '../../services/advanceService';
import { getConversion, reverseConversion } from '../../services/conversionService';
import { balancePresentation, formatGrams, formatINR } from '../../utils/goldCalculations';
import { formatDisplayDate, formatTimestamp } from '../../utils/dateUtils';
import { paymentMethodLabel } from '../../utils/constants';
import { isAppError, userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

async function loadRecord(kind, id) {
  if (kind === 'INCOME') return getIncome(id);
  if (kind === 'ADVANCE') return getAdvance(id);
  return getConversion(id);
}

function Row({ label, value }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>{value || '—'}</Text>
    </View>
  );
}

export function TransactionDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const kind = route.params?.kind;
  const id = route.params?.id;
  const { data, loading, error, reload } = useScreenData(
    () => (kind && id ? loadRecord(kind, id) : Promise.resolve(null)),
    [kind, id],
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (!kind || !id) return <ErrorState message="This transaction could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const reverse = async () => {
    setSaving(true);
    try {
      await reverseConversion(id);
      setConfirming(false);
      navigation.goBack();
    } catch (reverseError) {
      setConfirming(false);
      setMessage(isAppError(reverseError) ? reverseError.message : userMessage(reverseError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 12 }}>
        {kind === 'INCOME' ? (
          <>
            <Row label="Type" value="Income" />
            <Row label="Amount" value={formatINR(data.amount_paise)} />
            <Row label="Date" value={formatDisplayDate(data.payment_date)} />
            <Row label="Method" value={paymentMethodLabel(data.payment_method)} />
            <Row label="Status" value={data.conversion_status === 'CONVERTED' ? 'Converted' : 'Unconverted'} />
            <Row label="Notes" value={data.notes} />
            <Row label="Recorded" value={formatTimestamp(data.created_at)} />
          </>
        ) : null}
        {kind === 'ADVANCE' ? (
          <>
            <Row label="Type" value={`Advance ${data.transaction_type.toLowerCase()}`} />
            <Row label="Amount" value={formatINR(data.amount_paise)} />
            <Row label="Date" value={formatDisplayDate(data.transaction_date)} />
            <Row label="Method" value={data.payment_method ? paymentMethodLabel(data.payment_method) : '—'} />
            <Row label="Notes" value={data.notes} />
            <Row label="Recorded" value={formatTimestamp(data.created_at)} />
          </>
        ) : null}
        {kind === 'CONVERSION' ? (
          <>
            <Row label="Type" value="Gold conversion" />
            <Row label="Status" value={data.reversed_at ? 'Reversed' : 'Completed'} />
            <Row label="Date" value={formatDisplayDate(data.conversion_date)} />
            <Row label="Previous balance" value={formatGrams(data.previous_balance_scaled)} />
            <Row label="Income included" value={formatINR(data.income_amount_paise)} />
            <Row label="Advance included" value={formatINR(data.advance_amount_paise)} />
            <Row label="Gold rate" value={`${formatINR(data.gold_rate_paise_per_gram)} / g`} />
            <Row label="Converted grams" value={formatGrams(data.converted_grams_scaled)} />
            <Row label="New balance" value={formatGrams(data.new_balance_scaled)} />
            <Row label="Result" value={balancePresentation(data.new_balance_scaled).sentence} />
            <Row label="Notes" value={data.notes} />
            <Row label="Recorded" value={formatTimestamp(data.created_at)} />
          </>
        ) : null}
      </View>
      {message ? <Text style={{ color: theme.colors.danger }}>{message}</Text> : null}
      {kind === 'CONVERSION' && !data.reversed_at ? (
        <SecondaryButton label="Reverse conversion" danger onPress={() => setConfirming(true)} />
      ) : null}
      <Text style={{ color: theme.colors.textMuted }}>
        Completed conversions are not edited. A reversal adds an offsetting ledger entry and returns included income to unconverted.
      </Text>
      <ConfirmationDialog
        visible={confirming}
        title="Reverse this conversion?"
        message="The original conversion stays in history. Gold balance, advance, and the included income will be restored."
        confirmLabel="Reverse"
        destructive
        loading={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={reverse}
      />
    </Screen>
  );
}
