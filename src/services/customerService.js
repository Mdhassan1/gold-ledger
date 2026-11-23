import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { nowIso, todayISODate } from '../utils/dateUtils';
import { toSafeNumber } from '../utils/goldCalculations';
import { likeContains, validateCustomerInput } from '../utils/validation';

const CUSTOMER_LIST_SQL = `
SELECT
  c.id,
  c.name,
  c.phone,
  c.normalized_phone,
  c.address,
  c.notes,
  c.opening_gold_grams,
  c.created_at,
  c.updated_at,
  c.is_archived,
  COALESCE((
    SELECT gl.balance_after_scaled
    FROM gold_ledger gl
    WHERE gl.customer_id = c.id
    ORDER BY gl.created_at DESC, gl.rowid DESC
    LIMIT 1
  ), c.opening_gold_grams) AS gold_balance_scaled,
  COALESCE((
    SELECT SUM(
      CASE
        WHEN a.transaction_type = 'DEPOSIT' THEN a.amount_paise
        WHEN a.transaction_type = 'REVERSAL' THEN a.amount_paise
        WHEN a.transaction_type = 'CONSUMPTION' THEN -a.amount_paise
        ELSE 0
      END
    )
    FROM advance_transactions a
    WHERE a.customer_id = c.id
  ), 0) AS advance_balance_paise,
  (
    SELECT MAX(entry_date) FROM (
      SELECT payment_date AS entry_date FROM income_transactions WHERE customer_id = c.id
      UNION ALL
      SELECT transaction_date AS entry_date FROM advance_transactions
      WHERE customer_id = c.id AND transaction_type = 'DEPOSIT'
    ) AS payment_dates
  ) AS last_payment_date
FROM customers c
`;

async function findPhoneDuplicate(normalizedPhone, excludeId, tx) {
  if (!normalizedPhone) return null;
  return tx.get(
    `SELECT id, name, phone FROM customers
     WHERE normalized_phone = ? AND is_archived = 0 AND id != ?`,
    [normalizedPhone, excludeId || ''],
  );
}

export async function getCustomer(customerId, tx) {
  const db = activeDb(tx);
  const row = await db.get(`${CUSTOMER_LIST_SQL} WHERE c.id = ?`, [customerId]);
  if (!row) {
    throw new AppError('NOT_FOUND', 'Customer not found.');
  }
  return row;
}

export async function assertActiveCustomer(customerId, tx) {
  const customer = await getCustomer(customerId, tx);
  if (customer.is_archived) {
    throw new AppError('ARCHIVED', 'This customer is archived. Restore the customer before adding transactions.');
  }
  return customer;
}

export async function listCustomers(query = '', { includeArchived = false } = {}, tx) {
  const db = activeDb(tx);
  const trimmed = String(query || '').trim();
  const pattern = likeContains(trimmed);
  const digits = trimmed.replace(/\D/g, '');
  const digitPattern = digits ? likeContains(digits) : pattern;
  return db.all(
    `${CUSTOMER_LIST_SQL}
     WHERE (? = 1 OR c.is_archived = 0)
       AND (
         ? = ''
         OR c.name LIKE ? ESCAPE '\\'
         OR IFNULL(c.phone, '') LIKE ? ESCAPE '\\'
         OR IFNULL(c.normalized_phone, '') LIKE ? ESCAPE '\\'
       )
     ORDER BY c.is_archived ASC, c.name COLLATE NOCASE ASC, c.id ASC`,
    [includeArchived ? 1 : 0, trimmed, pattern, pattern, digitPattern],
  );
}

export async function createCustomer(input) {
  const data = validateCustomerInput(input, { requireFinancial: true });
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    const duplicate = await findPhoneDuplicate(data.normalizedPhone, null, tx);
    if (duplicate && !input.confirmDuplicate) {
      throw new AppError(
        'DUPLICATE_PHONE',
        `${duplicate.name} already uses this mobile number. Save this customer anyway?`,
        { existingName: duplicate.name },
      );
    }
    const id = createId();
    const timestamp = nowIso();
    const opening = toSafeNumber(data.openingGoldScaled, 'Opening gold balance');
    const advance = toSafeNumber(data.openingAdvancePaise, 'Opening advance');
    await tx.run(
      `INSERT INTO customers (
        id, name, phone, normalized_phone, address, notes, opening_gold_grams, created_at, updated_at, is_archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, data.name, data.phone, data.normalizedPhone, data.address, data.notes, opening, timestamp, timestamp],
    );
    await tx.run(
      `INSERT INTO gold_ledger (
        id, customer_id, transaction_type, reference_id, grams_delta_scaled, balance_after_scaled, transaction_date, created_at
      ) VALUES (?, ?, 'OPENING', ?, ?, ?, ?, ?)`,
      [createId(), id, id, opening, opening, todayISODate(), timestamp],
    );
    if (advance > 0) {
      await tx.run(
        `INSERT INTO advance_transactions (
          id, customer_id, transaction_type, amount_paise, transaction_date, conversion_id, payment_method, notes, created_at
        ) VALUES (?, ?, 'DEPOSIT', ?, ?, NULL, 'CASH', ?, ?)`,
        [createId(), id, advance, todayISODate(), 'Opening advance', timestamp],
      );
    }
    return getCustomer(id, tx);
  });
}

export async function updateCustomer(input) {
  const data = validateCustomerInput(input);
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    const existing = await tx.get('SELECT id FROM customers WHERE id = ?', [input.id]);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Customer not found.');
    }
    const duplicate = await findPhoneDuplicate(data.normalizedPhone, input.id, tx);
    if (duplicate && !input.confirmDuplicate) {
      throw new AppError(
        'DUPLICATE_PHONE',
        `${duplicate.name} already uses this mobile number. Save this change anyway?`,
        { existingName: duplicate.name },
      );
    }
    await tx.run(
      `UPDATE customers
       SET name = ?, phone = ?, normalized_phone = ?, address = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [data.name, data.phone, data.normalizedPhone, data.address, data.notes, nowIso(), input.id],
    );
    return getCustomer(input.id, tx);
  });
}

export async function setCustomerArchived(customerId, archived) {
  const db = activeDb();
  const existing = await db.get('SELECT id FROM customers WHERE id = ?', [customerId]);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Customer not found.');
  }
  await db.run('UPDATE customers SET is_archived = ?, updated_at = ? WHERE id = ?', [
    archived ? 1 : 0,
    nowIso(),
    customerId,
  ]);
  return getCustomer(customerId);
}
