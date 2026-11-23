import { AppError } from './errors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function todayISODate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayISODate(date);
}

export function startOfWeek(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  return addDays(isoDate, -mondayOffset);
}

export function startOfMonth(isoDate) {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonth(isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  const date = new Date(year, month, 0);
  return todayISODate(date);
}

export function parseISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return value;
}

export function assertBusinessDate(value, { allowFuture = false, today = todayISODate() } = {}) {
  const parsed = parseISODate(value);
  if (!parsed) {
    throw new AppError('INVALID_DATE', 'Enter a valid date.');
  }
  if (parsed < '2000-01-01') {
    throw new AppError('INVALID_DATE', 'Date must be 1 Jan 2000 or later.');
  }
  if (!allowFuture && parsed > today) {
    throw new AppError('INVALID_DATE', 'Date cannot be in the future.');
  }
  return parsed;
}

export function formatDisplayDate(isoDate) {
  if (!isoDate) return '—';
  const parsed = parseISODate(String(isoDate).slice(0, 10));
  if (!parsed) return String(isoDate);
  const [year, month, day] = parsed.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatLongDate(isoDate) {
  const parsed = parseISODate(isoDate);
  if (!parsed) return formatDisplayDate(isoDate);
  const [year, month, day] = parsed.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatTimestamp(isoTimestamp) {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return String(isoTimestamp);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${formatDisplayDate(todayISODate(date))}, ${hour12}:${minutes} ${suffix}`;
}

export function eachDate(start, end) {
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    if (dates.length > 370) break;
  }
  return dates;
}

export function monthKey(isoDate) {
  return String(isoDate).slice(0, 7);
}

export function resolveDateRange(preset, { today = todayISODate(), start, end } = {}) {
  if (preset === 'yesterday') {
    const day = addDays(today, -1);
    return { start: day, end: day, label: 'Yesterday' };
  }
  if (preset === 'week') {
    return { start: startOfWeek(today), end: today, label: 'This week' };
  }
  if (preset === 'month') {
    return { start: startOfMonth(today), end: today, label: 'This month' };
  }
  if (preset === 'custom') {
    const safeStart = assertBusinessDate(start, { allowFuture: true, today });
    const safeEnd = assertBusinessDate(end, { allowFuture: true, today });
    if (safeStart > safeEnd) {
      throw new AppError('INVALID_DATE', 'The start date must be on or before the end date.');
    }
    return { start: safeStart, end: safeEnd, label: 'Custom range' };
  }
  return { start: today, end: today, label: 'Today' };
}

export function nowIso() {
  return new Date().toISOString();
}

export function periodRange(period, anchor) {
  const date = assertBusinessDate(anchor, { allowFuture: true });
  if (period === 'week') {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return {
      start,
      end,
      label: `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
      period: 'week',
      anchor: start,
    };
  }
  if (period === 'month') {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const month = Number(start.slice(5, 7));
    const year = start.slice(0, 4);
    return {
      start,
      end,
      label: `${MONTHS[month - 1]} ${year}`,
      period: 'month',
      anchor: start,
    };
  }
  return {
    start: date,
    end: date,
    label: formatLongDate(date),
    period: 'day',
    anchor: date,
  };
}

export function shiftPeriodAnchor(period, anchor, delta) {
  const range = periodRange(period, anchor);
  if (period === 'month') {
    const year = Number(range.start.slice(0, 4));
    const month = Number(range.start.slice(5, 7));
    return todayISODate(new Date(year, month - 1 + delta, 1));
  }
  if (period === 'week') return addDays(range.start, delta * 7);
  return addDays(range.anchor, delta);
}
