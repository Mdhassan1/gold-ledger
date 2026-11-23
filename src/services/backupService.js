import { activeDb } from '../database/connection';
import { TABLE_NAMES } from '../database/schema';
import { AppError } from '../utils/errors';
import { nowIso, todayISODate } from '../utils/dateUtils';
import { createId } from '../utils/ids';
import { getFileStore } from './fileStore';
import { decryptBackupEnvelope, encryptBackupPayload } from './backupCrypto';
import { summarizeBackup, validateBackupPayload } from './backupFormat';

const APP_VERSION = '1.0.0';

function extensionFromName(name) {
  if (!name || !String(name).includes('.')) return '.jpg';
  return String(name).slice(String(name).lastIndexOf('.'));
}

export async function buildBackupPayload() {
  const db = activeDb();
  const tables = {};
  for (const table of TABLE_NAMES) {
    if (table === 'customer_images') {
      tables[table] = await db.all(`SELECT id, customer_id, image_name, image_date, mime_type, created_at FROM ${table}`);
    } else {
      tables[table] = await db.all(`SELECT * FROM ${table}`);
    }
  }
  const imageRows = await db.all('SELECT * FROM customer_images');
  const images = [];
  const warnings = [];
  const store = getFileStore();
  for (const row of imageRows) {
    const dataBase64 = await store.readBase64(row.local_uri);
    if (!dataBase64) {
      warnings.push(`Missing image file for ${row.image_name}.`);
      continue;
    }
    images.push({
      id: row.id,
      customer_id: row.customer_id,
      image_name: row.image_name,
      image_date: row.image_date,
      mime_type: row.mime_type,
      created_at: row.created_at,
      extension: extensionFromName(row.local_uri),
      dataBase64,
    });
  }
  return validateBackupPayload({
    format: 'goldledger-backup',
    version: 1,
    encrypted: false,
    createdAt: nowIso(),
    appVersion: APP_VERSION,
    tables: {
      ...tables,
      customer_images: images.map(({ dataBase64, extension, ...row }) => row),
    },
    images,
    warnings,
  });
}

export async function encodeBackup(payload, password, iterations) {
  if (password) {
    return encryptBackupPayload(payload, password, iterations);
  }
  return payload;
}

export async function decodeBackupText(text, password) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AppError('INVALID_BACKUP', 'The selected file is not a GoldLedger backup.');
  }
  if (parsed && parsed.encrypted === true) {
    const payload = await decryptBackupEnvelope(parsed, password);
    return validateBackupPayload(payload);
  }
  return validateBackupPayload(parsed);
}

const INSERT_COLUMNS = {
  customers: ['id', 'name', 'phone', 'normalized_phone', 'address', 'notes', 'opening_gold_grams', 'created_at', 'updated_at', 'is_archived'],
  income_transactions: ['id', 'customer_id', 'amount_paise', 'payment_date', 'payment_method', 'notes', 'conversion_status', 'conversion_id', 'created_at'],
  advance_transactions: ['id', 'customer_id', 'transaction_type', 'amount_paise', 'transaction_date', 'conversion_id', 'payment_method', 'notes', 'created_at'],
  gold_conversions: ['id', 'customer_id', 'previous_balance_scaled', 'income_amount_paise', 'advance_amount_paise', 'total_amount_paise', 'gold_rate_paise_per_gram', 'converted_grams_scaled', 'new_balance_scaled', 'conversion_date', 'notes', 'created_at', 'reversed_at'],
  gold_ledger: ['id', 'customer_id', 'transaction_type', 'reference_id', 'grams_delta_scaled', 'balance_after_scaled', 'transaction_date', 'created_at'],
  customer_images: ['id', 'customer_id', 'image_name', 'image_date', 'local_uri', 'mime_type', 'created_at'],
  app_settings: ['key', 'value', 'updated_at'],
};

