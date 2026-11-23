import { activeDb } from '../database/connection';
import { getSchemaVersion } from '../database/migrations';
import { TABLE_NAMES } from '../database/schema';
import { AppError } from '../utils/errors';
import { nowIso } from '../utils/dateUtils';
import { validatePin } from '../utils/validation';
import { bytesToBase64, base64ToBytes } from '../utils/base64';
import { createSalt, hashPin, PIN_ITERATIONS, safeEqual } from './backupCrypto';

const THEME_MODES = new Set(['light', 'dark', 'system']);
const TIMEOUTS = new Set(['immediate', '60', '300', '900', 'session']);

async function readSetting(key, tx) {
  const db = tx || activeDb();
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function getSetting(key) {
  return readSetting(key);
}

export async function setSetting(key, value) {
  const db = activeDb();
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value === null || value === undefined ? null : String(value), nowIso()],
  );
}

export async function getThemeMode() {
  const value = await getSetting('theme');
  return THEME_MODES.has(value) ? value : 'system';
}

export async function setThemeMode(mode) {
  if (!THEME_MODES.has(mode)) {
    throw new AppError('VALIDATION', 'Choose light, dark, or system default.');
  }
  await setSetting('theme', mode);
  return mode;
}

export async function getBusinessProfile() {
  return {
    name: (await getSetting('business_name')) || '',
    phone: (await getSetting('business_phone')) || '',
    address: (await getSetting('business_address')) || '',
    currency: (await getSetting('currency')) || 'INR',
    gramPrecision: 4,
  };
}

export async function saveBusinessProfile({ name, phone, address }) {
  const clean = (value, max) => String(value ?? '').trim().slice(0, max);
  await setSetting('business_name', clean(name, 80));
  await setSetting('business_phone', clean(phone, 20));
  await setSetting('business_address', clean(address, 300));
  await setSetting('currency', 'INR');
  await setSetting('gram_precision', '4');
  return getBusinessProfile();
}

export async function getSecurityState() {
  const hash = await getSetting('pin_hash');
  return {
    hasPin: Boolean(hash),
    timeout: TIMEOUTS.has(await getSetting('lock_timeout')) ? await getSetting('lock_timeout') : 'immediate',
    biometricEnabled: (await getSetting('biometric_enabled')) === '1',
  };
}

export async function setPin(pin, { iterations = PIN_ITERATIONS } = {}) {
  const normalized = validatePin(pin);
  const salt = createSalt(16);
  const hash = await hashPin(normalized, salt, iterations);
  await setSetting('pin_hash', hash);
  await setSetting('pin_salt', bytesToBase64(salt));
  await setSetting('pin_iterations', String(iterations));
  if (!(await getSetting('lock_timeout'))) {
    await setSetting('lock_timeout', 'immediate');
  }
}

export async function verifyPin(pin) {
  const hash = await getSetting('pin_hash');
  const salt = await getSetting('pin_salt');
  if (!hash || !salt) return false;
  const iterations = Number(await getSetting('pin_iterations')) || PIN_ITERATIONS;
  const candidate = await hashPin(String(pin ?? ''), base64ToBytes(salt), iterations);
  return safeEqual(candidate, hash);
}

export async function clearPin(pin) {
  const valid = await verifyPin(pin);
  if (!valid) throw new AppError('INVALID_PIN', 'The current PIN is incorrect.');
  const db = activeDb();
  await db.run(`DELETE FROM app_settings WHERE key IN ('pin_hash', 'pin_salt', 'pin_iterations', 'biometric_enabled')`);
}

export async function changePin(currentPin, nextPin, options) {
  const valid = await verifyPin(currentPin);
  if (!valid) throw new AppError('INVALID_PIN', 'The current PIN is incorrect.');
  await setPin(nextPin, options);
}

export async function setLockTimeout(timeout) {
  if (!TIMEOUTS.has(timeout)) throw new AppError('VALIDATION', 'Choose a lock timeout.');
  await setSetting('lock_timeout', timeout);
}

export async function setBiometricEnabled(enabled) {
  const state = await getSecurityState();
  if (enabled && !state.hasPin) {
    throw new AppError('VALIDATION', 'Set a PIN before turning on biometric unlock.');
  }
  await setSetting('biometric_enabled', enabled ? '1' : '0');
}

export async function getDatabaseInfo() {
  const db = activeDb();
  const schemaVersion = await getSchemaVersion(db);
  const counts = {};
  for (const table of TABLE_NAMES) {
    const row = await db.get(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(row.count);
  }
  return {
    schemaVersion,
    path: db.path || 'On this device',
    counts,
  };
}
