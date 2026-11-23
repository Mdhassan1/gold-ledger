const { useTestDatabase, resetTestState } = require('./testDb');
const { createCustomer } = require('../src/services/customerService');
const { addIncome } = require('../src/services/incomeService');
const { addAdvance } = require('../src/services/advanceService');
const { convertGold } = require('../src/services/conversionService');
const { getReports } = require('../src/services/reportService');
const { addCustomerImage, listCustomerImages } = require('../src/services/galleryService');
const { setThemeMode, getThemeMode, setPin, verifyPin, getDatabaseInfo } = require('../src/services/settingsService');
const { PIN_ITERATIONS, BACKUP_KDF_ITERATIONS } = require('../src/services/backupCrypto');
const { buildBackupPayload, encodeBackup, decodeBackupText, restoreBackupPayload } = require('../src/services/backupService');

describe('reports, gallery, settings, and backup', () => {
  beforeEach(async () => {
    await useTestDatabase();
  });

  afterEach(() => {
    resetTestState();
  });

  test('report date filters do not mix advance with income', async () => {
    const today = '2026-11-01';
    const customer = await createCustomer({ name: 'Report', openingGoldGrams: '1', openingAdvance: '0' });
    await addIncome({ customerId: customer.id, amount: '1000', paymentDate: '2026-11-01', paymentMethod: 'CASH' });
    await addIncome({ customerId: customer.id, amount: '2500', paymentDate: '2026-10-31', paymentMethod: 'UPI' });
    await addIncome({ customerId: customer.id, amount: '4000', paymentDate: '2026-10-26', paymentMethod: 'CASH' });
    await addIncome({ customerId: customer.id, amount: '9000', paymentDate: '2026-10-25', paymentMethod: 'CASH' });
    await addAdvance({
      customerId: customer.id,
      amount: '7000',
      transactionDate: '2026-11-01',
      paymentMethod: 'CASH',
    });
    const incomeIds = (await getReports({ preset: 'today', today })).income;
    const todayReport = await getReports({ preset: 'today', today });
    expect(todayReport.income.totalPaise).toBe(100000);
    expect(todayReport.income.count).toBe(1);
    expect(todayReport.advance.depositedPaise).toBe(700000);
    expect(todayReport.income.totalPaise).not.toBe(todayReport.advance.depositedPaise);

    const yesterday = await getReports({ preset: 'yesterday', today });
    expect(yesterday.income.totalPaise).toBe(250000);

    const week = await getReports({ preset: 'week', today });
    expect(week.range.start).toBe('2026-10-26');
    expect(week.income.totalPaise).toBe(100000 + 250000 + 400000);

    const month = await getReports({ preset: 'month', today });
    expect(month.range.start).toBe('2026-11-01');
    expect(month.income.totalPaise).toBe(100000);

    const custom = await getReports({ preset: 'custom', today, start: '2026-10-25', end: '2026-10-31' });
    expect(custom.income.totalPaise).toBe(250000 + 400000 + 900000);
    expect(incomeIds).toBeDefined();
  });

  test('converted income is not counted again as unconverted', async () => {
    const customer = await createCustomer({ name: 'Status', openingGoldGrams: '2', openingAdvance: '0' });
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
    const report = await getReports({ preset: 'today', today: '2026-11-01' });
    expect(report.income.totalPaise).toBe(1500000);
    expect(report.income.convertedPaise).toBe(1500000);
    expect(report.income.unconvertedPaise).toBe(0);
    expect(report.income.count).toBe(1);
    expect(report.gold.convertedScaled).toBe(10000);
  });

  test('galleries stay isolated and store image metadata', async () => {
    const first = await createCustomer({ name: 'Amina', openingGoldGrams: '0', openingAdvance: '0' });
    const second = await createCustomer({ name: 'Basheer', openingGoldGrams: '0', openingAdvance: '0' });
    const saved = await addCustomerImage({
      customerId: first.id,
      imageName: 'Aadhaar front',
      imageDate: '2026-11-01',
      sourceUri: 'image-bytes-a',
      mimeType: 'image/jpeg',
      fileName: 'aadhaar.jpg',
    });
    await addCustomerImage({
      customerId: second.id,
      imageName: 'Pan card',
      imageDate: '2026-10-02',
      sourceUri: 'image-bytes-b',
      mimeType: 'image/png',
      fileName: 'pan.png',
    });
    const firstImages = await listCustomerImages(first.id);
    const secondImages = await listCustomerImages(second.id);
    expect(firstImages).toHaveLength(1);
    expect(secondImages).toHaveLength(1);
    expect(firstImages[0].image_name).toBe('Aadhaar front');
    expect(firstImages[0].image_date).toBe('2026-11-01');
    expect(firstImages[0].local_uri).toContain(first.id);
    expect(firstImages[0].local_uri).not.toContain(second.id);
    expect(secondImages.map((image) => image.id)).not.toContain(saved.id);
  });

  test('theme and PIN settings persist without storing the PIN', async () => {
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(100000);
    expect(BACKUP_KDF_ITERATIONS).toBeGreaterThanOrEqual(210000);
    await setThemeMode('dark');
    expect(await getThemeMode()).toBe('dark');
    await setThemeMode('light');
    expect(await getThemeMode()).toBe('light');

    await setPin('2468', { iterations: 2000 });
    const info = await getDatabaseInfo();
    expect(info.counts.app_settings).toBeGreaterThan(0);
    const dbModule = require('../src/database/connection');
    const stored = await dbModule.getDatabase().get(`SELECT value FROM app_settings WHERE key = 'pin_hash'`);
    expect(stored.value).not.toBe('2468');
    expect(stored.value.length).toBeGreaterThan(20);
    expect(await verifyPin('2468')).toBe(true);
    expect(await verifyPin('0000')).toBe(false);
  });

  test('backup validation, encryption, and restore replace data completely', async () => {
    const customer = await createCustomer({
      name: 'Backup Customer',
      phone: '9000000000',
      openingGoldGrams: '2.5',
      openingAdvance: '1000',
    });
    await addCustomerImage({
      customerId: customer.id,
      imageName: 'Receipt',
      imageDate: '2026-11-01',
      sourceUri: 'receipt-bytes',
      mimeType: 'image/jpeg',
      fileName: 'receipt.jpg',
    });
    const payload = await buildBackupPayload();
    expect(payload.tables.customers).toHaveLength(1);
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].dataBase64).toBe('receipt-bytes');

    const encrypted = await encodeBackup(payload, 'correct-horse', 2000);
    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.cipher).toBe('aes-256-gcm');
    expect(JSON.stringify(encrypted)).not.toContain('Backup Customer');
    const unlocked = await decodeBackupText(JSON.stringify(encrypted), 'correct-horse');
    expect(unlocked.tables.customers[0].name).toBe('Backup Customer');
    await expect(decodeBackupText(JSON.stringify(encrypted), 'wrong-password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    await expect(
      decodeBackupText(JSON.stringify({ format: 'goldledger-backup', version: 99, tables: {}, images: [] })),
    ).rejects.toMatchObject({ code: 'INVALID_BACKUP' });

    await createCustomer({ name: 'Should disappear', openingGoldGrams: '9', openingAdvance: '0' });
    const summary = await restoreBackupPayload(unlocked);
    expect(summary.customers).toBe(1);
    const { listCustomers } = require('../src/services/customerService');
    const customers = await listCustomers('');
    expect(customers.map((row) => row.name)).toEqual(['Backup Customer']);
    expect(customers[0].gold_balance_scaled).toBe(25000);
    const images = await listCustomerImages(customers[0].id);
    expect(images).toHaveLength(1);
    expect(images[0].image_name).toBe('Receipt');

    const broken = JSON.parse(JSON.stringify(payload));
    broken.tables.income_transactions.push({
      id: 'bad-income',
      customer_id: customers[0].id,
      amount_paise: -5,
      payment_date: '2026-11-01',
      payment_method: 'CASH',
      notes: null,
      conversion_status: 'UNCONVERTED',
      conversion_id: null,
      created_at: '2026-11-01T00:00:00.000Z',
    });
    await expect(restoreBackupPayload(broken)).rejects.toThrow();
    const stillThere = await listCustomers('');
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].name).toBe('Backup Customer');
  });
});
