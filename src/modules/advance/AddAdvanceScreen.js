import { useState } from 'react';
import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { CustomInput } from '../../components/CustomInput';
import { DateSelector } from '../../components/DateSelector';
import { FilterChips } from '../../components/FilterChips';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { PAYMENT_METHODS, paymentMethodLabel } from '../../utils/constants';
import { formatDisplayDate, todayISODate } from '../../utils/dateUtils';
import { addAdvance, getAdvanceSummary } from '../../services/advanceService';
import { formatINR } from '../../utils/goldCalculations';
import { isAppError, userMessage } from '../../utils/errors';
import { useTheme } from '../../theme/ThemeProvider';
import { useScreenData } from '../../hooks/useScreenData';

export function AddAdvanceScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const { data, loading } = useScreenData(
    () => (customerId ? getAdvanceSummary(customerId) : Promise.resolve(null)),
    [customerId],
  );
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISODate());
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(null);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await addAdvance({ customerId, amount, transactionDate, paymentMethod, notes });
      setAvailable(result.summary.availablePaise);
      setConfirming(false);
      setAmount('');
      setNotes('');
    } catch (saveError) {
      setConfirming(false);
      setError(isAppError(saveError) ? saveError.message : userMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  const shown = available === null ? data.availablePaise : available;

  return (
    <Screen scroll footer={<PrimaryButton label="Done" onPress={() => setConfirming(true)} disabled={!amount.trim()} />}>
      <Text style={{ color: theme.colors.textMuted }}>
        Available advance {formatINR(shown)}. Deposited {formatINR(data.depositedPaise)}. Used {formatINR(data.consumedPaise)}. Advance is never treated as income.
      </Text>
      <CustomInput label="Advance amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" error={error} />
      <DateSelector label="Date" value={transactionDate} onChange={setTransactionDate} />
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Payment method</Text>
      <FilterChips options={PAYMENT_METHODS} value={paymentMethod} onChange={setPaymentMethod} />
      <CustomInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      {available !== null ? <Text style={{ color: theme.colors.success, fontWeight: '700' }}>Saved. Available advance is {formatINR(available)}.</Text> : null}
  
      <ConfirmationDialog
        visible={confirming}
        title="Save this advance?"
        message={`${amount ? `₹${amount}` : '₹0'} by ${paymentMethodLabel(paymentMethod)} on ${formatDisplayDate(transactionDate)}.`}
        confirmLabel="Save advance"
        loading={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={save}
      />
    </Screen>
  );
}