async function insertRows(tx, table, rows) {
  const allowed = INSERT_COLUMNS[table];
  for (const row of rows) {
    const columns = allowed.filter((column) => row[column] !== undefined);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    await tx.run(
      sql,
      columns.map((column) => (row[column] === undefined ? null : row[column])),
    );
  }
}

export async function restoreBackupPayload(payload) {
  const valid = validateBackupPayload(payload);
  const store = getFileStore();
  const db = activeDb();
  const oldImages = await db.all('SELECT local_uri FROM customer_images');
  const batch = createId();
  const written = [];
  const imageRows = [];
  try {
    for (const image of valid.images) {
      const stored = await store.writeBase64({
        customerId: image.customer_id,
        imageId: image.id,
        extension: image.extension || '.jpg',
        base64: image.dataBase64,
        mimeType: image.mime_type,
        fileName: `${image.id}-${batch}${image.extension || '.jpg'}`,
      });
      written.push(stored.uri);
      imageRows.push({
        id: image.id,
        customer_id: image.customer_id,
        image_name: image.image_name,
        image_date: image.image_date,
        local_uri: stored.uri,
        mime_type: image.mime_type || stored.mimeType || null,
        created_at: image.created_at,
      });
    }

    await db.withTransaction(async (tx) => {
      await tx.run('DELETE FROM income_transactions');
      await tx.run('DELETE FROM advance_transactions');
      await tx.run('DELETE FROM gold_ledger');
      await tx.run('DELETE FROM customer_images');
      await tx.run('DELETE FROM gold_conversions');
      await tx.run('DELETE FROM customers');
      await tx.run('DELETE FROM app_settings');
      await insertRows(tx, 'customers', valid.tables.customers);
      await insertRows(tx, 'gold_conversions', valid.tables.gold_conversions);
      await insertRows(tx, 'income_transactions', valid.tables.income_transactions);
      await insertRows(tx, 'advance_transactions', valid.tables.advance_transactions);
      await insertRows(tx, 'gold_ledger', valid.tables.gold_ledger);
      await insertRows(tx, 'customer_images', imageRows);
      await insertRows(tx, 'app_settings', valid.tables.app_settings);
      const integrity = await tx.get('PRAGMA integrity_check');
      const integrityValue = integrity?.integrity_check || integrity?.['integrity_check'];
      if (integrityValue !== 'ok') {
        throw new AppError('INTEGRITY', 'The restored database failed its integrity check.');
      }
      const foreignKeys = await tx.all('PRAGMA foreign_key_check');
      if (foreignKeys.length) {
        throw new AppError('INTEGRITY', 'The restored data has broken customer relationships.');
      }
    });
  } catch (error) {
    await Promise.all(written.map((uri) => store.delete(uri)));
    throw error;
  }

  const kept = new Set(written);
  await Promise.all(
    oldImages
      .map((row) => row.local_uri)
      .filter((uri) => uri && !kept.has(uri))
      .map((uri) => store.delete(uri)),
  );
  return summarizeBackup(valid);
}

export async function createBackupFile(password) {
  const payload = await buildBackupPayload();
  const encoded = await encodeBackup(payload, password);
  const filename = `GoldLedger-Backup-${todayISODate()}.goldledger`;
  const uri = await getFileStore().writeTextFile(filename, JSON.stringify(encoded));
  return { uri, filename, summary: summarizeBackup(payload), encrypted: Boolean(password) };
}

export async function shareBackup(password) {
  const created = await createBackupFile(password);
  const Sharing = require('expo-sharing');
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new AppError('SHARE_UNAVAILABLE', 'Saving files is not available on this device.');
  }
  await Sharing.shareAsync(created.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Save GoldLedger backup',
    UTI: 'public.data',
  });
  return created;
}

export async function pickAndReadBackup(password) {
  const DocumentPicker = require('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const text = await getFileStore().readTextFile(result.assets[0].uri);
  const payload = await decodeBackupText(text, password);
  return { payload, summary: summarizeBackup(payload), encrypted: Boolean(payload && false) };
}

export { summarizeBackup };
