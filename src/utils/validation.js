import { AppError } from './errors';
import { PAYMENT_METHODS } from './constants';
import { parseGramsToScaled, parsePositiveRupeesToPaise, parseRupeesToPaise } from './goldCalculations';
import { assertBusinessDate } from './dateUtils';

export function cleanText(value, { max = 500, label = 'Text', required = false } = {}) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text && required) {
    throw new AppError('VALIDATION', `${label} is required.`);
  }
  if (text.length > max) {
    throw new AppError('VALIDATION', `${label} must be ${max} characters or fewer.`);
  }
  return text;
}

export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '');
}

export function validateCustomerInput(input, { requireFinancial = false } = {}) {
  const name = cleanText(input.name, { max: 80, label: 'Customer name', required: true });
  const phone = cleanText(input.phone, { max: 20, label: 'Mobile number' });
  const normalizedPhone = normalizePhone(phone);
  if (phone && (normalizedPhone.length < 8 || normalizedPhone.length > 15)) {
    throw new AppError('VALIDATION', 'Enter a mobile number with 8 to 15 digits, or leave it blank.');
  }
  const address = cleanText(input.address, { max: 300, label: 'Address' });
  const notes = cleanText(input.notes, { max: 500, label: 'Notes' });
  const result = {
    name,
    phone: phone || null,
    normalizedPhone: normalizedPhone || null,
    address: address || null,
    notes: notes || null,
  };
  if (requireFinancial || input.openingGoldGrams !== undefined || input.openingAdvance !== undefined) {
    result.openingGoldScaled = parseGramsToScaled(input.openingGoldGrams ?? '0', {
      allowNegative: true,
      allowZero: true,
      label: 'Opening gold balance',
    });
    const advanceText = String(input.openingAdvance ?? '').trim();
    result.openingAdvancePaise = advanceText ? parseRupeesToPaise(advanceText, 'Opening advance') : 0n;
  }
  return result;
}

export function validateIncomeInput(input) {
  return {
    amountPaise: parsePositiveRupeesToPaise(input.amount, 'Income amount'),
    paymentDate: assertBusinessDate(input.paymentDate),
    paymentMethod: assertPaymentMethod(input.paymentMethod),
    notes: cleanText(input.notes, { max: 500, label: 'Notes' }) || null,
  };
}

export function validateAdvanceInput(input) {
  return {
    amountPaise: parsePositiveRupeesToPaise(input.amount, 'Advance amount'),
    transactionDate: assertBusinessDate(input.transactionDate || input.paymentDate),
    paymentMethod: assertPaymentMethod(input.paymentMethod),
    notes: cleanText(input.notes, { max: 500, label: 'Notes' }) || null,
  };
}

export function assertPaymentMethod(value) {
  if (!PAYMENT_METHODS.some((method) => method.id === value)) {
    throw new AppError('VALIDATION', 'Choose a payment method.');
  }
  return value;
}

export function validatePin(pin) {
  const text = String(pin ?? '').trim();
  if (!/^\d{4,6}$/.test(text)) {
    throw new AppError('VALIDATION', 'PIN must be 4 to 6 digits.');
  }
  return text;
}

export function validateImageInput(input) {
  const imageName = cleanText(input.imageName || input.name, { max: 80, label: 'Image name', required: true });
  const imageDate = assertBusinessDate(input.imageDate);
  if (!input.sourceUri) {
    throw new AppError('VALIDATION', 'Choose an image before saving.');
  }
  return { imageName, imageDate };
}

export function likeContains(value) {
  return `%${String(value).replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
