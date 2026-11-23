import { View } from 'react-native';
import { CustomInput } from '../../components/CustomInput';
import { DateSelector } from '../../components/DateSelector';

export function CustomerForm({ values, onChange, errors, showFinancial = false }) {
  const set = (key) => (value) => onChange({ ...values, [key]: value });
  return (
    <View style={{ gap: 14 }}>
      <CustomInput label="Customer name" value={values.name} onChangeText={set('name')} error={errors.name} placeholder="Full name" />
      <CustomInput label="Mobile number" value={values.phone} onChangeText={set('phone')} error={errors.phone} placeholder="Optional" keyboardType="phone-pad" />
       {showFinancial ? (
        <>
          <CustomInput
            label="Opening pending gold (grams)"
            value={values.openingGoldGrams}
            onChangeText={set('openingGoldGrams')}
            error={errors.openingGoldGrams}
            placeholder="0.0000"
            keyboardType="numbers-and-punctuation"
            helper="Positive if the customer owes gold. Negative if the business owes gold."
          />
          <CustomInput
            label="Opening advance (₹)"
            value={values.openingAdvance}
            onChangeText={set('openingAdvance')}
            error={errors.openingAdvance}
            placeholder="0.00"
            keyboardType="decimal-pad"
            helper="Optional. Advance stays separate from income."
          />
        </>
      ) : null}
    </View>
  );
}

export const emptyCustomerForm = {
  name: '',
  phone: '',
  address: '',
  notes: '',
  openingGoldGrams: '',
  openingAdvance: '',
};

export { DateSelector };
