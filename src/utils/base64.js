const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += ALPHABET[(triple >> 18) & 63];
    output += ALPHABET[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? ALPHABET[triple & 63] : '=';
  }
  return output;
}

export function base64ToBytes(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9+/]/g, '');
  if (cleaned.length % 4 === 1) {
    throw new Error('Invalid base64.');
  }
  const pad = cleaned.length % 4 === 0 ? 0 : 4 - (cleaned.length % 4);
  const padded = cleaned + '='.repeat(pad);
  const length = (padded.length / 4) * 3 - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < padded.length; index += 4) {
    const n =
      (ALPHABET.indexOf(padded[index]) << 18) |
      (ALPHABET.indexOf(padded[index + 1]) << 12) |
      ((padded[index + 2] === '=' ? 0 : ALPHABET.indexOf(padded[index + 2])) << 6) |
      (padded[index + 3] === '=' ? 0 : ALPHABET.indexOf(padded[index + 3]));
    bytes[offset] = (n >> 16) & 255;
    if (offset + 1 < length) bytes[offset + 1] = (n >> 8) & 255;
    if (offset + 2 < length) bytes[offset + 2] = n & 255;
    offset += 3;
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const normalized = String(hex);
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) {
    throw new Error('Invalid hex.');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
