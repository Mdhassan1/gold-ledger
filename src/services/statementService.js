import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { formatDisplayDate, periodRange, todayISODate } from '../utils/dateUtils';
import { formatGrams, formatINR, readStoredInteger } from '../utils/goldCalculations';
import { paymentMethodLabel } from '../utils/constants';
import { buildTextPdf } from '../utils/textPdf';
import { getIncomeSummary } from './incomeService';
import { getAdvanceSummary } from './advanceService';
import { listCustomers } from './customerService';

async function balanceOn(db, customerId, openingScaled, boundary, inclusive) {
  const comparison = inclusive ? '<=' : '<';
  const row = await db.get(
    `SELECT balance_after_scaled
     FROM gold_ledger
     WHERE customer_id = ? AND transaction_date ${comparison} ?
     ORDER BY transaction_date DESC, created_at DESC, rowid DESC
     LIMIT 1`,
    [customerId, boundary],
  );
  if (!row) return readStoredInteger(openingScaled, 'Opening gold');
  return readStoredInteger(row.balance_after_scaled, 'Gold balance');
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function buildMonthStatement({ customerId = null, month = todayISODate() } = {}) {
  const range = periodRange('month', month);
  const db = activeDb();
  const customers = customerId
    ? await (async () => {
        const row = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
        if (!row) throw new AppError('NOT_FOUND', 'Customer not found.');
        return [row];
      })()
    : await listCustomers('');

  const sections = [];
  for (const customer of customers) {
    const opening = await balanceOn(db, customer.id, customer.opening_gold_grams, range.start, false);
    const closing = await balanceOn(db, customer.id, customer.opening_gold_grams, range.end, true);
    const income = await db.all(
      `SELECT * FROM income_transactions
       WHERE customer_id = ? AND payment_date >= ? AND payment_date <= ?
       ORDER BY payment_date ASC, created_at ASC`,
      [customer.id, range.start, range.end],
    );
    const advances = await db.all(
      `SELECT * FROM advance_transactions
       WHERE customer_id = ? AND transaction_date >= ? AND transaction_date <= ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [customer.id, range.start, range.end],
    );
    const conversions = await db.all(
      `SELECT * FROM gold_conversions
       WHERE customer_id = ? AND conversion_date >= ? AND conversion_date <= ?
       ORDER BY conversion_date ASC, created_at ASC`,
      [customer.id, range.start, range.end],
    );
    const incomeSummary = await getIncomeSummary(customer.id);
    const advanceSummary = await getAdvanceSummary(customer.id);
    sections.push({
      customer,
      openingScaled: opening,
      closingScaled: closing,
      income,
      advances,
      conversions,
      currentUnconvertedPaise: incomeSummary.unconvertedPaise,
      currentAdvancePaise: advanceSummary.availablePaise,
    });
  }

  const periodIncome = sections.reduce(
    (sum, section) => sum + section.income.reduce((inner, row) => inner + row.amount_paise, 0),
    0,
  );
  const periodDeposits = sections.reduce(
    (sum, section) => sum + section.advances.filter((row) => row.transaction_type === 'DEPOSIT').reduce((inner, row) => inner + row.amount_paise, 0),
    0,
  );
  const periodUsed = sections.reduce(
    (sum, section) => sum + section.advances.filter((row) => row.transaction_type === 'CONSUMPTION').reduce((inner, row) => inner + row.amount_paise, 0),
    0,
  );
  return { range, sections, periodIncome, periodDeposits, periodUsed };
}

export function statementToLines(statement) {
  const lines = [
    'GoldLedger monthly statement',
    statement.range.label,
    `${statement.range.start} to ${statement.range.end}`,
    'Offline report. Advance deposits are listed separately from income.',
    '',
    `Period income: ${formatINR(statement.periodIncome)}`,
    `Period advance deposits: ${formatINR(statement.periodDeposits)}`,
    `Period advance used: ${formatINR(statement.periodUsed)}`,
    '',
  ];
  if (!statement.sections.length) {
    lines.push('No customers in this report.');
    return lines;
  }
  statement.sections.forEach((section) => {
    const customer = section.customer;
    lines.push('------------------------------------------------------------');
    lines.push(customer.name);
    lines.push(`Phone: ${customer.phone || '—'}`);
    if (customer.address) lines.push(`Address: ${customer.address}`);
    lines.push(`Gold at start of month: ${formatGrams(section.openingScaled)}`);
    lines.push(`Gold at end of month: ${formatGrams(section.closingScaled)}`);
    lines.push(`Current unconverted income: ${formatINR(section.currentUnconvertedPaise)} (not limited to this month)`);
    lines.push(`Current available advance: ${formatINR(section.currentAdvancePaise)}`);
    lines.push('');
    lines.push('Income');
    if (!section.income.length) lines.push('  None');
    section.income.forEach((row) => {
      lines.push(`  ${row.payment_date}  ${formatINR(row.amount_paise)}  ${paymentMethodLabel(row.payment_method)}  ${row.conversion_status}${row.notes ? `  ${row.notes}` : ''}`);
    });
    lines.push('Advance');
    if (!section.advances.length) lines.push('  None');
    section.advances.forEach((row) => {
      lines.push(`  ${row.transaction_date}  ${row.transaction_type}  ${formatINR(row.amount_paise)}${row.notes ? `  ${row.notes}` : ''}`);
    });
    lines.push('Gold conversions');
    if (!section.conversions.length) lines.push('  None');
    section.conversions.forEach((row) => {
      const reversed = row.reversed_at ? ' REVERSED' : '';
      lines.push(`  ${row.conversion_date}  ${formatINR(row.total_amount_paise)} at ${formatINR(row.gold_rate_paise_per_gram)}/g  ${formatGrams(row.previous_balance_scaled)} -> ${formatGrams(row.new_balance_scaled)}  converted ${formatGrams(row.converted_grams_scaled)}${reversed}`);
    });
    lines.push('');
  });
  return lines;
}

export function statementToCsv(statement) {
  const rows = [[
    'Customer', 'Phone', 'Date', 'Type', 'Detail', 'Amount', 'Grams', 'Gold rate', 'Status', 'Notes',
  ]];
  statement.sections.forEach((section) => {
    const name = section.customer.name;
    const phone = section.customer.phone || '';
    rows.push([name, phone, statement.range.start, 'Opening gold', 'Balance before this month', '', formatGrams(section.openingScaled, { withUnit: false }), '', '', '']);
    rows.push([name, phone, statement.range.end, 'Closing gold', 'Balance at month end', '', formatGrams(section.closingScaled, { withUnit: false }), '', '', '']);
    rows.push([name, phone, '', 'Current unconverted income', 'Not limited to this month', formatINR(section.currentUnconvertedPaise), '', '', '', '']);
    section.income.forEach((row) => {
      rows.push([name, phone, row.payment_date, 'Income', paymentMethodLabel(row.payment_method), formatINR(row.amount_paise), '', '', row.conversion_status, row.notes || '']);
    });
    section.advances.forEach((row) => {
      rows.push([name, phone, row.transaction_date, 'Advance', row.transaction_type, formatINR(row.amount_paise), '', '', row.transaction_type, row.notes || '']);
    });
    section.conversions.forEach((row) => {
      rows.push([
        name,
        phone,
        row.conversion_date,
        'Gold conversion',
        `${formatGrams(row.previous_balance_scaled)} to ${formatGrams(row.new_balance_scaled)}`,
        formatINR(row.total_amount_paise),
        formatGrams(row.converted_grams_scaled, { withUnit: false }),
        formatINR(row.gold_rate_paise_per_gram),
        row.reversed_at ? 'REVERSED' : 'COMPLETED',
        row.notes || '',
      ]);
    });
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export async function shareMonthStatement({ customerId = null, month = todayISODate(), format = 'pdf' } = {}) {
  const statement = await buildMonthStatement({ customerId, month });
  const slug = customerId ? 'customer' : 'all-customers';
  const filename = format === 'pdf'
    ? `GoldLedger-${statement.range.start.slice(0, 7)}-${slug}.pdf`
    : `GoldLedger-${statement.range.start.slice(0, 7)}-${slug}.csv`;
  const contents = format === 'pdf'
    ? buildTextPdf(statementToLines(statement))
    : statementToCsv(statement);
  const { getFileStore } = require('./fileStore');
  const uri = await getFileStore().writeTextFile(filename, contents);
  const Sharing = require('expo-sharing');
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new AppError('SHARE_UNAVAILABLE', 'Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: format === 'pdf' ? 'application/pdf' : 'text/csv',
    dialogTitle: format === 'pdf' ? 'Share GoldLedger PDF' : 'Share GoldLedger CSV',
    UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
  return { uri, filename, statement };
}

export function formatStatementDate(isoDate) {
  return formatDisplayDate(isoDate);
}
