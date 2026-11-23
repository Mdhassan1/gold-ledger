const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { useTestDatabase, resetTestState } = require('./testDb');
const { createNodeAdapter } = require('../src/database/nodeAdapter');
const { migrate } = require('../src/database/migrations');
const { setDatabase, getDatabase } = require('../src/database/connection');
const { createCustomer } = require('../src/services/customerService');
const {
  addIncome,
  deleteUnconvertedIncome,
  getIncomeSummary,
  listIncome,
  listUnconvertedIncome,
  updateUnconvertedIncome,
} = require('../src/services/incomeService');
const { addAdvance, getAdvanceSummary } = require('../src/services/advanceService');
const { convertGold, reverseConversion } = require('../src/services/conversionService');
const { getGoldBalance } = require('../src/services/ledgerService');
const { getReports } = require('../src/services/reportService');
const { buildMonthStatement, statementToCsv, statementToLines } = require('../src/services/statementService');
const { buildTextPdf } = require('../src/utils/textPdf');
const { createId } = require('../src/utils/ids');
const { nowIso } = require('../src/utils/dateUtils');
const { formatGrams } = require('../src/utils/goldCalculations');

async function customer(name, grams = '0', advance = '0') {
  return createCustomer({ name, openingGoldGrams: grams, openingAdvance: advance });
}

async function pay(customerId, amount, date = '2026-10-20', method = 'CASH') {
  return addIncome({ customerId, amount, paymentDate: date, paymentMethod: method });
}

