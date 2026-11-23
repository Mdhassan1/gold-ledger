import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/dateUtils';
import { toSafeNumber } from '../utils/goldCalculations';

export async function getGoldBalance(customerId, tx) {
  const db = activeDb(tx);
  const row = await db.get(
    `SELECT balance_after_scaled
     FROM gold_ledger
     WHERE customer_id = ?
     ORDER BY created_at DESC, rowid DESC
     LIMIT 1`,
    [customerId],
  );
  if (!row) {
    const customer = await db.get('SELECT opening_gold_grams FROM customers WHERE id = ?', [customerId]);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.');
    return Number(customer.opening_gold_grams);
  }
  return Number(row.balance_after_scaled);
}

export async function insertLedgerEntry({
  customerId,
  transactionType,
  referenceId,
  gramsDeltaScaled,
  balanceAfterScaled,
  transactionDate,
  tx,
}) {
  const db = activeDb(tx);
  const id = createId();
  await db.run(
    `INSERT INTO gold_ledger (
      id, customer_id, transaction_type, reference_id, grams_delta_scaled, balance_after_scaled, transaction_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      customerId,
      transactionType,
      referenceId || null,
      toSafeNumber(gramsDeltaScaled, 'Gold movement'),
      toSafeNumber(balanceAfterScaled, 'Gold balance'),
      transactionDate,
      nowIso(),
    ],
  );
  return id;
}

export async function getTimeline(customerId, tx) {
  const db = activeDb(tx);
  return db.all(
    `SELECT id, 'INCOME' AS kind, payment_date AS transaction_date, amount_paise,
            NULL AS grams_scaled, conversion_status AS status, payment_method, notes, created_at, conversion_id
     FROM income_transactions WHERE customer_id = ?
     UNION ALL
     SELECT id, 'ADVANCE' AS kind, transaction_date, amount_paise,
            NULL AS grams_scaled, transaction_type AS status, payment_method, notes, created_at, conversion_id
     FROM advance_transactions WHERE customer_id = ?
     UNION ALL
     SELECT id, 'CONVERSION' AS kind, conversion_date, total_amount_paise,
            converted_grams_scaled AS grams_scaled,
            CASE WHEN reversed_at IS NULL THEN 'COMPLETED' ELSE 'REVERSED' END AS status,
            NULL AS payment_method, notes, created_at, NULL AS conversion_id
     FROM gold_conversions WHERE customer_id = ?
     ORDER BY transaction_date DESC, created_at DESC`,
    [customerId, customerId, customerId],
  );
}

export async function reconstructBalance(customerId, tx) {
  const db = activeDb(tx);
  const customer = await db.get('SELECT opening_gold_grams FROM customers WHERE id = ?', [customerId]);
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.');
  const row = await db.get(
    `SELECT COALESCE(SUM(grams_delta_scaled), 0) AS delta_sum, COUNT(*) AS entries
     FROM gold_ledger WHERE customer_id = ?`,
    [customerId],
  );
  const latest = await getGoldBalance(customerId, tx);
  const opening = Number(customer.opening_gold_grams);
  const fromDeltas = Number(row.delta_sum);
  return {
    opening,
    fromDeltas,
    latest,
    consistent: fromDeltas === latest,
    entries: Number(row.entries),
  };
}
