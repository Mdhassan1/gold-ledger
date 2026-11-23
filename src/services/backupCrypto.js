import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { AppError } from '../utils/errors';
import { base64ToBytes, bytesToBase64 } from '../utils/base64';

export const PIN_ITERATIONS = 120000;
export const BACKUP_KDF_ITERATIONS = 210000;
export const BACKUP_FORMAT = 'goldledger-backup';
export const BACKUP_VERSION = 1;
const BACKUP_AAD = utf8ToBytes('goldledger-backup-v1');

export function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    const leftCode = index < a.length ? a.charCodeAt(index) : 0;
    const rightCode = index < b.length ? b.charCodeAt(index) : 0;
    diff |= leftCode ^ rightCode;
  }
  return diff === 0;
}

export async function hashPin(pin, saltBytes, iterations = PIN_ITERATIONS) {
  const derived = await pbkdf2Async(sha256, utf8ToBytes(String(pin)), saltBytes, {
    c: iterations,
    dkLen: 32,
  });
  return bytesToHex(derived);
}

export function createSalt(size = 16) {
  return randomBytes(size);
}

export async function encryptBackupPayload(payload, password, iterations = BACKUP_KDF_ITERATIONS) {
  if (!password || String(password).length < 8) {
    throw new AppError('WEAK_PASSWORD', 'Use a backup password of at least 8 characters.');
  }
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await pbkdf2Async(sha256, utf8ToBytes(String(password)), salt, {
    c: iterations,
    dkLen: 32,
  });
  const cipher = gcm(key, nonce, BACKUP_AAD);
  const ciphertext = cipher.encrypt(utf8ToBytes(JSON.stringify(payload)));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    encrypted: true,
    kdf: 'pbkdf2-sha256',
    cipher: 'aes-256-gcm',
    iterations,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptBackupEnvelope(envelope, password) {
  if (!envelope || envelope.encrypted !== true) {
    throw new AppError('INVALID_BACKUP', 'This backup is not encrypted.');
  }
  if (!password) {
    throw new AppError('PASSWORD_REQUIRED', 'Enter the backup password.');
  }
  try {
    const salt = base64ToBytes(envelope.salt);
    const nonce = base64ToBytes(envelope.nonce);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const iterations = Number(envelope.iterations);
    if (!iterations || iterations < 1000) {
      throw new Error('Invalid KDF.');
    }
    const key = await pbkdf2Async(sha256, utf8ToBytes(String(password)), salt, {
      c: iterations,
      dkLen: 32,
    });
    const cipher = gcm(key, nonce, BACKUP_AAD);
    const plaintext = cipher.decrypt(ciphertext);
    return JSON.parse(bytesToUtf8(plaintext));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('WRONG_PASSWORD', 'The password could not unlock this backup.');
  }
}
