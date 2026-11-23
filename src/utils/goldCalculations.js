import { AppError } from './errors';

/**
 * Financial precision policy
 * -------------------------
 * Money is stored as integer paise (1 rupee = 100 paise).
 * Gold grams are stored as scaled integers: 1 gram = 10,000 units,
 * which is exactly four decimal places.
 *
 * Converted grams:
 *   converted_scaled = roundHalfAwayFromZero(total_paise * 10000 / rate_paise_per_gram)
 *
 * New pending balance:
 *   new_balance_scaled = previous_balance_scaled - converted_scaled
 *
 * The sign is preserved. A negative balance means the business owes gold
 * to the customer. Values are never clamped to zero and absolute value is
 * never applied to a stored balance.
 *
 * Arithmetic uses BigInt only. Each conversion stores the rate, the inputs,
 * and the scaled result. Older conversions are never recalculated with a
 * newer gold rate.
 */
export const GRAM_SCALE = 10000n;
export const PAISE_SCALE = 100n;
export const MAX_PAISE = 100000000000000n;
export const MAX_SCALED_GRAMS = 10000000000000n;

export const PRECISION_POLICY = {
  gramScale: 10000,
  decimalPlaces: 4,
  moneyUnit: 'paise',
  rounding: 'half-away-from-zero',
};

export function toBigInt(value, label = 'Value') {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new AppError('INVALID_NUMBER', `${label} must be a whole number.`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new AppError('INVALID_NUMBER', `${label} must be a whole number.`);
}

export function toSafeNumber(value, label = 'Value') {
  const integer = toBigInt(value, label);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new AppError('AMOUNT_TOO_LARGE', `${label} is too large to store safely.`);
  }
  return Number(integer);
}

export function readStoredInteger(value, label = 'Value') {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toSafeNumber(Math.trunc(value), label);
  }
  return toSafeNumber(value, label);
}

export function roundDivHalfAwayFromZero(numerator, denominator) {
  const n = toBigInt(numerator, 'Numerator');
  const d = toBigInt(denominator, 'Denominator');
  if (d === 0n) {
    throw new AppError('INVALID_RATE', 'Gold rate must be greater than zero.');
  }
  const negative = (n < 0n) !== (d < 0n);
  const absoluteN = n < 0n ? -n : n;
  const absoluteD = d < 0n ? -d : d;
  const quotient = absoluteN / absoluteD;
  const remainder = absoluteN % absoluteD;
  const rounded = remainder * 2n >= absoluteD ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function parseRupeesToPaise(input, label = 'Amount') {
  if (input === null || input === undefined) {
    throw new AppError('INVALID_AMOUNT', `Enter a valid ${label.toLowerCase()}.`);
  }
  const cleaned = String(input).trim().replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!cleaned) {
    throw new AppError('INVALID_AMOUNT', `Enter a valid ${label.toLowerCase()}.`);
  }
  if (cleaned.startsWith('-')) {
    throw new AppError('INVALID_AMOUNT', `${label} cannot be negative.`);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new AppError('INVALID_AMOUNT', `${label} can have at most 2 decimal places.`);
  }
  const [whole, fraction = ''] = cleaned.split('.');
  const paise = BigInt(whole) * PAISE_SCALE + BigInt((fraction + '00').slice(0, 2));
  if (paise > MAX_PAISE) {
    throw new AppError('AMOUNT_TOO_LARGE', `${label} is too large.`);
  }
  return paise;
}

export function parsePositiveRupeesToPaise(input, label = 'Amount') {
  const paise = parseRupeesToPaise(input, label);
  if (paise <= 0n) {
    throw new AppError('INVALID_AMOUNT', `${label} must be greater than zero.`);
  }
  return paise;
}

export function parseGramsToScaled(input, { allowNegative = false, allowZero = true, label = 'Grams' } = {}) {
  if (input === null || input === undefined || String(input).trim() === '') {
    if (allowZero) return 0n;
    throw new AppError('INVALID_GRAMS', `Enter ${label.toLowerCase()}.`);
  }
  const cleaned = String(input).trim().replace(/,/g, '').replace(/\s/g, '');
  const pattern = allowNegative ? /^-?\d+(\.\d{1,4})?$/ : /^\d+(\.\d{1,4})?$/;
  if (!pattern.test(cleaned)) {
    throw new AppError(
      'INVALID_GRAMS',
      allowNegative
        ? `${label} can be positive or negative, with up to 4 decimal places.`
        : `${label} must be a positive number with up to 4 decimal places.`,
    );
  }
  const negative = cleaned.startsWith('-');
  const absolute = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ''] = absolute.split('.');
  const scaled = BigInt(whole) * GRAM_SCALE + BigInt((fraction + '0000').slice(0, 4));
  if (scaled > MAX_SCALED_GRAMS) {
    throw new AppError('AMOUNT_TOO_LARGE', `${label} is too large.`);
  }
  const signed = negative ? -scaled : scaled;
  if (!allowZero && signed === 0n) {
    throw new AppError('INVALID_GRAMS', `${label} must be greater than zero.`);
  }
  if (!allowNegative && signed < 0n) {
    throw new AppError('INVALID_GRAMS', `${label} cannot be negative.`);
  }
  return signed;
}

