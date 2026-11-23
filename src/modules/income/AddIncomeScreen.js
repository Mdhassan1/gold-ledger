import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { CustomInput } from '../../components/CustomInput';
import { DateSelector } from '../../components/DateSelector';
import { FilterChips } from '../../components/FilterChips';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { PAYMENT_METHODS, paymentMethodLabel } from '../../utils/constants';
import { todayISODate, formatDisplayDate } from '../../utils/dateUtils';
import { addIncome } from '../../services/incomeService';
import { getIncomeSummary } from '../../services/incomeService';
import { formatINR } from '../../utils/goldCalculations';
import { ErrorState } from '../../components/ErrorState';
import { isAppError, userMessage } from '../../utils/errors';
import { useTheme } from '../../theme/ThemeProvider';

export function AddIncomeScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISODate());
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const savingRef = useRef(false);

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await addIncome({ customerId, amount, paymentDate, paymentMethod, notes });
      const summary = await getIncomeSummary(customerId);
      setConfirming(false);
      setSaved(summary.unconvertedPaise);
      setAmount('');
      setNotes('');
    } catch (saveError) {
      setConfirming(false);
      setError(isAppError(saveError) ? saveError.message : userMessage(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;

  return (
    <Screen scroll footer={<PrimaryButton label="Done" onPress={() => setConfirming(true)} disabled={!amount.trim()} />}>
      <CustomInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" error={error} />
      <DateSelector label="Payment date" value={paymentDate} onChange={setPaymentDate} />
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Payment method</Text>
      <FilterChips options={PAYMENT_METHODS} value={paymentMethod} onChange={setPaymentMethod} />
      <CustomInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      {saved !== null ? (
        <Text style={{ color: theme.colors.success, fontWeight: '700' }}>
          Saved. Unconverted income is now {formatINR(saved)}.
        </Text>
      ) : null}
      <ConfirmationDialog
        visible={confirming}
        title="Save this income?"
        message={`${formatAmount(amount)} by ${paymentMethodLabel(paymentMethod)} on ${formatDisplayDate(paymentDate)}. Each payment is stored separately.`}
        confirmLabel="Save income"
        loading={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={save}
      />
    </Screen>
  );
}

function formatAmount(amount) {
  const text = String(amount || '').trim();
  return text ? `₹${text}` : '₹0';
}
