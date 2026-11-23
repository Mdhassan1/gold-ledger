import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { eachDate, formatDisplayDate, monthKey, periodRange, resolveDateRange, todayISODate } from '../utils/dateUtils';
import { readStoredInteger } from '../utils/goldCalculations';
import { getGoldBalance } from './ledgerService';

function inRangeClause(column) {
  return `${column} >= ? AND ${column} <= ?`;
}

function customerFilter(column, customerId) {
  if (!customerId) return { sql: '1 = 1', params: [] };
  return { sql: `${column} = ?`, params: [customerId] };
}

export async function getHomeSummary(today = todayISODate()) {
  const db = activeDb();
  const customers = await db.all(
    `SELECT
       c.id,
       c.is_archived,
       COALESCE((
         SELECT gl.balance_after_scaled FROM gold_ledger gl
         WHERE gl.customer_id = c.id
         ORDER BY gl.created_at DESC, gl.rowid DESC LIMIT 1
       ), c.opening_gold_grams) AS gold_balance_scaled
     FROM customers c
     WHERE c.is_archived = 0`,
  );
  let pending = 0;
  let excess = 0;
  for (const customer of customers) {
    const balance = Number(customer.gold_balance_scaled);
    if (balance > 0) pending += balance;
    if (balance < 0) excess += -balance;
  }
  const income = await db.get(
    `SELECT COALESCE(SUM(amount_paise), 0) AS total
     FROM income_transactions WHERE payment_date = ?`,
    [today],
  );
  return {
    totalCustomers: customers.length,
    pendingScaled: pending,
    excessScaled: excess,
    netScaled: pending - excess,
    todayIncomePaise: Number(income.total),
  };
}

