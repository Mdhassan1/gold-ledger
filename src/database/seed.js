import { createCustomer } from '../services/customerService';
import { addIncome } from '../services/incomeService';

/**
 * Optional sample data for a manual demo. The running application never
 * calls this. Production starts with an empty local database.
 */
export async function seedSampleData() {
  const abdul = await createCustomer({
    name: 'Abdul Rahman',
    phone: '9876543210',
    address: 'MG Road',
    notes: 'Sample customer',
    openingGoldGrams: '3',
    openingAdvance: '15000',
    confirmDuplicate: true,
  });
  await addIncome({
    customerId: abdul.id,
    amount: '10000',
    paymentDate: '2026-11-01',
    paymentMethod: 'CASH',
  });
  await addIncome({
    customerId: abdul.id,
    amount: '10000',
    paymentDate: '2026-11-01',
    paymentMethod: 'UPI',
  });
  await addIncome({
    customerId: abdul.id,
    amount: '22000',
    paymentDate: '2026-11-01',
    paymentMethod: 'BANK_TRANSFER',
  });
  return abdul;
}