export function formatGrams(scaled, { withUnit = true } = {}) {
  const value = toBigInt(scaled, 'Grams');
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / GRAM_SCALE;
  const fraction = (absolute % GRAM_SCALE).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}${withUnit ? ' g' : ''}`;
}

export function formatIndianGrouping(integerText) {
  const negative = String(integerText).startsWith('-');
  const digits = negative ? String(integerText).slice(1) : String(integerText);
  if (digits.length <= 3) {
    return `${negative ? '-' : ''}${digits}`;
  }
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${negative ? '-' : ''}${groups.join(',')},${lastThree}`;
}

export function formatINR(paise) {
  const value = toBigInt(paise, 'Amount');
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const rupees = absolute / PAISE_SCALE;
  const fraction = (absolute % PAISE_SCALE).toString().padStart(2, '0');
  return `${negative ? '-' : ''}₹${formatIndianGrouping(rupees.toString())}.${fraction}`;
}

export function balancePresentation(scaled) {
  const value = toBigInt(scaled, 'Balance');
  if (value > 0n) {
    return {
      tone: 'owe',
      shortLabel: 'Customer owes',
      sentence: `Customer still owes ${formatGrams(value)}.`,
    };
  }
  if (value < 0n) {
    return {
      tone: 'excess',
      shortLabel: 'Excess credit',
      sentence: `Customer has an excess payment of ${formatGrams(-value)}.`,
    };
  }
  return {
    tone: 'settled',
    shortLabel: 'Settled',
    sentence: 'Gold account settled.',
  };
}

export function previewConversion({ previousScaled, incomePaise, advancePaise, ratePaisePerGram }) {
  const previous = toBigInt(previousScaled, 'Previous balance');
  const income = toBigInt(incomePaise, 'Income');
  const advance = toBigInt(advancePaise, 'Advance');
  const rate = toBigInt(ratePaisePerGram, 'Gold rate');

  if (income < 0n) {
    throw new AppError('INVALID_AMOUNT', 'Income cannot be negative.');
  }
  if (advance < 0n) {
    throw new AppError('INVALID_AMOUNT', 'Advance cannot be negative.');
  }
  if (rate <= 0n) {
    throw new AppError('INVALID_RATE', 'Gold rate must be greater than zero.');
  }
  if (previous > MAX_SCALED_GRAMS || previous < -MAX_SCALED_GRAMS) {
    throw new AppError('AMOUNT_TOO_LARGE', 'Gold balance is too large.');
  }

  const totalPaise = income + advance;
  if (totalPaise <= 0n) {
    throw new AppError('NOTHING_TO_CONVERT', 'Select income or an advance amount to convert.');
  }
  if (totalPaise > MAX_PAISE) {
    throw new AppError('AMOUNT_TOO_LARGE', 'Conversion amount is too large.');
  }

  const convertedScaled = roundDivHalfAwayFromZero(totalPaise * GRAM_SCALE, rate);
  if (convertedScaled <= 0n) {
    throw new AppError(
      'AMOUNT_TOO_SMALL',
      'This amount is too small to convert at the entered gold rate. At least 0.0001 g is required.',
    );
  }
  const newBalanceScaled = previous - convertedScaled;
  return {
    previousScaled: previous,
    incomePaise: income,
    advancePaise: advance,
    totalPaise,
    ratePaisePerGram: rate,
    convertedScaled,
    newBalanceScaled,
    presentation: balancePresentation(newBalanceScaled),
  };
}

export function remainingAdvance(availablePaise, usedPaise) {
  const available = toBigInt(availablePaise, 'Available advance');
  const used = toBigInt(usedPaise, 'Advance used');
  if (used < 0n) {
    throw new AppError('INVALID_AMOUNT', 'Advance used cannot be negative.');
  }
  if (used > available) {
    throw new AppError('ADVANCE_EXCEEDED', 'That amount is higher than the available advance.');
  }
  return available - used;
}
