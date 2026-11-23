import { useState } from 'react';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { CustomerForm, emptyCustomerForm } from './CustomerForm';
import { createCustomer } from '../../services/customerService';
import { isAppError, userMessage } from '../../utils/errors';

export function AddCustomerScreen({ navigation }) {
  const [values, setValues] = useState(emptyCustomerForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const save = async (confirmDuplicate = false) => {
    setSaving(true);
    setErrors({});
    try {
      const customer = await createCustomer({ ...values, confirmDuplicate });
      if (!customer?.id) {
        setErrors({ name: 'The customer could not be saved. Please try again.' });
        return;
      }
      navigation.replace('CustomerDetails', { customerId: customer.id });
    } catch (error) {
      if (isAppError(error) && error.code === 'DUPLICATE_PHONE') {
        setDuplicate(error.message);
      } else if (isAppError(error)) {
        const field = error.code === 'INVALID_GRAMS'
          ? 'openingGoldGrams'
          : error.code === 'INVALID_AMOUNT'
            ? 'openingAdvance'
            : 'name';
        setErrors({ [field]: error.message });
      } else {
        setErrors({ name: userMessage(error) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll footer={<PrimaryButton label="Save customer" onPress={() => save(false)} loading={saving} />}>
      <CustomerForm values={values} onChange={setValues} errors={errors} showFinancial />
      <ConfirmationDialog
        visible={Boolean(duplicate)}
        title="Similar mobile number"
        message={duplicate}
        confirmLabel="Save anyway"
        onCancel={() => setDuplicate(null)}
        onConfirm={() => {
          setDuplicate(null);
          save(true);
        }}
      />
    </Screen>
  );
}
