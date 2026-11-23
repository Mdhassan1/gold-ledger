const { useTestDatabase, resetTestState } = require('./testDb');
const { createCustomer, listCustomers, updateCustomer, setCustomerArchived } = require('../src/services/customerService');
const { addIncome, listIncome, listUnconvertedIncome } = require('../src/services/incomeService');
const { getAdvanceSummary } = require('../src/services/advanceService');
const { convertGold } = require('../src/services/conversionService');
const { getGoldBalance, reconstructBalance } = require('../src/services/ledgerService');
const { getDatabase } = require('../src/database/connection');
const { formatGrams } = require('../src/utils/goldCalculations');

async function counts() {
  const db = getDatabase();
  const income = await db.get('SELECT COUNT(*) AS count FROM income_transactions');
  const advance = await db.get('SELECT COUNT(*) AS count FROM advance_transactions');
  const conversions = await db.get('SELECT COUNT(*) AS count FROM gold_conversions');
  const ledger = await db.get('SELECT COUNT(*) AS count FROM gold_ledger');
  return {
    income: income.count,
    advance: advance.count,
    conversions: conversions.count,
    ledger: ledger.count,
  };
}

describe('customer ledger', () => {
  beforeEach(async () => {
    await useTestDatabase();
  });

  afterEach(() => {
    resetTestState();
  });

  test('creates, edits, and searches customers without changing financial history', async () => {
    const created = await createCustomer({
      name: 'Abdul Rahman',
      phone: '98765 43210',
      address: 'MG Road',
      notes: 'Regular',
      openingGoldGrams: '-1.5',
      openingAdvance: '0',
    });
    expect(created.gold_balance_scaled).toBe(-15000);
    expect(created.normalized_phone).toBe('9876543210');

    await expect(
      createCustomer({
        name: 'Abdul Two',
        phone: '9876543210',
        openingGoldGrams: '0',
        openingAdvance: '0',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PHONE' });

    const confirmed = await createCustomer({
      name: 'Abdul Two',
      phone: '9876543210',
      openingGoldGrams: '0',
      openingAdvance: '0',
      confirmDuplicate: true,
    });
    expect(confirmed.name).toBe('Abdul Two');

    const edited = await updateCustomer({
      id: created.id,
      name: 'Abdul K Rahman',
      phone: '9876543210',
      address: 'New street',
      notes: 'Updated',
      confirmDuplicate: true,
    });
    expect(edited.name).toBe('Abdul K Rahman');
    expect(edited.opening_gold_grams).toBe(-15000);
    expect(edited.gold_balance_scaled).toBe(-15000);

    const byName = await listCustomers('rahman');
    expect(byName.map((customer) => customer.id)).toContain(created.id);
    const byPhone = await listCustomers('43210');
    expect(byPhone.length).toBe(2);

    await setCustomerArchived(confirmed.id, true);
    const visible = await listCustomers('');
    expect(visible.map((customer) => customer.id)).not.toContain(confirmed.id);
    const withArchived = await listCustomers('', { includeArchived: true });
    expect(withArchived.map((customer) => customer.id)).toContain(confirmed.id);
  });

  test('keeps multiple same-day income payments separate', async () => {
    const customer = await createCustomer({
      name: 'Abdul',
      openingGoldGrams: '3',
      openingAdvance: '0',
    });
    await addIncome({ customerId: customer.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    await addIncome({ customerId: customer.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'UPI' });
    await addIncome({ customerId: customer.id, amount: '22000', paymentDate: '2026-11-01', paymentMethod: 'BANK_TRANSFER' });
    const rows = await listIncome(customer.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.payment_date === '2026-11-01')).toBe(true);
    expect(rows.every((row) => row.conversion_status === 'UNCONVERTED')).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.amount_paise, 0)).toBe(4200000);
  });

  test('rejects a negative income amount before writing a row', async () => {
    const customer = await createCustomer({ name: 'Mina', openingGoldGrams: '0', openingAdvance: '0' });
    await expect(
      addIncome({ customerId: customer.id, amount: '-100', paymentDate: '2026-11-01', paymentMethod: 'CASH' }),
    ).rejects.toThrow(/negative|greater than zero/);
    expect((await listIncome(customer.id)).length).toBe(0);
  });

  test('converts the worked examples and preserves advance when it is not selected', async () => {
    const abdul = await createCustomer({ name: 'Abdul', openingGoldGrams: '3', openingAdvance: '0' });
    await addIncome({ customerId: abdul.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    await addIncome({ customerId: abdul.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'UPI' });
    await addIncome({ customerId: abdul.id, amount: '22000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    const firstIds = (await listUnconvertedIncome(abdul.id)).map((row) => row.id);
    const first = await convertGold({
      customerId: abdul.id,
      incomeIds: firstIds,
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
      expectedPreviousScaled: 30000,
      expectedIncomePaise: 4200000,
      expectedAvailablePaise: 0,
    });
    expect(first.new_balance_scaled).toBe(2000);
    expect(formatGrams(first.new_balance_scaled)).toBe('0.2000 g');

    const extra = await createCustomer({ name: 'Extra', openingGoldGrams: '3', openingAdvance: '0' });
    await addIncome({ customerId: extra.id, amount: '50000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    const extraConversion = await convertGold({
      customerId: extra.id,
      incomeIds: (await listUnconvertedIncome(extra.id)).map((row) => row.id),
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
    });
    expect(extraConversion.new_balance_scaled).toBe(-3333);

    const partial = await createCustomer({ name: 'Partial', openingGoldGrams: '3', openingAdvance: '15000' });
    await addIncome({ customerId: partial.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    const partialConversion = await convertGold({
      customerId: partial.id,
      incomeIds: (await listUnconvertedIncome(partial.id)).map((row) => row.id),
      includeAdvance: true,
      advanceAmount: '5000',
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
      expectedAvailablePaise: 1500000,
    });
    expect(partialConversion.new_balance_scaled).toBe(20000);
    expect((await getAdvanceSummary(partial.id)).availablePaise).toBe(1000000);

    const untouched = await createCustomer({ name: 'Untouched', openingGoldGrams: '3', openingAdvance: '15000' });
    await addIncome({ customerId: untouched.id, amount: '10000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    const untouchedConversion = await convertGold({
      customerId: untouched.id,
      incomeIds: (await listUnconvertedIncome(untouched.id)).map((row) => row.id),
      includeAdvance: false,
      advanceAmount: '15000',
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
    });
    expect(untouchedConversion.advance_amount_paise).toBe(0);
    expect(untouchedConversion.new_balance_scaled).toBe(23333);
    expect((await getAdvanceSummary(untouched.id)).availablePaise).toBe(1500000);
  });

  test('rejects a second conversion of the same income and keeps later income unconverted', async () => {
    const customer = await createCustomer({ name: 'Repeat', openingGoldGrams: '3', openingAdvance: '0' });
    const income = await addIncome({
      customerId: customer.id,
      amount: '15000',
      paymentDate: '2026-11-01',
      paymentMethod: 'CASH',
    });
    await convertGold({
      customerId: customer.id,
      incomeIds: [income.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
    });
    await expect(
      convertGold({
        customerId: customer.id,
        incomeIds: [income.id],
        includeAdvance: false,
        ratePerGram: '15000',
        conversionDate: '2026-11-01',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' });

    const later = await addIncome({
      customerId: customer.id,
      amount: '2000',
      paymentDate: '2026-10-20',
      paymentMethod: 'UPI',
    });
    expect(later.conversion_status).toBe('UNCONVERTED');
    const open = await listUnconvertedIncome(customer.id);
    expect(open.map((row) => row.id)).toEqual([later.id]);
  });

  test('rejects an advance larger than the available balance and writes nothing', async () => {
    const customer = await createCustomer({ name: 'Advance', openingGoldGrams: '3', openingAdvance: '15000' });
    await addIncome({ customerId: customer.id, amount: '1000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    const before = await counts();
    await expect(
      convertGold({
        customerId: customer.id,
        incomeIds: (await listUnconvertedIncome(customer.id)).map((row) => row.id),
        includeAdvance: true,
        advanceAmount: '20000',
        ratePerGram: '15000',
        conversionDate: '2026-11-01',
        expectedAvailablePaise: 1500000,
      }),
    ).rejects.toMatchObject({ code: 'ADVANCE_EXCEEDED' });
    expect(await counts()).toEqual(before);
    expect((await getAdvanceSummary(customer.id)).availablePaise).toBe(1500000);
    expect(await getGoldBalance(customer.id)).toBe(30000);
  });

  test('rejects a zero rate before changing the ledger', async () => {
    const customer = await createCustomer({ name: 'Rate', openingGoldGrams: '1', openingAdvance: '0' });
    const income = await addIncome({
      customerId: customer.id,
      amount: '1000',
      paymentDate: '2026-11-01',
      paymentMethod: 'CASH',
    });
    const before = await counts();
    await expect(
      convertGold({
        customerId: customer.id,
        incomeIds: [income.id],
        includeAdvance: false,
        ratePerGram: '0',
        conversionDate: '2026-11-01',
      }),
    ).rejects.toThrow(/greater than zero/);
    expect(await counts()).toEqual(before);
  });

  test('rolls back every conversion write when a later step fails', async () => {
    const customer = await createCustomer({ name: 'Rollback', openingGoldGrams: '3', openingAdvance: '15000' });
    const income = await addIncome({
      customerId: customer.id,
      amount: '10000',
      paymentDate: '2026-11-01',
      paymentMethod: 'CASH',
    });
    const before = await counts();
    await expect(
      convertGold({
        customerId: customer.id,
        incomeIds: [income.id],
        includeAdvance: true,
        advanceAmount: '5000',
        ratePerGram: '15000',
        conversionDate: '2026-11-01',
        failAfter: 'mark_income',
      }),
    ).rejects.toThrow('TEST_ROLLBACK');
    expect(await counts()).toEqual(before);
    expect((await listUnconvertedIncome(customer.id)).map((row) => row.id)).toEqual([income.id]);
    expect((await getAdvanceSummary(customer.id)).availablePaise).toBe(1500000);
    expect(await getGoldBalance(customer.id)).toBe(30000);
    const check = await reconstructBalance(customer.id);
    expect(check.consistent).toBe(true);
  });

  test('calculates a negative opening balance through the ledger', async () => {
    const customer = await createCustomer({ name: 'Credit', openingGoldGrams: '-1.5', openingAdvance: '0' });
    const income = await addIncome({
      customerId: customer.id,
      amount: '15000',
      paymentDate: '2026-11-01',
      paymentMethod: 'CASH',
    });
    const conversion = await convertGold({
      customerId: customer.id,
      incomeIds: [income.id],
      includeAdvance: false,
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
    });
    expect(conversion.previous_balance_scaled).toBe(-15000);
    expect(conversion.new_balance_scaled).toBe(-25000);
    expect(await getGoldBalance(customer.id)).toBe(-25000);
    expect((await reconstructBalance(customer.id)).consistent).toBe(true);
  });

  test('tracks partial advance across multiple conversions', async () => {
    const customer = await createCustomer({ name: 'Stages', openingGoldGrams: '0', openingAdvance: '15000' });
    await convertGold({
      customerId: customer.id,
      incomeIds: [],
      includeAdvance: true,
      advanceAmount: '5000',
      ratePerGram: '15000',
      conversionDate: '2026-11-01',
      expectedAvailablePaise: 1500000,
    });
    expect((await getAdvanceSummary(customer.id)).availablePaise).toBe(1000000);

    await convertGold({
      customerId: customer.id,
      incomeIds: [],
      includeAdvance: true,
      advanceAmount: '4000',
      ratePerGram: '15000',
      conversionDate: '2026-10-21',
      expectedAvailablePaise: 1000000,
    });
    expect((await getAdvanceSummary(customer.id)).availablePaise).toBe(600000);

    await expect(
      convertGold({
        customerId: customer.id,
        incomeIds: [],
        includeAdvance: true,
        advanceAmount: '7000',
        ratePerGram: '15000',
        conversionDate: '2026-10-22',
        expectedAvailablePaise: 600000,
      }),
    ).rejects.toMatchObject({ code: 'ADVANCE_EXCEEDED' });
    expect((await getAdvanceSummary(customer.id)).availablePaise).toBe(600000);
    const deposits = await getDatabase().get(
      `SELECT COUNT(*) AS count FROM advance_transactions WHERE customer_id = ? AND transaction_type = 'DEPOSIT'`,
      [customer.id],
    );
    const used = await getDatabase().get(
      `SELECT COUNT(*) AS count FROM advance_transactions WHERE customer_id = ? AND transaction_type = 'CONSUMPTION'`,
      [customer.id],
    );
    expect(deposits.count).toBe(1);
    expect(used.count).toBe(2);
  });
});
