import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { CustomInput } from '../../components/CustomInput';
import { DateSelector } from '../../components/DateSelector';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { getCustomer } from '../../services/customerService';
import { listUnconvertedIncome } from '../../services/incomeService';
import { getAdvanceSummary } from '../../services/advanceService';
import { getGoldBalance } from '../../services/ledgerService';
import { convertGold } from '../../services/conversionService';
import {
  balancePresentation,
  formatGrams,
  formatINR,
  parsePositiveRupeesToPaise,
  previewConversion,
} from '../../utils/goldCalculations';
import { formatDisplayDate, todayISODate } from '../../utils/dateUtils';
import { isAppError, userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

function PreviewRow({ label, value }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: theme.colors.textMuted, flex: 1 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export function GoldConversionScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const { data, loading, error, reload } = useScreenData(async () => {
    if (!customerId) return null;
    const [customer, balance, income, advance] = await Promise.all([
      getCustomer(customerId),
      getGoldBalance(customerId),
      listUnconvertedIncome(customerId),
      getAdvanceSummary(customerId),
    ]);
    return { customer, balance, income, advance };
  }, [customerId]);
  const [selected, setSelected] = useState([]);
  const [rate, setRate] = useState('');
  const [includeAdvance, setIncludeAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [conversionDate, setConversionDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (data?.income) setSelected(data.income.map((row) => row.id));
  }, [data]);

  const incomePaise = useMemo(() => {
    if (!data) return 0n;
    return data.income
      .filter((row) => selected.includes(row.id))
      .reduce((sum, row) => sum + BigInt(row.amount_paise), 0n);
  }, [data, selected]);

  const preview = useMemo(() => {
    if (!data || !rate.trim()) return { error: '', value: null };
    try {
      const ratePaise = parsePositiveRupeesToPaise(rate, 'Gold rate');
      if (includeAdvance && !String(advanceAmount).trim()) {
        return { error: 'Enter how much advance to use.', value: null };
      }
      const advancePaise = includeAdvance ? parsePositiveRupeesToPaise(advanceAmount, 'Advance amount') : 0n;
      if (includeAdvance && advancePaise > BigInt(data.advance.availablePaise)) {
        return { error: 'That amount is higher than the available advance.', value: null };
      }
      if (incomePaise + advancePaise <= 0n) {
        return { error: 'Select income or enter an advance amount.', value: null };
      }
      return {
        error: '',
        value: previewConversion({
          previousScaled: data.balance,
          incomePaise,
          advancePaise,
          ratePaisePerGram: ratePaise,
        }),
      };
    } catch (previewError) {
      return { error: userMessage(previewError), value: null };
    }
  }, [advanceAmount, data, includeAdvance, incomePaise, rate]);

  const toggle = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const save = async () => {
    if (!preview.value || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError('');
    try {
      const result = await convertGold({
        customerId,
        incomeIds: selected,
        includeAdvance,
        advanceAmount: includeAdvance ? advanceAmount : '0',
        ratePerGram: rate,
        conversionDate,
        notes,
        expectedPreviousScaled: data.balance,
        expectedIncomePaise: Number(incomePaise),
        expectedAvailablePaise: data.advance.availablePaise,
      });
      setConfirming(false);
      navigation.replace('ConversionSuccess', { customerId, conversionId: result.id });
    } catch (saveError) {
      setConfirming(false);
      setFormError(isAppError(saveError) ? saveError.message : userMessage(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState label="Preparing conversion" />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  const presentation = preview.value ? preview.value.presentation : balancePresentation(data.balance);
  const advanceIncluded = preview.value ? preview.value.advancePaise : 0n;

  return (
    <Screen
      scroll
      footer={
        <PrimaryButton
          label="Complete Transaction"
          onPress={() => setConfirming(true)}
          disabled={!preview.value || saving}
          loading={saving && !confirming}
        />
      }
    >
      <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '700' }}>{data.customer.name}</Text>
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 10 }}>
        <PreviewRow label="Previous balance" value={formatGrams(data.balance)} />
        <PreviewRow label="Unconverted income" value={formatINR(incomePaise)} />
        <PreviewRow label="Advance included" value={formatINR(advanceIncluded)} />
        <PreviewRow label="Total conversion amount" value={preview.value ? formatINR(preview.value.totalPaise) : '—'} />
        <PreviewRow label="Current gold rate" value={rate.trim() ? `₹${rate} / g` : '—'} />
        <PreviewRow label="Converted gold grams" value={preview.value ? formatGrams(preview.value.convertedScaled) : '—'} />
        <PreviewRow label="New pending gold balance" value={preview.value ? formatGrams(preview.value.newBalanceScaled) : '—'} />
        <Text style={{ color: preview.value ? theme.colors.accent : theme.colors.textMuted, fontWeight: '700' }}>
          {preview.error || (preview.value ? presentation.sentence : 'Enter the gold rate to preview this conversion.')}
        </Text>
      </View>

      <CustomInput label="Gold rate per gram (₹)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="15000" helper="Entered on this device. GoldLedger does not fetch rates." />
      <DateSelector label="Transaction date" value={conversionDate} onChange={setConversionDate} />

      <Pressable onPress={() => setIncludeAdvance((value) => !value)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.accent, backgroundColor: includeAdvance ? theme.colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {includeAdvance ? <Text style={{ color: theme.colors.accentText, fontWeight: '800' }}>✓</Text> : null}
        </View>
        <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1 }}>Include advance in conversion</Text>
      </Pressable>
      {includeAdvance ? (
        <CustomInput
          label="How much advance do you want to use?"
          value={advanceAmount}
          onChangeText={setAdvanceAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          helper={`Available advance ${formatINR(data.advance.availablePaise)}. Only the amount you enter is used.`}
        />
      ) : (
        <Text style={{ color: theme.colors.textMuted }}>Advance stays unchanged when this is off. Available {formatINR(data.advance.availablePaise)}.</Text>
      )}

      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Unconverted payments</Text>
      {data.income.length === 0 ? (
        <Text style={{ color: theme.colors.textMuted }}>No unconverted income. You can still convert advance.</Text>
      ) : data.income.map((row) => {
        const checked = selected.includes(row.id);
        return (
          <Pressable key={row.id} onPress={() => toggle(row.id)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.accent, backgroundColor: checked ? theme.colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {checked ? <Text style={{ color: theme.colors.accentText, fontWeight: '800', fontSize: 13 }}>✓</Text> : null}
            </View>
            <Text style={{ color: theme.colors.text, flex: 1 }}>{formatDisplayDate(row.payment_date)}</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{formatINR(row.amount_paise)}</Text>
          </Pressable>
        );
      })}
      <CustomInput label="Conversion notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      {formError ? <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{formError}</Text> : null}

      <ConfirmationDialog
        visible={confirming}
        title="Complete this conversion?"
        confirmLabel="Complete Transaction"
        loading={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={save}
      >
        {preview.value ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.text }}>Income {formatINR(preview.value.incomePaise)}</Text>
            <Text style={{ color: theme.colors.text }}>Advance {formatINR(preview.value.advancePaise)}</Text>
            <Text style={{ color: theme.colors.text }}>Rate {formatINR(preview.value.ratePaisePerGram)} / g</Text>
            <Text style={{ color: theme.colors.text }}>Converted {formatGrams(preview.value.convertedScaled)}</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{preview.value.presentation.sentence}</Text>
          </View>
        ) : null}
      </ConfirmationDialog>
    </Screen>
  );
}
