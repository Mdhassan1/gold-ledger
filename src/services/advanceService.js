import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/dateUtils';
import { readStoredInteger, toSafeNumber } from '../utils/goldCalculations';
import { validateAdvanceInput } from '../utils/validation';
import { assertActiveCustomer } from './customerService';

const BALANCE_SQL = `
SELECT COALESCE(SUM(
  CASE
    WHEN transaction_type = 'DEPOSIT' THEN amount_paise
    WHEN transaction_type = 'REVERSAL' THEN amount_paise
    WHEN transaction_type = 'CONSUMPTION' THEN -amount_paise
    ELSE 0
  END
), 0) AS available_paise,
COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' THEN amount_paise ELSE 0 END), 0) AS deposited_paise,
COALESCE(SUM(CASE WHEN transaction_type = 'CONSUMPTION' THEN amount_paise ELSE 0 END), 0) AS consumed_paise,
COALESCE(SUM(CASE WHEN transaction_type = 'REVERSAL' THEN amount_paise ELSE 0 END), 0) AS reversed_paise
FROM advance_transactions
WHERE customer_id = ?
`;

export async function getAdvanceSummary(customerId, tx) {
  const db = activeDb(tx);
  const row = await db.get(BALANCE_SQL, [customerId]);
  return {
    availablePaise: readStoredInteger(row.available_paise, 'Available advance'),
    depositedPaise: readStoredInteger(row.deposited_paise, 'Advance deposits'),
    consumedPaise: readStoredInteger(row.consumed_paise, 'Advance used'),
    reversedPaise: readStoredInteger(row.reversed_paise, 'Advance reversals'),
  };
}

export async function addAdvance(input) {
  const data = validateAdvanceInput(input);
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    await assertActiveCustomer(input.customerId, tx);
    const id = createId();
    await tx.run(
      `INSERT INTO advance_transactions (
        id, customer_id, transaction_type, amount_paise, transaction_date, conversion_id, payment_method, notes, created_at
      ) VALUES (?, ?, 'DEPOSIT', ?, ?, NULL, ?, ?, ?)`,
      [
        id,
        input.customerId,
        toSafeNumber(data.amountPaise, 'Advance amount'),
        data.transactionDate,
        data.paymentMethod,
        data.notes,
        nowIso(),
      ],
    );
    const summary = await getAdvanceSummary(input.customerId, tx);
    const record = await tx.get('SELECT * FROM advance_transactions WHERE id = ?', [id]);
    return { record, summary };
  });
}

export async function listAdvances(customerId, tx) {
  const db = activeDb(tx);
  return db.all(
    `SELECT * FROM advance_transactions
     WHERE customer_id = ?
     ORDER BY transaction_date DESC, created_at DESC`,
    [customerId],
  );
}

export async function getAdvance(advanceId, tx) {
  const db = activeDb(tx);
  const row = await db.get('SELECT * FROM advance_transactions WHERE id = ?', [advanceId]);
  if (!row) throw new AppError('NOT_FOUND', 'Advance record not found.');
  return row;
}
