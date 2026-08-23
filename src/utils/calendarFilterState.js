const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthKeyToDate(key) {
  if (typeof key !== 'string' || !MONTH_KEY_RE.test(key)) return null;
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function dateToMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
