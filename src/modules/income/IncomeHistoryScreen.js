import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { SummaryCard } from '../../components/SummaryCard';
import { FilterChips } from '../../components/FilterChips';
import { DateSelector } from '../../components/DateSelector';
import { CustomModal } from '../../components/CustomModal';
import { CustomInput } from '../../components/CustomInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { deleteUnconvertedIncome, getIncomeSummary, listIncome, updateUnconvertedIncome } from '../../services/incomeService';
import { formatINR } from '../../utils/goldCalculations';
import { formatDisplayDate, todayISODate } from '../../utils/dateUtils';
import { PAYMENT_METHODS, paymentMethodLabel } from '../../utils/constants';
import { isAppError, userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'UNCONVERTED', label: 'Unconverted' },
  { id: 'CONVERTED', label: 'Converted' },
];

export function IncomeHistoryScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const [status, setStatus] = useState('ALL');
  const [useDate, setUseDate] = useState(false);
  const [paymentDate, setPaymentDate] = useState(todayISODate());
  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState('');
  const [editDate, setEditDate] = useState(todayISODate());
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, loading, error, reload } = useScreenData(async () => {
    if (!customerId) return null;
    const [summary, rows] = await Promise.all([
      getIncomeSummary(customerId),
      listIncome(customerId, { status, paymentDate: useDate ? paymentDate : null }),
    ]);
    return { summary, rows };
  }, [customerId, status, useDate, paymentDate]);

  const openEdit = (row) => {
    setEditing(row);
    const paise = BigInt(row.amount_paise);
    setAmount(`${paise / 100n}.${(paise % 100n).toString().padStart(2, '0')}`);
    setEditDate(row.payment_date);
    setMethod(row.payment_method);
    setNotes(row.notes || '');
    setFormError('');
  };

  const saveEdit = async () => {
    setSaving(true);
    setFormError('');
    try {
      await updateUnconvertedIncome({
        incomeId: editing.id,
        customerId,
        amount,
        paymentDate: editDate,
        paymentMethod: method,
        notes,
      });
      setEditing(null);
      reload();
    } catch (saveError) {
      setFormError(isAppError(saveError) ? saveError.message : userMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteUnconvertedIncome(pendingDelete.id, customerId);
      setPendingDelete(null);
      reload();
    } catch (deleteError) {
      setFormError(isAppError(deleteError) ? deleteError.message : userMessage(deleteError));
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const summary = data.summary;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SummaryCard label="Total income" value={formatINR(summary.totalPaise)} hint={`${summary.paymentCount} payments`} />
        <SummaryCard label="Converted" value={formatINR(summary.convertedPaise)} />
      </View>
      <SummaryCard
        label="Unconverted"
        value={formatINR(summary.unconvertedPaise)}
        hint={summary.reconciles ? 'Matches the income records' : 'Totals do not match the records'}
        tone={summary.reconciles ? 'success' : 'danger'}
      />
      <FilterChips options={FILTERS} value={status} onChange={setStatus} />
      <Pressable onPress={() => setUseDate((value) => !value)}>
        <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{useDate ? 'Clear date filter' : 'Filter by date'}</Text>
      </Pressable>
      {useDate ? <DateSelector label="Payment date" value={paymentDate} onChange={setPaymentDate} /> : null}
      {formError && !editing ? <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{formError}</Text> : null}
      {data.rows.length === 0 ? (
        <EmptyState icon="cash-outline" title="No income" message="Payments for this filter will appear here. Advance deposits are not included." />
      ) : data.rows.map((row) => {
        const converted = row.conversion_status === 'CONVERTED';
        return (
          <Pressable
            key={row.id}
            onPress={() => (converted
              ? navigation.navigate('TransactionDetails', { customerId, kind: 'INCOME', id: row.id })
              : openEdit(row))}
            style={{ padding: 14, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 6 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16 }}>{formatINR(row.amount_paise)}</Text>
              <Text style={{ color: converted ? theme.colors.success : theme.colors.accent, fontWeight: '700' }}>
                {converted ? 'Converted' : 'Unconverted'}
              </Text>
            </View>
            <Text style={{ color: theme.colors.textMuted }}>
              {formatDisplayDate(row.payment_date)} · {paymentMethodLabel(row.payment_method)}
            </Text>
            {row.notes ? <Text style={{ color: theme.colors.text }}>{row.notes}</Text> : null}
            {converted && row.conversion_id ? (
              <Text style={{ color: theme.colors.textMuted }}>Conversion {row.conversion_id.slice(0, 8)}</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><SecondaryButton compact label="Edit" onPress={() => openEdit(row)} /></View>
                <View style={{ flex: 1 }}><SecondaryButton compact danger label="Delete" onPress={() => setPendingDelete(row)} /></View>
              </View>
            )}
          </Pressable>
        );
      })}

      <CustomModal visible={Boolean(editing)} title="Edit unconverted income" onClose={() => setEditing(null)}>
        <CustomInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={formError} />
        <DateSelector label="Payment date" value={editDate} onChange={setEditDate} />
        <FilterChips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        <CustomInput label="Notes" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton label="Save changes" onPress={saveEdit} loading={saving} />
      </CustomModal>
      <ConfirmationDialog
        visible={Boolean(pendingDelete)}
        title="Delete this payment?"
        message="Only an unconverted payment can be deleted. This does not change gold or advance."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}
