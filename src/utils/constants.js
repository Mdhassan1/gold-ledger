export const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash' },
  { id: 'UPI', label: 'UPI' },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { id: 'OTHER', label: 'Other' },
];

export const LOCK_TIMEOUTS = [
  { id: 'immediate', label: 'Immediately', milliseconds: 0 },
  { id: '60', label: 'After 1 minute', milliseconds: 60 * 1000 },
  { id: '300', label: 'After 5 minutes', milliseconds: 5 * 60 * 1000 },
  { id: '900', label: 'After 15 minutes', milliseconds: 15 * 60 * 1000 },
  { id: 'session', label: 'Only when the app restarts', milliseconds: null },
];

export const THEME_MODES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System default' },
];

export function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find((method) => method.id === id)?.label || 'Other';
}