export async function getReports({
  preset = 'today',
  start,
  end,
  today = todayISODate(),
  period,
  anchor,
  customerId = null,
} = {}) {
  const range = period
    ? periodRange(period, anchor || today)
    : resolveDateRange(preset, { today, start, end });
  const db = activeDb();
  const incomeScope = customerFilter('customer_id', customerId);
  const scopedCustomer = customerId
    ? await db.get('SELECT id, name FROM customers WHERE id = ?', [customerId])
    : null;
  if (customerId && !scopedCustomer) throw new AppError('NOT_FOUND', 'Customer not found.');
  const customers = await db.all(
    `SELECT
       c.id,
       COALESCE((
         SELECT gl.balance_after_scaled FROM gold_ledger gl
         WHERE gl.customer_id = c.id
         ORDER BY gl.created_at DESC, gl.rowid DESC LIMIT 1
       ), c.opening_gold_grams) AS gold_balance_scaled
     FROM customers c
     WHERE (c.is_archived = 0 OR (? IS NOT NULL AND c.id = ?))
       AND (? IS NULL OR c.id = ?)`,
    [customerId, customerId, customerId, customerId],
  );
  let owing = 0;
  let excessCustomers = 0;
  let settled = 0;
  let pendingScaled = 0;
  let excessScaled = 0;
  for (const customer of customers) {
    const balance = Number(customer.gold_balance_scaled);
    if (balance > 0) {
      owing += 1;
      pendingScaled += balance;
    } else if (balance < 0) {
      excessCustomers += 1;
      excessScaled += -balance;
    } else {
      settled += 1;
    }
  }

  const income = await db.get(
    `SELECT COALESCE(SUM(amount_paise), 0) AS total,
            COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN conversion_status = 'UNCONVERTED' THEN amount_paise ELSE 0 END), 0) AS unconverted,
            COALESCE(SUM(CASE WHEN conversion_status = 'CONVERTED' THEN amount_paise ELSE 0 END), 0) AS converted
     FROM income_transactions
     WHERE ${inRangeClause('payment_date')} AND ${incomeScope.sql}`,
    [range.start, range.end, ...incomeScope.params],
  );
  const dailyRows = await db.all(
    `SELECT payment_date AS day, COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS count
     FROM income_transactions
     WHERE ${inRangeClause('payment_date')} AND ${incomeScope.sql}
     GROUP BY payment_date
     ORDER BY payment_date ASC`,
    [range.start, range.end, ...incomeScope.params],
  );
  const monthlyRows = await db.all(
    `SELECT substr(payment_date, 1, 7) AS month, COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS count
     FROM income_transactions
     WHERE ${inRangeClause('payment_date')} AND ${incomeScope.sql}
     GROUP BY substr(payment_date, 1, 7)
     ORDER BY month ASC`,
    [range.start, range.end, ...incomeScope.params],
  );

  const advance = await db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' THEN amount_paise ELSE 0 END), 0) AS deposited,
       COALESCE(SUM(CASE WHEN transaction_type = 'CONSUMPTION' THEN amount_paise ELSE 0 END), 0) AS consumed,
       COALESCE(SUM(CASE WHEN transaction_type = 'REVERSAL' THEN amount_paise ELSE 0 END), 0) AS reversed
     FROM advance_transactions
     WHERE ${inRangeClause('transaction_date')} AND ${incomeScope.sql}`,
    [range.start, range.end, ...incomeScope.params],
  );
  const outstanding = await db.get(
    `SELECT COALESCE(SUM(
       CASE
         WHEN transaction_type = 'DEPOSIT' THEN amount_paise
         WHEN transaction_type = 'REVERSAL' THEN amount_paise
         WHEN transaction_type = 'CONSUMPTION' THEN -amount_paise
         ELSE 0
       END
     ), 0) AS available
     FROM advance_transactions a
     JOIN customers c ON c.id = a.customer_id
     WHERE (c.is_archived = 0 OR (? IS NOT NULL AND c.id = ?))
       AND (? IS NULL OR a.customer_id = ?)`,
    [customerId, customerId, customerId, customerId],
  );
  const unconvertedOutstanding = await db.get(
    `SELECT COALESCE(SUM(amount_paise), 0) AS total
     FROM income_transactions
     WHERE conversion_status = 'UNCONVERTED' AND ${incomeScope.sql}`,
    incomeScope.params,
  );

  const gold = await db.get(
    `SELECT COALESCE(SUM(converted_grams_scaled), 0) AS converted,
            COUNT(*) AS count
     FROM gold_conversions
     WHERE reversed_at IS NULL AND ${inRangeClause('conversion_date')} AND ${incomeScope.sql}`,
    [range.start, range.end, ...incomeScope.params],
  );
  const transactions = await db.all(
    `SELECT id, kind, transaction_date, amount_paise, grams_scaled, status, payment_method, notes, created_at, conversion_id, customer_name
     FROM (
       SELECT i.id AS id, 'INCOME' AS kind, i.payment_date AS transaction_date, i.amount_paise AS amount_paise,
              NULL AS grams_scaled, i.conversion_status AS status, i.payment_method AS payment_method, i.notes AS notes,
              i.created_at AS created_at, i.conversion_id AS conversion_id, c.name AS customer_name
       FROM income_transactions i
       JOIN customers c ON c.id = i.customer_id
       WHERE ${inRangeClause('i.payment_date')} AND ${customerFilter('i.customer_id', customerId).sql}
       UNION ALL
       SELECT a.id, 'ADVANCE', a.transaction_date, a.amount_paise, NULL, a.transaction_type, a.payment_method, a.notes,
              a.created_at, a.conversion_id, c.name
       FROM advance_transactions a
       JOIN customers c ON c.id = a.customer_id
       WHERE ${inRangeClause('a.transaction_date')} AND ${customerFilter('a.customer_id', customerId).sql}
       UNION ALL
       SELECT g.id, 'CONVERSION', g.conversion_date, g.total_amount_paise, g.converted_grams_scaled,
              CASE WHEN g.reversed_at IS NULL THEN 'COMPLETED' ELSE 'REVERSED' END,
              NULL, g.notes, g.created_at, NULL, c.name
       FROM gold_conversions g
       JOIN customers c ON c.id = g.customer_id
       WHERE ${inRangeClause('g.conversion_date')} AND ${customerFilter('g.customer_id', customerId).sql}
     ) AS activity
     ORDER BY transaction_date DESC, created_at DESC`,
    [
      range.start, range.end, ...incomeScope.params,
      range.start, range.end, ...incomeScope.params,
      range.start, range.end, ...incomeScope.params,
    ],
  );
  const signedBalance = customerId ? await getGoldBalance(customerId) : pendingScaled - excessScaled;

  const dailyMap = new Map(dailyRows.map((row) => [row.day, Number(row.total)]));
  const span = eachDate(range.start, range.end);
  const useEveryDay = span.length <= 14;
  const days = (useEveryDay ? span : dailyRows.map((row) => row.day)).map((day) => ({
    day,
    label: formatDisplayDate(day).split(' ').slice(0, 2).join(' '),
    shortLabel: day.slice(8),
    paise: dailyMap.get(day) || 0,
  }));

  return {
    range,
    scope: {
      customerId: customerId || null,
      customerName: scopedCustomer?.name || null,
    },
    outstanding: {
      unconvertedPaise: readStoredInteger(unconvertedOutstanding.total, 'Unconverted income'),
      balanceScaled: readStoredInteger(signedBalance, 'Gold balance'),
      pendingScaled,
      excessScaled,
    },
    transactions,
    customers: {
      total: customers.length,
      owing,
      excess: excessCustomers,
      settled,
    },
    income: {
      totalPaise: Number(income.total),
      count: Number(income.count),
      unconvertedPaise: Number(income.unconverted),
      convertedPaise: Number(income.converted),
      daily: days,
      monthly: monthlyRows.map((row) => ({
        month: row.month,
        label: monthKey(row.month),
        paise: Number(row.total),
        count: Number(row.count),
      })),
    },
    advance: {
      depositedPaise: Number(advance.deposited),
      consumedPaise: Number(advance.consumed),
      reversedPaise: Number(advance.reversed),
      outstandingPaise: Number(outstanding.available),
    },
    gold: {
      pendingScaled,
      excessScaled,
      settled,
      convertedScaled: Number(gold.converted),
      conversionCount: Number(gold.count),
    },
  };
}

export async function buildReportCsv(options) {
  const report = await getReports(options);
  const lines = [
    'Section,Label,Value',
    `Range,Start,${report.range.start}`,
    `Range,End,${report.range.end}`,
    `Customers,Total,${report.customers.total}`,
    `Customers,Owing gold,${report.customers.owing}`,
    `Customers,Excess credit,${report.customers.excess}`,
    `Customers,Settled,${report.customers.settled}`,
    `Income,Total paise,${report.income.totalPaise}`,
    `Income,Payments,${report.income.count}`,
    `Income,Unconverted paise,${report.income.unconvertedPaise}`,
    `Income,Converted paise,${report.income.convertedPaise}`,
    `Advance,Deposits paise,${report.advance.depositedPaise}`,
    `Advance,Consumed paise,${report.advance.consumedPaise}`,
    `Advance,Outstanding paise,${report.advance.outstandingPaise}`,
    `Gold,Pending scaled,${report.gold.pendingScaled}`,
    `Gold,Excess scaled,${report.gold.excessScaled}`,
    `Gold,Converted scaled,${report.gold.convertedScaled}`,
  ];
  report.income.daily.forEach((day) => {
    lines.push(`Daily income,${day.day},${day.paise}`);
  });
  return lines.join('\n');
}

export async function shareReport(options = {}) {
  const csv = await buildReportCsv(options);
  const { getFileStore } = require('./fileStore');
  const uri = await getFileStore().writeTextFile(`GoldLedger-Report-${options.today || todayISODate()}.csv`, csv);
  const Sharing = require('expo-sharing');
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new AppError('SHARE_UNAVAILABLE', 'Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export GoldLedger report',
    UTI: 'public.comma-separated-values-text',
  });
}
