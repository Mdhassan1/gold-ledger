import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/dateUtils';
import { readStoredInteger, toSafeNumber } from '../utils/goldCalculations';
import { validateIncomeInput } from '../utils/validation';
import { assertActiveCustomer } from './customerService';

export const UNCONVERTED_INCOME_SQL = `
SELECT COALESCE(SUM(amount_paise), 0) AS unconverted_paise,
       COUNT(*) AS payment_count
FROM income_transactions
WHERE customer_id = ?
  AND conversion_status = 'UNCONVERTED'
`;

function isExecutor(value) {
  return Boolean(value && typeof value.all === 'function' && typeof value.get === 'function');
}

export async function addIncome(input) {
  const data = validateIncomeInput(input);
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    await assertActiveCustomer(input.customerId, tx);
    const id = createId();
    const timestamp = nowIso();
    await tx.run(
      `INSERT INTO income_transactions (
        id, customer_id, amount_paise, payment_date, payment_method, notes, conversion_status, conversion_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'UNCONVERTED', NULL, ?)`,
      [
        id,
        input.customerId,
        toSafeNumber(data.amountPaise, 'Income amount'),
        data.paymentDate,
        data.paymentMethod,
        data.notes,
        timestamp,
      ],
    );
    return tx.get('SELECT * FROM income_transactions WHERE id = ?', [id]);
  });
}

export async function listIncome(customerId, options = {}, tx) {
  const executor = isExecutor(options) ? options : tx;
  const filter = isExecutor(options) ? {} : options;
  const db = activeDb(executor);
  const status = filter.status && filter.status !== 'ALL' ? filter.status : null;
  const paymentDate = filter.paymentDate || null;
  return db.all(
    `SELECT * FROM income_transactions
     WHERE customer_id = ?
       AND (? IS NULL OR conversion_status = ?)
       AND (? IS NULL OR payment_date = ?)
     ORDER BY payment_date DESC, created_at DESC`,
    [customerId, status, status, paymentDate, paymentDate],
  );
}

export async function listUnconvertedIncome(customerId, tx) {
  const db = activeDb(tx);
  return db.all(
    `SELECT * FROM income_transactions
     WHERE customer_id = ? AND conversion_status = 'UNCONVERTED'
     ORDER BY payment_date ASC, created_at ASC`,
    [customerId],
  );
}

export async function getIncomeSummary(customerId, tx) {
  const db = activeDb(tx);
  const totals = await db.get(
    `SELECT
       COALESCE(SUM(amount_paise), 0) AS total_paise,
       COALESCE(SUM(CASE WHEN conversion_status = 'CONVERTED' THEN amount_paise ELSE 0 END), 0) AS converted_paise,
       COUNT(*) AS payment_count
     FROM income_transactions
     WHERE customer_id = ?`,
    [customerId],
  );
  const unconverted = await db.get(UNCONVERTED_INCOME_SQL, [customerId]);
  const totalPaise = readStoredInteger(totals.total_paise, 'Total income');
  const convertedPaise = readStoredInteger(totals.converted_paise, 'Converted income');
  const unconvertedPaise = readStoredInteger(unconverted.unconverted_paise, 'Unconverted income');
  return {
    totalPaise,
    unconvertedPaise,
    convertedPaise,
    paymentCount: Number(totals.payment_count),
    unconvertedCount: Number(unconverted.payment_count),
    reconciles: totalPaise === convertedPaise + unconvertedPaise,
  };
}

async function requireUnconverted(incomeId, customerId, tx) {
  const row = await tx.get(
    'SELECT * FROM income_transactions WHERE id = ? AND customer_id = ?',
    [incomeId, customerId],
  );
  if (!row) throw new AppError('NOT_FOUND', 'Income record not found.');
  if (row.conversion_status !== 'UNCONVERTED' || row.conversion_id) {
    throw new AppError('ALREADY_CONVERTED', 'Converted income cannot be changed. Reverse the gold conversion instead.');
  }
  return row;
}

export async function updateUnconvertedIncome(input) {
  const data = validateIncomeInput(input);
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    await assertActiveCustomer(input.customerId, tx);
    await requireUnconverted(input.incomeId, input.customerId, tx);
    const updated = await tx.run(
      `UPDATE income_transactions
       SET amount_paise = ?, payment_date = ?, payment_method = ?, notes = ?
       WHERE id = ? AND customer_id = ? AND conversion_status = 'UNCONVERTED' AND conversion_id IS NULL`,
      [
        toSafeNumber(data.amountPaise, 'Income amount'),
        data.paymentDate,
        data.paymentMethod,
        data.notes,
        input.incomeId,
        input.customerId,
      ],
    );
    if (updated.changes !== 1) {
      throw new AppError('ALREADY_CONVERTED', 'Converted income cannot be changed. Reverse the gold conversion instead.');
    }
    return tx.get('SELECT * FROM income_transactions WHERE id = ?', [input.incomeId]);
  });
}

export async function deleteUnconvertedIncome(incomeId, customerId) {
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    await requireUnconverted(incomeId, customerId, tx);
    const deleted = await tx.run(
      `DELETE FROM income_transactions
       WHERE id = ? AND customer_id = ? AND conversion_status = 'UNCONVERTED' AND conversion_id IS NULL`,
      [incomeId, customerId],
    );
    if (deleted.changes !== 1) {
      throw new AppError('ALREADY_CONVERTED', 'Converted income cannot be deleted. Reverse the gold conversion instead.');
    }
    return getIncomeSummary(customerId, tx);
  });
}

export async function getIncome(incomeId, tx) {
  const db = activeDb(tx);
  const row = await db.get('SELECT * FROM income_transactions WHERE id = ?', [incomeId]);
  if (!row) throw new AppError('NOT_FOUND', 'Income record not found.');
  return row;
}
