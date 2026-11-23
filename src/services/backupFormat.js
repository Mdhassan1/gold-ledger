import { AppError } from '../utils/errors';
import { TABLE_NAMES } from '../database/schema';
import { BACKUP_FORMAT, BACKUP_VERSION } from './backupCrypto';

const REQUIRED_COLUMNS = {
  customers: ['id', 'name', 'opening_gold_grams', 'created_at', 'updated_at', 'is_archived'],
  income_transactions: ['id', 'customer_id', 'amount_paise', 'payment_date', 'payment_method', 'conversion_status', 'created_at'],
  advance_transactions: ['id', 'customer_id', 'transaction_type', 'amount_paise', 'transaction_date', 'created_at'],
  gold_conversions: ['id', 'customer_id', 'previous_balance_scaled', 'income_amount_paise', 'advance_amount_paise', 'total_amount_paise', 'gold_rate_paise_per_gram', 'converted_grams_scaled', 'new_balance_scaled', 'conversion_date', 'created_at'],
  gold_ledger: ['id', 'customer_id', 'transaction_type', 'grams_delta_scaled', 'balance_after_scaled', 'transaction_date', 'created_at'],
  customer_images: ['id', 'customer_id', 'image_name', 'image_date', 'created_at'],
  app_settings: ['key', 'updated_at'],
};

function assertColumns(table, row) {
  const missing = REQUIRED_COLUMNS[table].filter((column) => row[column] === undefined);
  if (missing.length) {
    throw new AppError('INVALID_BACKUP', `A ${table} record is missing ${missing.join(', ')}.`);
  }
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('INVALID_BACKUP', 'The backup file is empty or unreadable.');
  }
  if (payload.format !== BACKUP_FORMAT) {
    throw new AppError('INVALID_BACKUP', 'This file is not a GoldLedger backup.');
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new AppError('INVALID_BACKUP', 'This backup was created by an unsupported GoldLedger version.');
  }
  if (!payload.tables || typeof payload.tables !== 'object') {
    throw new AppError('INVALID_BACKUP', 'The backup does not contain database records.');
  }
  TABLE_NAMES.forEach((table) => {
    if (!Array.isArray(payload.tables[table])) {
      throw new AppError('INVALID_BACKUP', `The backup is missing ${table}.`);
    }
    payload.tables[table].forEach((row) => assertColumns(table, row));
  });
  if (!Array.isArray(payload.images)) {
    throw new AppError('INVALID_BACKUP', 'The backup image list is invalid.');
  }

  const customerIds = new Set(payload.tables.customers.map((row) => row.id));
  const conversionIds = new Set(payload.tables.gold_conversions.map((row) => row.id));
  const expectCustomer = (table, row) => {
    if (!customerIds.has(row.customer_id)) {
      throw new AppError('INVALID_BACKUP', `A ${table} record points at a missing customer.`);
    }
  };
  payload.tables.income_transactions.forEach((row) => {
    expectCustomer('income', row);
    if (row.conversion_id && !conversionIds.has(row.conversion_id)) {
      throw new AppError('INVALID_BACKUP', 'An income record points at a missing conversion.');
    }
  });
  payload.tables.advance_transactions.forEach((row) => {
    expectCustomer('advance', row);
    if (row.conversion_id && !conversionIds.has(row.conversion_id)) {
      throw new AppError('INVALID_BACKUP', 'An advance record points at a missing conversion.');
    }
  });
  payload.tables.gold_conversions.forEach((row) => expectCustomer('conversion', row));
  payload.tables.gold_ledger.forEach((row) => expectCustomer('ledger', row));
  payload.images.forEach((image) => {
    if (!customerIds.has(image.customer_id)) {
      throw new AppError('INVALID_BACKUP', 'An image belongs to a missing customer.');
    }
    if (!image.dataBase64) {
      throw new AppError('INVALID_BACKUP', 'An image in the backup has no file data.');
    }
  });
  const imageIds = new Set(payload.images.map((image) => image.id));
  payload.tables.customer_images.forEach((row) => {
    expectCustomer('image', row);
    if (!imageIds.has(row.id)) {
      throw new AppError('INVALID_BACKUP', 'An image record has no matching image file.');
    }
  });
  return payload;
}

export function summarizeBackup(payload) {
  return {
    createdAt: payload.createdAt || null,
    appVersion: payload.appVersion || null,
    customers: payload.tables.customers.length,
    income: payload.tables.income_transactions.length,
    advances: payload.tables.advance_transactions.length,
    conversions: payload.tables.gold_conversions.length,
    images: payload.images.length,
    warnings: payload.warnings || [],
  };
}
