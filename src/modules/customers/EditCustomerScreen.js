import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { CustomerForm } from './CustomerForm';
import { getCustomer, setCustomerArchived, updateCustomer } from '../../services/customerService';
import { formatGrams } from '../../utils/goldCalculations';
import { isAppError, userMessage } from '../../utils/errors';
import { useTheme } from '../../theme/ThemeProvider';
import { useScreenData } from '../../hooks/useScreenData';

export function EditCustomerScreen({ route, navigation }) {
  const { theme } = useTheme();
  const customerId = route.params?.customerId;
  const { data, loading, error, reload } = useScreenData(async () => {
    if (!customerId) return null;
    const customer = await getCustomer(customerId);
    return {
      customer,
      values: {
        name: customer.name,
        phone: customer.phone || '',
        address: customer.address || '',
        notes: customer.notes || '',
      },
    };
  }, [customerId]);
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const form = values || data?.values;

  const save = async (confirmDuplicate = false) => {
    setSaving(true);
    setErrors({});
    try {
      await updateCustomer({ id: customerId, ...form, confirmDuplicate });
      navigation.goBack();
    } catch (saveError) {
      if (isAppError(saveError) && saveError.code === 'DUPLICATE_PHONE') setDuplicate(saveError.message);
      else setErrors({ name: userMessage(saveError) });
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  return (
    <Screen
      scroll
      footer={<PrimaryButton label="Save changes" onPress={() => save(false)} loading={saving} />}
    >
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>Opening gold balance</Text>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{formatGrams(data.customer.opening_gold_grams)}</Text>
        <Text style={{ color: theme.colors.textMuted }}>Opening balances stay in the ledger. Use a reversal if a conversion needs correction.</Text>
      </View>
      <CustomerForm values={form} onChange={setValues} errors={errors} />
      <SecondaryButton
        label={data.customer.is_archived ? 'Restore customer' : 'Archive customer'}
        danger={!data.customer.is_archived}
        onPress={() => setConfirmArchive(true)}
      />
      <ConfirmationDialog
        visible={Boolean(duplicate)}
        title="Similar mobile number"
        message={duplicate}
        confirmLabel="Save anyway"
        onCancel={() => setDuplicate(null)}
        onConfirm={() => { setDuplicate(null); save(true); }}
      />
      <ConfirmationDialog
        visible={confirmArchive}
        title={data.customer.is_archived ? 'Restore customer?' : 'Archive customer?'}
        message="Financial records stay on this device. Archiving only hides the customer from the main list."
        confirmLabel={data.customer.is_archived ? 'Restore' : 'Archive'}
        destructive={!data.customer.is_archived}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          await setCustomerArchived(customerId, !data.customer.is_archived);
          setConfirmArchive(false);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}