describe('financial audit', () => {
  beforeEach(async () => {
    await useTestDatabase();
  });

  afterEach(() => {
    resetTestState();
  });

  test('four payments stay in the unconverted total, including after a partial conversion', async () => {
    const person = await customer('A', '3');
    const payments = [];
    for (const amount of ['10000', '10000', '22000', '5000']) {
      payments.push(await pay(person.id, amount, '2026-10-20', amount === '5000' ? 'UPI' : 'CASH'));
    }
    const before = await getIncomeSummary(person.id);
    expect(before.unconvertedPaise).toBe(4700000);
    expect(before.reconciles).toBe(true);
    expect((await listUnconvertedIncome(person.id)).reduce((sum, row) => sum + row.amount_paise, 0)).toBe(4700000);

    await convertGold({
      customerId: person.id,
      incomeIds: [payments[0].id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    const afterFirst = await getIncomeSummary(person.id);
    expect(afterFirst.unconvertedPaise).toBe(3700000);
    expect(afterFirst.convertedPaise).toBe(1000000);
    expect(afterFirst.totalPaise).toBe(4700000);

    await pay(person.id, '8000', '2026-10-21', 'BANK_TRANSFER');
    const afterNew = await getIncomeSummary(person.id);
    expect(afterNew.unconvertedPaise).toBe(4500000);
    expect(afterNew.reconciles).toBe(true);

    const history = await listIncome(person.id);
    const unconverted = await listIncome(person.id, { status: 'UNCONVERTED' });
    const converted = await listIncome(person.id, { status: 'CONVERTED' });
    expect(history).toHaveLength(5);
    expect(unconverted.reduce((sum, row) => sum + row.amount_paise, 0)).toBe(4500000);
    expect(converted).toHaveLength(1);

    const report = await getReports({ period: 'month', anchor: '2026-10-20', customerId: person.id });
    expect(report.outstanding.unconvertedPaise).toBe(4500000);
    expect(report.income.totalPaise).toBe(5500000);
    expect(report.transactions.filter((row) => row.kind === 'INCOME')).toHaveLength(5);
  });

  test('parallel income inserts all commit and a reader waits for the open transaction', async () => {
    const person = await customer('Parallel');
    await Promise.all([
      pay(person.id, '10000', '2026-10-20', 'CASH'),
      pay(person.id, '10000', '2026-10-20', 'UPI'),
      pay(person.id, '22000', '2026-10-20', 'BANK_TRANSFER'),
      pay(person.id, '5000', '2026-10-20', 'OTHER'),
    ]);
    expect((await listIncome(person.id))).toHaveLength(4);
    expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(4700000);

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let holding = false;
    const pending = getDatabase().withTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO income_transactions (
          id, customer_id, amount_paise, payment_date, payment_method, notes, conversion_status, conversion_id, created_at
        ) VALUES (?, ?, ?, ?, 'CASH', NULL, 'UNCONVERTED', NULL, ?)`,
        [createId(), person.id, 100000, '2026-10-20', nowIso()],
      );
      holding = true;
      await gate;
    });
    while (!holding) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    let observed = null;
    const reading = getIncomeSummary(person.id).then((summary) => {
      observed = summary.unconvertedPaise;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observed).toBe(null);
    release();
    await pending;
    await reading;
    expect(observed).toBe(4800000);
  });

  test('edits and deletes only unconverted income', async () => {
    const person = await customer('Edit', '1');
    const open = await pay(person.id, '1000', '2020-05-01', 'UPI');
    const closed = await pay(person.id, '15000', '2026-10-20', 'CASH');
    await convertGold({
      customerId: person.id,
      incomeIds: [closed.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    const edited = await updateUnconvertedIncome({
      incomeId: open.id,
      customerId: person.id,
      amount: '1500.50',
      paymentDate: '2020-05-02',
      paymentMethod: 'BANK_TRANSFER',
      notes: 'Corrected',
    });
    expect(edited.amount_paise).toBe(150050);
    expect(edited.payment_date).toBe('2020-05-02');
    await expect(updateUnconvertedIncome({
      incomeId: closed.id,
      customerId: person.id,
      amount: '1',
      paymentDate: '2026-10-20',
      paymentMethod: 'CASH',
    })).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' });
    expect((await getIncome(closed.id)).amount_paise).toBe(1500000);
    await expect(deleteUnconvertedIncome(closed.id, person.id)).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' });
    await deleteUnconvertedIncome(open.id, person.id);
    const summary = await getIncomeSummary(person.id);
    expect(summary.unconvertedPaise).toBe(0);
    expect(summary.convertedPaise).toBe(1500000);
    expect(summary.paymentCount).toBe(1);
  });

  test('advance, partial use, reversal, and advance-only conversion stay separate from income', async () => {
    const person = await customer('Advance', '2', '15000');
    await addAdvance({ customerId: person.id, amount: '5000', transactionDate: '2026-10-20', paymentMethod: 'CASH' });
    expect((await getAdvanceSummary(person.id)).availablePaise).toBe(2000000);
    const income = await pay(person.id, '10000');
    await convertGold({
      customerId: person.id,
      incomeIds: [income.id],
      includeAdvance: true,
      advanceAmount: '5000',
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    expect(formatGrams(await getGoldBalance(person.id))).toBe('1.0000 g');
    expect((await getAdvanceSummary(person.id)).availablePaise).toBe(1500000);
    expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(0);

    const untouched = await customer('Untouched', '3', '15000');
    const untouchedIncome = await pay(untouched.id, '10000');
    await convertGold({
      customerId: untouched.id,
      incomeIds: [untouchedIncome.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    expect(formatGrams(await getGoldBalance(untouched.id))).toBe('2.3333 g');
    expect((await getAdvanceSummary(untouched.id)).availablePaise).toBe(1500000);

    const only = await customer('Advance only', '2');
    await addAdvance({ customerId: only.id, amount: '30000', transactionDate: '2026-10-20', paymentMethod: 'UPI' });
    const onlyConversion = await convertGold({
      customerId: only.id,
      incomeIds: [],
      includeAdvance: true,
      advanceAmount: '30000',
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    expect(formatGrams(await getGoldBalance(only.id))).toBe('0.0000 g');
    expect((await getAdvanceSummary(only.id)).availablePaise).toBe(0);
    expect((await getIncomeSummary(only.id)).totalPaise).toBe(0);

    await reverseConversion(onlyConversion.id);
    expect(formatGrams(await getGoldBalance(only.id))).toBe('2.0000 g');
    expect((await getAdvanceSummary(only.id)).availablePaise).toBe(3000000);
  });

  test('multiple conversions on one date keep their own rates and balances', async () => {
    const person = await customer('Chain', '5');
    const first = await pay(person.id, '30000', '2026-10-20', 'CASH');
    const second = await pay(person.id, '22500', '2026-10-20', 'UPI');
    const third = await pay(person.id, '30000', '2026-10-21', 'CASH');
    const one = await convertGold({
      customerId: person.id,
      incomeIds: [first.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    const two = await convertGold({
      customerId: person.id,
      incomeIds: [second.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    });
    const three = await convertGold({
      customerId: person.id,
      incomeIds: [third.id],
      includeAdvance: false,
      ratePerGram: '20000',
      conversionDate: '2026-10-21',
    });
    expect(one.id).not.toBe(two.id);
    expect(one.previous_balance_scaled).toBe(50000);
    expect(one.new_balance_scaled).toBe(30000);
    expect(two.previous_balance_scaled).toBe(30000);
    expect(two.new_balance_scaled).toBe(15000);
    expect(three.gold_rate_paise_per_gram).toBe(2000000);
    expect(three.previous_balance_scaled).toBe(15000);
    expect(three.new_balance_scaled).toBe(0);
    expect(formatGrams(await getGoldBalance(person.id))).toBe('0.0000 g');
    expect(one.conversion_date).toBe(two.conversion_date);
    await expect(convertGold({
      customerId: person.id,
      incomeIds: [first.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    })).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' });
    await expect(convertGold({
      customerId: person.id,
      incomeIds: [],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-10-20',
    })).rejects.toMatchObject({ code: 'NOTHING_TO_CONVERT' });
  });

  test('daily, weekly, and monthly reports can be limited to one customer', async () => {
    const first = await customer('First', '1');
    const second = await customer('Second', '2');
    await pay(first.id, '1000', '2026-11-01');
    await pay(first.id, '4000', '2026-10-20');
    await pay(second.id, '9000', '2026-11-01');
    await addAdvance({ customerId: first.id, amount: '700', transactionDate: '2026-11-01', paymentMethod: 'CASH' });

    const daily = await getReports({ period: 'day', anchor: '2026-11-01', customerId: first.id });
    expect(daily.range.start).toBe('2026-11-01');
    expect(daily.range.end).toBe('2026-11-01');
    expect(daily.income.totalPaise).toBe(100000);
    expect(daily.advance.depositedPaise).toBe(70000);
    expect(daily.outstanding.unconvertedPaise).toBe(500000);
    expect(daily.transactions.map((row) => row.kind).sort()).toEqual(['ADVANCE', 'INCOME']);

    const weekly = await getReports({ period: 'week', anchor: '2026-11-01', customerId: first.id });
    expect(weekly.range.start).toBe('2026-10-26');
    expect(weekly.range.end).toBe('2026-11-01');
    expect(weekly.income.totalPaise).toBe(100000);

    const monthly = await getReports({ period: 'month', anchor: '2026-11-01' });
    expect(monthly.range.start).toBe('2026-11-01');
    expect(monthly.range.end).toBe('2026-11-30');
    expect(monthly.income.totalPaise).toBe(1000000);
    expect(monthly.outstanding.unconvertedPaise).toBe(1400000);
    expect(monthly.scope.customerId).toBe(null);

    const oneMonth = await getReports({ period: 'month', anchor: '2026-10-20', customerId: first.id });
    expect(oneMonth.income.totalPaise).toBe(400000);
    expect(oneMonth.scope.customerName).toBe('First');
  });

  test('a monthly statement keeps income and advance apart and can cover one customer', async () => {
    const first = await customer('Statement One', '1.5');
    const second = await customer('Statement Two', '0');
    await pay(first.id, '2500', '2026-11-01', 'UPI');
    await addAdvance({ customerId: first.id, amount: '800', transactionDate: '2026-11-01', paymentMethod: 'CASH' });
    await pay(second.id, '9999', '2026-11-01');
    const statement = await buildMonthStatement({ customerId: first.id, month: '2026-11-01' });
    expect(statement.sections).toHaveLength(1);
    expect(statement.periodIncome).toBe(250000);
    expect(statement.periodDeposits).toBe(80000);
    const csv = statementToCsv(statement);
    expect(csv).toContain('Income');
    expect(csv).toContain('Advance');
    expect(csv).not.toContain('Statement Two');
    const pdf = buildTextPdf(statementToLines(statement));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Statement One');
    expect(pdf).not.toContain('Statement Two');
  });
});

describe('income survives closing the database file', () => {
  afterEach(() => {
    resetTestState();
  });

  test('reopening the file keeps every unconverted payment', async () => {
    const file = path.join(os.tmpdir(), `goldledger-income-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
    const open = async () => {
      const raw = new DatabaseSync(file);
      const db = createNodeAdapter(raw);
      await db.exec('PRAGMA foreign_keys = ON;');
      await migrate(db);
      setDatabase(db);
      return raw;
    };
    try {
      let raw = await open();
      const person = await customer('Reopen', '3');
      const payments = [];
      for (const amount of ['10000', '10000', '22000', '5000']) {
        payments.push(await pay(person.id, amount));
      }
      expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(4700000);
      raw.close();

      raw = await open();
      expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(4700000);
      expect((await listUnconvertedIncome(person.id))).toHaveLength(4);
      await convertGold({
        customerId: person.id,
        incomeIds: [payments[0].id],
        includeAdvance: false,
        ratePerGram: '15000',
        conversionDate: '2026-10-20',
      });
      expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(3700000);
      await pay(person.id, '8000', '2026-10-21');
      expect((await getIncomeSummary(person.id)).unconvertedPaise).toBe(4500000);
      raw.close();

      raw = await open();
      const summary = await getIncomeSummary(person.id);
      expect(summary.unconvertedPaise).toBe(4500000);
      expect(summary.convertedPaise).toBe(1000000);
      expect(summary.reconciles).toBe(true);
      const report = await getReports({ period: 'month', anchor: '2026-10-20', customerId: person.id });
      expect(report.outstanding.unconvertedPaise).toBe(summary.unconvertedPaise);
      raw.close();
    } finally {
      resetTestState();
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
      }
    }
  });
});

async function getIncome(id) {
  return getDatabase().get('SELECT * FROM income_transactions WHERE id = ?', [id]);
}
